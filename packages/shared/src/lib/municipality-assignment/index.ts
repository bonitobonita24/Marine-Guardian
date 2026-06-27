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
 * Assign a geographic point to a municipality.
 *
 * Two-stage attribution:
 *   1. On-land containment (exclusive) — a point inside a municipality's land
 *      polygon belongs to that municipality.
 *   2. Municipal waters — otherwise attribute the point to the NEAREST
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

  // 2. Municipal waters — nearest coastline within the seaward reach.
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

export type { MunicipalityForAssignment, ProtectedZoneForAssignment };
