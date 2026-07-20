"use client";

/**
 * Event-density heatmap island for the Report Map PDF (owner 2026-07-12: a
 * heatmap on each category page, per event type). Renders OSM tiles + a single
 * "events" HeatLayer built from the category's located event points, framed
 * tight to those points (same focus logic as EventPointsMap). Follows the same
 * MapRenderGate contract as every other print-render map island so Puppeteer
 * waits for the heat paint before capturing the PDF.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, TileLayer } from "react-leaflet";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";
import type {
  ReportMapBounds,
  ReportMapEventPoint,
} from "@/server/report-map-report/get-report-map-report-data";
import { boundsToView } from "./bounds-view";
import { HeatLayer } from "./heat-layer";
import { MapRenderGate } from "./map-render-gate";

// REAL rendered pixel size of the `.cat-map` print box this heatmap occupies.
// The previous values (1010x360) were stale constants from the superseded
// LANDSCAPE layout — see the derivation comment in event-points-map.tsx. This
// island only ever renders inside `.cat-map` (report-map-report.tsx), which is
// 655x235 under the A4-portrait layout.
const HEATMAP_WIDTH_PX = 655;
const HEATMAP_HEIGHT_PX = 235;

/**
 * Bounds inset per side, in CSS px. Deliberately kept identical to
 * EventPointsMap's `framingInsetPx` (and duplicated here for the same reason
 * `pointsBounds` below is duplicated: these two islands are independently
 * code-split via next/dynamic, so importing across them would drag the points
 * map's react-leaflet module graph into this chunk for one arithmetic helper).
 * Both must agree — the heatmap renders directly beneath the points map on a
 * category page, so any framing mismatch between them reads as a bug.
 *
 * 96px == 1.0 inch at print scale (`preferCSSPageSize` maps CSS px at 96dpi),
 * clamped to 20% of the smaller box dimension so the data always keeps >=60% of
 * the box. A literal 1-inch inset is impossible in a 235px-tall (2.45in) box —
 * it would leave 43px of usable height. min(96, floor(235 * 0.2)) = 47px.
 */
const TARGET_INSET_PX = 96;
const MAX_INSET_FRACTION = 0.2;

export function framingInsetPx(widthPx: number, heightPx: number): number {
  return Math.min(
    TARGET_INSET_PX,
    Math.floor(Math.min(widthPx, heightPx) * MAX_INSET_FRACTION),
  );
}

const HEATMAP_INSET_PX = framingInsetPx(HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX);
const DEFAULT_CENTER: [number, number] = [13.0, 121.0];
const DEFAULT_ZOOM = 9;

/** Tight padded bbox around the located points (mirrors EventPointsMap). */
function pointsBounds(
  points: { lat: number; lon: number }[],
): ReportMapBounds | null {
  const first = points[0];
  if (first === undefined) return null;
  let south = first.lat;
  let north = first.lat;
  let west = first.lon;
  let east = first.lon;
  for (const p of points) {
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

/** Fallback hue for points with no assigned sub-type colour (slate-500). */
const NEUTRAL_HEAT_COLOR = "#64748b";

/**
 * Per-point heat weight. leaflet.heat scales every point's intensity by
 * `1 / 2^(maxZoom - currentZoom)` in `_redraw`; at the tight event-framing zoom
 * (well below maxZoom) a weight of 1 collapses to a fraction, so a blob never
 * reaches the vivid stops of its sub-type gradient and washes out to a faint
 * tint — leaving only the most dominant hue (red) visible. A high weight (capped
 * back to 1.0 by the layer `max`) saturates every blob to its true legend colour
 * regardless of zoom. The radial "heatwave" falloff is unaffected — it comes
 * from the blur circle's own alpha gradient, not the weight. (owner 2026-07-12)
 */
const HEAT_WEIGHT = 15;

type ColoredEventPoint = ReportMapEventPoint & { color?: string };

interface EventHeatmapMapProps {
  /**
   * Located event points, each carrying its sub-event-type legend `color`
   * (owner 2026-07-12). The heatmap renders ONE leaflet.heat layer per distinct
   * colour so each sub-type's density blobs paint in its own hue — matching the
   * Event Map markers + breakdown-chart legend — instead of a single
   * category-wide ramp.
   */
  points: ColoredEventPoint[];
  municipalityBounds?: ReportMapBounds | null;
}

export function EventHeatmapMap({
  points,
  municipalityBounds = null,
}: EventHeatmapMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);

  // Group points by their sub-type legend colour → one HeatLayer per hue.
  const groups = new Map<string, HeatLatLng[]>();
  for (const p of points) {
    const key = p.color ?? NEUTRAL_HEAT_COLOR;
    const arr = groups.get(key);
    const tuple: HeatLatLng = [p.lat, p.lon, HEAT_WEIGHT];
    if (arr) arr.push(tuple);
    else groups.set(key, [tuple]);
  }
  const colorGroups = [...groups.entries()];

  const framingBounds = pointsBounds(points) ?? municipalityBounds;

  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (!framingBounds) return;
      const { center, zoom } = boundsToView(
        framingBounds,
        HEATMAP_WIDTH_PX,
        HEATMAP_HEIGHT_PX,
        { paddingPx: HEATMAP_INSET_PX },
      );
      map.setView(center, zoom, { animate: false });
    },
    [framingBounds],
  );

  const initialView = framingBounds
    ? boundsToView(framingBounds, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX, {
        paddingPx: HEATMAP_INSET_PX,
      })
    : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={initialView.center}
        zoom={initialView.zoom}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={true}
        style={{ width: "100%", height: "100%", background: "#dbeafe" }}
        data-testid="event-heatmap-map"
      >
        <TileLayer
          ref={tileLayerRef}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {colorGroups.map(([color, pts]) => (
          <HeatLayer key={color} points={pts} color={color} />
        ))}
        <MapRenderGate
          hasAnyOverlay={points.length > 0}
          applyFraming={applyFraming}
          tileLayerRef={tileLayerRef}
        />
      </MapContainer>
      {points.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontSize: "11px",
            color: "#6b7280",
          }}
        >
          No located items
        </div>
      )}
    </div>
  );
}
