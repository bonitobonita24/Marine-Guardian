// find-nearest-boundary.ts
//
// v2 spec L531-L561 step 2: geographic nearest-boundary fallback.
// - Edge-distance semantics: distance from point to nearest line segment
//   of the boundary geometry (NOT centroid distance).
// - Polygon: walk outer ring edges (ignore holes).
// - LineString: walk consecutive points as segments.
// - Threshold default: 5 km (spec L539).
// - Skip disabled boundaries.
// - Skip malformed geometry with console.warn (does not throw).
//
// Math: haversine great-circle distance + equirectangular projection
// for the point-to-segment foot computation. Earth is spherical at
// the 5 km scale to <0.1% — well within "5 km threshold" accuracy.
// Zero external geo deps — pure math, keeps packages/shared zero-dep.

import type { AreaBoundaryForDerivation, LatLon } from "./types";

export const DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM = 5;

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

// Equirectangular projection around the point's latitude.
// Returns local Cartesian km offsets (x = east, y = north) from origin lat0.
// Valid for short distances (<~50 km) — error <0.1% at the 5 km scale.
function projectToLocalKm(
  origin: LatLon,
  p: LatLon,
): { x: number; y: number } {
  const latRad0 = toRadians(origin.lat);
  const dLat = toRadians(p.lat - origin.lat);
  const dLon = toRadians(p.lon - origin.lon);
  return {
    x: EARTH_RADIUS_KM * dLon * Math.cos(latRad0),
    y: EARTH_RADIUS_KM * dLat,
  };
}

// Distance from a point to a line segment, using local Cartesian projection
// centered at the input point. Clamps to segment endpoints if the foot of
// the perpendicular falls outside the segment.
export function pointToSegmentDistanceKm(
  point: LatLon,
  segStart: LatLon,
  segEnd: LatLon,
): number {
  // Project both segment endpoints into a local plane centered at the point.
  const a = projectToLocalKm(point, segStart);
  const b = projectToLocalKm(point, segEnd);

  // Vector AB and AP (where P is origin = (0,0) in projected space).
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = -a.x;
  const apy = -a.y;

  const abLenSq = abx * abx + aby * aby;

  // Degenerate segment (start == end): distance is point-to-start.
  if (abLenSq === 0) return haversineKm(point, segStart);

  // Parameter t of projection of P onto AB, normalized to [0, 1] on segment.
  let t = (apx * abx + apy * aby) / abLenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  // Foot of perpendicular on segment, in projected coordinates.
  const footX = a.x + t * abx;
  const footY = a.y + t * aby;

  // Distance from origin (=point) to foot in km.
  return Math.sqrt(footX * footX + footY * footY);
}

function isValidLatLon(p: LatLon): boolean {
  if (Number.isNaN(p.lat) || Number.isNaN(p.lon)) return false;
  if (p.lat < -90 || p.lat > 90) return false;
  if (p.lon < -180 || p.lon > 180) return false;
  return true;
}

// Extract edge segments from a boundary's geometry. Returns null if malformed.
function extractSegments(
  geom: Record<string, unknown>,
): LatLon[][] | null {
  const type = geom["type"];
  const coords: unknown = geom["coordinates"];
  if (type === "Polygon") {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    // Outer ring only — ignore holes for nearest-boundary purposes.
    const outer: unknown = coords[0];
    if (!Array.isArray(outer) || outer.length < 2) return null;
    const ring = parseCoordinateList(outer as unknown[]);
    if (ring === null) return null;
    return [ring];
  }
  if (type === "LineString") {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const line = parseCoordinateList(coords as unknown[]);
    if (line === null) return null;
    return [line];
  }
  return null;
}

function parseCoordinateList(arr: unknown[]): LatLon[] | null {
  const result: LatLon[] = [];
  for (const pair of arr) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lon: unknown = pair[0];
    const lat: unknown = pair[1];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    result.push({ lat, lon });
  }
  return result;
}

// Compute the minimum edge-distance from point to all segments of a single
// boundary. Returns Infinity if the geometry contains no usable segments.
function minDistanceToBoundary(
  point: LatLon,
  segments: LatLon[][],
): number {
  let minDist = Infinity;
  for (const path of segments) {
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];
      if (start === undefined || end === undefined) continue;
      const d = pointToSegmentDistanceKm(point, start, end);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

export function findNearestBoundary(
  point: LatLon,
  boundaries: AreaBoundaryForDerivation[],
  thresholdKm: number = DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM,
): AreaBoundaryForDerivation | null {
  if (!isValidLatLon(point)) return null;
  if (boundaries.length === 0) return null;

  let best: AreaBoundaryForDerivation | null = null;
  let bestDist = Infinity;

  for (const b of boundaries) {
    if (!b.isEnabled) continue;

    const segments = extractSegments(b.geometryGeojson);
    if (segments === null) {
      console.warn(
        `[area-derivation] Skipping boundary ${b.id} (${b.name}): malformed or unsupported geometry`,
      );
      continue;
    }

    const dist = minDistanceToBoundary(point, segments);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }

  if (best === null) return null;
  if (bestDist > thresholdKm) return null;
  return best;
}
