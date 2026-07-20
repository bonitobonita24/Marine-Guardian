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
import { useCallback, useMemo, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, TileLayer } from "react-leaflet";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";
import { filterValidLatLonPairs } from "@/lib/map-coordinates";
import { HeatLayer } from "./heat-layer";
import { MapRenderGate } from "./map-render-gate";

interface PerAreaHeatmapMapProps {
  eventPoints: HeatLatLng[];
  trackPoints: HeatLatLng[];
  /** Optional bbox override; otherwise fitBounds is auto-computed. */
  initialCenter?: { lat: number; lon: number };
  initialZoom?: number;
}

export function PerAreaHeatmapMap({
  eventPoints,
  trackPoints,
  initialCenter,
  initialZoom,
}: PerAreaHeatmapMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);
  const allPoints = useMemo(
    () => [...eventPoints, ...trackPoints],
    [eventPoints, trackPoints],
  );

  const center: [number, number] = initialCenter
    ? [initialCenter.lat, initialCenter.lon]
    : [13.0, 121.0]; // Default: Mindoro centerpoint — overridden by AutoFitBounds when data exists.
  const zoom = initialZoom ?? 9;
  const hasAnyOverlay = eventPoints.length > 0 || trackPoints.length > 0;

  const applyFraming = useCallback(
    (map: LeafletMap) => {
      // MAP GEOMETRY ONLY — drop (0,0)/non-finite/out-of-domain heat points
      // before fitting; the HeatLayers above still receive every point and no
      // event or patrol total changes. Fewer than 2 usable points → keep the
      // initial center/zoom rather than fit a degenerate box.
      const boundsPoints = filterValidLatLonPairs(allPoints);
      if (boundsPoints.length < 2) return;
      const latLngs = boundsPoints.map(
        ([lat, lon]) => [lat, lon] as [number, number],
      );
      map.fitBounds(latLngs, { padding: [16, 16] });
    },
    [allPoints],
  );

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
        ref={tileLayerRef}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HeatLayer variant="tracks" points={trackPoints} />
      <HeatLayer variant="events" points={eventPoints} />
      <MapRenderGate
        hasAnyOverlay={hasAnyOverlay}
        applyFraming={applyFraming}
        tileLayerRef={tileLayerRef}
      />
    </MapContainer>
  );
}
