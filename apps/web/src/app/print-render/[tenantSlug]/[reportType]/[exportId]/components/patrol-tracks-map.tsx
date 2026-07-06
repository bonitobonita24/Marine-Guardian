"use client";

/**
 * Patrol Tracks Map — Leaflet client island for Report Map PDF patrol section.
 *
 * Renders OpenStreetMap tiles + a Polyline for every patrol track that has at
 * least two points. Auto-fits bounds over all track paths.
 *
 * Sets `window.__renderReady = true` once Leaflet finishes painting — or
 * immediately when there are no tracks with two or more points, so Puppeteer
 * is never left waiting on an empty patrol section.
 *
 * When no renderable tracks exist, shows the tile basemap with a centered
 * "No located items" overlay and flips the ready flag without waiting for
 * the tile load.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import type {
  ReportMapBounds,
  ReportMapTrackRow,
} from "@/server/report-map-report/get-report-map-report-data";
import { MapRenderGate } from "./map-render-gate";

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
  /** When set (report scoped to one municipality), the map frames this area
   *  instead of fitting to the track paths — fixes the whole-region /
   *  empty-ocean-margin view on a single-municipality report. */
  municipalityBounds?: ReportMapBounds | null;
}

export function PatrolTracksMap({
  tracks,
  municipalityBounds = null,
}: PatrolTracksMapProps) {
  const renderableTracks = tracks.filter((t) => t.path.length > 1);
  const hasTracks = renderableTracks.length > 0;
  const tileLayerRef = useRef<LeafletTileLayer>(null);

  // A specific municipality is in scope — always frame it, even when there
  // are 0/1 renderable tracks (the case that used to fall through to the
  // fixed whole-region fallback). Runs AFTER MapRenderGate's invalidateSize.
  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (municipalityBounds) {
        const { south, west, north, east } = municipalityBounds;
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [16, 16], maxZoom: 13 },
        );
        return;
      }
      const points: Array<[number, number]> = [];
      for (const t of renderableTracks) {
        for (const pt of t.path) {
          points.push([pt.lat, pt.lon]);
        }
      }
      if (points.length < 2) return;
      map.fitBounds(points, { padding: [16, 16] });
    },
    [renderableTracks, municipalityBounds],
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
        data-testid="patrol-tracks-map"
      >
        <TileLayer
          ref={tileLayerRef}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {renderableTracks.map((track) => (
          <Polyline
            key={track.patrolId}
            positions={track.path.map(
              (pt) => [pt.lat, pt.lon] as [number, number],
            )}
            pathOptions={{ color: "#1f2937", weight: 2, opacity: 0.85 }}
          />
        ))}
        <MapRenderGate
          hasAnyOverlay={hasTracks}
          applyFraming={applyFraming}
          tileLayerRef={tileLayerRef}
        />
      </MapContainer>
      {!hasTracks && (
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
