"use client";

/**
 * Patrol Tracks Map — Leaflet client island for Report Map PDF patrol section.
 *
 * Renders OpenStreetMap tiles + a Polyline for every patrol track that has at
 * least two points. Frames the camera on the union of the report's scope
 * bounds and the drawn track extent (see computeTracksFraming), falling back
 * to fitting the track paths when the report has no scope. Each polyline is
 * colored by ReportMapTrackRow.patrolType (R1, 2026-07-06) — seaborne
 * (#16A34A green-600) / foot (#F97316 orange-500 — swapped 2026-07-06 from
 * the former cyan/teal pair, which read too similarly to each other),
 * matching the SEABORNE_COLOR/FOOT_COLOR convention in
 * patrol-type-bar-chart.tsx — instead of the previous single hardcoded
 * dark-gray color, so a track's mode is distinguishable at a glance. An
 * unrecognised patrolType falls back to the original dark gray (#1f2937).
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
import { useCallback, useMemo, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import type {
  ReportMapBounds,
  ReportMapTrackRow,
} from "@/server/report-map-report/get-report-map-report-data";
import { computeTracksFraming } from "./patrol-tracks-framing";
import { MapRenderGate } from "./map-render-gate";

// Rendered pixel size of this map's box. These are NOT cosmetic: nothing
// re-frames the camera after computeTracksFraming (MapRenderGate calls
// applyFraming once and never touches the view again), so an assumed box
// LARGER than the real one silently over-zooms and the geometry runs off the
// edge. The 2026-07-20 "tracks run off the bottom" defect was exactly this —
// the height below read 360 while the real box is 235.
//
// HEIGHT — exact. report-map-report.tsx pins the map box:
//   `.patrol-tracks-block { width: 100%; height: 235px; }` (figure + map both
//   100%/100% inside it).
// WIDTH — deliberately conservative. The map is full-width inside
//   `.report-section` on an A4 page: portrait is 210mm − 24mm @page margin =
//   186mm ≈ 703px, minus the section's 24px horizontal padding each side
//   ≈ 655px; a landscape template is wider still. 640 sits just under the
//   narrowest case, and UNDER-stating the box can only zoom out (extra
//   margin), never clip.
const TRACKS_MAP_WIDTH_PX = 640;
const TRACKS_MAP_HEIGHT_PX = 235;

const DEFAULT_CENTER: [number, number] = [13.0, 121.0];
const DEFAULT_ZOOM = 9;

/** Flatten every renderable track into a `[lat, lon]` vertex list. */
function collectTrackPoints(
  tracks: ReadonlyArray<ReportMapTrackRow>,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const t of tracks) {
    for (const pt of t.path) {
      points.push([pt.lat, pt.lon]);
    }
  }
  return points;
}

/** Mirrors SEABORNE_COLOR/FOOT_COLOR in patrol-type-bar-chart.tsx. */
function trackColor(patrolType: string): string {
  if (patrolType === "seaborne") return "#16A34A";
  if (patrolType === "foot") return "#F97316";
  return "#1f2937";
}

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
  /** Scope bounds (municipality / zone / province the report is scoped to).
   *  When set, the map frames the UNION of this box and the drawn track
   *  extent — the scope stays visible for context while whole tracks that
   *  run outside it are still fully contained (see computeTracksFraming). */
  municipalityBounds?: ReportMapBounds | null;
}

export function PatrolTracksMap({
  tracks,
  municipalityBounds = null,
}: PatrolTracksMapProps) {
  const renderableTracks = useMemo(
    () => tracks.filter((t) => t.path.length > 1),
    [tracks],
  );
  const hasTracks = renderableTracks.length > 0;
  const tileLayerRef = useRef<LeafletTileLayer>(null);

  // Frame to the DATA: the union of the scope box and the drawn track extent
  // (see computeTracksFraming). Runs AFTER MapRenderGate's invalidateSize.
  // Memoised so `applyFraming` keeps a stable identity — MapRenderGate takes
  // it as an effect dependency, and a fresh identity every render would
  // re-run invalidateSize/framing on each re-render.
  const framingPlan = useMemo(
    () =>
      computeTracksFraming(
        collectTrackPoints(renderableTracks),
        municipalityBounds,
        TRACKS_MAP_WIDTH_PX,
        TRACKS_MAP_HEIGHT_PX,
      ),
    [renderableTracks, municipalityBounds],
  );

  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (framingPlan.kind === "setView") {
        map.setView(framingPlan.center, framingPlan.zoom, { animate: false });
      }
    },
    [framingPlan],
  );

  // Compute the initial view from the same plan DIRECTLY — independent of the
  // live container size, which is unreliable at effect time in this multi-page
  // Puppeteer print document (see bounds-view.ts's file header for the full
  // root-cause explanation of why post-mount fitBounds alone was not
  // sufficient). Falls back to the whole-region default when there is no scope.
  const initialView =
    framingPlan.kind === "setView"
      ? { center: framingPlan.center, zoom: framingPlan.zoom }
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
