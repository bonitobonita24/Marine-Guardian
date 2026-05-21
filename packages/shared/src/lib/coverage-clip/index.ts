// Barrel export for coverage-clip pure functions.
// Consumed by 6.1c-ii (apps/web/src/server/coverage-report/) and any future
// report layer that needs per-boundary km/hours coverage from patrol tracks.

export { clipTrackToBoundary } from "./clip-track-to-boundary";
export type { ClipResult } from "./clip-track-to-boundary";
export { computeCoverageHours } from "./compute-coverage-hours";
export type { CoverageHoursResult } from "./compute-coverage-hours";
export { accumulateCoverageByBoundary } from "./accumulate-coverage-by-boundary";
export type {
  AccumulatedCoverage,
  AreaBoundaryForDerivation,
  BoundaryCoverage,
  PatrolForCoverage,
} from "./types";
