"use client";

// Leaflet island for the Area Boundary Preview dialog. Mirrors the
// MapContainer + TileLayer + Polygon/Polyline + AutoFitBounds pattern from
// apps/web/src/app/print-render/.../components/area-coverage-map.tsx but
// scoped to a single boundary with Esri World Imagery tiles.
//
// Imported by preview-area-boundary-dialog.tsx via
//   const AreaBoundaryMap = dynamic(() => import("./area-boundary-map")
//     .then((m) => m.AreaBoundaryMap), { ssr: false });
// so Leaflet (~50KB) stays out of the dashboard bundle until first preview.

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import { MapContainer, Polygon, Polyline, TileLayer, useMap } from "react-leaflet";
import { ESRI_ATTRIBUTION, ESRI_URL } from "./lib/esri-tile-config";
import {
  geojsonToLeafletPositions,
  type LeafletPositions,
} from "./lib/geojson-to-leaflet-positions";

const STROKE = "#2563eb"; // blue-600
const FILL = "#3b82f6";   // blue-500

interface Props {
  geometryGeojson: unknown;
  geometryType: "Polygon" | "LineString";
}

export function AreaBoundaryMap({ geometryGeojson, geometryType }: Props) {
  const parsed = useMemo(
    () => geojsonToLeafletPositions(geometryGeojson, geometryType),
    [geometryGeojson, geometryType],
  );

  if (parsed === null) {
    return (
      <div
        data-testid="area-boundary-map-fallback"
        className="flex h-[480px] items-center justify-center bg-muted text-sm text-muted-foreground"
      >
        Geometry could not be rendered. Check the raw GeoJSON in the Edit dialog.
      </div>
    );
  }

  return (
    <MapContainer
      center={[13.0, 121.0]} // Mindoro fallback — AutoFitBounds overrides on mount
      zoom={9}
      scrollWheelZoom={true}
      zoomControl={true}
      style={{ width: "100%", height: "480px", background: "#dbeafe" }}
      data-testid="area-boundary-map"
    >
      <TileLayer url={ESRI_URL} attribution={ESRI_ATTRIBUTION} maxZoom={18} />
      {parsed.kind === "Polygon" && (
        <Polygon
          positions={parsed.positions}
          pathOptions={{
            color: STROKE,
            fillColor: FILL,
            fillOpacity: 0.25,
            weight: 2,
          }}
        />
      )}
      {parsed.kind === "LineString" && (
        <Polyline
          positions={parsed.positions}
          pathOptions={{ color: STROKE, weight: 2 }}
        />
      )}
      <AutoFitBounds parsed={parsed} />
    </MapContainer>
  );
}

function AutoFitBounds({ parsed }: { parsed: LeafletPositions }) {
  const map = useMap();
  useEffect(() => {
    const flat: [number, number][] =
      parsed.kind === "Polygon" ? parsed.positions.flat() : parsed.positions;
    if (flat.length < 2) return;
    map.fitBounds(flat, { padding: [20, 20] });
  }, [map, parsed]);
  return null;
}
