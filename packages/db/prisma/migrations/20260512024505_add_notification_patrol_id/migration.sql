-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE 'running';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "patrol_id" TEXT;

-- CreateIndex
CREATE INDEX "notifications_patrol_id_idx" ON "notifications"("patrol_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
