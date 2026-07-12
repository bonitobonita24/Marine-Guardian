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

const HEATMAP_WIDTH_PX = 1010;
const HEATMAP_HEIGHT_PX = 360;
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

interface EventHeatmapMapProps {
  points: ReportMapEventPoint[];
  municipalityBounds?: ReportMapBounds | null;
}

export function EventHeatmapMap({
  points,
  municipalityBounds = null,
}: EventHeatmapMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);
  const heatPoints: HeatLatLng[] = points.map((p) => [p.lat, p.lon, 1]);
  const framingBounds = pointsBounds(points) ?? municipalityBounds;

  const applyFraming = useCallback(
    (map: LeafletMap) => {
      if (!framingBounds) return;
      const { center, zoom } = boundsToView(
        framingBounds,
        HEATMAP_WIDTH_PX,
        HEATMAP_HEIGHT_PX,
      );
      map.setView(center, zoom, { animate: false });
    },
    [framingBounds],
  );

  const initialView = framingBounds
    ? boundsToView(framingBounds, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX)
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
        <HeatLayer points={heatPoints} variant="events" />
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
