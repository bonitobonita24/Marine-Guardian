-- Phase 8 Batch 4 Sub-batch 4.1e: Area attribution columns on Event/Patrol + Tenant ArcGIS reference fields.
-- v2 spec refs: docs/v2/PRODUCT.md L449 (Tenant), L456 (Event), L463 (Patrol).
-- All additive nullable — no backfill needed. Fields stay NULL until Batch 5+ derivation job lands.

-- 1. AlterTable: Tenant — add ArcGIS reference fields (encrypted at app layer like other ER credentials)
ALTER TABLE "tenants" ADD COLUMN "arcgis_boundary_url" TEXT;
ALTER TABLE "tenants" ADD COLUMN "arcgis_boundary_outfields" TEXT;

-- 2. AlterTable: Event — add area attribution columns
ALTER TABLE "events" ADD COLUMN "area_name" TEXT;
ALTER TABLE "events" ADD COLUMN "area_boundary_id" TEXT;
ALTER TABLE "events" ADD COLUMN "area_derived_at" TIMESTAMP(3);

-- 3. AddForeignKey: Event → AreaBoundary (SET NULL on boundary delete, matches FuelEntry precedent)
ALTER TABLE "events" ADD CONSTRAINT "events_area_boundary_id_fkey" FOREIGN KEY ("area_boundary_id") REFERENCES "area_boundaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. CreateIndex: composite for "events in this area" queries (used by Per Area Report — Batch 6+)
CREATE INDEX "events_tenant_id_area_boundary_id_idx" ON "events"("tenant_id", "area_boundary_id");

-- 5. AlterTable: Patrol — add area attribution columns
ALTER TABLE "patrols" ADD COLUMN "area_name" TEXT;
ALTER TABLE "patrols" ADD COLUMN "area_boundary_id" TEXT;
ALTER TABLE "patrols" ADD COLUMN "area_derived_at" TIMESTAMP(3);

-- 6. AddForeignKey: Patrol → AreaBoundary (SET NULL — matches Event + FuelEntry)
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_area_boundary_id_fkey" FOREIGN KEY ("area_boundary_id") REFERENCES "area_boundaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. CreateIndex: composite for "patrols in this area" queries
CREATE INDEX "patrols_tenant_id_area_boundary_id_idx" ON "patrols"("tenant_id", "area_boundary_id");
