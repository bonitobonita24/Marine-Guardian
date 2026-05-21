// compute-coverage-hours.ts — coverage_hrs derivation per patrol×boundary.
//
// Current implementation: pro-rate totalHours by km fraction. Every patrol
// with a non-null positive totalHours triggers `estimated = true` for the
// boundary it contributed to. PatrolTrack has no per-point timestamps in
// the current schema (v2 §645–§771) — when that column lands, the body of
// this function flips to real time-interval interpolation while preserving
// the signature.

export interface CoverageHoursResult {
  /** Pro-rated hours for this patrol's contribution to the boundary. 0 when un-knowable. */
  coverageHrs: number;
  /** True when the result was pro-rated (counts toward hrsEstimatedCount). */
  estimated: boolean;
}

export function computeCoverageHours(
  totalHours: number | null,
  coverageKm: number,
  trackTotalKm: number,
): CoverageHoursResult {
  if (coverageKm <= 0) return { coverageHrs: 0, estimated: false };
  if (totalHours === null || totalHours <= 0) {
    return { coverageHrs: 0, estimated: false };
  }
  if (trackTotalKm <= 0) return { coverageHrs: 0, estimated: false };

  const fraction = coverageKm / trackTotalKm;
  // Clamp to [0, 1] — clipped length should never exceed total but float
  // drift on tracks that hug a boundary edge could push the ratio above 1.
  const clamped = Math.max(0, Math.min(1, fraction));
  return { coverageHrs: totalHours * clamped, estimated: true };
}
