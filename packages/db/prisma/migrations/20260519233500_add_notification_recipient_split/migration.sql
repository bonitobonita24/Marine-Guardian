-- Phase 8 Batch 4 Sub-batch 4.1d: Split per-user read state OFF Notification ONTO NotificationRecipient.
-- v2 spec: docs/v2/PRODUCT.md L480-484. One Notification row, N NotificationRecipient rows.
-- Pre-flight: SELECT COUNT(*) FROM notifications → 0 rows in dev. Backfill present for staging/prod safety.

-- 1. CreateEnum
CREATE TYPE "NotificationEmailStatus" AS ENUM ('pending', 'sent', 'suppressed_by_cooldown', 'digested', 'failed');

-- 2. CreateTable
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "email_sent_at" TIMESTAMP(3),
    "email_status" "NotificationEmailStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- 3. CreateIndex
CREATE INDEX "notification_recipients_notification_id_idx" ON "notification_recipients"("notification_id");

-- 4. CreateIndex
CREATE INDEX "notification_recipients_user_id_is_read_idx" ON "notification_recipients"("user_id", "is_read");

-- 5. CreateIndex
CREATE INDEX "notification_recipients_user_id_created_at_idx" ON "notification_recipients"("user_id", "created_at" DESC);

-- 6. AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 8. Backfill: one NotificationRecipient per existing Notification, preserving user_id + is_read + created_at.
-- Deterministic ID via md5 → idempotent if re-run by hand. INSERT bypasses Prisma default(cuid()) — OK.
INSERT INTO "notification_recipients" ("id", "notification_id", "user_id", "is_read", "read_at", "email_sent_at", "email_status", "created_at")
SELECT
  'c' || substring(md5('nr_' || "id" || '_' || "user_id") FROM 1 FOR 24),
  "id",
  "user_id",
  "is_read",
  NULL,
  NULL,
  'pending'::"NotificationEmailStatus",
  "created_at"
FROM "notifications";

-- 9. DropIndex (now-removed columns)
DROP INDEX "notifications_user_id_idx";

-- 10. DropIndex
DROP INDEX "notifications_is_read_idx";

-- 11. DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- 12. AlterTable: drop user_id + is_read, add subject_id
ALTER TABLE "notifications" DROP COLUMN "user_id";
ALTER TABLE "notifications" DROP COLUMN "is_read";
ALTER TABLE "notifications" ADD COLUMN "subject_id" TEXT;

-- 13. AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 14. CreateIndex
CREATE INDEX "notifications_subject_id_idx" ON "notifications"("subject_id");
