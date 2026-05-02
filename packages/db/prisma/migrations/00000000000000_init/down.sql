-- Down migration: drops all tables, policies, and enums created by the init migration.
-- Run order matters due to foreign key constraints.

-- Drop RLS policies first
DROP POLICY IF EXISTS tenant_isolation ON "users";
DROP POLICY IF EXISTS tenant_isolation ON "event_types";
DROP POLICY IF EXISTS tenant_isolation ON "events";
DROP POLICY IF EXISTS tenant_isolation ON "subjects";
DROP POLICY IF EXISTS tenant_isolation ON "subject_groups";
DROP POLICY IF EXISTS tenant_isolation ON "patrols";
DROP POLICY IF EXISTS tenant_isolation ON "patrol_segments";
DROP POLICY IF EXISTS tenant_isolation ON "observations";
DROP POLICY IF EXISTS tenant_isolation ON "patrol_areas";
DROP POLICY IF EXISTS tenant_isolation ON "patrol_schedules";
DROP POLICY IF EXISTS tenant_isolation ON "alert_rules";
DROP POLICY IF EXISTS tenant_isolation ON "notifications";
DROP POLICY IF EXISTS tenant_isolation ON "accompanying_rangers";

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "known_rangers";
DROP TABLE IF EXISTS "accompanying_rangers";
DROP TABLE IF EXISTS "sync_logs";
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "alert_rules";
DROP TABLE IF EXISTS "patrol_schedules";
DROP TABLE IF EXISTS "patrol_areas";
DROP TABLE IF EXISTS "observations";
DROP TABLE IF EXISTS "patrol_segments";
DROP TABLE IF EXISTS "patrols";
DROP TABLE IF EXISTS "subject_groups";
DROP TABLE IF EXISTS "subjects";
DROP TABLE IF EXISTS "events";
DROP TABLE IF EXISTS "event_types";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "tenants";

-- Drop enums
DROP TYPE IF EXISTS "NotificationChannel";
DROP TYPE IF EXISTS "KnownRangerSource";
DROP TYPE IF EXISTS "AccompanyingEntityType";
DROP TYPE IF EXISTS "RangerType";
DROP TYPE IF EXISTS "NotificationType";
DROP TYPE IF EXISTS "SyncStatus";
DROP TYPE IF EXISTS "SyncType";
DROP TYPE IF EXISTS "EventPriority";
DROP TYPE IF EXISTS "EventState";
DROP TYPE IF EXISTS "PatrolState";
DROP TYPE IF EXISTS "PatrolType";
DROP TYPE IF EXISTS "Language";
DROP TYPE IF EXISTS "UserRole";
