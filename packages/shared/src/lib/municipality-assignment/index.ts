/**
 * municipality-assignment — pure spatial-assignment functions.
 *
 * Layer 1: assign a lat/lon point to exactly one municipality (mutually
 *   exclusive) using polygon containment. Returns null if the point falls
 *   outside every boundary (open ocean, data gap).
 *
 * Layer 2: assign a lat/lon point (event) or GeoJSON LineString track
 *   (patrol) to zero or more protected zones (additive, many-to-many).
 *
 * Dependencies already in packages/shared/package.json:
 *   @turf/boolean-point-in-polygon  (point containment)
 *   @turf/boolean-intersects         (track ∩ zone polygon)
 *
 * NO try/catch — callers (BullMQ processors) own error handling + retry.
 */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import booleanIntersects from "@turf/boolean-intersects";
import pointToPolygonDistance from "@turf/point-to-polygon-distance";
import { point as turfPoint } from "@turf/helpers";
import type { MunicipalityForAssignment, ProtectedZoneForAssignment } from "./types";

/**
 * Unwrap a GeoJSON value for use with turf predicates.
 *
 * The boundary GeoJSON stored in the DB (and on disk) is a FeatureCollection
 * containing a single Feature. Turf's booleanPointInPolygon / booleanIntersects
 * work on Feature or Geometry, not FeatureCollection. We extract the first
 * Feature so both paths work correctly.
 */
function unwrapGeojson(raw: unknown): GeoJSON.Feature | GeoJSON.Geometry {
  const g = raw as { type?: string; features?: GeoJSON.Feature[] };
  if (g.type === "FeatureCollection" && Array.isArray(g.features) && g.features.length > 0) {
    return g.features[0] as GeoJSON.Feature;
  }
  return raw as GeoJSON.Feature | GeoJSON.Geometry;
}

// ── Layer 1 — Municipality (exclusive) ────────────────────────────────────────

/**
 * Municipal-waters reach in kilometres. Philippine LGUs hold jurisdiction over
 * municipal waters extending ~15 km seaward from their coastline
 * (RA 7160 §131, RA 8550 "Philippine Fisheries Code"). Because this is a marine
 * operation, the overwhelming majority of events/patrols occur in the water OFF
 * the land polygon — so after the on-land containment test we attribute a point
 * to the nearest municipality whose boundary lies within this distance.
 */
export const MUNICIPAL_WATERS_KM = 15;

/**
 * On-land containment check (exclusive) — a point inside a municipality's
 * land polygon belongs to that municipality. Returns the FIRST match (Layer-1
 * is exclusive, so overlapping boundaries resolve to list order).
 *
 * Shared by `assignMunicipalityToPoint` and `assignMunicipalityToPointOrNearest`
 * so both containment stages can never diverge.
 */
function containingMunicipality(
  tPoint: ReturnType<typeof turfPoint>,
  municipalities: MunicipalityForAssignment[],
): string | null {
  for (const muni of municipalities) {
    const geojson = unwrapGeojson(muni.boundaryGeojson);
    if (
      booleanPointInPolygon(
        tPoint,
        geojson as Parameters<typeof booleanPointInPolygon>[1],
      )
    ) {
      return muni.id;
    }
  }
  return null;
}

/**
 * Uploaded-water-polygon containment check (exclusive) — a point inside a
 * municipality's uploaded `waterGeojson` (drawn municipal-waters jurisdiction,
 * e.g. from a KML/KMZ upload) belongs to that municipality. Municipalities
 * with no `waterGeojson` (null/undefined) are skipped. Returns the FIRST
 * match, same exclusivity semantics as `containingMunicipality`.
 *
 * Runs AFTER land containment and BEFORE the generic nearest/15km-buffer
 * fallback, so an explicit uploaded water boundary always wins over the
 * generic approximation.
 */
function containingWaterMunicipality(
  tPoint: ReturnType<typeof turfPoint>,
  municipalities: MunicipalityForAssignment[],
): string | null {
  for (const muni of municipalities) {
    if (muni.waterGeojson == null) continue;
    const geojson = unwrapGeojson(muni.waterGeojson);
    if (
      booleanPointInPolygon(
        tPoint,
        geojson as Parameters<typeof booleanPointInPolygon>[1],
      )
    ) {
      return muni.id;
    }
  }
  return null;
}

