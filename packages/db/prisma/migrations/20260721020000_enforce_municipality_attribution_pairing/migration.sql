-- Make municipality VALUE and municipality PROVENANCE inseparable.
--
-- THE BUG THIS CLOSES
--   Dev accumulated 34 events with `municipality_id` set and
--   `municipality_attribution_method` NULL, plus 1 patrol with the inverse
--   (method `title_hint`, `municipality_id` NULL).
--
--   There was NO second writer and NO disagreement about the VALUE. Every live
--   writer -- the municipality-assign processor, the event/patrol
--   setMunicipalityOverride mutations, and the one-time backfill scripts --
--   already writes both columns in the SAME statement. Re-running containment
--   over the stored coordinates reproduced the stored municipality EXACTLY for
--   all 34 events, and correctly reproduced "unattributed" for the 1 patrol.
--
--   The rows were written by a dev WORKER container running an image built
--   minutes before 825cf6c ("record containment provenance on municipality
--   assignment"). That build's update payload was
--   `{ municipalityId, municipalityAssignedAt, terrain }` -- no method key at
--   all -- so it set the value and silently left the provenance behind. The
--   inverse patrol is the same single cause in the other direction: the stale
--   worker nulled `municipality_id` (containment found nothing) while leaving
--   an earlier `title_hint` claim standing.
--
--   So the defect was never in the source; it was that a stale writer COULD
--   set one column without the other and nothing objected. A row with a
--   municipality but a NULL method is invisible to every method-keyed filter
--   (the officer needs-review queue, 4f41c57) and misrepresents how it was
--   attributed.
--
-- WHAT THIS DOES
--   A CHECK constraint per table asserting the biconditional: either BOTH
--   columns are NULL (never attributed / handed back to auto-attribution) or
--   BOTH are set (a value together with how it was derived). This is enforced
--   against ANY writer -- including a stale worker image that the TypeScript
--   test suite never runs against, which is exactly the gap that produced the
--   drift. The application-level counterpart is the pairing-invariant block in
--   packages/jobs/src/processors/__tests__/municipality-assign.processor.test.ts.
--
-- WHY `NOT VALID`
--   NOT VALID still enforces the constraint on every INSERT and UPDATE from
--   this moment on -- it only skips the one-time scan of pre-existing rows.
--   That is deliberate: an environment whose legacy backlog has not been
--   repaired yet must NOT have its deploy fail, and the drifted rows must NOT
--   be silently "fixed" by guessing a provenance value inside a migration.
--   Repair is a separate, verifiable, geometry-recomputing step:
--
--     scripts/repair-municipality-attribution-pairing.ts --dry-run
--     scripts/repair-municipality-attribution-pairing.ts --execute
--
--   That script recomputes containment per row, refuses to guess when the
--   recomputed value disagrees with the stored one, and runs
--   `VALIDATE CONSTRAINT` at the end once the table is provably clean.
--
-- ⚠ DEPLOY ORDERING (staging / production)
--   Ship the WORKER image at >= 825cf6c BEFORE applying this migration. A
--   pre-825cf6c worker sets `municipality_id` without the method, and once this
--   constraint exists such a write is REJECTED -- the assign job will fail
--   loudly and retry rather than corrupt provenance. That is the intended
--   trade (loud failure over silent drift), but it means the app/worker image
--   must lead the migration, not trail it.
--
-- No enum change is required: `MunicipalityAttributionMethod` already carries
-- every value this invariant needs (containment / nearest / title_hint /
-- manual). Nothing here uses DROP/CREATE on the type.

ALTER TABLE "events"
  ADD CONSTRAINT "events_municipality_attribution_paired"
  CHECK (("municipality_id" IS NULL) = ("municipality_attribution_method" IS NULL))
  NOT VALID;

ALTER TABLE "patrols"
  ADD CONSTRAINT "patrols_municipality_attribution_paired"
  CHECK (("municipality_id" IS NULL) = ("municipality_attribution_method" IS NULL))
  NOT VALID;
