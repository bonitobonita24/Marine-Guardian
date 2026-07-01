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
import type { ReportMapTrackRow } from "@/server/report-map-report/get-report-map-report-data";

declare global {
  interface Window {
    __renderReady?: boolean;
    /** Multi-map coordination counter — see event-points-map.tsx for protocol. */
    __renderPending?: number;
  }
}

interface PatrolTracksMapProps {
  tracks: ReportMapTrackRow[];
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

function AutoFitBounds({ tracks }: { tracks: ReportMapTrackRow[] }) {
  const map = useMap();
  useEffect(() => {
    const points: Array<[number, number]> = [];
    for (const t of tracks) {
      for (const pt of t.path) {
        points.push([pt.lat, pt.lon]);
      }
    }
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [16, 16] });
  }, [map, tracks]);
  return null;
}

export function PatrolTracksMap({ tracks }: PatrolTracksMapProps) {
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
        <AutoFitBounds tracks={renderableTracks} />
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
