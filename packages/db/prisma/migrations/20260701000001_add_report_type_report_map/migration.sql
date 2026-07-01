-- Additive: add report_map value to the ReportType enum.
-- Safe: ALTER TYPE ADD VALUE does not lock the table and is reversible only
-- by removing rows (cannot drop enum values without recreating the type).
-- Naming convention: matches reportTypeSchema Zod enum ("report_map").
ALTER TYPE "ReportType" ADD VALUE 'report_map';
