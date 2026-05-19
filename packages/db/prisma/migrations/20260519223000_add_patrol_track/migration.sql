-- CreateEnum
CREATE TYPE "TrackSource" AS ENUM ('er_api', 'cache');

-- CreateTable
CREATE TABLE "patrol_tracks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patrol_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "since" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "track_geojson" JSONB NOT NULL,
    "has_timestamps" BOOLEAN NOT NULL DEFAULT false,
    "point_count" INTEGER NOT NULL DEFAULT 0,
    "last_track_time" TIMESTAMP(3),
    "patrol_ended" BOOLEAN NOT NULL DEFAULT false,
    "source" "TrackSource" NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patrol_tracks_patrol_id_key" ON "patrol_tracks"("patrol_id");

-- CreateIndex
CREATE INDEX "patrol_tracks_tenant_id_idx" ON "patrol_tracks"("tenant_id");

-- CreateIndex
CREATE INDEX "patrol_tracks_tenant_id_patrol_ended_idx" ON "patrol_tracks"("tenant_id", "patrol_ended");

-- AddForeignKey
ALTER TABLE "patrol_tracks" ADD CONSTRAINT "patrol_tracks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_tracks" ADD CONSTRAINT "patrol_tracks_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
