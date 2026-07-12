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
  | "tracks"
  | "patrol-seaborne"
  | "patrol-foot";

interface HeatLayerProps {
  points: HeatLatLng[];
  /** Preset gradient family (patrol/track/events). Ignored when `color` set. */
  variant?: HeatLayerVariant;
  /**
   * Per-sub-event-type radial "heatwave" (owner 2026-07-12): when a legend hex
   * is supplied, the layer paints in THAT single hue — a saturated hot core
   * that fades outward through a pale tint of the same colour to transparent at
   * the blob edge (the leaflet.heat mask alpha falls off radially; the palette
   * only shifts the hue's lightness with density, never the hue itself). This
   * is what makes each sub-type's density blobs match its markers + chart
   * legend, instead of a single category-wide red/teal ramp. Overrides `variant`.
   */
  color?: string;
  /** Heat blob radius in px. Default 16 (smaller/denser per owner 2026-07-12). */
  radius?: number;
  /** Gaussian blur in px. Default 14. */
  blur?: number;
}

/** `#rgb`/`#rrggbb` → {r,g,b} (0-255). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Mix `hex` toward `target` (255 = white, 0 = black) by `amount` (0-1). */
function mixToward(hex: string, target: number, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const m = (c: number) => Math.round(c + (target - c) * amount);
  return `rgb(${String(m(r))}, ${String(m(g))}, ${String(m(b))})`;
}

/**
 * Single-hue density ramp for a sub-event-type's legend colour. leaflet.heat
 * indexes this palette by accumulated mask alpha, so low density (blob edge)
 * renders the pale tint and high density (overlapping core) the deepened
 * colour — a smooth centre-out gradient in ONE hue. The blob's transparency
 * fade comes from the mask alpha itself (radius + blur), not the palette.
 */
function monoHeatGradient(hex: string): Record<number, string> {
  return {
    0.2: mixToward(hex, 255, 0.55), // pale tint at the fading edge
    0.45: mixToward(hex, 255, 0.25),
    0.7: hex, // the legend colour proper
    1.0: mixToward(hex, 0, 0.18), // slightly deepened hot core
  };
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

export function HeatLayer({
  points,
  variant = "events",
  color,
  radius,
  blur,
}: HeatLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const options: L.HeatMapOptions =
      color !== undefined
        ? {
            radius: radius ?? 16,
            blur: blur ?? 14,
            max: 1.0,
            // Low floor so the blob edge fades all the way to transparent —
            // the "gradually decreasing colour away from the centre" the owner
            // asked for. The radial falloff itself comes from radius + blur.
            minOpacity: 0.05,
            maxZoom: 14,
            gradient: monoHeatGradient(color),
          }
        : VARIANT_OPTIONS[variant];

    const layer = L.heatLayer(points, options);
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, variant, color, radius, blur]);

  return null;
}