/**
 * Find the municipality whose polygon is NEAREST to a point, with no distance
 * cap. A point INSIDE a polygon has distance 0 to it (turf's
 * `pointToPolygonDistance` on a containing polygon), so containment is
 * naturally "nearest" — but callers that need the containment id explicitly
 * should still prefer `assignMunicipalityToPoint`/`containingMunicipality`
 * since this function does a full distance scan even when unnecessary.
 *
 * Used to approximate Philippine municipal-waters jurisdiction: an
 * open-water patrol/event too far offshore for the ~15 km `MUNICIPAL_WATERS_KM`
 * reach should still be attributed to SOME municipality (the closest coastal
 * LGU) rather than left unassigned, so coverage totals reconcile with the
 * raw patrol/event counts.
 *
 * @param point - { lat, lon } — WGS-84 decimal degrees
 * @param municipalities - array loaded from DB (one per tenant)
 * @returns nearest municipality id, or null only when the list is empty
 */
export function nearestMunicipality(
  point: { lat: number; lon: number },
  municipalities: MunicipalityForAssignment[],
): string | null {
  if (municipalities.length === 0) return null;

  const tPoint = turfPoint([point.lon, point.lat]);

  let nearestId: string | null = null;
  let nearestKm = Infinity;
  for (const muni of municipalities) {
    const geojson = unwrapGeojson(muni.boundaryGeojson);
    const km = Math.abs(
      pointToPolygonDistance(
        tPoint,
        geojson as Parameters<typeof pointToPolygonDistance>[1],
        { units: "kilometers" },
      ),
    );
    if (km < nearestKm) {
      nearestKm = km;
      nearestId = muni.id;
    }
  }

  return nearestId;
}

/**
 * Assign a geographic point to a municipality.
 *
 * Three-stage attribution:
 *   1. On-land containment (exclusive) — a point inside a municipality's land
 *      polygon belongs to that municipality.
 *   2. Uploaded water-jurisdiction containment (exclusive) — otherwise, a
 *      point inside a municipality's uploaded `waterGeojson` (e.g. drawn from
 *      a KML/KMZ upload) belongs to that municipality. Municipalities without
 *      an uploaded water polygon are skipped at this stage.
 *   3. Municipal waters — otherwise attribute the point to the NEAREST
 *      municipality whose boundary is within `maxWaterDistanceKm` (default
 *      MUNICIPAL_WATERS_KM). Gives the equidistant sea partition used in
 *      practice and captures marine events sitting just offshore of land.
 *
 * Returns null only when the point is farther than `maxWaterDistanceKm` from
 * every municipality (open/national waters, or bad coordinates).
 *
 * @param point  - { lat, lon } — WGS-84 decimal degrees
 * @param municipalities - array loaded from DB (one per tenant)
 * @param maxWaterDistanceKm - seaward reach; defaults to MUNICIPAL_WATERS_KM
 * @returns municipality id, or null
 */
export function assignMunicipalityToPoint(
  point: { lat: number; lon: number },
  municipalities: MunicipalityForAssignment[],
  maxWaterDistanceKm: number = MUNICIPAL_WATERS_KM,
): string | null {
  const tPoint = turfPoint([point.lon, point.lat]);

  // 1. On-land containment takes precedence.
  const contained = containingMunicipality(tPoint, municipalities);
  if (contained != null) return contained;

  // 2. Uploaded water-jurisdiction polygon (when present) — an explicit LGU
  //    boundary always wins over the generic 15 km-buffer approximation.
  const waterContained = containingWaterMunicipality(tPoint, municipalities);
  if (waterContained != null) return waterContained;

  // 3. Municipal waters — nearest coastline within the seaward reach.
  let nearestId: string | null = null;
  let nearestKm = Infinity;
  for (const muni of municipalities) {
    const geojson = unwrapGeojson(muni.boundaryGeojson);
    const km = Math.abs(
      pointToPolygonDistance(
        tPoint,
        geojson as Parameters<typeof pointToPolygonDistance>[1],
        { units: "kilometers" },
      ),
    );
    if (km < nearestKm) {
      nearestKm = km;
      nearestId = muni.id;
    }
  }

  return nearestKm <= maxWaterDistanceKm ? nearestId : null;
}

