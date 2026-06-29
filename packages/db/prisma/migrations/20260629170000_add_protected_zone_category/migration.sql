-- Additive: sub-area category for protected zones (nullable-safe via NOT NULL DEFAULT).
-- "mpa" (Marine Protected Area) | "special_area" (named sub-boundary under a municipality).
-- Existing rows (seeded MPAs) take the default 'mpa'. No data loss.
ALTER TABLE "protected_zones" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'mpa';
