// Converts a GeoJSON Polygon or LineString to Leaflet positions, flipping
// [lng,lat] → [lat,lng]. Returns null on any structural failure — callers
// render a fallback UI when null comes back.

export type LeafletPositions =
  | { kind: "Polygon"; positions: [number, number][][] }
  | { kind: "LineString"; positions: [number, number][] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function flipPair(pair: [number, number]): [number, number] {
  // GeoJSON: [lng, lat]; Leaflet: [lat, lng]
  return [pair[1], pair[0]];
}

export function geojsonToLeafletPositions(
  geometryGeojson: unknown,
  expectedType: "Polygon" | "LineString",
): LeafletPositions | null {
  if (
    geometryGeojson === null ||
    typeof geometryGeojson !== "object" ||
    Array.isArray(geometryGeojson)
  ) {
    return null;
  }

  const obj = geometryGeojson as Record<string, unknown>;
  if (obj.type !== expectedType) return null;
  if (!Array.isArray(obj.coordinates)) return null;

  if (expectedType === "LineString") {
    const coords = obj.coordinates;
    if (coords.length < 2) return null;
    if (!coords.every(isCoordinatePair)) return null;
    return {
      kind: "LineString",
      positions: coords.map(flipPair),
    };
  }

  // Polygon: array of rings; each ring is array of pairs; outer ring must have ≥4 points
  const rings = obj.coordinates;
  if (rings.length === 0) return null;
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null;
    if (!ring.every(isCoordinatePair)) return null;
  }
  const outerRing = rings[0] as [number, number][];
  if (outerRing.length < 4) return null;

  return {
    kind: "Polygon",
    positions: (rings as [number, number][][]).map((ring) => ring.map(flipPair)),
  };
}
