-- Additive: derived municipal-water polygon (nullable, no data loss).
ALTER TABLE "municipalities" ADD COLUMN "water_geojson" JSONB;
