-- AlterTable
ALTER TABLE "events" ADD COLUMN     "municipality_assigned_at" TIMESTAMP(3),
ADD COLUMN     "municipality_id" TEXT;

-- AlterTable
ALTER TABLE "patrols" ADD COLUMN     "municipality_assigned_at" TIMESTAMP(3),
ADD COLUMN     "municipality_id" TEXT;

-- CreateTable
CREATE TABLE "municipalities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "psgc_code" TEXT,
    "boundary_geojson" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protected_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundary_geojson" JSONB NOT NULL,
    "parent_municipality_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protected_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_covered_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patrol_id" TEXT NOT NULL,
    "protected_zone_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_covered_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_covered_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "protected_zone_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_covered_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "municipalities_tenant_id_idx" ON "municipalities"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_tenant_id_slug_key" ON "municipalities"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "protected_zones_tenant_id_idx" ON "protected_zones"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "protected_zones_tenant_id_slug_key" ON "protected_zones"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "patrol_covered_zones_tenant_id_idx" ON "patrol_covered_zones"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_covered_zones_patrol_id_protected_zone_id_key" ON "patrol_covered_zones"("patrol_id", "protected_zone_id");

-- CreateIndex
CREATE INDEX "event_covered_zones_tenant_id_idx" ON "event_covered_zones"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_covered_zones_event_id_protected_zone_id_key" ON "event_covered_zones"("event_id", "protected_zone_id");

-- CreateIndex
CREATE INDEX "events_tenant_id_municipality_id_idx" ON "events"("tenant_id", "municipality_id");

-- CreateIndex
CREATE INDEX "patrols_tenant_id_municipality_id_idx" ON "patrols"("tenant_id", "municipality_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma re-emitted the polymorphic FK statements because we added new
-- relations on Event and Patrol. These FKs were deliberately dropped by
-- migration 20260619000000_drop_polymorphic_accompanying_ranger_fks
-- (single entity_id column cannot satisfy two non-deferrable FKs; see
-- accompanying_rangers comment in schema.prisma). Drop them again here
-- to keep the DB in the correct "no polymorphic FKs" state.
-- AddForeignKey (emitted by Prisma — immediately dropped below)
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_event_fk" FOREIGN KEY ("entity_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (emitted by Prisma — immediately dropped below)
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_patrol_fk" FOREIGN KEY ("entity_id") REFERENCES "patrols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Re-drop polymorphic FKs (same logic as 20260619000000 — keeps the drop
-- as the final state in the concatenated migration history).
ALTER TABLE "accompanying_rangers" DROP CONSTRAINT IF EXISTS "accompanying_ranger_event_fk";
ALTER TABLE "accompanying_rangers" DROP CONSTRAINT IF EXISTS "accompanying_ranger_patrol_fk";

-- AddForeignKey
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_zones" ADD CONSTRAINT "protected_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_zones" ADD CONSTRAINT "protected_zones_parent_municipality_id_fkey" FOREIGN KEY ("parent_municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_covered_zones" ADD CONSTRAINT "patrol_covered_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_covered_zones" ADD CONSTRAINT "patrol_covered_zones_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_covered_zones" ADD CONSTRAINT "patrol_covered_zones_protected_zone_id_fkey" FOREIGN KEY ("protected_zone_id") REFERENCES "protected_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_covered_zones" ADD CONSTRAINT "event_covered_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_covered_zones" ADD CONSTRAINT "event_covered_zones_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_covered_zones" ADD CONSTRAINT "event_covered_zones_protected_zone_id_fkey" FOREIGN KEY ("protected_zone_id") REFERENCES "protected_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
