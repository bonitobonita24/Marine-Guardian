-- Down migration: reverts add_notification_patrol_id.
-- Drops the notifications.patrol_id FK, its index, and the column.
--
-- Note: PostgreSQL cannot drop enum values directly. The SyncStatus.running
-- value swept into the forward migration is a pre-existing schema drift fix
-- and remains as a no-op residue if this migration is rolled back. The
-- notifications.patrol_id changes ARE fully reversible.

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_patrol_id_fkey";
DROP INDEX IF EXISTS "notifications_patrol_id_idx";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "patrol_id";
