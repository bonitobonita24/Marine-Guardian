// types.ts — internal shape used by area-attribution pure functions.
//
// Area-attribution differs from area-derivation:
// - area-derivation (5.1) decides which AreaBoundary a NEW or imported
//   patrol/incident row "belongs" to, name-first then nearest, and writes
//   back the resolved id. Runs once per row at sync/create time.
// - area-attribution (6.1b) groups an EXISTING set of patrols by the
//   enabled boundary nearest to where each one actually started, then
//   falls back to feature-name match if nearest is out of threshold.
//   Runs at report-render time, never writes back.
//
// The two share their underlying primitives (findNearestBoundary +
// matchByName) but invert the priority. Page 2 of the Coverage Report
// is geographically grouping field activity; the area-derivation
// composite was admin-friendly bookkeeping.

import type { AreaBoundaryForDerivation, LatLon } from "../area-derivation";

export type { AreaBoundaryForDerivation, LatLon };

export type AttributionSource = "nearest" | "feature-name" | null;

export interface PatrolForAttribution {
  id: string;
  /** GeoJSON start point — first point of the materialised track. */
  startLocation: LatLon | null;
  /** Free-text area name from the patrol row — fallback when start is out of threshold. */
  areaName: string | null;
}

export interface PatrolAttribution {
  patrolId: string;
  /** Boundary id when matched; null when no boundary within threshold AND no name match. */
  areaBoundaryId: string | null;
  /** Which strategy resolved the match. */
  matchedVia: AttributionSource;
}

export interface AreaPatrolCount {
  areaBoundaryId: string;
  areaName: string;
  patrolCount: number;
}
