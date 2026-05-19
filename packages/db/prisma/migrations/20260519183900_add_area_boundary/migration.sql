-- CreateEnum
CREATE TYPE "BoundarySource" AS ENUM ('official', 'custom');

-- CreateEnum
CREATE TYPE "GeometryType" AS ENUM ('Polygon', 'LineString');

-- CreateTable
CREATE TABLE "area_boundaries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "region" TEXT NOT NULL,
    "source" "BoundarySource" NOT NULL DEFAULT 'custom',
    "geometry_type" "GeometryType" NOT NULL,
    "geometry_geojson" JSONB NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "override_official" BOOLEAN NOT NULL DEFAULT false,
    "arcgis_reference_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "area_boundaries_tenant_id_idx" ON "area_boundaries"("tenant_id");

-- CreateIndex
CREATE INDEX "area_boundaries_tenant_id_is_enabled_idx" ON "area_boundaries"("tenant_id", "is_enabled");

-- AddForeignKey
ALTER TABLE "area_boundaries" ADD CONSTRAINT "area_boundaries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_boundaries" ADD CONSTRAINT "area_boundaries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
