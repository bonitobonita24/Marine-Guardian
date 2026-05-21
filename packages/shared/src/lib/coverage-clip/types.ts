// types.ts — internal shape used by coverage-clip pure functions.
//
// coverage-clip computes per-boundary coverage_km and coverage_hrs by
// intersecting a patrol's GeoJSON track LineString against each enabled
// AreaBoundary polygon. Produced for Page 3 of the Coverage Report (6.1c).
//
// Reuses AreaBoundaryForDerivation from area-derivation/types.ts so all
// three boundary-aware libraries (area-derivation, area-attribution,
// coverage-clip) consume the same projected boundary shape.
//
// coverage_hrs is pro-rated: totalHours × (coverageKm / trackTotalKm) per
// patrol×boundary. PatrolTrack has no per-point timestamps in the current
// schema — every patrol's hours are estimated, so hrs_estimated_count
// equals patrolsCount whenever totalHours is non-null. A future schema
// addition (per-point timestamps on PatrolTrack) would enable real
// time-interval hours; that landing replaces the body of
// compute-coverage-hours.ts without changing the algorithm's API.

import type { AreaBoundaryForDerivation } from "../area-derivation";

export type { AreaBoundaryForDerivation };

export interface PatrolForCoverage {
  id: string;
  /** Full polyline coordinates [lon, lat] — null when the patrol has no materialised track. */
  trackLineString: Array<[number, number]> | null;
  /** Patrol duration in hours. Used to pro-rate coverage_hrs by km fraction. Null = unknown duration. */
  totalHours: number | null;
}

export interface BoundaryCoverage {
  areaBoundaryId: string;
  areaName: string;
  /** Patrols with non-zero clipped length inside this boundary. */
  patrolsCount: number;
  /** Sum of clipped track length inside this boundary, in kilometers. */
  coverageKm: number;
  /** Sum of pro-rated hours inside this boundary. */
  coverageHrs: number;
  /** Patrols whose coverageHrs contribution to this boundary was pro-rated (totalHours != null). */
  hrsEstimatedCount: number;
}

export interface AccumulatedCoverage {
  /** Per-Polygon-boundary coverage rows, sorted by coverageKm DESC then name ASC. */
  rows: BoundaryCoverage[];
  /** Patrols that have totalHours set but no trackLineString — surfaced in Page 3 footer note. */
  missingTracksCount: number;
}
