-- On-demand PDF→PowerPoint rendering for ReportExport rows. Additive only —
-- independent of the existing PDF status columns; reuses the existing
-- "ReportExportStatus" enum so no new enum type is needed. Telegram-only
-- storage (pptx_telegram_file_id is the sole store), same posture as the
-- existing telegram_file_id column added in 20260703000000.
ALTER TABLE "report_exports" ADD COLUMN     "pptx_status" "ReportExportStatus",
ADD COLUMN     "pptx_telegram_file_id" TEXT,
ADD COLUMN     "pptx_file_size_bytes" INTEGER,
ADD COLUMN     "pptx_error_message" TEXT;
