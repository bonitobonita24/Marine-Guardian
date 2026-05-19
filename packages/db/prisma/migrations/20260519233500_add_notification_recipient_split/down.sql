-- Reverse of 20260519233500_add_notification_recipient_split/migration.sql.
-- Restores user_id + is_read on notifications; drops notification_recipients table + enum.
-- WARNING: lossy if a Notification had N>1 recipients — restores the EARLIEST recipient's user_id.

-- 1. DropIndex (subject_id column being removed)
DROP INDEX "notifications_subject_id_idx";

-- 2. DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_subject_id_fkey";

-- 3. AlterTable: drop subject_id, re-add user_id (nullable initially) + is_read
ALTER TABLE "notifications" DROP COLUMN "subject_id";
ALTER TABLE "notifications" ADD COLUMN "user_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false;

-- 4. Restore user_id + is_read from notification_recipients (earliest per notification).
UPDATE "notifications" n
SET "user_id" = nr."user_id", "is_read" = nr."is_read"
FROM (
  SELECT DISTINCT ON ("notification_id") "notification_id", "user_id", "is_read"
  FROM "notification_recipients"
  ORDER BY "notification_id", "created_at" ASC
) nr
WHERE nr."notification_id" = n."id";

-- 5. Delete orphan notifications with no recipient (would violate NOT NULL).
DELETE FROM "notifications" WHERE "user_id" IS NULL;

-- 6. Enforce NOT NULL
ALTER TABLE "notifications" ALTER COLUMN "user_id" SET NOT NULL;

-- 7. AddForeignKey (restore original user_id FK on notifications)
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 8. CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- 9. DropTable (cascade drops FKs from notification_recipients to notifications + users)
DROP TABLE "notification_recipients";

-- 10. DropEnum
DROP TYPE "NotificationEmailStatus";
