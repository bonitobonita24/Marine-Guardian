-- CreateEnum
CREATE TYPE "PatrolScheduleStatus" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- DropForeignKey
ALTER TABLE "patrol_schedules" DROP CONSTRAINT "patrol_schedules_patrol_area_id_fkey";

-- AlterTable
ALTER TABLE "patrol_schedules" ADD COLUMN     "accompanying_rangers" JSONB,
ADD COLUMN     "planned_hours" DOUBLE PRECISION,
ADD COLUMN     "planned_track_geojson" JSONB,
ADD COLUMN     "status" "PatrolScheduleStatus" NOT NULL DEFAULT 'planned',
ALTER COLUMN "patrol_area_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_patrol_area_id_fkey" FOREIGN KEY ("patrol_area_id") REFERENCES "patrol_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
