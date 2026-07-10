import { TRPCError } from "@trpc/server";
import {
  cancelReportExportInputSchema,
  createReportExportInputSchema,
  deleteReportExportInputSchema,
  getPptxReportExportDownloadUrlInputSchema,
  getReportExportByIdInputSchema,
  getReportExportDownloadUrlInputSchema,
  listReportExportsInputSchema,
  pollPptxReportExportStatusInputSchema,
  pollReportExportStatusInputSchema,
  renderPptxReportExportInputSchema,
  retryReportExportInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { adminProcedure, matrixProcedure, reportGenerateProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";
import {
  cancelPdfRender,
  enqueuePdfRender,
  enqueuePptxRender,
} from "@marine-guardian/jobs";

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
 * RBAC: report.export is coordinator+ (spec §410), with one narrow
 * exception — `create` also allows `viewer` (2026-07-06, reportGenerateProcedure)
 * so a viewer can generate a printable report from the Interactive Report
 * Map; every other procedure here is unchanged and is either
 * reportGenerateProcedure/adminProcedure or tenantProcedure (read-only
 * access for any tenant user to see their own exports).
 */
/**
 * paramsJson field shapes actually written by the various report-generating
 * UIs (generate-report-button.tsx + generate-printable-button.tsx). Not
 * every reportType populates every field — see the per-type comments at
 * each write site. All fields are optional here because paramsJson is an
 * untyped Json column; this is a best-effort read shape for the Exports
 * page summary, not a validated contract.
 */
interface ReportExportParams {
  templateId?: string;
  municipalityId?: string;
  /**
   * Optional province rollup filter (2026-07-09) — carried through verbatim
   * from paramsJson (untyped Json column) so a queued province-scoped
   * report_map export's summary can reflect province scope even though no
   * specific municipalityId was set.
   */
  province?: string;
  /**
   * Optional "include child boundaries" toggle (Phase 4B, 2026-07-09) —
   * carried through verbatim from paramsJson; does not affect the summary
   * municipalityName (which is derived from municipalityId/province only).
   */
  includeChildren?: boolean;
  protectedZoneId?: string;
  areaBoundaryId?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
}

function extractParams(paramsJson: unknown): ReportExportParams {
  if (paramsJson === null || typeof paramsJson !== "object") return {};
  return paramsJson;
}

export const reportExportRouter = router({
  list: matrixProcedure(tenantProcedure, "exports", "view")
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
        // telegramFileId is a server-side storage locator (Telegram Bot API
        // file_id) — never exposed to the client. Downloads go through the
        // Route Handler, which resolves it server-side.
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        include: {
          requestedBy: { select: { id: true, fullName: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      // Report Summary column (so a user sees what they already generated
      // before re-generating the same thing): paramsJson only carries IDs
      // (municipalityId, protectedZoneId, templateId, areaBoundaryId) — batch
      // resolve them to names for this page of rows only. Tenant-scoped on
      // every lookup so a row can never leak a cross-tenant name even if a
      // paramsJson id were ever malformed/spoofed.
      const municipalityIds = new Set<string>();
      const protectedZoneIds = new Set<string>();
      const templateIds = new Set<string>();
      const areaBoundaryIds = new Set<string>();
      for (const item of items) {
        const p = extractParams(item.paramsJson);
        if (p.municipalityId !== undefined) municipalityIds.add(p.municipalityId);
        if (p.protectedZoneId !== undefined) protectedZoneIds.add(p.protectedZoneId);
        if (p.templateId !== undefined) templateIds.add(p.templateId);
        if (p.areaBoundaryId !== undefined) areaBoundaryIds.add(p.areaBoundaryId);
      }

      const [municipalities, protectedZones, templates, areaBoundaries] =
        await Promise.all([
          municipalityIds.size > 0
            ? prisma.municipality.findMany({
                where: { tenantId: ctx.tenantId, id: { in: [...municipalityIds] } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          protectedZoneIds.size > 0
            ? prisma.protectedZone.findMany({
                where: { tenantId: ctx.tenantId, id: { in: [...protectedZoneIds] } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          templateIds.size > 0
            ? prisma.reportTemplate.findMany({
                where: { tenantId: ctx.tenantId, id: { in: [...templateIds] } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          areaBoundaryIds.size > 0
            ? prisma.areaBoundary.findMany({
                where: { tenantId: ctx.tenantId, id: { in: [...areaBoundaryIds] } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
        ]);

      const municipalityNameById = new Map(municipalities.map((m) => [m.id, m.name]));
      const protectedZoneNameById = new Map(protectedZones.map((z) => [z.id, z.name]));
      const templateNameById = new Map(templates.map((t) => [t.id, t.name]));
      const areaNameById = new Map(areaBoundaries.map((a) => [a.id, a.name]));

      const itemsWithSummary = items.map((item) => {
        const p = extractParams(item.paramsJson);
        return {
          ...item,
          reportSummary: {
            municipalityName:
              p.municipalityId !== undefined
                ? municipalityNameById.get(p.municipalityId) ?? null
                : (p.province ?? null),
            protectedZoneName:
              p.protectedZoneId !== undefined
                ? protectedZoneNameById.get(p.protectedZoneId) ?? null
                : null,
            templateName:
              p.templateId !== undefined
                ? templateNameById.get(p.templateId) ?? null
                : null,
            areaName:
              p.areaBoundaryId !== undefined
                ? areaNameById.get(p.areaBoundaryId) ?? null
                : null,
            from: p.from ?? p.startDate ?? null,
            to: p.to ?? p.endDate ?? null,
            period:
              p.year !== undefined && p.month !== undefined
                ? { year: p.year, month: p.month }
                : null,
          },
        };
      });

      return { items: itemsWithSummary, nextCursor };
    }),

  getById: matrixProcedure(tenantProcedure, "exports", "view")
    .input(getReportExportByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        // Same posture as list: telegramFileId stays server-side.
        omit: { telegramFileId: true, pptxTelegramFileId: true },
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
  pollStatus: matrixProcedure(tenantProcedure, "exports", "view")
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
   *
   * RBAC (2026-07-06): `reportGenerateProcedure` = coordinator+ PLUS
   * `viewer`. Viewer is allowed here ONLY because report generation is an
   * owner-approved, read-oriented "produce a PDF of what I can already see"
   * action — it stays excluded from every other mutation in this router
   * (retry/cancel/delete/renderPptx remain adminProcedure).
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
  getDownloadUrl: matrixProcedure(tenantProcedure, "exports", "view")
    .input(getReportExportDownloadUrlInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          status: true,
          filePath: true,
          telegramFileId: true,
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // Downloadable when ready AND at least one storage location exists —
      // Telegram (primary since Phase 4 S1) or MinIO (legacy/fallback).
      // telegramFileId itself is never returned to the client.
      if (
        row.status !== "ready" ||
        (row.telegramFileId === null && row.filePath === null)
      ) {
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
  retry: matrixProcedure(adminProcedure, "exports", "update")
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
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: {
          status: "queued",
          filePath: null,
          telegramFileId: null,
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

  /**
   * cancel — admin stops a pending (queued/rendering) export, giving a
   * stuck-"Queued" (or unwanted "Rendering") row an escape hatch. Best-effort
   * removes the underlying BullMQ job via cancelPdfRender (jobId
   * `pdf-render__${id}`) — a job the worker already has ACTIVE/locked cannot
   * be force-removed, so cancelPdfRender is a no-op in that case (see its
   * doc comment). Regardless of queue-removal outcome, the row is always
   * flipped to the terminal state so the UI stops treating it as in-flight.
   *
   * There is no "cancelled" value on ReportExportStatus — reusing "failed"
   * with an explicit errorMessage avoids an enum migration (per spec).
   *
   * RBAC: adminProcedure (super_admin + site_admin), same posture as retry.
   * Tenant scope enforced via findFirst {id, tenantId} — NOT_FOUND for
   * cross-tenant rows (never leaks existence).
   */
  cancel: matrixProcedure(adminProcedure, "exports", "update")
    .input(cancelReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Best-effort queue cleanup first (never throws) — see cancelPdfRender
      // doc comment for the active-job caveat.
      await cancelPdfRender(existing.id);

      const updated = await prisma.reportExport.update({
        where: { id: existing.id },
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: {
          status: "failed",
          errorMessage: "Cancelled by user",
          completedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "EXPORT_CANCELLED",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          entityType: "ReportExport",
          entityId: existing.id,
          changesJson: { previousStatus: existing.status },
        },
      });

      return updated;
    }),

  /**
   * delete — admin permanently removes a terminal (ready/failed) export
   * row. Also best-effort clears any lingering BullMQ job for the id via
   * cancelPdfRender, so a delete fully cleans up even if the row was left
   * in a stuck queued/rendering state before being deleted directly.
   *
   * RBAC: adminProcedure (super_admin + site_admin). Tenant scope enforced
   * via findFirst {id, tenantId} — NOT_FOUND for cross-tenant rows (never
   * leaks existence), same posture as retry/cancel.
   */
  delete: matrixProcedure(adminProcedure, "exports", "delete")
    .input(deleteReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await cancelPdfRender(existing.id);

      await prisma.reportExport.delete({ where: { id: existing.id } });

      await prisma.auditLog.create({
        data: {
          action: "EXPORT_DELETED",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          entityType: "ReportExport",
          entityId: existing.id,
          changesJson: { previousStatus: existing.status },
        },
      });

      return { id: existing.id };
    }),

  /**
   * renderPptx — on-demand "Render to PowerPoint" for an already-`ready`
   * PDF export. NEVER auto-fired — strictly a user-initiated conversion of
   * an existing report PDF into a .pptx (one slide per PDF page). Requires
   * the row's PDF status to already be "ready"; a queued/rendering/failed
   * PDF cannot be converted (the row has no finished PDF to convert yet).
   *
   * Resets pptxStatus=queued + clears prior pptx fields (a re-request after
   * a completed/failed prior PPTX render must actually re-run, not surface
   * stale state), then enqueues the pptx-render job. Same jobId-dedupe
   * posture as reportExport.create/retry — the BullMQ jobId pattern
   * `pptx-render__${id}` collapses double-clicks to one job.
   *
   * RBAC: adminProcedure (super_admin + site_admin) — more restrictive
   * than the coordinatorProcedure gating the original PDF `create`, since
   * PPTX rendering is an additional, optional, admin-triggered conversion
   * rather than the primary report-generation flow.
   */
  renderPptx: matrixProcedure(adminProcedure, "exports", "write")
    .input(renderPptxReportExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { id: true, status: true, telegramFileId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (existing.status !== "ready" || existing.telegramFileId === null) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cannot render PowerPoint until the PDF report has finished generating.",
        });
      }

      const updated = await prisma.reportExport.update({
        where: { id: existing.id },
        omit: { telegramFileId: true, pptxTelegramFileId: true },
        data: {
          pptxStatus: "queued",
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
   * an on-demand PPTX render to complete. Mirrors pollStatus.
   */
  pollPptxStatus: matrixProcedure(tenantProcedure, "exports", "view")
    .input(pollPptxReportExportStatusInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          pptxStatus: true,
          pptxErrorMessage: true,
          pptxFileSizeBytes: true,
        },
      });
    }),

  /**
   * getPptxDownloadUrl — returns the PPTX download URL once pptxStatus is
   * "ready". Mirrors getDownloadUrl's NOT_FOUND-on-cross-tenant posture —
   * never leaks existence. telegramFileId itself is never returned to the
   * client.
   */
  getPptxDownloadUrl: matrixProcedure(tenantProcedure, "exports", "view")
    .input(getPptxReportExportDownloadUrlInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await prisma.reportExport.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: {
          id: true,
          pptxStatus: true,
          pptxTelegramFileId: true,
        },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (row.pptxStatus !== "ready" || row.pptxTelegramFileId === null) {
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
