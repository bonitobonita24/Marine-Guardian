-- Reverse migration for 20260512044045_add_alert_history
-- Drops the alert_history table and its FK constraints.

ALTER TABLE "alert_history" DROP CONSTRAINT IF EXISTS "alert_history_event_id_fkey";
ALTER TABLE "alert_history" DROP CONSTRAINT IF EXISTS "alert_history_alert_rule_id_fkey";
ALTER TABLE "alert_history" DROP CONSTRAINT IF EXISTS "alert_history_tenant_id_fkey";

DROP INDEX IF EXISTS "alert_history_tenant_id_fired_at_idx";
DROP INDEX IF EXISTS "alert_history_event_id_idx";
DROP INDEX IF EXISTS "alert_history_alert_rule_id_idx";
DROP INDEX IF EXISTS "alert_history_tenant_id_idx";

DROP TABLE IF EXISTS "alert_history";
