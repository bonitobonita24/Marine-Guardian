-- Add provenance marker to covered-zone junction tables.
-- Existing rows are all geometry-derived, so DEFAULT 'geometry' backfills them correctly.
CREATE TYPE "CoveredZoneSource" AS ENUM ('geometry', 'title_hint');

ALTER TABLE "patrol_covered_zones"
  ADD COLUMN "source" "CoveredZoneSource" NOT NULL DEFAULT 'geometry';

ALTER TABLE "event_covered_zones"
  ADD COLUMN "source" "CoveredZoneSource" NOT NULL DEFAULT 'geometry';
