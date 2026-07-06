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
import { useEffect, useRef } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type {
  ReportMapBounds,
  ReportMapTrackRow,
} from "@/server/report-map-report/get-report-map-report-data";

declare global {
  interface Window {
    __renderReady?: boolean;
    /** Multi-map coordination counter — see event-points-map.tsx for protocol. */
    __renderPending?: number;
  }
}

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
  /** When set (report scoped to one municipality), the map frames this area
   *  instead of fitting to the track paths — fixes the whole-region /
   *  empty-ocean-margin view on a single-municipality report. */
  municipalityBounds?: ReportMapBounds | null;
}

function MapReadySignal({ hasAnyOverlay }: { hasAnyOverlay: boolean }) {
  const map = useMap();
  const flippedRef = useRef(false);

  useEffect(() => {
    if (flippedRef.current) return;

    function flip() {
      if (flippedRef.current) return;
      flippedRef.current = true;
      if (typeof window.__renderPending === "number") {
        window.__renderPending -= 1;
        if (window.__renderPending <= 0) window.__renderReady = true;
      } else {
        window.__renderReady = true;
      }
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

function AutoFitBounds({
  tracks,
  municipalityBounds,
}: {
  tracks: ReportMapTrackRow[];
  municipalityBounds?: ReportMapBounds | null;
}) {
  const map = useMap();
  useEffect(() => {
    // Print/SSR mounts the container before it reaches its final laid-out
    // width; Leaflet measures too-narrow and only loads tiles for that width.
    // Re-measure the FULL container before framing, else the uncovered right
    // band shows through as the MapContainer background.
    map.invalidateSize({ animate: false });
    // A specific municipality is in scope — always frame it, even when there
    // are 0/1 renderable tracks (the case that used to fall through to the
    // fixed whole-region fallback).
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
    for (const t of tracks) {
      for (const pt of t.path) {
        points.push([pt.lat, pt.lon]);
      }
    }
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [16, 16] });
  }, [map, tracks, municipalityBounds]);
  return null;
}

export function PatrolTracksMap({
  tracks,
  municipalityBounds = null,
}: PatrolTracksMapProps) {
  const renderableTracks = tracks.filter((t) => t.path.length > 1);
  const hasTracks = renderableTracks.length > 0;

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
        <AutoFitBounds
          tracks={renderableTracks}
          municipalityBounds={municipalityBounds}
        />
        <MapReadySignal hasAnyOverlay={hasTracks} />
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
