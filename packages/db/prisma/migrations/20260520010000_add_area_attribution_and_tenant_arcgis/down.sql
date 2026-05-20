-- Reverse Sub-batch 4.1e. Lossless: all dropped columns were nullable and any values were
-- derivation-job outputs that can be re-derived. No data loss for production rollback.

-- 1. DropIndex (Patrol)
DROP INDEX "patrols_tenant_id_area_boundary_id_idx";

-- 2. DropForeignKey (Patrol)
ALTER TABLE "patrols" DROP CONSTRAINT "patrols_area_boundary_id_fkey";

-- 3. AlterTable: Patrol — drop area attribution columns
ALTER TABLE "patrols" DROP COLUMN "area_derived_at";
ALTER TABLE "patrols" DROP COLUMN "area_boundary_id";
ALTER TABLE "patrols" DROP COLUMN "area_name";

-- 4. DropIndex (Event)
DROP INDEX "events_tenant_id_area_boundary_id_idx";

-- 5. DropForeignKey (Event)
ALTER TABLE "events" DROP CONSTRAINT "events_area_boundary_id_fkey";

-- 6. AlterTable: Event — drop area attribution columns
ALTER TABLE "events" DROP COLUMN "area_derived_at";
ALTER TABLE "events" DROP COLUMN "area_boundary_id";
ALTER TABLE "events" DROP COLUMN "area_name";

-- 7. AlterTable: Tenant — drop ArcGIS reference fields
ALTER TABLE "tenants" DROP COLUMN "arcgis_boundary_outfields";
ALTER TABLE "tenants" DROP COLUMN "arcgis_boundary_url";
