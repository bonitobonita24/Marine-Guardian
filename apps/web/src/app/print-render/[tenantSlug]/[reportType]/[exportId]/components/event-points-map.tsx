"use client";

/**
 * Event Points Map — Leaflet client island for Report Map PDF sections.
 *
 * Renders OpenStreetMap tiles + a CircleMarker for every event point in the
 * given set. Covers all four event-typed surfaces: Law Enforcement, Monitoring,
 * High Priority, and the Events-Over-Time overview layer.
 *
 * Sets `window.__renderReady = true` once Leaflet finishes painting — or
 * immediately (via a double rAF flush) when no points are present, so
 * Puppeteer is never left waiting on an empty section.
 *
 * When `points` is empty, renders the MapContainer (so the tile basemap still
 * loads) plus a centered "No located items" overlay, and the ready flag fires
 * without waiting for tile load.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import type {
  ReportMapBounds,
  ReportMapEventPoint,
} from "@/server/report-map-report/get-report-map-report-data";
import { MapRenderGate } from "./map-render-gate";

interface EventPointsMapProps {
  points: ReportMapEventPoint[];
  markerColor?: string;
  /** When set (report scoped to one municipality), the map frames this area
   *  instead of fitting to the data points — fixes the whole-region /
   *  empty-ocean-margin view on a single-municipality report. */
  municipalityBounds?: ReportMapBounds | null;
}

export function EventPointsMap({
  points,
  markerColor = "#2563eb",
  municipalityBounds = null,
}: EventPointsMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);

  // A specific municipality is in scope — always frame it, even when there
  // are 0/1 located event points (the case that used to fall through to the
  // fixed whole-region fallback). Runs AFTER MapRenderGate's invalidateSize.
  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (municipalityBounds) {
        const { south, west, north, east } = municipalityBounds;
        // animate:false (R11 fix): Leaflet's default fitBounds recenter uses
        // an ANIMATED (CSS-transition, ~250ms) pan whenever the pan offset
        // fits within the viewport — MapRenderGate's render-ready gate only
        // waits for the TileLayer's "load" event, never for this pan
        // animation's completion, so Puppeteer's page.pdf() can capture the
        // page mid-transition (or before the transition has progressed at
        // all), showing the map at its PRE-fit (MapContainer default)
        // center/zoom even though fitBounds was called correctly. Forcing
        // animate:false makes Leaflet apply the recentered view SYNCHRONOUSLY
        // (same code path as MapRenderGate's own invalidateSize({animate:
        // false}) call just before this), so there's no async transition for
        // the render-ready gate to race against. Confirmed via a real
        // Leaflet+jsdom repro: without animate:false, map.getCenter() stayed
        // at the MapContainer default after fitBounds; with it, getCenter()
        // immediately reflected the municipality bounds' centroid.
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [8, 8], maxZoom: 15, animate: false },
        );
        return;
      }
      if (points.length < 2) return;
      const latLngs = points.map((p) => [p.lat, p.lon] as [number, number]);
      map.fitBounds(latLngs, { padding: [16, 16], animate: false });
    },
    [points, municipalityBounds],
  );

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <MapContainer
        center={[13.0, 121.0]}
        zoom={9}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={true}
        style={{ width: "100%", height: "100%", background: "#dbeafe" }}
        data-testid="event-points-map"
      >
        <TileLayer
          ref={tileLayerRef}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={5}
            pathOptions={{
              color: markerColor,
              fillColor: markerColor,
              fillOpacity: 0.7,
              weight: 1,
            }}
          />
        ))}
        <MapRenderGate
          hasAnyOverlay={points.length > 0}
          applyFraming={applyFraming}
          tileLayerRef={tileLayerRef}
        />
      </MapContainer>
      {points.length === 0 && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.85)",
            zIndex: 1000,
            fontSize: "11px",
            color: "#6b7280",
            fontStyle: "italic",
          }}
        >
          No located items
        </div>
      )}
    </div>
  );
}
