-- AlterTable
ALTER TABLE "events" ADD COLUMN     "er_original_snapshot" JSONB;

-- AlterTable
ALTER TABLE "patrols" ADD COLUMN     "er_original_snapshot" JSONB;

-- AlterTable
ALTER TABLE "tenant_er_connections" ADD COLUMN     "interval_ms" INTEGER NOT NULL DEFAULT 300000,
ADD COLUMN     "recurring_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_revisions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_revisions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patrol_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_revisions_tenant_id_event_id_created_at_idx" ON "event_revisions"("tenant_id", "event_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "patrol_revisions_tenant_id_patrol_id_created_at_idx" ON "patrol_revisions"("tenant_id", "patrol_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_logs_tenant_id_sync_type_status_completed_at_idx" ON "sync_logs"("tenant_id", "sync_type", "status", "completed_at" DESC);

-- AddForeignKey
ALTER TABLE "event_revisions" ADD CONSTRAINT "event_revisions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_revisions" ADD CONSTRAINT "patrol_revisions_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTE: The two accompanying_ranger_event_fk / accompanying_ranger_patrol_fk FK statements
-- that Prisma would normally emit here are intentionally OMITTED.
-- Migration 20260619000000_drop_polymorphic_accompanying_ranger_fks already dropped them
-- because the polymorphic entity_id column cannot satisfy both FKs simultaneously —
-- doing so causes a 23503 FK-violation on every insert. Referential integrity is
-- enforced at the application layer. DO NOT re-add these constraints.
