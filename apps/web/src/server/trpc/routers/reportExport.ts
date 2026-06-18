import { TRPCError } from "@trpc/server";
import {
  createReportExportInputSchema,
  getReportExportByIdInputSchema,
  getReportExportDownloadUrlInputSchema,
  listReportExportsInputSchema,
  pollReportExportStatusInputSchema,
  retryReportExportInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure, coordinatorProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import { enqueuePdfRender } from "@marine-guardian/jobs";

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
   * create — inserts a queued ReportExport row, enqueues the BullMQ
   * pdf-render job, and writes the EXPORT_REQUESTED AuditLog. Wired in
   * 5.3b — closes the loop from v2 PRODUCT.md L505-506 (4.1c scaffolded
   * the row insert; 5.3b fires the producer side of the pipeline).
   *
   * Order of operations: prisma.create → enqueuePdfRender → auditLog.create.
   * Each step's failure mode is independent: a row exists with status=queued
   * even if the enqueue or audit log fails, and the 5.3d admin "Retry"
   * button can re-enqueue from the stuck-queued state if needed (jobId
   * `pdf-render__${exportId}` dedupes the second enqueue to one BullMQ
   * job). Same pattern as patrol.rebuildTracks + areaBoundary.rebuild —
   * sequential awaits rather than $transaction wrap because BullMQ writes
   * to Valkey (outside Postgres) and a $transaction cannot span both.
   */
  create: coordinatorProcedure
    .input(createReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const created = await prisma.reportExport.create({
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
      // the bounded enqueue rejects quickly (see enqueuePdfRender), we log it,
      // and the 5.3d admin "Retry" button re-enqueues from the queued state.
      // Previously an unreachable Valkey made queue.add hang forever, which is
      // what produced the 524 timeout on the Generate Report button.
      try {
        await enqueuePdfRender({
          exportId: created.id,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        });
      } catch (err) {
        console.error(
          `[reportExport.create] enqueue failed for export ${created.id}; row remains queued and can be retried:`,
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
   * Returns null when status is not "ready" (still queued, rendering, or
   * failed).
   *
   * Returns NOT_FOUND when the row does not exist for this tenant — never
   * leaks existence cross-tenant.
   *
   * 5.3c — URL shape changed from `/${tenantId}/exports/${id}/download`
   * (v2 spec §506) to `/api/exports/reports/${id}/download`. The Route
   * Handler enforces tenant scope server-side via session.tenantId, so
   * the URL no longer needs to carry tenantId. Cleaner posture: no public
   * URL identifies the tenant a row belongs to.
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
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (row.status !== "ready" || row.filePath === null) {
        return { downloadUrl: null as string | null, status: row.status };
      }
      return {
        downloadUrl: `/api/exports/reports/${row.id}/download`,
        status: row.status,
      };
    }),

  /**
   * retry — admin re-enqueues a previously-failed (or stuck-queued) export.
   *
   * Resets the row state: status=queued, nullifies filePath/fileSizeBytes/
   * errorMessage/completedAt. Then re-fires the pdf-render job. The BullMQ
   * jobId pattern `pdf-render__${exportId}` dedupes the second enqueue to
   * one job if a stale job is still in flight (5.3b precedent).
   *
   * RBAC: adminProcedure (super_admin + site_admin). Tenant scope enforced
   * via findFirst {id, tenantId} — returns NOT_FOUND for cross-tenant rows
   * (never leaks existence). Pattern mirrors patrol.rebuildTracks (5.2c)
   * and areaBoundary.rebuild (5.1e): sequential awaits (not $transaction)
   * because BullMQ writes to Valkey outside the Postgres transaction
   * scope.
   */
  retry: adminProcedure
    .input(retryReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updated = await prisma.reportExport.update({
        where: { id: existing.id },
        data: {
          status: "queued",
          filePath: null,
          fileSizeBytes: null,
          errorMessage: null,
          completedAt: null,
        },
      });

      await enqueuePdfRender({
        exportId: existing.id,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });

      await prisma.auditLog.create({
        data: {
          action: "EXPORT_RETRY",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          entityType: "ReportExport",
          entityId: existing.id,
          changesJson: {},
        },
      });

      return updated;
    }),
});
