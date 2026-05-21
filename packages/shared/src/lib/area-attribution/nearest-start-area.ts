// nearest-start-area.ts
//
// Page 2 attribution primitive #1: pure wrapper over findNearestBoundary
// that returns the FULL boundary object (not just its id). Matches the
// signature the v2 PRODUCT.md L771 page 2 spec prescribes verbatim:
//   nearestStartArea(patrol.start_location, enabledAreaBoundaries)
//
// Uses the same 5 km default threshold as the area-derivation primitive
// (DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM). Pure — no I/O, no state.

import {
  DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM,
  findNearestBoundary,
} from "../area-derivation";
import type { AreaBoundaryForDerivation, LatLon } from "./types";

export function nearestStartArea(
  startLocation: LatLon | null | undefined,
  enabledBoundaries: AreaBoundaryForDerivation[],
  thresholdKm: number = DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM,
): AreaBoundaryForDerivation | null {
  if (startLocation === null || startLocation === undefined) return null;
  return findNearestBoundary(startLocation, enabledBoundaries, thresholdKm);
}
