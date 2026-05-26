// Pure helper: inverse of geojsonToLeafletPositions.
// Takes a geoman-style shape descriptor ({lat,lng} objects) and returns
// a GeoJSON Polygon or LineString with [lng,lat] ordering for storage.
// Returns null if input is malformed or below minimum vertex thresholds.

type LatLng = { lat: number; lng: number };

export type LeafletShape =
  | { kind: "Polygon"; positions: LatLng[][] }
  | { kind: "LineString"; positions: LatLng[] };

export type GeoJsonShape =
  | { type: "Polygon"; coordinates: [number, number][][] }
  | { type: "LineString"; coordinates: [number, number][] };

function isFiniteLatLng(p: unknown): p is LatLng {
  return (
    typeof p === "object" &&
    p !== null &&
    "lat" in p &&
    "lng" in p &&
    typeof (p as LatLng).lat === "number" &&
    typeof (p as LatLng).lng === "number" &&
    Number.isFinite((p as LatLng).lat) &&
    Number.isFinite((p as LatLng).lng)
  );
}

function flip(p: LatLng): [number, number] {
  return [p.lng, p.lat];
}

export function leafletPositionsToGeojson(
  shape: LeafletShape,
): GeoJsonShape | null {
  // Accept-as-unknown defensive shape: callers may pass geoman output that
  // does not match the LeafletShape union exactly.
  const candidate = shape as unknown;
  if (candidate === null || typeof candidate !== "object") return null;
  const obj = candidate as { kind?: unknown; positions?: unknown };
  if (!Array.isArray(obj.positions)) return null;

  if (obj.kind === "LineString") {
    const pts = obj.positions;
    if (pts.length < 2) return null;
    if (!pts.every(isFiniteLatLng)) return null;
    return { type: "LineString", coordinates: pts.map(flip) };
  }

  if (obj.kind === "Polygon") {
    const rings = obj.positions;
    if (rings.length === 0 || !Array.isArray(rings[0])) return null;
    const outer = rings[0] as unknown[];
    if (outer.length < 3) return null;
    if (!outer.every(isFiniteLatLng)) return null;
    const flipped = outer.map(flip);
    // Auto-close: geoman emits open rings; GeoJSON requires first === last.
    const first = flipped[0];
    const last = flipped[flipped.length - 1];
    if (first === undefined || last === undefined) return null;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      flipped.push([first[0], first[1]]);
    }
    return { type: "Polygon", coordinates: [flipped] };
  }

  return null;
}
