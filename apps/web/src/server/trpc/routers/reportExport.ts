import { TRPCError } from "@trpc/server";
import {
  createReportExportInputSchema,
  getPptxReportExportDownloadUrlInputSchema,
  getReportExportDownloadUrlInputSchema,
  pollPptxReportExportStatusInputSchema,
  pollReportExportStatusInputSchema,
  purgeReportExportsInputSchema,
  renderPptxReportExportInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import {
  adminProcedure,
  matrixProcedure,
  reportGenerateProcedure,
} from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import {
  buildPptxExportKey,
  deleteObject,
  getExportsBucketName,
} from "@marine-guardian/storage";
import {
  cancelPdfRender,
  enqueuePdfRender,
  enqueuePptxRender,
} from "@marine-guardian/jobs";

/**
 * ReportExport router — ephemeral report export tracker.
 *
 * Lifecycle: create (status=queued) → BullMQ pdf-render worker picks up →
 * status=rendering → status=ready (with filePath = a MinIO object key) OR
 * failed. A PPTX is rendered on demand from the same report data (NOT
 * converted from the PDF) and its object key is DERIVED via
 * buildPptxExportKey — it is stored in no column.
 *
 * Storage model (Phase 4 S1-S5): exports live in MinIO, not Telegram.
 * `telegramFileId` / `pptxTelegramFileId` are legacy columns and are now
 * always written null.
 *
 * Retention: exports are EPHEMERAL. The `export-janitor` BullMQ repeatable
 * job is the AUTHORITY for deletion — it sweeps rows older than
 * EXPORT_TTL_MS and removes their objects. The `purge` mutation below is a
 * best-effort immediate cleanup the UI fires on dialog close; it is an
 * optimisation, never a replacement for the TTL sweep.
 *
 * Client-facing error text: the raw `errorMessage` / `pptxErrorMessage`
 * columns carry renderer internals (file paths, stack fragments) and MUST
 * NOT reach the client. Every client-facing procedure returns
 * GENERIC_EXPORT_ERROR instead, and console.errors the real value so
 * operators keep their diagnostics server-side.
 *
 * RBAC: report generation is coordinator+ PLUS `viewer`
 * (reportGenerateProcedure) — a viewer may produce a printable report of
 * what it can already see. Read procedures are tenantProcedure.
 */

/**
 * The ONLY error string any client-facing export procedure may return.
 * The real column value is logged server-side, never serialised to the
 * browser — internal file paths were previously visible in the network
 * payload (verified with a canary).
 */
const GENERIC_EXPORT_ERROR = "Report generation failed. Please try again.";

/**
 * Logs the real, internal error text for an export row and returns the
 * generic client-facing replacement. `null` in → `null` out, so a healthy
 * row still reports "no error".
 */
function redactExportError(
  exportId: string,
  field: "errorMessage" | "pptxErrorMessage",
  raw: string | null,
): string | null {
  if (raw === null) return null;
  console.error(
    `[reportExport] export ${exportId} ${field} (not sent to client):`,
    raw,
  );
  return GENERIC_EXPORT_ERROR;
}

export const reportExportRouter = router({
  /**
   * pollStatus — lightweight read for the UI to poll while waiting for a
   * render to complete.
   *
   * `errorMessage` is a boolean-ish signal only: null when the row has no
   * error, otherwise GENERIC_EXPORT_ERROR. The raw column value is logged
   * server-side (see redactExportError) and never serialised.
   */
  pollStatus: matrixProcedure(tenantProcedure, "exports", "view")
    .input(pollReportExportStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          errorMessage: true,
          fileSizeBytes: true,
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        completedAt: row.completedAt,
        fileSizeBytes: row.fileSizeBytes,
        errorMessage: redactExportError(row.id, "errorMessage", row.errorMessage),
      };
    }),

  /**
   * create — inserts a queued ReportExport row, enqueues the BullMQ
   * pdf-render job, and writes the EXPORT_REQUESTED AuditLog.
   *
   * Order of operations: prisma.create → enqueuePdfRender → auditLog.create.
   * Each step's failure mode is independent: a row exists with status=queued
   * even if the enqueue or audit log fails. Sequential awaits rather than a
   * $transaction wrap because BullMQ writes to Valkey (outside Postgres) and
   * a $transaction cannot span both.
   *
   * RBAC (2026-07-06): `reportGenerateProcedure` = coordinator+ PLUS
   * `viewer` — report generation is an owner-approved, read-oriented
   * "produce a PDF of what I can already see" action.
   */
  create: matrixProcedure(reportGenerateProcedure, "exports", "write")
    .input(createReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await prisma.reportExport.create({
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: {
          tenantId: ctx.tenantId,
          requestedByUserId: ctx.userId,
          reportType: input.reportType,
          paramsJson: input.paramsJson,
          paperSize: input.paperSize,
          status: "queued",
        },
      });

      // Enqueue is best-effort and must never hang or fail the request. The
      // row already exists with status=queued; if Valkey/BullMQ is unreachable
      // the bounded enqueue rejects quickly (see enqueuePdfRender) and we log
      // it. Previously an unreachable Valkey made queue.add hang forever,
      // which is what produced the 524 timeout on the Generate Report button.
      try {
        await enqueuePdfRender({
          exportId: created.id,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        });
      } catch (err) {
        console.error(
          `[reportExport.create] enqueue failed for export ${created.id}; row remains queued:`,
          err,
        );
      }

      await prisma.auditLog.create({
        data: {
          action: "EXPORT_REQUESTED",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          entityType: "ReportExport",
          entityId: created.id,
          changesJson: {
            reportType: input.reportType,
            paperSize: input.paperSize,
          },
        },
      });

      return created;
    }),

  /**
   * getDownloadUrl — returns the download URL when the export is ready.
   * Returns null when the row is not ready, or is ready but carries no
   * stored object key (nothing to serve — e.g. already purged).
   *
   * Returns NOT_FOUND when the row does not exist for this tenant — never
   * leaks existence cross-tenant.
   *
   * The Route Handler enforces tenant scope server-side via session.tenantId,
   * so the URL does not carry tenantId: no public URL identifies the tenant
   * a row belongs to.
   */
  getDownloadUrl: matrixProcedure(tenantProcedure, "exports", "view")
    .input(getReportExportDownloadUrlInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          filePath: true,
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // filePath is the MinIO object key. It is a server-side storage
      // locator and is never returned to the client.
      if (row.status !== "ready" || row.filePath === null) {
        return { downloadUrl: null as string | null, status: row.status };
      }
      return {
        downloadUrl: `/api/exports/reports/${row.id}/download`,
        status: row.status,
      };
    }),

  /**
   * purge — best-effort immediate cleanup of exports the user just
   * generated, fired by the Generate Printable Report dialog on close.
   *
   * ⚠ This is an OPTIMISATION, NOT the retention mechanism. The
   * `export-janitor` repeatable job's TTL sweep is the AUTHORITY for
   * deletion and remains mandatory: a crashed tab, a closed laptop, or a
   * dropped connection never fires this mutation, so purge existing does
   * not make the janitor optional.
   *
   * NEVER THROWS by design. The client fires it during dialog teardown,
   * where an error is both useless (nothing to retry into) and invisible
   * (the dialog is already gone). Every step is individually try/caught and
   * the sweep continues; the janitor is the backstop for anything missed.
   *
   * Unknown and cross-tenant ids are silently skipped — no NOT_FOUND. That
   * would leak row existence AND would make an ordinary double-close look
   * like a failure.
   *
   * Tenant scope is enforced server-side on every id (findFirst with
   * ctx.tenantId), so ids from a hostile client can never reach another
   * tenant's row.
   */
  purge: matrixProcedure(reportGenerateProcedure, "exports", "write")
    .input(purgeReportExportsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const bucket = getExportsBucketName();
      let purged = 0;

      for (const id of input.ids) {
        try {
          const row = await prisma.reportExport.findFirst({
            where: { id, tenantId: ctx.tenantId },
            select: { id: true, tenantId: true, filePath: true, createdAt: true },
          });
          if (!row) continue;

          // Drop any still-pending BullMQ job so the worker does not
          // resurrect an object under a row we are about to delete.
          try {
            await cancelPdfRender(row.id);
          } catch (err) {
            console.warn(`[reportExport.purge] cancelPdfRender failed for ${row.id}:`, err);
          }

          const keys: string[] = [];
          if (row.filePath !== null && row.filePath !== "") {
            keys.push(row.filePath);
          }
          // The PPTX key is DERIVED, never stored, and embeds the UTC
          // year/month of the moment the worker uploaded it. A row created
          // just before UTC midnight on the last day of a month has its
          // object under the NEXT month's prefix, so probe both candidates
          // (deduped — mid-month they collapse to one). deleteObject
          // swallows a 404, so the extra probe is a cheap no-op.
          const pptxKeys = new Set<string>([
            buildPptxExportKey(row.tenantId, row.id, row.createdAt),
            buildPptxExportKey(
              row.tenantId,
              row.id,
              new Date(row.createdAt.getTime() + 24 * 60 * 60 * 1000),
            ),
          ]);
          keys.push(...pptxKeys);

          for (const key of keys) {
            try {
              await deleteObject({ bucket, key });
            } catch (err) {
              console.warn(`[reportExport.purge] deleteObject failed for ${key}:`, err);
            }
          }

          try {
            await prisma.reportExport.deleteMany({
              where: { id: row.id, tenantId: ctx.tenantId },
            });
            purged += 1;
          } catch (err) {
            console.warn(`[reportExport.purge] row delete failed for ${row.id}:`, err);
          }
        } catch (err) {
          console.warn(`[reportExport.purge] skipping ${id} after an unexpected error:`, err);
        }
      }

      return { purged };
    }),

  /**
   * renderPptx — on-demand "Generate PowerPoint" for a report export.
   *
   * Since Phase 4 S3 the pptx worker renders from the live report data (the
   * same print-render page the PDF uses), NOT by converting the finished
   * PDF. So a PPTX no longer depends on the PDF having succeeded, and the
   * old `status === "ready" && telegramFileId !== null` precondition is
   * gone — with Telegram removed, telegramFileId is always null and that
   * guard would have rejected every request. Only row existence is required
   * (the row carries paramsJson).
   *
   * Resets pptxStatus=queued + clears prior pptx fields (a re-request after
   * a completed/failed prior render must actually re-run, not surface stale
   * state), then enqueues the pptx-render job. The BullMQ jobId pattern
   * `pptx-render__${id}` collapses double-clicks to one job.
   *
   * RBAC: adminProcedure (tenant_manager + tenant_superadmin +
   * tenant_admin) — deliberately MORE restrictive than the
   * reportGenerateProcedure gating `create`, which additionally admits
   * `viewer`.
   *
   * HISTORY — do not re-widen. Phase 4 S6 relaxed this to
   * reportGenerateProcedure purely so the new in-dialog "Generate
   * PowerPoint" button would work for every role that can generate a PDF
   * (including viewer). That was a permissions WIDENING introduced to
   * satisfy a UI convenience, and the owner reverted it (2026-07-20). The
   * correct fix for "the button errors for non-admins" is to HIDE the
   * button (export-progress-row.tsx `canGeneratePptx`), not to lower this
   * gate. THIS procedure is the real authorisation boundary; the client-side
   * hide is UX only and is not trusted.
   */
  renderPptx: matrixProcedure(adminProcedure, "exports", "write")
    .input(renderPptxReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updated = await prisma.reportExport.update({
        where: { id: existing.id },
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: {
          pptxStatus: "queued",
          // Legacy column — always null since Phase 4 S3.
          pptxTelegramFileId: null,
          pptxFileSizeBytes: null,
          pptxErrorMessage: null,
        },
      });

      await enqueuePptxRender({
        exportId: existing.id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });

      await prisma.auditLog.create({
        data: {
          action: "EXPORT_PPTX_REQUESTED",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          entityType: "ReportExport",
          entityId: existing.id,
          changesJson: {},
        },
      });

      return updated;
    }),

  /**
   * pollPptxStatus — lightweight read for the UI to poll while waiting for
   * an on-demand PPTX render to complete. Mirrors pollStatus, including its
   * error-redaction posture: the raw pptxErrorMessage never reaches the
   * client.
   */
  pollPptxStatus: matrixProcedure(tenantProcedure, "exports", "view")
    .input(pollPptxReportExportStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          pptxStatus: true,
          pptxErrorMessage: true,
          pptxFileSizeBytes: true,
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        pptxStatus: row.pptxStatus,
        pptxFileSizeBytes: row.pptxFileSizeBytes,
        pptxErrorMessage: redactExportError(
          row.id,
          "pptxErrorMessage",
          row.pptxErrorMessage,
        ),
      };
    }),

  /**
   * getPptxDownloadUrl — returns the PPTX download URL once pptxStatus is
   * "ready". There is no pptx key column to check — the object key is
   * DERIVED by the Route Handler — so pptxStatus is the only row-level
   * gate. Mirrors getDownloadUrl's NOT_FOUND-on-cross-tenant posture:
   * never leaks existence.
   */
  getPptxDownloadUrl: matrixProcedure(tenantProcedure, "exports", "view")
    .input(getPptxReportExportDownloadUrlInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          pptxStatus: true,
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (row.pptxStatus !== "ready") {
        return {
          downloadUrl: null as string | null,
          pptxStatus: row.pptxStatus,
        };
      }
      return {
        downloadUrl: `/api/exports/reports/${row.id}/pptx`,
        pptxStatus: row.pptxStatus,
      };
    }),
});
