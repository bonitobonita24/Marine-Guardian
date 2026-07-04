-- Additive: link an Event to the Patrol it belongs to.
-- ER surfaces this via patrol.patrol_segments[].events[].id on every patrol
-- sync (never a reliable event-side back-reference) — see syncPatrols() in
-- packages/jobs/src/processors/er-sync.processor.ts, which backfills this
-- column via event.updateMany() keyed on (tenantId, erEventId).
-- Nullable + ON DELETE SET NULL: safe, non-breaking for existing rows.
ALTER TABLE "events" ADD COLUMN "patrol_id" TEXT;

CREATE INDEX "events_tenant_id_patrol_id_idx" ON "events"("tenant_id", "patrol_id");

ALTER TABLE "events" ADD CONSTRAINT "events_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
