// types.ts — internal shape for the heatmap-sample primitive.
//
// heatmap-sample densifies GeoJSON LineString patrol tracks into evenly-
// spaced [lat, lon, weight] tuples ready for direct consumption by
// L.heatLayer (Leaflet.heat plugin). Built for Per Area Report Page 2
// (6.2b) patrol-track heatmap variant. Event heatmaps use raw lat/lon
// from Event.locationLat/locationLon — they do NOT go through this
// library because Event rows are already point geometries.
//
// Convention notes (gotcha-bait):
//   • Input is GeoJSON convention: Array<[lon, lat]> (longitude first).
//   • Output is Leaflet HeatLatLng convention: [lat, lon, weight].
//   • The convention flip is embedded inside this library so consumers
//     never need to remember which order their library expects. The cost
//     is that this lib is specifically "for-leaflet-heat" by name — a
//     future SVG renderer would need its own primitive (not currently
//     planned per the locked "Heatmap Renderer Choice" decision).

/**
 * Leaflet HeatLatLng tuple: `[lat, lon, weight]`.
 *
 * weight is unitless; L.heatLayer normalizes against the input set so
 * 1.0 / 2.0 / 0.5 behave relatively. Per 6.2b-i, every emitted tuple
 * receives the same weight (default 1) — pre-aggregation of duplicate
 * positions is deferred to a future enhancement if needed.
 */
export type HeatLatLng = [number, number, number];

export interface SampleTrackPointsOptions {
  /**
   * Distance between sampled points in meters along the great-circle
   * arc length of the input LineString. Default: 250 (per the locked
   * "Heatmap Renderer Choice" decision in DECISIONS_LOG.md).
   *
   * Smaller intervals produce denser heatmaps + larger payloads to the
   * client island. 250m balances visual coverage against transfer size
   * for typical patrol tracks (1-30 km).
   */
  intervalMeters?: number;
  /**
   * Weight attached to each output tuple. Default: 1. Override only
   * when a future Per Area variant pre-aggregates duplicate positions.
   */
  weight?: number;
}
