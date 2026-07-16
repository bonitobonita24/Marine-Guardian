// clip-track-to-municipality.ts — patrol track × municipality (land ∪
// water) clipping primitive.
//
// A Municipality's jurisdiction is the UNION of its land polygon
// (`landGeojson`) and, when present, its water polygon (`waterGeojson`,
// either an uploaded LGU boundary or a derived municipal-waters buffer).
// Both may be a single-ring Polygon OR a MultiPolygon — flattened here into
// individual single-ring Polygon geometries and each is clipped against the
// track independently via `clipTrackToBoundary` (the existing line × polygon
// primitive), then summed. Land and water bands are non-overlapping by
// design (see municipality-assignment/index.ts's equidistance/containment
// rules), so summing the disjoint pieces does not double-count — but the
// total is still clamped to `trackTotalKm` as a defensive guard against
// float drift on tracks that hug a shared edge.
//
// `insideHoursEst` reuses the same proportional-hours derivation as the
// AreaBoundary coverage-clip path (`computeCoverageHours`) — pro-rating
// `totalHours` by the inside-km fraction of the track.

import booleanIntersects from "@turf/boolean-intersects";
import { lineString as turfLineString } from "@turf/helpers";
import { length as turfLength } from "@turf/length";

import { clipTrackToBoundary } from "./clip-track-to-boundary";
import { computeCoverageHours } from "./compute-coverage-hours";
import type { AreaBoundaryForDerivation } from "./types";

export interface MunicipalityGeometry {
  landGeojson: unknown;
  waterGeojson?: unknown;
}

export interface TrackMunicipalityClip {
  /** True when the track intersects the municipality's land ∪ water polygon set at all. */
  traverses: boolean;
  /** Clipped track length inside the municipality's land ∪ water territory, in kilometers. */
  insideKm: number;
  /** Total length of the input track, in kilometers. */
  trackTotalKm: number;
  /** Pro-rated hours inside the municipality (totalHours × insideKm/trackTotalKm fraction). */
  insideHoursEst: number;
}

/**
 * Unwrap a GeoJSON value down to its bare geometry.
 *
 * Mirrors the `unwrapGeojson` pattern in municipality-assignment/index.ts:
 * FeatureCollection → first Feature → geometry; Feature → geometry; bare
 * geometry passes through unchanged.
 */
function unwrapGeojson(raw: unknown): unknown {
  const g = raw as
    | { type?: string; features?: unknown[]; geometry?: unknown }
    | null
    | undefined;
  if (g == null) return raw;
  if (g.type === "FeatureCollection" && Array.isArray(g.features) && g.features.length > 0) {
    return unwrapGeojson(g.features[0]);
  }
  if (g.type === "Feature") {
    return g.geometry;
  }
  return raw;
}

/**
 * Extract [lon, lat] coordinate pairs out of a single GeoJSON geometry
 * object (LineString, MultiLineString, Point, MultiPoint). Malformed or
 * unrecognised geometry yields an empty array rather than throwing. Same
 * behaviour as municipality-assignment/index.ts's internal
 * `coordsFromGeometry` (not exported there, so replicated here rather than
 * changing that module's visibility).
 */
function coordsFromGeometry(geometry: unknown): Array<[number, number]> {
  const g = geometry as { type?: string; coordinates?: unknown } | null | undefined;
  if (g == null) return [];
  const { type, coordinates } = g;
  if (type === "LineString" && Array.isArray(coordinates)) {
    return coordinates as Array<[number, number]>;
  }
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    return (coordinates as Array<Array<[number, number]>>).flat();
  }
  if (type === "Point" && Array.isArray(coordinates)) {
    return [coordinates as [number, number]];
  }
  if (type === "MultiPoint" && Array.isArray(coordinates)) {
    return coordinates as Array<[number, number]>;
  }
  return [];
}

/**
 * Extract every [lon, lat] coordinate pair out of a track GeoJSON value —
 * same FeatureCollection/Feature/bare-geometry handling as
 * municipality-assignment/index.ts's internal `extractTrackCoordinates`
 * (not exported there, so replicated here rather than changing that
 * module's visibility).
 */
function extractTrackCoordinates(trackGeojson: unknown): Array<[number, number]> {
  if (trackGeojson == null) return [];

  const g = trackGeojson as {
    type?: string;
    features?: unknown[];
    geometry?: unknown;
  };

  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    return g.features.flatMap((feature) => {
      const f = feature as { type?: string; geometry?: unknown } | null | undefined;
      if (f == null) return [];
      const geometry = f.type === "Feature" ? f.geometry : f;
      return coordsFromGeometry(geometry);
    });
  }

  if (g.type === "Feature") {
    return coordsFromGeometry(g.geometry);
  }

  return coordsFromGeometry(g);
}

/**
 * Flatten a Polygon or MultiPolygon geometry into a list of single-ring
 * Polygon GeoJSON objects (outer ring only — no hole subtraction, same
 * limitation `clipTrackToBoundary` already documents). Unrecognised
 * geometry types yield an empty array.
 */
function flattenToPolygons(geometry: unknown): Record<string, unknown>[] {
  const g = geometry as { type?: string; coordinates?: unknown } | null | undefined;
  if (g == null) return [];
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return [{ type: "Polygon", coordinates: g.coordinates }];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[]).map((polygonCoords) => ({
      type: "Polygon",
      coordinates: polygonCoords,
    }));
  }
  return [];
}

