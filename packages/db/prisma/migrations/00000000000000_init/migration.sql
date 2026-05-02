-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'site_admin', 'field_coordinator', 'operator');
CREATE TYPE "Language" AS ENUM ('en', 'id', 'ms');
CREATE TYPE "PatrolType" AS ENUM ('foot', 'seabourn');
CREATE TYPE "PatrolState" AS ENUM ('open', 'done', 'cancelled');
CREATE TYPE "EventState" AS ENUM ('new_event', 'active', 'resolved');
CREATE TYPE "EventPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SyncType" AS ENUM ('events', 'subjects', 'patrols', 'observations', 'event_types');
CREATE TYPE "SyncStatus" AS ENUM ('success', 'failed', 'partial');
CREATE TYPE "NotificationType" AS ENUM ('critical', 'warning', 'info', 'system');
CREATE TYPE "RangerType" AS ENUM ('registered', 'freetext');
CREATE TYPE "AccompanyingEntityType" AS ENUM ('event', 'patrol');
CREATE TYPE "KnownRangerSource" AS ENUM ('earthranger_sync', 'manual_entry');
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email');

-- CreateTable: tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "sync_frequency_seconds" INTEGER NOT NULL DEFAULT 300,
    "earthranger_url" TEXT,
    "earthranger_username" TEXT,
    "earthranger_password" TEXT,
    "earthranger_das_token" TEXT,
    "earthranger_track_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "language_preference" "Language" NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "security_version" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: event_types
CREATE TABLE "event_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_eventtype_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "category" TEXT,
    "default_priority" INTEGER NOT NULL DEFAULT 0,
    "icon_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schema_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable: events
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_event_id" TEXT NOT NULL,
    "event_type_id" TEXT,
    "serial_number" TEXT,
    "title" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "state" "EventState" NOT NULL DEFAULT 'new_event',
    "location_lat" DOUBLE PRECISION,
    "location_lon" DOUBLE PRECISION,
    "reported_by_name" TEXT,
    "reported_at" TIMESTAMP(3),
    "event_details_json" JSONB,
    "notes_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subjects
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_subject_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_subtype" TEXT,
    "last_position_lat" DOUBLE PRECISION,
    "last_position_lon" DOUBLE PRECISION,
    "last_position_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "additional_json" JSONB,
    "group_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subject_groups
CREATE TABLE "subject_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "subject_count" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: patrols
CREATE TABLE "patrols" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_patrol_id" TEXT NOT NULL,
    "serial_number" TEXT,
    "title" TEXT,
    "patrol_type" "PatrolType" NOT NULL,
    "state" "PatrolState" NOT NULL DEFAULT 'open',
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "total_distance_km" DOUBLE PRECISION,
    "total_hours" DOUBLE PRECISION,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrols_pkey" PRIMARY KEY ("id")
);

-- CreateTable: patrol_segments
CREATE TABLE "patrol_segments" (
    "id" TEXT NOT NULL,
    "patrol_id" TEXT NOT NULL,
    "er_segment_id" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3),
    "scheduled_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "leader_name" TEXT,
    "leader_er_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: observations
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "er_observation_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "location_lat" DOUBLE PRECISION NOT NULL,
    "location_lon" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "source_name" TEXT,
    "additional_json" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: patrol_areas
CREATE TABLE "patrol_areas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "patrol_type" "PatrolType" NOT NULL,
    "polygon_geojson" JSONB NOT NULL,
    "color_hex" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: patrol_schedules
