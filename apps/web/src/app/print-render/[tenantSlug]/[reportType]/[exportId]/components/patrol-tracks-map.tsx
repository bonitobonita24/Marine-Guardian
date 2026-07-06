"use client";

/**
 * Patrol Tracks Map — Leaflet client island for Report Map PDF patrol section.
 *
 * Renders OpenStreetMap tiles + a Polyline for every patrol track that has at
 * least two points. Auto-fits bounds over all track paths. Each polyline is
 * colored by ReportMapTrackRow.patrolType (R1, 2026-07-06) — seaborne
 * (#0891b2 cyan) / foot (#0f766e teal), matching the SEABORNE_COLOR/
 * FOOT_COLOR convention in patrol-type-bar-chart.tsx — instead of the
 * previous single hardcoded dark-gray color, so a track's mode is
 * distinguishable at a glance. An unrecognised patrolType falls back to the
 * original dark gray (#1f2937).
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
import { boundsToView } from "./bounds-view";
import { MapRenderGate } from "./map-render-gate";

// Approximate rendered pixel size of this map's box — the patrol-tracks map
// sits in a right column (narrower than the full-width event/heatmap maps)
// per report-map-report.tsx's layout. Exact values aren't critical —
// boundsToView only needs to be close enough that the initial view is
// already framed on the municipality before applyFraming's post-mount
// fitBounds refinement runs.
const TRACKS_MAP_WIDTH_PX = 560;
const TRACKS_MAP_HEIGHT_PX = 360;

const DEFAULT_CENTER: [number, number] = [13.0, 121.0];
const DEFAULT_ZOOM = 9;

/** Mirrors SEABORNE_COLOR/FOOT_COLOR in patrol-type-bar-chart.tsx. */
function trackColor(patrolType: string): string {
  if (patrolType === "seaborne") return "#0891b2";
  if (patrolType === "foot") return "#0f766e";
  return "#1f2937";
}

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
        // animate:false (R11 fix) — see event-points-map.tsx's applyFraming
        // for the full explanation: without it, Leaflet's fitBounds recenter
        // runs as an ASYNC ~250ms CSS-transition pan whenever the offset
        // fits the viewport, and MapRenderGate's render-ready gate never
        // waits for it — so Puppeteer's page.pdf() can capture the map still
        // at its pre-fit (MapContainer default) view. Forcing animate:false
        // applies the recenter synchronously, matching MapRenderGate's own
        // invalidateSize({animate:false}) call immediately before this.
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [8, 8], maxZoom: 15, animate: false },
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
      map.fitBounds(points, { padding: [16, 16], animate: false });
    },
    [renderableTracks, municipalityBounds],
  );

  // Compute the initial view from municipalityBounds DIRECTLY — independent
  // of the live container size, which is unreliable at effect time in this
  // multi-page Puppeteer print document (see bounds-view.ts's file header
  // for the full root-cause explanation of why post-mount fitBounds alone
  // was not sufficient). Falls back to the whole-region default when no
  // municipality is in scope.
  const initialView = municipalityBounds
    ? boundsToView(municipalityBounds, TRACKS_MAP_WIDTH_PX, TRACKS_MAP_HEIGHT_PX)
    : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <MapContainer
        center={initialView.center}
        zoom={initialView.zoom}
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
            pathOptions={{
              color: trackColor(track.patrolType),
              weight: 2,
              opacity: 0.85,
            }}
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