let boundaryIdCounter = 0;

/** Wrap a single-ring Polygon GeoJSON object as the boundary shape `clipTrackToBoundary` expects. */
function wrapAsBoundary(polygonGeojson: Record<string, unknown>): AreaBoundaryForDerivation {
  boundaryIdCounter += 1;
  return {
    id: `clip-track-to-municipality-polygon-${String(boundaryIdCounter)}`,
    name: "municipality-territory-polygon",
    aliases: [],
    isEnabled: true,
    geometryType: "Polygon",
    geometryGeojson: polygonGeojson,
  };
}

/**
 * Optional 4th parameter `cleanDistanceKm` — the de-jitter guard.
 *
 * Real patrol tracks carry heavy GPS jitter; some unprocessed patrols have
 * 1000+ km of RAW turf length with a null clean distance and 0 recorded
 * hours, which massively inflates `insideKm` if the raw track length is
 * trusted directly. When `cleanDistanceKm` is supplied, the clipped inside
 * fraction (`rawInsideKm / rawTrackTotalKm`, from the raw clip against the
 * municipality polygons) is applied to the CLEAN distance instead of the
 * raw one, so `insideKm` is bounded by the trustworthy clean total rather
 * than jitter-inflated raw turf length. When no clean distance is available
 * for a patrol (`cleanDistanceKm` is `null` or non-positive), the patrol is
 * EXCLUDED from this municipality's inside-km entirely (traverses=false,
 * insideKm=0) rather than falling back to the untrustworthy raw number.
 *
 * Omitting the 4th parameter (`undefined`) preserves the original
 * raw-track-length behaviour exactly, for backward compatibility with
 * existing callers.
 */
export function clipTrackToMunicipality(
  trackGeojson: unknown,
  muni: MunicipalityGeometry,
  totalHours: number | null | undefined,
  cleanDistanceKm?: number | null,
): TrackMunicipalityClip {
  const points = extractTrackCoordinates(trackGeojson);
  if (points.length < 2) {
    return { traverses: false, insideKm: 0, trackTotalKm: 0, insideHoursEst: 0 };
  }

  const trackFeature = turfLineString(points);
  const rawTrackTotalKm = turfLength(trackFeature, { units: "kilometers" });

  const landGeometry = unwrapGeojson(muni.landGeojson);
  const waterGeometry = muni.waterGeojson != null ? unwrapGeojson(muni.waterGeojson) : null;

  const polygons: Record<string, unknown>[] = [
    ...flattenToPolygons(landGeometry),
    ...(waterGeometry != null ? flattenToPolygons(waterGeometry) : []),
  ];

  if (polygons.length === 0) {
    return { traverses: false, insideKm: 0, trackTotalKm: rawTrackTotalKm, insideHoursEst: 0 };
  }

  let traverses = false;
  let rawInsideKm = 0;

  for (const polygonGeojson of polygons) {
    try {
      if (
        booleanIntersects(
          trackFeature,
          polygonGeojson as unknown as Parameters<typeof booleanIntersects>[1],
        )
      ) {
        traverses = true;
      }
    } catch {
      // malformed geometry — skip rather than crash the caller
      continue;
    }

    const boundary = wrapAsBoundary(polygonGeojson);
    const clip = clipTrackToBoundary(points, boundary);
    rawInsideKm += clip.totalKm;
  }

  // Defensive clamp against float drift on tracks hugging a shared edge —
  // land/water bands are disjoint by design so this should rarely fire.
  rawInsideKm = Math.min(rawInsideKm, rawTrackTotalKm);

  // Backward-compatible path — 4th param omitted entirely: behave exactly
  // as before the de-jitter guard was introduced.
  if (cleanDistanceKm === undefined) {
    const { coverageHrs } = computeCoverageHours(totalHours ?? 0, rawInsideKm, rawTrackTotalKm);
    return {
      traverses,
      insideKm: rawInsideKm,
      trackTotalKm: rawTrackTotalKm,
      insideHoursEst: coverageHrs,
    };
  }

  // De-jitter guard path — cleanDistanceKm explicitly provided (number or null).
  const clipFraction =
    rawTrackTotalKm > 0 ? Math.max(0, Math.min(1, rawInsideKm / rawTrackTotalKm)) : 0;

  if (clipFraction <= 0) {
    return { traverses: false, insideKm: 0, trackTotalKm: rawTrackTotalKm, insideHoursEst: 0 };
  }

  const cleanKm =
    typeof cleanDistanceKm === "number" && Number.isFinite(cleanDistanceKm) && cleanDistanceKm > 0
      ? cleanDistanceKm
      : null;

  if (cleanKm === null) {
    // Untrusted / unprocessed patrol — no clean distance available. Exclude
    // rather than fall back to the jitter-inflated raw number.
    return { traverses: false, insideKm: 0, trackTotalKm: rawTrackTotalKm, insideHoursEst: 0 };
  }

  const insideKm = clipFraction * cleanKm;
  const insideHoursEst =
    typeof totalHours === "number" && Number.isFinite(totalHours) ? totalHours * clipFraction : 0;

  return { traverses: true, insideKm, trackTotalKm: cleanKm, insideHoursEst };
}
