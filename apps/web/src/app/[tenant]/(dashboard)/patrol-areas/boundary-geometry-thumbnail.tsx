// Lightweight inline SVG thumbnail for a boundary row's geometry. Deliberately
// NOT Leaflet — the Boundaries table can render 30+ rows and a map-per-row
// would be far too heavy. Pure/SSR-safe: no browser-only APIs.

import { memo, useMemo } from "react";

type Point = [number, number]; // [lng, lat]
type Ring = Point[];

const VIEWBOX_WIDTH = 48;
const VIEWBOX_HEIGHT = 32;
const PADDING = 3;
const VIEWBOX_STRING = `0 0 ${String(VIEWBOX_WIDTH)} ${String(VIEWBOX_HEIGHT)}`;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function extractRingsFromCoordinates(
  type: string,
  coordinates: unknown,
): Ring[] {
  switch (type) {
    case "LineString": {
      if (!Array.isArray(coordinates)) return [];
      if (!coordinates.every(isCoordinatePair)) return [];
      return [coordinates];
    }
    case "MultiLineString": {
      if (!Array.isArray(coordinates)) return [];
      const rings: Ring[] = [];
      for (const line of coordinates) {
        if (!Array.isArray(line) || !line.every(isCoordinatePair)) continue;
        rings.push(line);
      }
      return rings;
    }
    case "Polygon": {
      if (!Array.isArray(coordinates)) return [];
      const rings: Ring[] = [];
      for (const ring of coordinates) {
        if (!Array.isArray(ring) || !ring.every(isCoordinatePair)) continue;
        rings.push(ring);
      }
      return rings;
    }
    case "MultiPolygon": {
      if (!Array.isArray(coordinates)) return [];
      const rings: Ring[] = [];
      for (const polygon of coordinates) {
        if (!Array.isArray(polygon)) continue;
        for (const ring of polygon) {
          if (!Array.isArray(ring) || !ring.every(isCoordinatePair)) continue;
          rings.push(ring);
        }
      }
      return rings;
    }
    default:
      return [];
  }
}

/**
 * Walks a GeoJSON value (Geometry, Feature, or FeatureCollection) and
 * extracts every coordinate ring as an array of [lng, lat] pairs. Returns an
 * empty array on any structural failure — never throws.
 */
function extractRings(geojson: unknown): Ring[] {
  if (geojson === null || typeof geojson !== "object") return [];
  const obj = geojson as Record<string, unknown>;

  if (obj.type === "FeatureCollection") {
    if (!Array.isArray(obj.features)) return [];
    const rings: Ring[] = [];
    for (const feature of obj.features) {
      rings.push(...extractRings(feature));
    }
    return rings;
  }

  if (obj.type === "Feature") {
    return extractRings(obj.geometry);
  }

  if (obj.type === "GeometryCollection") {
    if (!Array.isArray(obj.geometries)) return [];
    const rings: Ring[] = [];
    for (const geometry of obj.geometries) {
      rings.push(...extractRings(geometry));
    }
    return rings;
  }

  if (typeof obj.type === "string" && "coordinates" in obj) {
    return extractRingsFromCoordinates(obj.type, obj.coordinates);
  }

  return [];
}

interface ProjectedPath {
  d: string;
  closed: boolean;
}

/**
 * Projects rings onto a fixed viewBox, preserving aspect ratio and centering
 * within the padded box. Flips Y since GeoJSON lat increases upward while
 * SVG y increases downward.
 */
function projectRings(rings: Ring[]): ProjectedPath[] | null {
  const allPoints = rings.flat();
  if (allPoints.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of allPoints) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;

  const availableWidth = VIEWBOX_WIDTH - PADDING * 2;
  const availableHeight = VIEWBOX_HEIGHT - PADDING * 2;
  const scale = Math.min(availableWidth / spanLng, availableHeight / spanLat);

  const drawnWidth = spanLng * scale;
  const drawnHeight = spanLat * scale;
  const offsetX = PADDING + (availableWidth - drawnWidth) / 2;
  const offsetY = PADDING + (availableHeight - drawnHeight) / 2;

  return rings
    .filter((ring) => ring.length > 0)
    .map((ring) => {
      const closed = ring.length >= 3;
      const projected = ring.map(([lng, lat]) => {
        const x = offsetX + (lng - minLng) * scale;
        // Flip Y: higher lat → smaller y (nearer the top)
        const y = offsetY + (maxLat - lat) * scale;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });
      const d = `M${projected.join(" L")}${closed ? " Z" : ""}`;
      return { d, closed };
    });
}

function PlaceholderThumbnail({
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <svg
      role="img"
      aria-label="No preview available"
      width={VIEWBOX_WIDTH}
      height={VIEWBOX_HEIGHT}
      viewBox={VIEWBOX_STRING}
      className={className}
    >
      <rect
        x={PADDING}
        y={PADDING}
        width={VIEWBOX_WIDTH - PADDING * 2}
        height={VIEWBOX_HEIGHT - PADDING * 2}
        rx={3}
        className="fill-muted stroke-muted-foreground/30"
        strokeWidth={1}
      />
    </svg>
  );
}

interface BoundaryGeometryThumbnailProps {
  geojson: unknown;
  geometryType: "Polygon" | "LineString";
  className?: string | undefined;
}

function BoundaryGeometryThumbnailImpl({
  geojson,
  geometryType,
  className,
}: BoundaryGeometryThumbnailProps) {
  const paths = useMemo(() => {
    const rings = extractRings(geojson);
    return projectRings(rings);
  }, [geojson]);

  if (paths === null || paths.length === 0) {
    return <PlaceholderThumbnail className={className} />;
  }

  const isPolygon = geometryType === "Polygon";

  return (
    <svg
      role="img"
      aria-label={`${geometryType} preview`}
      width={VIEWBOX_WIDTH}
      height={VIEWBOX_HEIGHT}
      viewBox={VIEWBOX_STRING}
      className={className}
    >
      {paths.map((path, index) => (
        <path
          key={`${String(index)}-${path.d.slice(0, 12)}`}
          d={path.d}
          className={
            isPolygon
              ? "fill-primary/20 stroke-primary"
              : "fill-none stroke-primary"
          }
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export const BoundaryGeometryThumbnail = memo(BoundaryGeometryThumbnailImpl);
