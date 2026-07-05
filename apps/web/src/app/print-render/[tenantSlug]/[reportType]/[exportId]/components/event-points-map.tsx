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
import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import type {
  ReportMapBounds,
  ReportMapEventPoint,
} from "@/server/report-map-report/get-report-map-report-data";

declare global {
  interface Window {
    __renderReady?: boolean;
    /** Multi-map coordination counter. Set by the RSC host before render; each
     *  MapReadySignal decrements it. __renderReady is flipped only when the
     *  counter reaches 0. Single-map documents leave this undefined — the
     *  direct-flip fallback preserves backward compatibility. */
    __renderPending?: number;
  }
}

interface EventPointsMapProps {
  points: ReportMapEventPoint[];
  markerColor?: string;
  /** When set (report scoped to one municipality), the map frames this area
   *  instead of fitting to the data points — fixes the whole-region /
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

    // Safety net: 8s hard timeout (matches Puppeteer waitForFunction timeout).
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
  points,
  municipalityBounds,
}: {
  points: ReportMapEventPoint[];
  municipalityBounds?: ReportMapBounds | null;
}) {
  const map = useMap();
  useEffect(() => {
    // A specific municipality is in scope — always frame it, even when there
    // are 0/1 located event points (the case that used to fall through to
    // the fixed whole-region fallback).
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
    if (points.length < 2) return;
    const latLngs = points.map((p) => [p.lat, p.lon] as [number, number]);
    map.fitBounds(latLngs, { padding: [16, 16] });
  }, [map, points, municipalityBounds]);
  return null;
}

export function EventPointsMap({
  points,
  markerColor = "#2563eb",
  municipalityBounds = null,
}: EventPointsMapProps) {
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
        data-testid="event-points-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={5}
            pathOptions={{
              color: markerColor,
              fillColor: markerColor,
              fillOpacity: 0.7,
              weight: 1,
            }}
          />
        ))}
        <AutoFitBounds points={points} municipalityBounds={municipalityBounds} />
        <MapReadySignal hasAnyOverlay={points.length > 0} />
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
