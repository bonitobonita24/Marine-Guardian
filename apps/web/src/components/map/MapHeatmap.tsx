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
  /** Heat radius in px (default 22). */
  radius?: number;
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
export function MapHeatmap({ id: propId, points, hsl, radius = 22 }: MapHeatmapProps) {
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
    const ramp = (alpha: number) =>
      `hsla(${String(h)}, ${String(s)}%, ${String(l)}%, ${String(alpha)})`;

    map.addSource(sourceId, { type: "geojson", data: featureCollection });
    map.addLayer({
      id: layerId,
      type: "heatmap",
      source: sourceId,
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": 1,
        "heatmap-radius": radius,
        "heatmap-opacity": 0.85,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          ramp(0),
          0.2,
          ramp(0.3),
          0.4,
          ramp(0.5),
          0.7,
          ramp(0.7),
          1,
          ramp(0.9),
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
