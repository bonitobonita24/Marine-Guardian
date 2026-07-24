-- Extend covered-zone provenance with two manual-override values.
--
-- `manual_include` — a user manually added a zone the system missed.
-- `manual_exclude` — a TOMBSTONE: a user manually removed a
-- wrongly-attributed zone. The read layer must treat the zone as NOT
-- covered, and the containment/title-hint processor must never re-add
-- (upsert over) a `manual_exclude` row. The row's `source` alone is the
-- lock -- no separate boolean field is introduced.
--
-- Postgres cannot add an enum value and use it in the same transaction,
-- so this migration is enum-only (no data changes), matching the split
-- style of 20260721000000_add_municipality_attribution_provenance /
-- 20260721010000_add_title_hint_attribution_method.
ALTER TYPE "CoveredZoneSource" ADD VALUE IF NOT EXISTS 'manual_include';
ALTER TYPE "CoveredZoneSource" ADD VALUE IF NOT EXISTS 'manual_exclude';
