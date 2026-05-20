// Barrel export for area-derivation pure functions.
// Consumed by 5.1b (persistence helper), 5.1c (BullMQ processor),
// 5.1d (sync engine), 5.1e (admin re-derive button).

export { matchByName } from "./match-by-name";
export {
  findNearestBoundary,
  haversineKm,
  pointToSegmentDistanceKm,
  DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM,
} from "./find-nearest-boundary";
export { deriveArea } from "./derive-area";
export type {
  DeriveAreaInput,
  DeriveAreaResult,
  MatchSource,
} from "./derive-area";
export type {
  AreaBoundaryForDerivation,
  LatLon,
  GeometryKind,
} from "./types";
