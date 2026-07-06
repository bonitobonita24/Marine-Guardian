"use client";

/**
 * Area Coverage Map — Leaflet client island for Coverage Report Page 2.
 *
 * Renders OpenStreetMap tiles + filled cyan polygons for every enabled
 * AreaBoundary + thin dark polylines for every patrol track in the
 * period. Optional dashed cyan reference outlines come from ArcGIS when
 * `arcgisReferenceId` is set on the boundary (the actual ArcGIS layer
 * fetch is deferred to 6.1c — for now the same polygon doubles as the
 * reference outline so the legend renders correctly).
 *
 * Sets `window.__renderReady = true` once Leaflet finishes tile load AND
 * polygon paint. The pdf-renderer Puppeteer service waits for this flag
 * after its existing networkidle0 wait (decision locked in
 * DECISIONS_LOG.md "Coverage Report Page 2 Map Render Strategy").
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useMemo, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, Polygon, Polyline, TileLayer } from "react-leaflet";
import type {
  CoverageReportArea,
  CoverageReportPatrolRow,
} from "@/server/coverage-report/get-coverage-report-data";
import { MapRenderGate } from "./map-render-gate";

interface AreaCoverageMapProps {
  areas: CoverageReportArea[];
  patrols: CoverageReportPatrolRow[];
  /** Optional bbox override; otherwise fitBounds is auto-computed. */
  initialCenter?: { lat: number; lon: number };
  initialZoom?: number;
}

const BOUNDARY_FILL = "#06b6d4"; // cyan-500
const BOUNDARY_STROKE = "#0e7490"; // cyan-700
const TRACK_STROKE = "#1f2937"; // gray-800

/**
 * Convert a GeoJSON polygon (lon/lat) to Leaflet positions (lat/lon).
 * Outer ring only — holes ignored.
 */
function polygonToLatLngs(
  geometry: Record<string, unknown>,
): Array<[number, number]> | null {
  if (geometry.type !== "Polygon") return null;
  const coords = geometry.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const outer: unknown = coords[0];
  if (!Array.isArray(outer)) return null;
  const result: Array<[number, number]> = [];
  for (const pair of outer as unknown[]) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const pairArr = pair as unknown[];
    const lon = pairArr[0];
    const lat = pairArr[1];
    if (typeof lon === "number" && typeof lat === "number") {
      result.push([lat, lon]);
    }
  }
  return result.length > 0 ? result : null;
}

function trackToLatLngs(
  coords: Array<[number, number]>,
): Array<[number, number]> {
  return coords.map(([lon, lat]) => [lat, lon] as [number, number]);
}

export function AreaCoverageMap({
  areas,
  patrols,
  initialCenter,
  initialZoom,
}: AreaCoverageMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);
  const polygons = useMemo(
    () =>
      areas
        .map((a) => ({
          area: a,
          positions: polygonToLatLngs(a.geometryGeojson),
        }))
        .filter((row): row is { area: CoverageReportArea; positions: Array<[number, number]> } => row.positions !== null),
    [areas],
  );
  const tracks = useMemo(
    () =>
      patrols
        .filter((p) => p.trackLineString !== null)
        .map((p) =>
          trackToLatLngs(p.trackLineString as Array<[number, number]>),
        ),
    [patrols],
  );

  const center: [number, number] = initialCenter
    ? [initialCenter.lat, initialCenter.lon]
    : [13.0, 121.0]; // Default: Mindoro centerpoint — overridden by AutoFitBounds when data exists.
  const zoom = initialZoom ?? 9;
  const hasAnyOverlay = polygons.length > 0 || tracks.length > 0;

  const applyFraming = useCallback(
    (map: LeafletMap) => {
      const points: Array<[number, number]> = [];
      for (const a of areas) {
        const ring = polygonToLatLngs(a.geometryGeojson);
        if (ring !== null) points.push(...ring);
      }
      for (const t of tracks) {
        points.push(...t);
      }
      if (points.length < 2) return;
      map.fitBounds(points, { padding: [16, 16] });
    },
    [areas, tracks],
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={true}
      style={{ width: "100%", height: "100%", background: "#dbeafe" }}
      data-testid="area-coverage-map"
    >
      <TileLayer
        ref={tileLayerRef}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {polygons.map(({ area, positions }) => (
        <Polygon
          key={area.id}
          positions={positions}
          pathOptions={{
            color: BOUNDARY_STROKE,
            fillColor: BOUNDARY_FILL,
            fillOpacity: 0.25,
            weight: 2,
            dashArray: area.arcgisReferenceId !== null ? "4 3" : undefined,
          }}
        />
      ))}
      {tracks.map((positions, idx) => (
        <Polyline
          key={`track-${String(idx)}`}
          positions={positions}
          pathOptions={{ color: TRACK_STROKE, weight: 1.5, opacity: 0.85 }}
        />
      ))}
      <MapRenderGate
        hasAnyOverlay={hasAnyOverlay}
        applyFraming={applyFraming}
        tileLayerRef={tileLayerRef}
      />
    </MapContainer>
  );
}
