-- Additive: add event_highlights value to the ReportType enum.
-- Safe: ALTER TYPE ADD VALUE does not lock the table and is reversible only
-- by removing rows (cannot drop enum values without recreating the type).
-- Naming convention: matches reportTypeSchema Zod enum ("event_highlights").
-- Backs the new image-collage "Event Highlights" printable report (2026-07-20).
ALTER TYPE "ReportType" ADD VALUE 'event_highlights';
