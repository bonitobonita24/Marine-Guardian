// clip-track-to-boundary.ts — line × polygon clipping primitive.
//
// Splits a patrol track LineString by the AreaBoundary polygon's outer
// ring and returns the total clipped length lying inside the polygon.
//
// AreaBoundary rows with geometryType="LineString" (coastline references)
// describe a curve, not an enclosed area — clipping is meaningless, so
// the function returns 0 km early. LineString boundaries are filtered out
// by the accumulator before reaching here in 6.1c-ii, but the guard is
// kept here to keep the primitive total per its name.
//
// Polygon coordinates per GeoJSON: coordinates[0] = outer ring (closed,
// last point == first point). Holes (coordinates[1..]) are NOT subtracted
// in 6.1c — no enabled boundary uses holes today. A future enhancement
// would test "inside outer AND outside any hole" via booleanPointInPolygon.

import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import {
  lineString as turfLineString,
  point as turfPoint,
  polygon as turfPolygon,
} from "@turf/helpers";
import { length as turfLength } from "@turf/length";
import { lineSplit } from "@turf/line-split";

import type { AreaBoundaryForDerivation } from "./types";

export interface ClipResult {
  /** Total clipped length inside the polygon, in kilometers. */
  totalKm: number;
  /** Total length of the input track in kilometers (for fraction math by callers). */
  trackTotalKm: number;
}

function extractPolygonOuterRing(
  geometryGeojson: Record<string, unknown>,
): Array<[number, number]> | null {
  if (geometryGeojson.type !== "Polygon") return null;
  const coords = geometryGeojson.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  // Array.isArray narrows `unknown` to `any[]` — cast back to unknown[] before
  // indexing so the inner ring entries are unknown, not any. Same precedent as
  // 6.1a/6.1b (no-unsafe-assignment on indexed access into a narrowed array).
  const outer = (coords as unknown[])[0];
  // A closed ring needs at least 4 points: 3 distinct vertices + the closing
  // duplicate of the first vertex. Fewer points means malformed geometry.
  if (!Array.isArray(outer) || outer.length < 4) return null;

  const ring: Array<[number, number]> = [];
  for (const c of outer as unknown[]) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lon = (c as unknown[])[0];
    const lat = (c as unknown[])[1];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push([lon, lat]);
  }
  return ring;
}

export function clipTrackToBoundary(
  trackLineString: Array<[number, number]>,
  boundary: AreaBoundaryForDerivation,
): ClipResult {
  if (boundary.geometryType !== "Polygon") {
    return { totalKm: 0, trackTotalKm: 0 };
  }
  if (trackLineString.length < 2) {
    return { totalKm: 0, trackTotalKm: 0 };
  }

  const outerRing = extractPolygonOuterRing(boundary.geometryGeojson);
  if (outerRing === null) {
    return { totalKm: 0, trackTotalKm: 0 };
  }

  const trackFeature = turfLineString(trackLineString);
  const trackTotalKm = turfLength(trackFeature, { units: "kilometers" });

  const polygonFeature = turfPolygon([outerRing]);
  // Splitter is the polygon's outer-ring LineString. lineSplit accepts a
  // LineString splitter natively and produces clean, predictable pieces.
  const splitterFeature = turfLineString(outerRing);
  const split = lineSplit(trackFeature, splitterFeature);

  // lineSplit returns an EMPTY FeatureCollection when the track does not
  // cross the splitter at all — meaning the track is either fully inside
  // or fully outside the polygon. Test the track's first vertex to decide.
  if (split.features.length === 0) {
    const first = trackLineString[0];
    if (first === undefined) return { totalKm: 0, trackTotalKm };
    const firstPoint = turfPoint([first[0], first[1]]);
    if (booleanPointInPolygon(firstPoint, polygonFeature)) {
      return { totalKm: trackTotalKm, trackTotalKm };
    }
    return { totalKm: 0, trackTotalKm };
  }

  let totalKm = 0;
  for (const piece of split.features) {
    const pieceCoords = piece.geometry.coordinates;
    if (pieceCoords.length < 2) continue;

    // Each piece sits entirely inside OR entirely outside the polygon —
    // lineSplit cut at every crossing. Test the midpoint between the
    // first two coordinates to classify.
    const a = pieceCoords[0];
    const b = pieceCoords[1];
    if (a === undefined || b === undefined) continue;
    const a0 = a[0];
    const a1 = a[1];
    const b0 = b[0];
    const b1 = b[1];
    if (
      typeof a0 !== "number" ||
      typeof a1 !== "number" ||
      typeof b0 !== "number" ||
      typeof b1 !== "number"
    ) {
      continue;
    }
    const midPoint = turfPoint([(a0 + b0) / 2, (a1 + b1) / 2]);

    if (booleanPointInPolygon(midPoint, polygonFeature)) {
      totalKm += turfLength(piece, { units: "kilometers" });
    }
  }

  return { totalKm, trackTotalKm };
}
