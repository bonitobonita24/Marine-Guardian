"use client";

/**
 * Per Area Heatmap Map — Leaflet client island for Per Area Report Page 2.
 *
 * Renders OpenStreetMap tiles + two heat layers:
 *   • events  — law enforcement + monitoring event point geometries (red).
 *   • tracks  — patrol track points pre-densified at 250m intervals (blue).
 *
 * Extends the AreaCoverageMap pattern from Coverage Report Page 2: same
 * MapContainer + TileLayer + AutoFitBounds + MapReadySignal contract.
 * Sets `window.__renderReady = true` once Leaflet finishes tile load AND
 * heat-layer paint (decision locked in DECISIONS_LOG.md "Coverage Report
 * Page 2 Map Render Strategy" — applies unchanged to heat-layer overlays).
 *
 * Data flow: server pre-flattens events + densifies tracks via
 * packages/shared/lib/heatmap-sample. The client island never re-runs the
 * sampler — it only mounts L.heatLayer with the pre-built tuples.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";
import { HeatLayer } from "./heat-layer";

declare global {
  interface Window {
    __renderReady?: boolean;
  }
}

interface PerAreaHeatmapMapProps {
  eventPoints: HeatLatLng[];
  trackPoints: HeatLatLng[];
  /** Optional bbox override; otherwise fitBounds is auto-computed. */
  initialCenter?: { lat: number; lon: number };
  initialZoom?: number;
}

interface MapReadySignalProps {
  hasAnyOverlay: boolean;
}

/**
 * Mirrors the MapReadySignal contract from AreaCoverageMap. Two animation
 * frames give the heat-layer canvas time to flush before Puppeteer
 * screenshots. Safety net: 8s hard timeout (matches Puppeteer's
 * waitForFunction timeout in the pdf-renderer service).
 */
function MapReadySignal({ hasAnyOverlay }: MapReadySignalProps) {
  const map = useMap();
  const flippedRef = useRef(false);

  useEffect(() => {
    if (flippedRef.current) return;

    function flip() {
      if (flippedRef.current) return;
      flippedRef.current = true;
      window.__renderReady = true;
    }

    function paintFlush() {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(flip);
      });
    }

    const timeoutId = window.setTimeout(paintFlush, 8000);

    if (!hasAnyOverlay) {
      paintFlush();
    } else {
      map.whenReady(() => {
        map.once("load", paintFlush);
      });
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [map, hasAnyOverlay]);

  return null;
}

interface AutoFitBoundsProps {
  points: HeatLatLng[];
}

function AutoFitBounds({ points }: AutoFitBoundsProps) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const latLngs = points.map(
      ([lat, lon]) => [lat, lon] as [number, number],
    );
    map.fitBounds(latLngs, { padding: [16, 16] });
  }, [map, points]);
  return null;
}

export function PerAreaHeatmapMap({
  eventPoints,
  trackPoints,
  initialCenter,
  initialZoom,
}: PerAreaHeatmapMapProps) {
  const allPoints = useMemo(
    () => [...eventPoints, ...trackPoints],
    [eventPoints, trackPoints],
  );

  const center: [number, number] = initialCenter
    ? [initialCenter.lat, initialCenter.lon]
    : [13.0, 121.0]; // Default: Mindoro centerpoint — overridden by AutoFitBounds when data exists.
  const zoom = initialZoom ?? 9;
  const hasAnyOverlay = eventPoints.length > 0 || trackPoints.length > 0;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={true}
      style={{ width: "100%", height: "100%", background: "#dbeafe" }}
      data-testid="per-area-heatmap-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HeatLayer variant="tracks" points={trackPoints} />
      <HeatLayer variant="events" points={eventPoints} />
      <AutoFitBounds points={allPoints} />
      <MapReadySignal hasAnyOverlay={hasAnyOverlay} />
    </MapContainer>
  );
}
