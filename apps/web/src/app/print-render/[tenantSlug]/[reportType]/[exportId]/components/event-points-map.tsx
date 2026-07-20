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
import { filterValidMapPoints } from "@/lib/map-coordinates";
import { boundsToView } from "./bounds-view";
import { MapRenderGate } from "./map-render-gate";

// REAL rendered pixel size of the print box these event maps occupy, measured
// from report-map-report.tsx's A4-PORTRAIT layout.
//
// The previous values (1010x360) were written for the SUPERSEDED landscape
// layout and were never updated when the owner pinned this report to portrait
// (2026-07-12, report-map-report.tsx). Assuming a box ~1.5x taller than the
// real one made boundsToView pick a zoom a full level too tight, which is why
// markers sat hard against the crop. Derivation:
//
//   @page A4 portrait, margin 12mm -> content 210mm - 24mm = 186mm = 703px @96dpi
//   .report-section padding 0 24px -> map box width  703 - 48 = 655px
//   .cat-map     height 235px  (category pages: points map + heatmap, one sheet)
//   .section-map height 260px  (Events-Over-Time overview map)
//
// 655x235 is used for BOTH call sites: it is the smaller (binding) box, so the
// taller 260px `.section-map` is framed slightly loose rather than clipped.
export const EVENT_MAP_WIDTH_PX = 655;
export const EVENT_MAP_HEIGHT_PX = 235;

/**
 * Target bounds inset per side, in CSS px. `preferCSSPageSize` maps CSS px to
 * paper at 96dpi, so 96px == exactly 1.0 inch of printed page — the owner's
 * "inset the markers by about an inch" ask.
 */
const TARGET_INSET_PX = 96;

/**
 * Degeneracy guard: the inset may never consume more than this fraction of the
 * SMALLER box dimension, so the data always keeps >=60% of the box on both axes.
 *
 * This clamp is load-bearing, not defensive decoration. A literal 96px inset on
 * all four sides is geometrically IMPOSSIBLE in a 235px-tall (2.45in) box: it
 * would leave 235 - 192 = 43px (0.45in) of usable height, collapsing the data
 * into a thin central strip over a mostly-empty basemap — and on a single-point
 * map (bbox = 0.04 deg) it would push the fit toward the minZoom floor. 20% of
 * 235 = 47px (~0.49in) is the largest inset this box can actually carry.
 */
const MAX_INSET_FRACTION = 0.2;

/**
 * Effective inset for a given box: the 1-inch target, clamped by
 * MAX_INSET_FRACTION of the smaller dimension.
 *
 * For the real 655x235 box this yields min(96, floor(235 * 0.2)) = 47px.
 * Net effect vs. the previous behaviour (1010x360 box, boundsToView's default
 * 8px pad) on the binding height axis:
 *   log2((235 - 2*47) / (360 - 2*8)) = log2(141 / 344) ~= -1.29 zoom levels.
 * i.e. ~2.4x more visible area — the "1 inch or equivalent zoom-out" the owner
 * asked for, expressed as the largest inset that does not degenerate the view.
 */
export function framingInsetPx(widthPx: number, heightPx: number): number {
  return Math.min(
    TARGET_INSET_PX,
    Math.floor(Math.min(widthPx, heightPx) * MAX_INSET_FRACTION),
  );
}

const EVENT_MAP_INSET_PX = framingInsetPx(
  EVENT_MAP_WIDTH_PX,
  EVENT_MAP_HEIGHT_PX,
);

const DEFAULT_CENTER: [number, number] = [13.0, 121.0];
const DEFAULT_ZOOM = 9;

/** An event point may carry its own per-sub-type accent (owner 2026-07-12); when
 *  absent the marker uses the section's `markerColor`. */
type EventPointWithColor = ReportMapEventPoint & { color?: string };

/**
 * Tight bounding box around the located points, padded by a fraction of the
 * span (min absolute pad so a lone point still frames sensibly). This focuses
 * the map on the actual event markers instead of the whole municipality water
 * polygon — the owner's "zoom in to what matters, not the full boundary" ask.
 *
 * Coordinates that cannot legitimately contribute to a bounds box — (0,0)
 * "Null Island", non-finite values, out-of-WGS84-domain values — are dropped
 * FIRST (see lib/map-coordinates.ts). Without this, four (0,0) event rows in
 * the dev DB stretched the box from the Gulf of Guinea to Mindoro and pushed
 * every real marker off the printed map.
 *
 * This affects MAP GEOMETRY ONLY. The excluded events remain in the report's
 * counts, breakdown rows, lists and tables — the caller passes the full,
 * unfiltered `points` array to the marker/heat layers and to every total.
 *
 * Returns null when NO point survives, so the caller falls back to the
 * municipality bounds and then to the default whole-region view rather than
 * producing NaN or an empty box.
 */
export function pointsBounds(
  points: { lat: number; lon: number }[],
): ReportMapBounds | null {
  const boundsPoints = filterValidMapPoints(
    points,
    (p) => p.lat,
    (p) => p.lon,
  );
  const first = boundsPoints[0];
  if (first === undefined) return null;
  let south = first.lat;
  let north = first.lat;
  let west = first.lon;
  let east = first.lon;
  for (const p of boundsPoints) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
  }
  const latPad = Math.max((north - south) * 0.18, 0.02);
  const lonPad = Math.max((east - west) * 0.18, 0.02);
  return {
    south: south - latPad,
    west: west - lonPad,
    north: north + latPad,
    east: east + lonPad,
  };
}

interface EventPointsMapProps {
  points: EventPointWithColor[];
  markerColor?: string;
  /** Fallback framing (whole municipality water area) used ONLY when there are
   *  no located points to fit to. */
  municipalityBounds?: ReportMapBounds | null;
}

export function EventPointsMap({
  points,
  markerColor = "#2563eb",
  municipalityBounds = null,
}: EventPointsMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);

  // Prefer a tight box around the event markers; fall back to the municipality
  // water area only when there are no points. Frames on the data the owner
  // cares about instead of empty ocean margin.
  const framingBounds = pointsBounds(points) ?? municipalityBounds;

  // Re-assert the SAME size-independent view the MapContainer initialized with
  // (boundsToView), via setView — NOT fitBounds. fitBounds recomputes the zoom
  // from the print container's unreliable measured size; setView applies the
  // precomputed center/zoom directly (no size dep). Runs AFTER MapRenderGate's
  // invalidateSize.
  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (!framingBounds) return;
      const { center, zoom } = boundsToView(
        framingBounds,
        EVENT_MAP_WIDTH_PX,
        EVENT_MAP_HEIGHT_PX,
        { paddingPx: EVENT_MAP_INSET_PX },
      );
      map.setView(center, zoom, { animate: false });
    },
    [framingBounds],
  );

  // Compute the initial view DIRECTLY — independent of the live container size,
  // which is unreliable at effect time in this multi-page Puppeteer print
  // document (see bounds-view.ts header). Falls back to the whole-region
  // default when nothing to frame.
  const initialView = framingBounds
    ? boundsToView(framingBounds, EVENT_MAP_WIDTH_PX, EVENT_MAP_HEIGHT_PX, {
        paddingPx: EVENT_MAP_INSET_PX,
      })
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
        data-testid="event-points-map"
      >
        <TileLayer
          ref={tileLayerRef}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => {
          const c = p.color ?? markerColor;
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={5}
              pathOptions={{
                color: c,
                fillColor: c,
                fillOpacity: 0.7,
                weight: 1,
              }}
            />
          );
        })}
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
