-- AlterTable: replace unused water_geojson with a land/water terrain classifier
ALTER TABLE "protected_zones" DROP COLUMN "water_geojson";
ALTER TABLE "protected_zones" ADD COLUMN "terrain" TEXT NOT NULL DEFAULT 'land';
