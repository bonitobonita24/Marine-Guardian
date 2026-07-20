import { z } from "zod";
import {
  paperSizeSchema,
  reportExportStatusSchema,
  reportTypeSchema,
} from "./enums";

/**
 * ReportExport — Command Center native (per v2 PRODUCT.md §505-506).
 *
 * Async PDF export tracker. Lifecycle: create (status=queued) → BullMQ pdf-render
 * worker picks up → status=rendering → status=ready (with file_path) OR failed.
 *
 * This scaffold deliberately STOPS at the row contract. The BullMQ enqueue side,
 * the Puppeteer worker, and the download endpoint are intentionally NOT wired —
 * those are future batch work. `create` here only inserts the queued row.
 */
export const reportExportSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  requestedByUserId: z.string().cuid(),
  reportType: reportTypeSchema,
  paramsJson: z.record(z.unknown()),
  paperSize: paperSizeSchema,
  status: reportExportStatusSchema,
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

// For report-map exports, paramsJson carries { templateId, from, to, municipalityId, protectedZoneId }.
export const createReportExportInputSchema = z.object({
  reportType: reportTypeSchema,
  paramsJson: z.record(z.unknown()),
  paperSize: paperSizeSchema.default("A4"),
});

export const pollReportExportStatusInputSchema = z.object({
  id: z.string(),
});

export const getReportExportDownloadUrlInputSchema = z.object({
  id: z.string(),
});

/**
 * Purge input — best-effort immediate cleanup of the exports a user just
 * generated, fired by the Generate Printable Report dialog on close. The
 * export-janitor TTL sweep remains the AUTHORITY for deletion; this is an
 * optimisation on top of it.
 *
 * Bounded to 20 ids: one dialog session can only produce a handful of
 * exports, and an unbounded array would let a hostile client turn one
 * request into an arbitrarily long storage-delete loop.
 *
 * Tenant scope enforced server-side via session.tenantId — ids that are
 * unknown or belong to another tenant are silently skipped.
 */
export const purgeReportExportsInputSchema = z.object({
  ids: z.array(z.string()).min(1).max(20),
});

/**
 * renderPptx input — triggers an on-demand PowerPoint render of a report
 * export. Never auto-fired; strictly user-initiated. Tenant scope enforced
 * server-side via session.tenantId.
 */
export const renderPptxReportExportInputSchema = z.object({
  id: z.string(),
});

/**
 * pollPptxStatus input — lightweight read for the UI to poll while a PPTX
 * render is in flight. Mirrors pollReportExportStatusInputSchema.
 */
export const pollPptxReportExportStatusInputSchema = z.object({
  id: z.string(),
});

/**
 * getPptxDownloadUrl input — mirrors getReportExportDownloadUrlInputSchema.
 */
export const getPptxReportExportDownloadUrlInputSchema = z.object({
  id: z.string(),
});