/**
 * Assign a geographic point to a municipality with NO distance cap.
 *
 * Three-stage attribution:
 *   1. On-land containment (exclusive) — same as `assignMunicipalityToPoint`.
 *   2. Uploaded water-jurisdiction containment (exclusive) — same as
 *      `assignMunicipalityToPoint`; an explicit LGU-drawn water boundary
 *      wins before falling back to nearest.
 *   3. Otherwise, the NEAREST municipality regardless of distance (via
 *      `nearestMunicipality`) — this is the "at-sea patrol/event always gets
 *      attributed to a municipality" rule, approximating municipal-waters
 *      jurisdiction beyond the conservative `MUNICIPAL_WATERS_KM` reach used
 *      by `assignMunicipalityToPoint`.
 *
 * Returns null only when there's no municipality to assign to (empty list).
 *
 * @param point - { lat, lon } — WGS-84 decimal degrees
 * @param municipalities - array loaded from DB (one per tenant)
 * @returns municipality id, or null only when `municipalities` is empty
 */
export function assignMunicipalityToPointOrNearest(
  point: { lat: number; lon: number },
  municipalities: MunicipalityForAssignment[],
): string | null {
  if (municipalities.length === 0) return null;

  const tPoint = turfPoint([point.lon, point.lat]);
  const contained = containingMunicipality(tPoint, municipalities);
  if (contained != null) return contained;

  const waterContained = containingWaterMunicipality(tPoint, municipalities);
  if (waterContained != null) return waterContained;

  return nearestMunicipality(point, municipalities);
}

// ── Layer 2 — Protected zones (additive) ─────────────────────────────────────

/**
 * Assign a geographic point to all protected zones that contain it.
 *
 * Used for events (which have a single lat/lon).
 *
 * @param point - { lat, lon }
 * @param zones - protected zones for the tenant
 * @returns array of zone ids (may be empty)
 */
export function assignZonesToPoint(
  point: { lat: number; lon: number },
  zones: ProtectedZoneForAssignment[],
): string[] {
  const tPoint = turfPoint([point.lon, point.lat]);
  return zones
    .filter((z) => {
      const geojson = unwrapGeojson(z.boundaryGeojson);
      return booleanPointInPolygon(
        tPoint,
        geojson as Parameters<typeof booleanPointInPolygon>[1],
      );
    })
    .map((z) => z.id);
}

/**
 * Assign a patrol track (GeoJSON LineString / MultiLineString) to all
 * protected zones whose polygon the track intersects.
 *
 * Used for patrols (which have a materialised PatrolTrack).
 *
 * @param trackGeojson - raw GeoJSON from PatrolTrack.trackGeojson
 * @param zones - protected zones for the tenant
 * @returns array of zone ids (may be empty)
 */
export function assignZonesToTrack(
  trackGeojson: unknown,
  zones: ProtectedZoneForAssignment[],
): string[] {
  return zones
    .filter((z) => {
      try {
        return booleanIntersects(
          trackGeojson as Parameters<typeof booleanIntersects>[0],
          unwrapGeojson(z.boundaryGeojson) as Parameters<typeof booleanIntersects>[1],
        );
      } catch {
        // malformed geometry — skip rather than crash the job
        return false;
      }
    })
    .map((z) => z.id);
}

// ── Layer 1b — Municipality by dominant track ────────────────────────────────

/**
 * Extract every [lon, lat] coordinate pair out of a track GeoJSON value.
 *
 * Handles LineString, MultiLineString, and (defensively) Point/MultiPoint —
 * whatever shape PatrolTrack.trackGeojson stores today or in the future.
 * Malformed/unrecognised geometry yields an empty array rather than throwing.
 */
function extractTrackCoordinates(trackGeojson: unknown): [number, number][] {
  if (trackGeojson == null) return [];
  const geometry = unwrapGeojson(trackGeojson) as {
    type?: string;
    coordinates?: unknown;
  };
  const type = geometry.type;
  const coords = geometry.coordinates;
  if (type === "LineString" && Array.isArray(coords)) {
    return coords as [number, number][];
  }
  if (type === "MultiLineString" && Array.isArray(coords)) {
    return (coords as [number, number][][]).flat();
  }
  if (type === "Point" && Array.isArray(coords)) {
    return [coords as [number, number]];
  }
  if (type === "MultiPoint" && Array.isArray(coords)) {
    return coords as [number, number][];
  }
  return [];
}

