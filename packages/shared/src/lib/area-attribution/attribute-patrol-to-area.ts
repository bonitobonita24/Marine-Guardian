// attribute-patrol-to-area.ts
//
// Composite Page 2 attribution per v2 PRODUCT.md L771:
//   1. nearestStartArea(patrol.start_location, enabledAreaBoundaries)
//      — geographic match first
//   2. featureMatchesArea(patrol.areaName, enabledAreaBoundaries)
//      — name/alias fallback when nearest is null
//   3. Otherwise return null (the patrol is "Outside enabled boundaries").
//
// Note: this priority order is INVERTED from area-derivation/deriveArea
// (which is name-first, nearest-fallback). Page 2 attributes patrols by
// where they actually went, with names as a corrective for patrols that
// have no recorded start point (manual entry, no track).

import { nearestStartArea } from "./nearest-start-area";
import { featureMatchesArea } from "./feature-matches-area";
import type {
  AreaBoundaryForDerivation,
  PatrolAttribution,
  PatrolForAttribution,
} from "./types";

export function attributePatrolToArea(
  patrol: PatrolForAttribution,
  enabledBoundaries: AreaBoundaryForDerivation[],
): PatrolAttribution {
  const nearest = nearestStartArea(patrol.startLocation, enabledBoundaries);
  if (nearest !== null) {
    return {
      patrolId: patrol.id,
      areaBoundaryId: nearest.id,
      matchedVia: "nearest",
    };
  }

  const byName = featureMatchesArea(patrol.areaName, enabledBoundaries);
  if (byName !== null) {
    return {
      patrolId: patrol.id,
      areaBoundaryId: byName.id,
      matchedVia: "feature-name",
    };
  }

  return { patrolId: patrol.id, areaBoundaryId: null, matchedVia: null };
}
