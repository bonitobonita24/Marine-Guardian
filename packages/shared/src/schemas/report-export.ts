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

export const listReportExportsInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  status: reportExportStatusSchema.optional(),
  reportType: reportTypeSchema.optional(),
});

export const getReportExportByIdInputSchema = z.object({
  id: z.string(),
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
 * Retry input — admin re-enqueues a previously-failed (or stuck-queued)
 * export. Resets status to "queued" and re-fires the pdf-render job.
 * Tenant scope enforced server-side via session.tenantId.
 */
export const retryReportExportInputSchema = z.object({
  id: z.string(),
});

/**
 * Delete input — admin removes a terminal (ready/failed) export row.
 * Tenant scope enforced server-side via session.tenantId.
 */
export const deleteReportExportInputSchema = z.object({
  id: z.string(),
});

/**
 * Cancel input — admin stops a pending (queued/rendering) export. There is
 * no dedicated "cancelled" status value on ReportExportStatus; cancel
 * reuses "failed" with errorMessage="Cancelled by user" rather than adding
 * an enum value / migration. Tenant scope enforced server-side via
 * session.tenantId.
 */
export const cancelReportExportInputSchema = z.object({
  id: z.string(),
});

/**
 * renderPptx input — admin triggers on-demand PDF→PowerPoint rendering for
 * an already-`ready` export. Never auto-fired; strictly a user-initiated
 * conversion of an existing report PDF. Tenant scope enforced server-side
 * via session.tenantId.
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