/**
 * Assign a patrol track to the municipality where the DOMINANT share of the
 * track's GPS points fall — not just the start point.
 *
 * For each point on the track, finds the containing/nearest municipality via
 * `assignMunicipalityToPoint` and tallies hits per municipality id. Returns
 * the id with the most hits (one municipality per patrol — single-assignment,
 * NOT many-to-many).
 *
 * Tie-break rule: when two or more municipalities have the same top tally,
 * the one whose FIRST hit occurs earliest along the track wins (deterministic,
 * stable regardless of object iteration order).
 *
 * Falls back to the NEAREST municipality (via `nearestMunicipality`, uncapped)
 * when the track has zero parseable points, or when every track point falls
 * outside every municipality's ~15 km municipal-waters reach (all points
 * return null from `assignMunicipalityToPoint`) — i.e. an entirely-offshore
 * track. The representative point used for the nearest lookup is
 * `fallbackPoint` when given, else the track's first point, so a wholly
 * open-water patrol still gets attributed to the nearest coastal
 * municipality instead of `null`. Returns null only when there is no usable
 * representative point (no `fallbackPoint` AND no parseable track points) or
 * `municipalities` is empty.
 *
 * NOTE: this nearest fallback only fires when literally NO track point is
 * contained in (or within municipal-waters reach of) any municipality — a
 * track with even one in-reach point keeps the existing dominant-by-tally
 * behavior unchanged (e.g. a patrol mostly inside municipality B still
 * returns B).
 *
 * @param trackGeojson - raw GeoJSON from PatrolTrack.trackGeojson
 * @param municipalities - array loaded from DB (one per tenant)
 * @param fallbackPoint - optional { lat, lon } used when the track yields no assignment
 * @returns municipality id, or null
 */
export function assignMunicipalityToDominantTrack(
  trackGeojson: unknown,
  municipalities: MunicipalityForAssignment[],
  fallbackPoint?: { lat: number; lon: number },
): string | null {
  const points = extractTrackCoordinates(trackGeojson);

  const tallies = new Map<string, number>();
  const firstHitIndex = new Map<string, number>();

  points.forEach(([lon, lat], index) => {
    const municipalityId = assignMunicipalityToPoint({ lat, lon }, municipalities);
    if (municipalityId == null) return;
    tallies.set(municipalityId, (tallies.get(municipalityId) ?? 0) + 1);
    if (!firstHitIndex.has(municipalityId)) {
      firstHitIndex.set(municipalityId, index);
    }
  });

  if (tallies.size === 0) {
    const firstPoint = points[0];
    const representativePoint =
      fallbackPoint ?? (firstPoint ? { lat: firstPoint[1], lon: firstPoint[0] } : undefined);
    return representativePoint ? nearestMunicipality(representativePoint, municipalities) : null;
  }

  let dominantId: string | null = null;
  let dominantCount = -1;
  let dominantFirstHit = Infinity;
  for (const [municipalityId, count] of tallies) {
    const firstHit = firstHitIndex.get(municipalityId) ?? Infinity;
    if (
      count > dominantCount ||
      (count === dominantCount && firstHit < dominantFirstHit)
    ) {
      dominantId = municipalityId;
      dominantCount = count;
      dominantFirstHit = firstHit;
    }
  }

  return dominantId;
}

// ── Layer 3 — Strict geometry containment (no attribution fallback) ─────────

/**
 * Test whether a point falls within ANY of the given geometries — a strict
 * containment check with NO nearest-municipality fallback, unlike
 * `assignMunicipalityToPoint` (attribution) or `nearestMunicipality`. Used to
 * CLIP a single-municipality report's rendered patrol tracks/heatmap points
 * to just that municipality's own territory (boundary polygon ∪ water
 * polygon), so a point that got attributed to the municipality (correctly or
 * not) but physically sits outside its geometry never leaks onto the map.
 *
 * `null`/`undefined` entries in `geometries` are ignored (callers typically
 * pass `[boundaryGeojson, waterGeojson]`, where either can be absent).
 *
 * @param point - { lat, lon } — WGS-84 decimal degrees
 * @param geometries - one or more GeoJSON values (Polygon/MultiPolygon, bare
 *   or FeatureCollection-wrapped, as stored in the Municipality Json columns)
 * @returns true if the point is inside at least one geometry
 */
export function isPointInAnyGeometry(
  point: { lat: number; lon: number },
  geometries: unknown[],
): boolean {
  const tPoint = turfPoint([point.lon, point.lat]);
  for (const geometry of geometries) {
    if (geometry == null) continue;
    if (
      booleanPointInPolygon(
        tPoint,
        unwrapGeojson(geometry) as Parameters<typeof booleanPointInPolygon>[1],
      )
    ) {
      return true;
    }
  }
  return false;
}

export type { MunicipalityForAssignment, ProtectedZoneForAssignment };
