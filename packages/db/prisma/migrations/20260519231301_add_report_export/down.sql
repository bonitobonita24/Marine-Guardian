-- Reverse of 20260519231301_add_report_export/migration.sql
-- Drops report_exports table then the enum types it depends on.

DROP TABLE IF EXISTS "report_exports";

DROP TYPE IF EXISTS "ReportExportStatus";

DROP TYPE IF EXISTS "PaperSize";

DROP TYPE IF EXISTS "ReportType";
