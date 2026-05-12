"use client";

import { useEffect, useId } from "react";
import type MapLibreGL from "maplibre-gl";
import { useMap } from "@/components/ui/map";

type MapPolygonProps = {
  /** Optional unique identifier for the polygon layers */
  id?: string;
  /** GeoJSON Polygon or MultiPolygon geometry (e.g. PatrolArea.polygonGeojson) */
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Fill + outline color as CSS color value (e.g. PatrolArea.colorHex) */
  color: string;
  /** Fill opacity from 0 to 1 (default 0.2) */
  fillOpacity?: number;
  /** Outline opacity from 0 to 1 (default 0.8) */
  outlineOpacity?: number;
  /** Outline width in pixels (default 1.5) */
  outlineWidth?: number;
};

/**
 * Renders a GeoJSON Polygon (or MultiPolygon) overlay on the parent MapLibre map
 * via imperative addSource / addLayer calls. mapcn does not expose a polygon
 * primitive, so this wrapper encapsulates the dance and the cleanup. Used for
 * PatrolArea overlays on the operator map.
 */
export function MapPolygon({
  id: propId,
  geojson,
  color,
  fillOpacity = 0.2,
  outlineOpacity = 0.8,
  outlineWidth = 1.5,
}: MapPolygonProps) {
  const { map, isLoaded } = useMap();
  const autoId = useId();
  const id = propId ?? autoId;
  const sourceId = `polygon-source-${id}`;
  const fillLayerId = `polygon-fill-${id}`;
  const lineLayerId = `polygon-line-${id}`;

  useEffect(() => {
    if (!isLoaded || !map) return;
    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: geojson },
    });

    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": fillOpacity,
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": outlineWidth,
        "line-opacity": outlineOpacity,
      },
    });

    return () => {
      try {
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // mapcn may unmount the map before us — ignore
      }
    };
  }, [isLoaded, map]);

  useEffect(() => {
    if (!isLoaded || !map) return;
    const source = map.getSource(sourceId);
    if (source !== undefined) {
      (source as MapLibreGL.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: geojson,
      });
    }
  }, [isLoaded, map, geojson, sourceId]);

  useEffect(() => {
    if (!isLoaded || !map) return;
    if (map.getLayer(fillLayerId)) {
      map.setPaintProperty(fillLayerId, "fill-color", color);
      map.setPaintProperty(fillLayerId, "fill-opacity", fillOpacity);
    }
    if (map.getLayer(lineLayerId)) {
      map.setPaintProperty(lineLayerId, "line-color", color);
      map.setPaintProperty(lineLayerId, "line-width", outlineWidth);
      map.setPaintProperty(lineLayerId, "line-opacity", outlineOpacity);
    }
  }, [
    isLoaded,
    map,
    fillLayerId,
    lineLayerId,
    color,
    fillOpacity,
    outlineOpacity,
    outlineWidth,
  ]);

  return null;
}
