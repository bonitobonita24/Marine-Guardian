-- AlterTable
ALTER TABLE "events" ADD COLUMN "terrain" TEXT;
ALTER TABLE "patrols" ADD COLUMN "terrain" TEXT;

-- CreateIndex
CREATE INDEX "events_tenant_id_terrain_idx" ON "events"("tenant_id", "terrain");
CREATE INDEX "patrols_tenant_id_terrain_idx" ON "patrols"("tenant_id", "terrain");
