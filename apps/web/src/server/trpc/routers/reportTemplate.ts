/**
 * ReportTemplate router — CRUD + setDefault for printable report templates.
 *
 * Security invariants:
 *   L3 — all mutations gated to adminProcedure (super_admin | site_admin)
 *   L5 — every mutation audited via writeAuditLog
 *   L6 — tenant-scoped: all queries carry ctx.tenantId guard
 *
 * Logo handling: create/update accept optional base64 image data for each logo
 * slot (municipal + partner). If provided, the router calls uploadImage from
 * @marine-guardian/storage and persists the returned key. partnerLogoKey null
 * means the rendered report falls back to the app-default logo.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure } from "../middleware/rbac";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import type { PrismaClient } from "@marine-guardian/db";
import {
  listReportTemplatesInputSchema,
  getReportTemplateByIdInputSchema,
  createReportTemplateInputSchema,
  updateReportTemplateInputSchema,
  deleteReportTemplateInputSchema,
} from "@marine-guardian/shared/schemas";
import {
  uploadImage,
  buildLogoKey,
  getExportsBucketName,
} from "@marine-guardian/storage";

// Logo upload extension: base64 + MIME type for each logo slot
const logoUploadField = z
  .object({
    data: z.string().min(1),
    contentType: z.enum(["image/png", "image/jpeg"]),
  })
  .optional();

const createInputWithLogos = createReportTemplateInputSchema.extend({
  municipalLogoUpload: logoUploadField,
  partnerLogoUpload: logoUploadField,
});

const updateInputWithLogos = updateReportTemplateInputSchema.extend({
  municipalLogoUpload: logoUploadField,
  partnerLogoUpload: logoUploadField,
});

// Slot suffix distinguishes the two logo keys under the same templateId prefix.
async function uploadLogoSlot(
  upload: { data: string; contentType: "image/png" | "image/jpeg" } | undefined,
  tenantId: string,
  templateId: string,
  slot: "municipal" | "partner",
): Promise<string | undefined> {
  if (!upload) return undefined;
  const ext = upload.contentType === "image/png" ? "png" : "jpg";
  const key = buildLogoKey(tenantId, `${templateId}-${slot}`, ext);
  const body = Buffer.from(upload.data, "base64");
  const result = await uploadImage({
    bucket: getExportsBucketName(),
    key,
    body,
    contentType: upload.contentType,
  });
  return result.key;
}

export const reportTemplateRouter = router({
  /**
   * List all report templates for the tenant (all tenant users may read).
   * Sorted newest-first; supports cursor-based pagination.
   */
  list: tenantProcedure
    .input(listReportTemplatesInputSchema)
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx;
      const { cursor, limit } = input;

      const items = await prisma.reportTemplate.findMany({
        where: { tenantId },
        ...(cursor !== undefined ? { cursor: { id: cursor } } : {}),
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const last = items.pop();
        nextCursor = last?.id;
      }

      return { items, nextCursor };
    }),

  /**
   * Fetch a single template by id — tenant-scoped (not cross-tenant accessible).
   */
  getById: tenantProcedure
    .input(getReportTemplateByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx;
      const template = await prisma.reportTemplate.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report template not found." });
      }
      return template;
    }),

  /**
   * Create a new report template. Admin-only. Audited.
   *
   * If isDefault is true, all sibling defaults for this tenant are unset first
   * inside a transaction so there is always at most one default per tenant.
   *
   * Logo slots: if municipalLogoUpload / partnerLogoUpload are provided, the
   * router calls uploadImage and persists the returned key; otherwise the
   * key fields from the input are used as-is.
   */
  create: adminProcedure
    .input(createInputWithLogos)
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;
      const { municipalLogoUpload, partnerLogoUpload, ...coreInput } = input;

      const template = await prisma.$transaction(async (tx) => {
        if (coreInput.isDefault) {
          await tx.reportTemplate.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.reportTemplate.create({
          data: {
            tenantId,
            name: coreInput.name,
            layout: coreInput.layout,
            municipalLogoKey: coreInput.municipalLogoKey ?? null,
            partnerLogoKey: coreInput.partnerLogoKey ?? null,
            reportTitle: coreInput.reportTitle,
            footerNotes: coreInput.footerNotes ?? null,
            isDefault: coreInput.isDefault,
          },
        });
      });

      // Upload logos after the record exists so we have the templateId for the key.
      // Run both uploads in parallel — they are independent S3 PutObject calls.
      let municipalLogoKey = template.municipalLogoKey;
      let partnerLogoKey = template.partnerLogoKey;

      const [municipalKey, partnerKey] = await Promise.all([
        uploadLogoSlot(municipalLogoUpload, tenantId, template.id, "municipal"),
        uploadLogoSlot(partnerLogoUpload, tenantId, template.id, "partner"),
      ]);

      if (municipalKey !== undefined || partnerKey !== undefined) {
        const updated = await prisma.reportTemplate.update({
          where: { id: template.id },
          data: {
            ...(municipalKey !== undefined && { municipalLogoKey: municipalKey }),
            ...(partnerKey !== undefined && { partnerLogoKey: partnerKey }),
          },
        });
        municipalLogoKey = updated.municipalLogoKey;
        partnerLogoKey = updated.partnerLogoKey;
      }

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "CREATE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: template.id,
        changesJson: {
          name: coreInput.name,
          layout: coreInput.layout,
          isDefault: coreInput.isDefault,
          municipalLogoKey,
          partnerLogoKey,
        },
        severity: "info",
      });

      return { ...template, municipalLogoKey, partnerLogoKey };
    }),

  /**
   * Update an existing template. Admin-only. Audited.
   * Tenant isolation: rejects IDs that belong to a different tenant.
   */
  update: adminProcedure
    .input(updateInputWithLogos)
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;
      const { id, municipalLogoUpload, partnerLogoUpload, ...patch } = input;

      const existing = await prisma.reportTemplate.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report template not found." });
      }

      // Upload logos in parallel — independent S3 calls with no data dependency.
      const [municipalKey, partnerKey] = await Promise.all([
        uploadLogoSlot(municipalLogoUpload, tenantId, id, "municipal"),
        uploadLogoSlot(partnerLogoUpload, tenantId, id, "partner"),
      ]);

      const updated = await prisma.$transaction(async (tx) => {
        if (patch.isDefault === true) {
          await tx.reportTemplate.updateMany({
            where: { tenantId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        return tx.reportTemplate.update({
          where: { id },
          data: {
            ...(patch.name !== undefined && { name: patch.name }),
            ...(patch.layout !== undefined && { layout: patch.layout }),
            ...(patch.reportTitle !== undefined && { reportTitle: patch.reportTitle }),
            ...(patch.footerNotes !== undefined && { footerNotes: patch.footerNotes }),
            ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }),
            ...(patch.municipalLogoKey !== undefined && { municipalLogoKey: patch.municipalLogoKey }),
            ...(patch.partnerLogoKey !== undefined && { partnerLogoKey: patch.partnerLogoKey }),
            ...(municipalKey !== undefined && { municipalLogoKey: municipalKey }),
            ...(partnerKey !== undefined && { partnerLogoKey: partnerKey }),
          },
        });
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "UPDATE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: id,
        changesJson: {
          before: {
            name: existing.name,
            layout: existing.layout,
            isDefault: existing.isDefault,
          },
          after: {
            name: updated.name,
            layout: updated.layout,
            isDefault: updated.isDefault,
          },
        },
        severity: "info",
      });

      return updated;
    }),

  /**
   * Delete a template. Admin-only. Audited.
   * Tenant isolation: silently rejects cross-tenant deletes via NOT_FOUND.
   */
  delete: adminProcedure
    .input(deleteReportTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      const existing = await prisma.reportTemplate.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report template not found." });
      }

      // Use deleteMany to handle concurrent deletes gracefully (returns count: 0
      // instead of throwing P2025 if another session deleted the record first).
      const { count } = await prisma.reportTemplate.deleteMany({
        where: { id: input.id, tenantId },
      });
      if (count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report template not found." });
      }

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "DELETE_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: input.id,
        changesJson: {
          name: existing.name,
          layout: existing.layout,
          isDefault: existing.isDefault,
        },
        severity: "info",
      });

      return { deleted: true };
    }),

  /**
   * Set a template as the tenant default.
   * Runs in a transaction: unsets all sibling defaults, sets this one.
   * Admin-only. Audited.
   */
  setDefault: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx;

      const existing = await prisma.reportTemplate.findFirst({
        where: { id: input.id, tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report template not found." });
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.reportTemplate.updateMany({
          where: { tenantId, isDefault: true, id: { not: input.id } },
          data: { isDefault: false },
        });
        return tx.reportTemplate.update({
          where: { id: input.id },
          data: { isDefault: true },
        });
      });

      await writeAuditLog(prisma as unknown as PrismaClient, {
        tenantId,
        userId,
        action: "SET_DEFAULT_REPORT_TEMPLATE",
        entityType: "ReportTemplate",
        entityId: input.id,
        changesJson: {
          wasAlreadyDefault: existing.isDefault,
          newDefaultId: input.id,
        },
        severity: "info",
      });

      return updated;
    }),
});
