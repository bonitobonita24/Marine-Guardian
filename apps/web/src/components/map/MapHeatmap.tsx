"use client";

import { useEffect, useId, useMemo } from "react";
import type MapLibreGL from "maplibre-gl";
import { useMap } from "@/components/ui/map";

type HeatPoint = { lon: number; lat: number };

type MapHeatmapProps = {
  /** Optional unique identifier for the heatmap source + layer. */
  id?: string;
  /** Event point coordinates to aggregate into the heat surface. */
  points: HeatPoint[];
  /** Base HSL of the ramp (per category — matches the dot markers / legend). */
  hsl: { h: number; s: number; l: number };
  /** Maximum heat radius in px, reached at the highest zoom. The actual radius
   *  is interpolated by zoom (small when zoomed out, up to this at zoom-in) so
   *  the surface no longer blankets huge areas at low zoom. Default 26. */
  radius?: number;
  /** `heatmap-intensity` paint value (default 1.1 — near-neutral so the surface
   *  reflects real density instead of an amplified blob). */
  intensity?: number;
  /** `heatmap-weight` paint value (default 1 — one unit of density per point;
   *  colour now escalates with genuine overlap, not artificial weighting). */
  weight?: number;
};

/**
 * Renders a MapLibre native heatmap layer for a set of event points, via
 * imperative addSource / addLayer (mapcn exposes no heatmap primitive). The
 * colour ramp interpolates from fully-transparent at zero density up to the
 * category colour at peak density, so overlapping events read as a hot core.
 *
 * Used by the Interactive Report Map's Heatmap display mode — one instance per
 * EarthRanger category (law enforcement = --chart-1, monitoring = --chart-2).
 * Concrete HSL values come from eventCategoryHeatHsl (MapLibre paint cannot read
 * CSS custom properties).
 */
export function MapHeatmap({
  id: propId,
  points,
  hsl,
  radius = 26,
  intensity = 1.1,
  weight = 1,
}: MapHeatmapProps) {
  const { map, isLoaded } = useMap();
  const autoId = useId();
  const id = propId ?? autoId;
  const sourceId = `heatmap-source-${id}`;
  const layerId = `heatmap-layer-${id}`;

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      })),
    }),
    [points],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;
    if (map.getSource(sourceId)) return;

    const { h, s, l } = hsl;
    // Category colour (identity) for the LOW/MID density band …
    const cat = (alpha: number) =>
      `hsla(${String(h)}, ${String(s)}%, ${String(l)}%, ${String(alpha)})`;

    map.addSource(sourceId, { type: "geojson", data: featureCollection });
    map.addLayer({
      id: layerId,
      type: "heatmap",
      source: sourceId,
      paint: {
        "heatmap-weight": weight,
        "heatmap-intensity": intensity,
        // Zoom-responsive radius — small when zoomed out (so the surface tracks
        // real point clusters instead of blanketing a whole municipality),
        // growing to `radius` px on zoom-in. This is the core fix for the
        // "oversized heatmap on zoom-out" report.
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          Math.max(3, Math.round(radius * 0.18)),
          8,
          Math.max(5, Math.round(radius * 0.4)),
          11,
          Math.round(radius * 0.7),
          14,
          radius,
          16,
          Math.round(radius * 1.25),
        ],
        "heatmap-opacity": 0.8,
        // Density → colour: sparse areas keep the category colour (so the layer
        // toggle / legend still reads), then escalate through amber and deep
        // orange to RED where events / patrol tracks pile up. Only the true 0
        // stop is transparent so a lone point still shows as its category hue.
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          cat(0),
          0.12,
          cat(0.45),
          0.35,
          cat(0.7),
          0.55,
          "hsla(38, 92%, 52%, 0.82)",
          0.78,
          "hsla(20, 95%, 50%, 0.9)",
          1,
          "hsla(0, 90%, 48%, 0.95)",
        ],
      },
    });

    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // mapcn may unmount the map before us — ignore.
      }
    };
  }, [isLoaded, map]);

  // Keep the source data in sync as the filtered point set changes.
  useEffect(() => {
    if (!isLoaded || !map) return;
    const source = map.getSource(sourceId);
    if (source !== undefined) {
      (source as MapLibreGL.GeoJSONSource).setData(featureCollection);
    }
  }, [isLoaded, map, featureCollection, sourceId]);

  return null;
}
