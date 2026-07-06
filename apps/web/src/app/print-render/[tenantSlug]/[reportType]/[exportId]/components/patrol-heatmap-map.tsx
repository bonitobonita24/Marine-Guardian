"use client";

/**
 * Patrol Tracks Heatmap Map — Leaflet client island for the Report Map PDF
 * "Patrol Tracks Heatmap" page (R5, 2026-07-06).
 *
 * Renders OpenStreetMap tiles + TWO heat layers, one per patrol type, so
 * seaborne and foot patrol density stay visually distinct on the same map:
 * seaborne uses the "patrol-seaborne" HeatLayer variant (cyan) and foot uses
 * "patrol-foot" (teal) — see heat-layer.tsx. Points are NOT re-densified:
 * they come straight from ReportMapTrackRow.path (already extracted via the
 * tested pointsFromTrackGeojson pipeline the patrol-tracks polyline map
 * consumes), split by patrolType and given weight 1 per point — see
 * get-report-map-report-data.ts's buildPatrolHeatPoints.
 *
 * Follows the same MapRenderGate contract as every other Report Map print
 * island (EventPointsMap / PatrolTracksMap) — registers with the
 * window.__renderPending counter via MapRenderGate/flipRenderReady, so
 * Puppeteer waits for this map's tiles/heat paint before capturing the PDF.
 *
 * When both point sets are empty, shows the tile basemap with a centered
 * "No located items" overlay and flips the ready flag without waiting for
 * tile load — matches PatrolTracksMap's empty-state contract.
 */

import "leaflet/dist/leaflet.css";
import { useCallback, useMemo, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { MapContainer, TileLayer } from "react-leaflet";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";
import type { ReportMapBounds } from "@/server/report-map-report/get-report-map-report-data";
import { HeatLayer } from "./heat-layer";
import { MapRenderGate } from "./map-render-gate";

interface PatrolHeatmapMapProps {
  seaborne: HeatLatLng[];
  foot: HeatLatLng[];
  /** When set (report scoped to one municipality), the map frames this area
   *  instead of fitting to the heat points — mirrors EventPointsMap /
   *  PatrolTracksMap's municipalityBounds contract. */
  municipalityBounds?: ReportMapBounds | null;
}

export function PatrolHeatmapMap({
  seaborne,
  foot,
  municipalityBounds = null,
}: PatrolHeatmapMapProps) {
  const tileLayerRef = useRef<LeafletTileLayer>(null);
  const allPoints = useMemo(() => [...seaborne, ...foot], [seaborne, foot]);
  const hasAnyOverlay = allPoints.length > 0;

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
      if (allPoints.length < 2) return;
      const latLngs = allPoints.map(
        ([lat, lon]) => [lat, lon] as [number, number],
      );
      map.fitBounds(latLngs, { padding: [16, 16] });
    },
    [allPoints, municipalityBounds],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={[13.0, 121.0]}
        zoom={9}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={true}
        style={{ width: "100%", height: "100%", background: "#dbeafe" }}
        data-testid="patrol-heatmap-map"
      >
        <TileLayer
          ref={tileLayerRef}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatLayer variant="patrol-seaborne" points={seaborne} />
        <HeatLayer variant="patrol-foot" points={foot} />
        <MapRenderGate
          hasAnyOverlay={hasAnyOverlay}
          applyFraming={applyFraming}
          tileLayerRef={tileLayerRef}
        />
      </MapContainer>
      {!hasAnyOverlay && (
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
