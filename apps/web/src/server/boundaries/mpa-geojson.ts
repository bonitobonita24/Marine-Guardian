/**
 * mpa-geojson.ts
 *
 * Server-side validation + normalization for user-uploaded MPA geometry.
 *
 * The client parses a KML/KMZ file into GeoJSON (browser DOMParser +
 * @tmcw/togeojson, JSZip for KMZ) and POSTs the resulting GeoJSON to the
 * `municipality.createMpaFromUpload` tRPC mutation. NEVER trust that payload:
 * this module is the trusted boundary that turns arbitrary client GeoJSON into
 * a single validated Polygon/MultiPolygon the rest of the system can store and
 * run point-in-polygon against.
 *
 * It collects EVERY polygon across the input (a KML with several Placemarks
 * becomes several Features; a MultiGeometry becomes a GeometryCollection) and
 * merges them into ONE geometry so the whole protected area is captured — then
 * enforces coordinate sanity and a hard vertex cap to bound abuse.
 */

export interface NormalizedMpaGeometry {
  /** Bare GeoJSON Polygon or MultiPolygon geometry. */
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  /** Total ring-vertex count across the geometry. */
  vertexCount: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
}

interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

/** Hard cap on total vertices — prevents a pathological upload from bloating
 *  the DB row and slowing every point-in-polygon test forever. ~50k vertices
 *  is far beyond any real MPA outline (Apo Reef = 5, detailed coastlines < 5k). */
export const MAX_MPA_VERTICES = 50_000;

export class MpaGeometryError extends Error {}

/** Recursively collect Polygon coordinate arrays from any GeoJSON value. */
function collectPolygons(node: unknown, out: number[][][][]): void {
  if (node == null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  switch (obj.type) {
    case "FeatureCollection":
      if (Array.isArray(obj.features)) {
        obj.features.forEach((f) => {
          collectPolygons(f, out);
        });
      }
      return;
    case "Feature":
      collectPolygons(obj.geometry, out);
      return;
    case "GeometryCollection":
      if (Array.isArray(obj.geometries)) {
        obj.geometries.forEach((g) => {
          collectPolygons(g, out);
        });
      }
      return;
    case "Polygon":
      if (Array.isArray(obj.coordinates)) out.push(obj.coordinates as number[][][]);
      return;
    case "MultiPolygon":
      if (Array.isArray(obj.coordinates)) {
        (obj.coordinates as number[][][][]).forEach((poly) => out.push(poly));
      }
      return;
    default:
      return;
  }
}

function isFiniteLonLat(pt: unknown): pt is [number, number] {
  return (
    Array.isArray(pt) &&
    pt.length >= 2 &&
    typeof pt[0] === "number" &&
    typeof pt[1] === "number" &&
    Number.isFinite(pt[0]) &&
    Number.isFinite(pt[1]) &&
    pt[0] >= -180 &&
    pt[0] <= 180 &&
    pt[1] >= -90 &&
    pt[1] <= 90
  );
}

/**
 * Validate + normalize arbitrary uploaded GeoJSON into a single Polygon /
 * MultiPolygon. Throws MpaGeometryError with a human-readable reason on any
 * problem (the caller maps it to a tRPC BAD_REQUEST).
 */
export function normalizeMpaGeometry(input: unknown): NormalizedMpaGeometry {
  const polygons: number[][][][] = [];
  collectPolygons(input, polygons);

  if (polygons.length === 0) {
    throw new MpaGeometryError(
      "No polygon found in the file. An MPA boundary must contain at least one area (Polygon). Lines and points are not supported.",
    );
  }

  // Coordinate sanity + vertex count + bbox, ring-by-ring.
  let vertexCount = 0;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) {
      throw new MpaGeometryError("A polygon in the file has no outer ring.");
    }
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new MpaGeometryError(
          "A polygon ring has fewer than 4 points — it cannot enclose an area.",
        );
      }
      for (const pt of ring) {
        if (!isFiniteLonLat(pt)) {
          throw new MpaGeometryError(
            "The file contains an invalid coordinate (outside longitude -180..180 / latitude -90..90).",
          );
        }
        const [lon, lat] = pt;
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
        vertexCount++;
      }
    }
  }

  if (vertexCount > MAX_MPA_VERTICES) {
    throw new MpaGeometryError(
      `The boundary is too detailed (${String(vertexCount)} points, max ${String(MAX_MPA_VERTICES)}). Simplify the shape and try again.`,
    );
  }

  const geometry: GeoJsonPolygon | GeoJsonMultiPolygon =
    polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] as number[][][] }
      : { type: "MultiPolygon", coordinates: polygons };

  return { geometry, vertexCount, bbox: [minLon, minLat, maxLon, maxLat] };
}

/** Wrap a bare geometry as the single-feature FeatureCollection the DB stores
 *  for ProtectedZone.boundaryGeojson (matches the seed convention so
 *  unwrapGeojson + turf read it identically). */
export function toFeatureCollection(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
  properties: Record<string, unknown> = {},
): unknown {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties, geometry }],
  };
}

/** Deterministic slug from a display name (lowercase, hyphenated, ascii). */
export function slugifyMpaName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
