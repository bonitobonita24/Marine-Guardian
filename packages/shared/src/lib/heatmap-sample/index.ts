// Barrel export for heatmap-sample pure functions.
// Consumed by apps/web/src/server/per-area-report/ to densify patrol
// LineString tracks into [lat, lon, weight] tuples ready for L.heatLayer
// (Leaflet.heat plugin) on the Per Area Report Page 2 client island.
//
// Decision: leaflet.heat is the locked heatmap renderer per
// DECISIONS_LOG.md "Heatmap Renderer Choice (Phase 8 Batch 6 Sub-batch 6.2b)".
// This library exists because tracks are LineStrings — they need
// densification to a point cloud before L.heatLayer can ingest them.
// Event heatmaps use raw Event.locationLat/locationLon directly (no
// densification needed for native point geometries).

export {
  haversineDistanceMeters,
  sampleTrackPoints,
} from "./sample-track-points";
export type { HeatLatLng, SampleTrackPointsOptions } from "./types";
