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
 * Assign a geographic point to a municipality.
 *
 * Iterates over all municipalities for the tenant and returns the id of the
 * first one whose boundary polygon contains the point.  Returns null if the
 * point is outside every polygon (open ocean, no data).
 *
 * @param point  - { lat, lon } — WGS-84 decimal degrees
 * @param municipalities - array loaded from DB (one per tenant)
 * @returns municipality id, or null
 */
export function assignMunicipalityToPoint(
  point: { lat: number; lon: number },
  municipalities: MunicipalityForAssignment[],
): string | null {
  const tPoint = turfPoint([point.lon, point.lat]);

  for (const muni of municipalities) {
    const geojson = unwrapGeojson(muni.boundaryGeojson);
    if (booleanPointInPolygon(tPoint, geojson as Parameters<typeof booleanPointInPolygon>[1])) {
      return muni.id;
    }
  }
  return null;
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
