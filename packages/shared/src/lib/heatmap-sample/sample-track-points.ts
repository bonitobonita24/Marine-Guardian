// sample-track-points.ts — densify a GeoJSON LineString into evenly-spaced
// [lat, lon, weight] tuples for L.heatLayer (Leaflet.heat plugin).
//
// Algorithm: walk the LineString segment-by-segment, maintaining a
// cumulative-arc-length cursor. At each integer multiple of intervalMeters
// from the start (0, interval, 2*interval, ...), emit a point linearly
// interpolated between the two vertices straddling that arc-distance.
// Segment arc-length is computed via the haversine formula on the WGS-84
// mean Earth radius (6,371,008.8 m).
//
// Linear lat/lon interpolation (vs great-circle interpolation) is a
// deliberate simplification: at 250m intervals over Philippines bounding-
// box latitudes (~5°N - 21°N), the deviation between linear and great-
// circle interpolation is <1cm — invisible at PDF DPI 96-150. Documented
// here so a future global tenant can re-evaluate.
//
// Anti-meridian (longitude ±180 wrap) is NOT handled. v2 launch tenants
// are all in the Philippines (longitudes ~117° E - 127° E), so anti-
// meridian traversal is geometrically impossible. A future tenant
// straddling the date line would need a wrap-aware interpolation here.
//
// Edge cases — all handled defensively for production safety:
//   • length < 2          → []  (degenerate input)
//   • totalArcLength == 0 → [start] (all vertices coincide)
//   • totalArcLength < interval → [start] (sub-interval line — sample only the anchor)
//   • intervalMeters <= 0 → throws (programmer error — guard via Zod at boundaries)
//   • 0-length intermediate segments → skipped (duplicate consecutive vertices)
//
// Input is GeoJSON convention `Array<[lon, lat]>` (longitude first).
// Output is Leaflet HeatLatLng convention `[lat, lon, weight]`.

import type { HeatLatLng, SampleTrackPointsOptions } from "./types";

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_INTERVAL_METERS = 250;
const DEFAULT_WEIGHT = 1;

/**
 * Haversine great-circle distance in meters between two [lon, lat] points
 * on the WGS-84 mean Earth sphere. Exported for unit-test transparency.
 */
export function haversineDistanceMeters(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const lon1 = a[0];
  const lat1 = a[1];
  const lon2 = b[0];
  const lat2 = b[1];
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const lat1R = lat1 * DEG_TO_RAD;
  const lat2R = lat2 * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1R) * Math.cos(lat2R) * sinDLon * sinDLon;
  // clamp h to [0, 1] to defend against floating-point overshoot on
  // antipodal/identical inputs before asin.
  const hClamped = h > 1 ? 1 : h < 0 ? 0 : h;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(hClamped));
}

export function sampleTrackPoints(
  lineString: ReadonlyArray<readonly [number, number]>,
  options: SampleTrackPointsOptions = {},
): HeatLatLng[] {
  const interval = options.intervalMeters ?? DEFAULT_INTERVAL_METERS;
  const weight = options.weight ?? DEFAULT_WEIGHT;
  if (interval <= 0) {
    throw new Error(
      `sampleTrackPoints: intervalMeters must be > 0 (got ${String(interval)})`,
    );
  }
  if (lineString.length < 2) return [];

  // Compute segment arc-lengths up front so we can short-circuit on
  // totalArcLength === 0 (all vertices coincide) and on sub-interval lines.
  const segmentLengths: number[] = [];
  let totalArcLength = 0;
  for (let i = 0; i < lineString.length - 1; i += 1) {
    const a = lineString[i];
    const b = lineString[i + 1];
    if (a === undefined || b === undefined) continue;
    const d = haversineDistanceMeters(a, b);
    segmentLengths.push(d);
    totalArcLength += d;
  }

  const first = lineString[0];
  if (first === undefined) return [];
  const firstFlipped: HeatLatLng = [first[1], first[0], weight];

  if (totalArcLength === 0) return [firstFlipped];
  if (totalArcLength < interval) return [firstFlipped];

  // Walk the line: at every multiple of `interval` from 0 up to and
  // including totalArcLength, emit one point interpolated between the
  // vertices straddling that distance.
  const points: HeatLatLng[] = [];
  let segmentIdx = 0;
  let cumulativeAtSegmentStart = 0;
  for (
    let sampleDistance = 0;
    sampleDistance <= totalArcLength;
    sampleDistance += interval
  ) {
    // Advance to the segment that contains sampleDistance.
    while (
      segmentIdx < segmentLengths.length - 1 &&
      cumulativeAtSegmentStart + (segmentLengths[segmentIdx] ?? 0) <
        sampleDistance
    ) {
      cumulativeAtSegmentStart += segmentLengths[segmentIdx] ?? 0;
      segmentIdx += 1;
    }

    const segmentLen = segmentLengths[segmentIdx] ?? 0;
    const segStart = lineString[segmentIdx];
    const segEnd = lineString[segmentIdx + 1];
    if (segStart === undefined || segEnd === undefined) continue;

    if (segmentLen === 0) {
      // Degenerate segment (duplicate vertices) — emit the vertex.
      points.push([segStart[1], segStart[0], weight]);
      continue;
    }

    // t ∈ [0, 1] within the current segment. Clamp defends against
    // floating-point drift on the final iteration where sampleDistance
    // can sit a hair past totalArcLength.
    const offsetInSegment = sampleDistance - cumulativeAtSegmentStart;
    let t = offsetInSegment / segmentLen;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const lon = segStart[0] + t * (segEnd[0] - segStart[0]);
    const lat = segStart[1] + t * (segEnd[1] - segStart[1]);
    points.push([lat, lon, weight]);
  }

  return points;
}
