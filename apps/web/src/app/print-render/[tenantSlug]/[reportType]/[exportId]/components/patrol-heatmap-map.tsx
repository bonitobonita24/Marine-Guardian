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
import { boundsToView } from "./bounds-view";
import { HeatLayer } from "./heat-layer";
import { MapRenderGate } from "./map-render-gate";

// Approximate rendered pixel size of the full-width `.section-map` box this
// heatmap renders in (report-map-report.tsx's landscape layout). Exact
// values aren't critical — boundsToView only needs to be close enough that
// the initial view is already framed on the municipality before
// applyFraming's post-mount fitBounds refinement runs.
const HEATMAP_WIDTH_PX = 1010;
const HEATMAP_HEIGHT_PX = 360;

const DEFAULT_CENTER: [number, number] = [13.0, 121.0];
const DEFAULT_ZOOM = 9;

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
      if (allPoints.length < 2) return;
      const latLngs = allPoints.map(
        ([lat, lon]) => [lat, lon] as [number, number],
      );
      map.fitBounds(latLngs, { padding: [16, 16], animate: false });
    },
    [allPoints, municipalityBounds],
  );

  // Compute the initial view from municipalityBounds DIRECTLY — independent
  // of the live container size, which is unreliable at effect time in this
  // multi-page Puppeteer print document (see bounds-view.ts's file header
  // for the full root-cause explanation of why post-mount fitBounds alone
  // was not sufficient). Falls back to the whole-region default when no
  // municipality is in scope.
  const initialView = municipalityBounds
    ? boundsToView(municipalityBounds, HEATMAP_WIDTH_PX, HEATMAP_HEIGHT_PX)
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
