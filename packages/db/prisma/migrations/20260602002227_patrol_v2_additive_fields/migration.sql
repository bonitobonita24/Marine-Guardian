-- AlterTable
ALTER TABLE "patrols" ADD COLUMN     "computed_distance_km" DOUBLE PRECISION,
ADD COLUMN     "computed_duration_hours" DOUBLE PRECISION,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "end_location_lat" DOUBLE PRECISION,
ADD COLUMN     "end_location_lon" DOUBLE PRECISION,
ADD COLUMN     "first_seen_at" TIMESTAMP(3),
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_test_patrol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "start_location_lat" DOUBLE PRECISION,
ADD COLUMN     "start_location_lon" DOUBLE PRECISION,
ADD COLUMN     "sync_needed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "patrols_tenant_id_sync_needed_last_synced_at_idx" ON "patrols"("tenant_id", "sync_needed", "last_synced_at");

-- CreateIndex
CREATE INDEX "patrols_tenant_id_is_deleted_idx" ON "patrols"("tenant_id", "is_deleted");

-- CreateIndex
CREATE INDEX "patrols_tenant_id_is_test_patrol_idx" ON "patrols"("tenant_id", "is_test_patrol");
