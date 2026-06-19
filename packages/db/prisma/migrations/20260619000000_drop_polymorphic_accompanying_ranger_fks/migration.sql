-- Drop the two polymorphic foreign-key constraints on accompanying_rangers.entity_id.
--
-- ROOT CAUSE (HIGH bug — addAccompanyingRanger returns 500 on staging/prod):
-- The `accompanying_rangers` table is a polymorphic join: a single `entity_id`
-- column points at EITHER an event (`entity_type = 'event'`) OR a patrol
-- (`entity_type = 'patrol'`). The init migration created TWO non-deferrable
-- foreign keys on that one column:
--     accompanying_ranger_event_fk  -> events(id)
--     accompanying_ranger_patrol_fk -> patrols(id)
-- A single column can never satisfy both at once. Inserting an event-scoped
-- accompanying ranger satisfies the event FK but VIOLATES the patrol FK (the
-- event id does not exist in `patrols`), and vice-versa. Postgres raises
-- 23503 (foreign_key_violation) on every insert, surfacing as a tRPC 500.
-- Unit tests mock Prisma, so this only reproduces against a real database.
--
-- FIX: polymorphic associations cannot use hard cross-table FKs on a shared
-- column. Referential integrity for `entity_id` is enforced at the application
-- layer instead — `event.addAccompanyingRanger` verifies the parent event
-- exists (and is tenant-scoped) before inserting; the patrol path does the same.
-- The two relations remain in schema.prisma for `include` query support.

ALTER TABLE "accompanying_rangers" DROP CONSTRAINT IF EXISTS "accompanying_ranger_event_fk";
ALTER TABLE "accompanying_rangers" DROP CONSTRAINT IF EXISTS "accompanying_ranger_patrol_fk";
