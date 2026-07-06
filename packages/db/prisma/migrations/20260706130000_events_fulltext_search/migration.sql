-- Events-page fuzzy full-content search (owner-chosen DEEP option): replaces
-- the old "Filter by area / municipality" box with a true fuzzy/contains
-- search across ALL Event fields, including the event_details_json and
-- notes_json blobs. Backs event.ts's `listViaSearch` $queryRaw path (the
-- eventListFilters.search input), which is only invoked when `search` is
-- supplied — the existing Prisma-fluent `list` path is untouched otherwise.
--
-- pg_trgm gives us a GIN trigram index that accelerates ILIKE '%term%'
-- (substring/contains) queries, which a plain btree index cannot do. The
-- indexed expression concatenates every scalar text column plus the two JSON
-- columns cast to text — it MUST match the expression used in the
-- application query verbatim for the planner to pick up this index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "events_search_trgm_idx" ON "events" USING GIN ((
  coalesce("title", '') || ' ' ||
  coalesce("reported_by_name", '') || ' ' ||
  coalesce("offender_name", '') || ' ' ||
  coalesce("vessel_name", '') || ' ' ||
  coalesce("vessel_registration", '') || ' ' ||
  coalesce("address", '') || ' ' ||
  coalesce("action_taken", '') || ' ' ||
  coalesce("area_name", '') || ' ' ||
  coalesce("serial_number", '') || ' ' ||
  coalesce("event_details_json"::text, '') || ' ' ||
  coalesce("notes_json"::text, '')
) gin_trgm_ops);
