"use client";

/**
 * HeatLayer — thin React wrapper around leaflet.heat's L.heatLayer plugin.
 *
 * Adds a heat layer to the surrounding MapContainer on mount and removes it
 * on unmount (and on prop change, to avoid stacked duplicate layers across
 * re-renders). Variants: `events` (red gradient) and `tracks` (blue
 * gradient), matching the Per Area Report Page 2 legend; `patrol-seaborne`
 * (green) and `patrol-foot` (tangerine orange) — added for the Report Map
 * "Patrol Tracks Heatmap" page (R5, 2026-07-06) — give the two patrol types
 * visually distinct density colors on the same map (colors mirror the
 * SEABORNE_COLOR/FOOT_COLOR convention in patrol-type-bar-chart.tsx:
 * #16A34A green-600 / #F97316 orange-500 — swapped 2026-07-06 from the
 * former cyan/teal pair, which read too similarly to each other).
 *
 * Decision lock: leaflet.heat is the framework heatmap renderer per
 * DECISIONS_LOG.md "Heatmap Renderer Choice (Phase 8 Batch 6 Sub-batch 6.2b)".
 * Track points are pre-densified server-side via packages/shared/lib/heatmap-sample;
 * event points pass through raw (Event rows already carry point geometry).
 * The two new patrol-* variants intentionally skip re-densification (see
 * get-report-map-report-data.ts buildPatrolHeatPoints) — they consume the
 * SAME already-extracted track path points the patrol-tracks polyline map
 * uses, at weight 1 per point.
 */

import { useEffect } from "react";
import L from "leaflet";
import "leaflet.heat";
import { useMap } from "react-leaflet";
import type { HeatLatLng } from "@marine-guardian/shared/lib/heatmap-sample";

export type HeatLayerVariant =
  | "events"
  | "events-law-enforcement"
  | "events-monitoring"
  | "tracks"
  | "patrol-seaborne"
  | "patrol-foot";

interface HeatLayerProps {
  points: HeatLatLng[];
  variant: HeatLayerVariant;
}

const VARIANT_OPTIONS: Record<HeatLayerVariant, L.HeatMapOptions> = {
  // Events — red gradient (red-200 → red-600 light → dark).
  events: {
    radius: 18,
    blur: 22,
    maxZoom: 14,
    gradient: {
      0.2: "#fecaca",
      0.4: "#fca5a5",
      0.6: "#f87171",
      0.8: "#ef4444",
      1.0: "#dc2626",
    },
  },
  // Category event-density heatmaps (owner 2026-07-12): INTENSIFIED (bigger
  // radius, lower blur, faster saturation via max, visible minOpacity) and
  // coloured to the CATEGORY's accent family so the heatmap reads with the same
  // colour identity as that category's markers/legend.
  // Law Enforcement — deep-red ramp.
  "events-law-enforcement": {
    radius: 26,
    blur: 16,
    max: 0.7,
    minOpacity: 0.4,
    maxZoom: 14,
    gradient: {
      0.1: "#fecaca",
      0.3: "#fca5a5",
      0.5: "#f87171",
      0.7: "#ef4444",
      0.85: "#dc2626",
      1.0: "#991b1b",
    },
  },
  // Monitoring — teal→green ramp (matches the monitoring marker family).
  "events-monitoring": {
    radius: 26,
    blur: 16,
    max: 0.7,
    minOpacity: 0.4,
    maxZoom: 14,
    gradient: {
      0.1: "#99f6e4",
      0.3: "#5eead4",
      0.5: "#2dd4bf",
      0.7: "#14b8a6",
      0.85: "#0d9488",
      1.0: "#0f766e",
    },
  },
  // Tracks — blue gradient (blue-200 → blue-700 light → dark).
  tracks: {
    radius: 14,
    blur: 20,
    maxZoom: 14,
    gradient: {
      0.2: "#bfdbfe",
      0.4: "#93c5fd",
      0.6: "#60a5fa",
      0.8: "#3b82f6",
      1.0: "#1d4ed8",
    },
  },
  // Patrol Tracks Heatmap — seaborne — green gradient (green-200 → green-600),
  // distinct from both the red "events" and blue "tracks" variants above, and
  // from the map's own blue water (2026-07-06 swap from the former cyan ramp,
  // which read too close to "patrol-foot"'s teal).
  "patrol-seaborne": {
    radius: 14,
    blur: 20,
    maxZoom: 14,
    gradient: {
      0.2: "#bbf7d0",
      0.4: "#86efac",
      0.6: "#4ade80",
      0.8: "#22c55e",
      1.0: "#16a34a",
    },
  },
  // Patrol Tracks Heatmap — foot — tangerine-orange gradient (orange-100 →
  // orange-500), visually distinct from the seaborne green gradient above and
  // from the map's terrain (2026-07-06 swap from the former teal ramp).
  "patrol-foot": {
    radius: 14,
    blur: 20,
    maxZoom: 14,
    gradient: {
      0.2: "#ffedd5",
      0.4: "#fed7aa",
      0.6: "#fdba74",
      0.8: "#fb923c",
      1.0: "#f97316",
    },
  },
};

export function HeatLayer({ points, variant }: HeatLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const layer = L.heatLayer(points, VARIANT_OPTIONS[variant]);
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, variant]);

  return null;
}
