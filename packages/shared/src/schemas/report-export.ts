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
