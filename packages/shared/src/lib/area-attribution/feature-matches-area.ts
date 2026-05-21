// feature-matches-area.ts
//
// Page 2 attribution primitive #2: pure wrapper over matchByName that
// matches a free-text feature name against AreaBoundary.name OR aliases[]
// (case-insensitive + trimmed, enabled boundaries only — matchByName
// already filters internally).
//
// Spec semantics (v2 PRODUCT.md L771 page 2): the "feature name" comes
// from the patrol row's free-text areaName column. Future syncs may
// populate it from a GeoJSON Feature.properties.name when the upstream
// EarthRanger / sync engine surfaces that field — at that point this
// wrapper stays unchanged. The wrapper exists so the report-render layer
// reads as one statement per attribution attempt, matching the spec.

import { matchByName } from "../area-derivation";
import type { AreaBoundaryForDerivation } from "./types";

export function featureMatchesArea(
  featureName: string | null | undefined,
  enabledBoundaries: AreaBoundaryForDerivation[],
): AreaBoundaryForDerivation | null {
  return matchByName(featureName ?? null, enabledBoundaries);
}
