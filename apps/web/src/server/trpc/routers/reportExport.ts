import { TRPCError } from "@trpc/server";
import {
  createReportExportInputSchema,
  getReportExportByIdInputSchema,
  getReportExportDownloadUrlInputSchema,
  listReportExportsInputSchema,
  pollReportExportStatusInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { coordinatorProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

/**
 * ReportExport router — async PDF export tracker per v2 PRODUCT.md §505-506.
 *
 * Lifecycle: create (status=queued) → BullMQ pdf-render worker picks up →
 * status=rendering → status=ready (with filePath) OR failed.
 *
 * Scope of this scaffold (Sub-batch 4.1c):
 *   - create  : inserts a queued row only. Does NOT enqueue BullMQ job —
 *               that wiring is intentionally deferred to a future batch.
 *   - getDownloadUrl : returns the download URL when status=ready; null
 *               otherwise. Does NOT serve the file — the download endpoint
 *               (per spec §506: /[tenant]/exports/{id}/download) is future
 *               batch work.
 *
 * RBAC: report.export is coordinator+ (spec §410). All procedures here are
 * coordinatorProcedure or tenantProcedure (read-only access for any tenant
 * user to see their own exports).
 */
export const reportExportRouter = router({
  list: tenantProcedure
    .input(listReportExportsInputSchema)
    .query(async ({ ctx, input }) => {
      const items = await prisma.reportExport.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.reportType !== undefined
            ? { reportType: input.reportType }
            : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { id: true, fullName: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: tenantProcedure
    .input(getReportExportByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          requestedBy: { select: { id: true, fullName: true } },
        },
      });
    }),

  /**
   * pollStatus — lightweight read for the UI to poll while waiting for a
   * render to complete. Returns just the status + completedAt + errorMessage
   * to keep the payload small.
   */
  pollStatus: tenantProcedure
    .input(pollReportExportStatusInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          errorMessage: true,
          fileSizeBytes: true,
        },
      });
    }),

  /**
   * create — inserts a queued ReportExport row and returns it. Does NOT
   * enqueue the BullMQ pdf-render job yet (future batch). The row exists
   * with status=queued so the UI flow + audit trail are testable.
   */
  create: coordinatorProcedure
    .input(createReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.reportExport.create({
        data: {
          tenantId: ctx.tenantId,
          requestedByUserId: ctx.userId,
          reportType: input.reportType,
          paramsJson: input.paramsJson,
          paperSize: input.paperSize,
          status: "queued",
        },
      });
    }),

  /**
   * getDownloadUrl — returns the download URL when the export is ready.
   * Returns null when status is not "ready" (still queued, rendering, or
   * failed). The actual file-serving endpoint is future batch work; this
   * procedure only resolves the URL shape per spec §506.
   *
   * Returns NOT_FOUND when the row does not exist for this tenant — never
   * leaks existence cross-tenant.
   */
  getDownloadUrl: tenantProcedure
    .input(getReportExportDownloadUrlInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          filePath: true,
          tenantId: true,
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (row.status !== "ready" || row.filePath === null) {
        return { downloadUrl: null as string | null, status: row.status };
      }
      // Spec §506: download path is /[tenant]/exports/{id}/download.
      // We return the canonical URL shape; the actual streaming endpoint
      // is wired in a future batch alongside the pdf-renderer service.
      return {
        downloadUrl: `/${row.tenantId}/exports/${row.id}/download`,
        status: row.status,
      };
    }),
});
