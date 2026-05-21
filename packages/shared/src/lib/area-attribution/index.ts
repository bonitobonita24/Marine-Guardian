// Barrel export for area-attribution pure functions.
// Consumed by 6.1b (apps/web/src/server/coverage-report/) and any future
// report layer that groups patrols by enabled AreaBoundary.

export { nearestStartArea } from "./nearest-start-area";
export { featureMatchesArea } from "./feature-matches-area";
export { attributePatrolToArea } from "./attribute-patrol-to-area";
export { countPatrolsByArea } from "./count-patrols-by-area";
export type { CountPatrolsByAreaResult } from "./count-patrols-by-area";
export type {
  AreaBoundaryForDerivation,
  AreaPatrolCount,
  AttributionSource,
  LatLon,
  PatrolAttribution,
  PatrolForAttribution,
} from "./types";
