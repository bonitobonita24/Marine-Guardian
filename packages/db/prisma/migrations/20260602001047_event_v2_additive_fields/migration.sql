-- DropForeignKey
ALTER TABLE "notification_recipients" DROP CONSTRAINT "notification_recipients_user_id_fkey";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "action_taken" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "end_time" TIMESTAMP(3),
ADD COLUMN     "has_photo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offender_name" TEXT,
ADD COLUMN     "reported_by_known_ranger_id" TEXT,
ADD COLUMN     "reported_by_user_id" TEXT,
ADD COLUMN     "vessel_name" TEXT,
ADD COLUMN     "vessel_registration" TEXT;

-- CreateIndex
CREATE INDEX "events_tenant_id_reported_by_user_id_idx" ON "events"("tenant_id", "reported_by_user_id");

-- CreateIndex
CREATE INDEX "events_tenant_id_reported_by_known_ranger_id_idx" ON "events"("tenant_id", "reported_by_known_ranger_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_reported_by_known_ranger_id_fkey" FOREIGN KEY ("reported_by_known_ranger_id") REFERENCES "known_rangers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