CREATE TABLE "patrol_schedules" (
    "id" TEXT NOT NULL,
    "patrol_area_id" TEXT NOT NULL,
    "ranger_user_id" TEXT,
    "ranger_name" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: alert_rules
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition_json" JSONB NOT NULL,
    "notification_channels" "NotificationChannel"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "alert_rule_id" TEXT,
    "event_id" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "notification_type" "NotificationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sync_logs
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sync_type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changes_json" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: accompanying_rangers
CREATE TABLE "accompanying_rangers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" "AccompanyingEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "ranger_type" "RangerType" NOT NULL,
    "registered_user_id" TEXT,
    "known_ranger_id" TEXT,
    "freetext_name" TEXT,
    "added_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accompanying_rangers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: known_rangers
CREATE TABLE "known_rangers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "KnownRangerSource" NOT NULL,
    "er_subject_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "known_rangers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");
CREATE UNIQUE INDEX "event_types_tenant_id_er_eventtype_id_key" ON "event_types"("tenant_id", "er_eventtype_id");
CREATE INDEX "event_types_tenant_id_idx" ON "event_types"("tenant_id");
CREATE UNIQUE INDEX "events_tenant_id_er_event_id_key" ON "events"("tenant_id", "er_event_id");
CREATE INDEX "events_tenant_id_idx" ON "events"("tenant_id");
CREATE INDEX "events_state_idx" ON "events"("state");
CREATE INDEX "events_priority_idx" ON "events"("priority");
CREATE UNIQUE INDEX "subjects_tenant_id_er_subject_id_key" ON "subjects"("tenant_id", "er_subject_id");
CREATE INDEX "subjects_tenant_id_idx" ON "subjects"("tenant_id");
CREATE INDEX "subjects_group_id_idx" ON "subjects"("group_id");
CREATE UNIQUE INDEX "subject_groups_tenant_id_er_group_id_key" ON "subject_groups"("tenant_id", "er_group_id");
CREATE INDEX "subject_groups_tenant_id_idx" ON "subject_groups"("tenant_id");
CREATE INDEX "subject_groups_parent_id_idx" ON "subject_groups"("parent_id");
CREATE UNIQUE INDEX "patrols_tenant_id_er_patrol_id_key" ON "patrols"("tenant_id", "er_patrol_id");
CREATE INDEX "patrols_tenant_id_idx" ON "patrols"("tenant_id");
CREATE INDEX "patrols_state_idx" ON "patrols"("state");
CREATE UNIQUE INDEX "patrol_segments_patrol_id_er_segment_id_key" ON "patrol_segments"("patrol_id", "er_segment_id");
CREATE INDEX "patrol_segments_patrol_id_idx" ON "patrol_segments"("patrol_id");
CREATE UNIQUE INDEX "observations_tenant_id_er_observation_id_key" ON "observations"("tenant_id", "er_observation_id");
CREATE INDEX "observations_tenant_id_idx" ON "observations"("tenant_id");
CREATE INDEX "observations_subject_id_idx" ON "observations"("subject_id");
CREATE INDEX "patrol_areas_tenant_id_idx" ON "patrol_areas"("tenant_id");
CREATE INDEX "patrol_schedules_patrol_area_id_idx" ON "patrol_schedules"("patrol_area_id");
CREATE INDEX "patrol_schedules_ranger_user_id_idx" ON "patrol_schedules"("ranger_user_id");
CREATE INDEX "alert_rules_tenant_id_idx" ON "alert_rules"("tenant_id");
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");
CREATE INDEX "sync_logs_tenant_id_idx" ON "sync_logs"("tenant_id");
CREATE INDEX "sync_logs_sync_type_idx" ON "sync_logs"("sync_type");
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "accompanying_rangers_tenant_id_idx" ON "accompanying_rangers"("tenant_id");
CREATE INDEX "accompanying_rangers_entity_type_entity_id_idx" ON "accompanying_rangers"("entity_type", "entity_id");
CREATE INDEX "accompanying_rangers_known_ranger_id_idx" ON "accompanying_rangers"("known_ranger_id");
CREATE UNIQUE INDEX "known_rangers_tenant_id_er_subject_id_key" ON "known_rangers"("tenant_id", "er_subject_id");
CREATE INDEX "known_rangers_tenant_id_idx" ON "known_rangers"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "subject_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subject_groups" ADD CONSTRAINT "subject_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subject_groups" ADD CONSTRAINT "subject_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "subject_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patrol_segments" ADD CONSTRAINT "patrol_segments_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "observations" ADD CONSTRAINT "observations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "observations" ADD CONSTRAINT "observations_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patrol_areas" ADD CONSTRAINT "patrol_areas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patrol_areas" ADD CONSTRAINT "patrol_areas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_patrol_area_id_fkey" FOREIGN KEY ("patrol_area_id") REFERENCES "patrol_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_ranger_user_id_fkey" FOREIGN KEY ("ranger_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_rangers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_event_fk" FOREIGN KEY ("entity_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_ranger_patrol_fk" FOREIGN KEY ("entity_id") REFERENCES "patrols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_rangers_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_rangers_known_ranger_id_fkey" FOREIGN KEY ("known_ranger_id") REFERENCES "known_rangers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accompanying_rangers" ADD CONSTRAINT "accompanying_rangers_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "known_rangers" ADD CONSTRAINT "known_rangers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────
-- L2: Row Level Security — ACTIVE (multi-tenant mode)
-- ─────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON "users"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text OR tenant_id IS NULL);

ALTER TABLE "event_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_event_types ON "event_types"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_events ON "events"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_subjects ON "subjects"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "subject_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_subject_groups ON "subject_groups"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "patrols" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_patrols ON "patrols"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "observations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_observations ON "observations"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "patrol_areas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_patrol_areas ON "patrol_areas"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "alert_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_alert_rules ON "alert_rules"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notifications ON "notifications"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "sync_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sync_logs ON "sync_logs"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "known_rangers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_known_rangers ON "known_rangers"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "accompanying_rangers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_accompanying_rangers ON "accompanying_rangers"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- Bypass RLS for the Prisma connection role (application manages tenant scoping via L6)
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "event_types" FORCE ROW LEVEL SECURITY;
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subject_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "patrols" FORCE ROW LEVEL SECURITY;
ALTER TABLE "observations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "patrol_areas" FORCE ROW LEVEL SECURITY;
ALTER TABLE "alert_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sync_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "known_rangers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "accompanying_rangers" FORCE ROW LEVEL SECURITY;
