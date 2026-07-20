-- CreateEnum
CREATE TYPE "MunicipalityAttributionMethod" AS ENUM ('containment', 'nearest', 'manual');

-- AlterTable: patrols
ALTER TABLE "patrols"
  ADD COLUMN     "municipality_attribution_method" "MunicipalityAttributionMethod",
  ADD COLUMN     "municipality_distance_km" DOUBLE PRECISION,
  ADD COLUMN     "municipality_attribution_ambiguous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "start_time_derived_at" TIMESTAMP(3),
  ADD COLUMN     "start_time_manual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "end_time_manual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: events
ALTER TABLE "events"
  ADD COLUMN     "municipality_attribution_method" "MunicipalityAttributionMethod",
  ADD COLUMN     "municipality_distance_km" DOUBLE PRECISION,
  ADD COLUMN     "municipality_attribution_ambiguous" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "patrols_tenant_id_municipality_id_municipality_attribution_idx" ON "patrols"("tenant_id", "municipality_id", "municipality_attribution_method");

-- CreateIndex
CREATE INDEX "events_tenant_id_municipality_id_municipality_attribution_m_idx" ON "events"("tenant_id", "municipality_id", "municipality_attribution_method");

-- DataBackfill: patrols — derive attribution method from existing manual flag / municipality assignment
UPDATE "patrols"
SET "municipality_attribution_method" = CASE
  WHEN "municipality_manual" = true THEN 'manual'::"MunicipalityAttributionMethod"
  WHEN "municipality_id" IS NOT NULL AND "municipality_manual" = false THEN 'containment'::"MunicipalityAttributionMethod"
  ELSE NULL
END;

-- DataBackfill: events — all existing assignments were made via containment
UPDATE "events"
SET "municipality_attribution_method" = 'containment'::"MunicipalityAttributionMethod"
WHERE "municipality_id" IS NOT NULL;
