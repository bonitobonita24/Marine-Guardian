"use client";

// Leaflet + leaflet-geoman island for the Area Boundary Create/Edit editor.
// Must be imported via next/dynamic with ssr:false by parent dialogs because
// leaflet imports window at module load.
//
// Pattern mirrors area-boundary-map.tsx (Preview): a MapContainer with Esri
// World Imagery tiles, plus inner components that wire geoman draw + edit
// events and convert results back to GeoJSON for the parent form.

import "leaflet/dist/leaflet.css";
import "./lib/leaflet-globals";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { LatLng, Layer, Map as LeafletMap } from "leaflet";

import { ESRI_ATTRIBUTION, ESRI_URL } from "./lib/esri-tile-config";
import { geojsonToLeafletPositions } from "./lib/geojson-to-leaflet-positions";
import {
  leafletPositionsToGeojson,
  type LeafletShape,
} from "./lib/leaflet-positions-to-geojson";

const PH_CENTROID: [number, number] = [12.8, 121.7];
const PH_DEFAULT_ZOOM = 6;

export type GeometryType = "Polygon" | "LineString";

export interface AreaBoundaryEditorProps {
  mode: "create" | "edit";
  initialGeometry?: Record<string, unknown> | null;
  initialType?: GeometryType | null;
  onGeometryChange: (
    geometry: Record<string, unknown> | null,
    type: GeometryType | null,
  ) => void;
}

export function AreaBoundaryEditor(props: AreaBoundaryEditorProps) {
  const { mode, initialGeometry, initialType, onGeometryChange } = props;

  // In edit mode, parse initial geometry up front so we can short-circuit to
  // the malformed-fallback before mounting the map. The helper requires an
  // expected type; default to Polygon if caller omitted initialType (will
  // still return null on type mismatch, triggering fallback).
  const initialParsed = useMemo(() => {
    if (mode !== "edit" || !initialGeometry) return null;
    return geojsonToLeafletPositions(initialGeometry, initialType ?? "Polygon");
  }, [mode, initialGeometry, initialType]);

  if (mode === "edit" && initialGeometry && initialParsed === null) {
    return (
      <p
        data-testid="editor-malformed-fallback"
        className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700"
      >
        Existing boundary geometry is malformed and cannot be edited. Delete
        and re-create.
      </p>
    );
  }

  return (
    <div
      data-testid="area-boundary-editor-root"
      data-locked-type={initialType ?? ""}
      className="h-[400px] w-full overflow-hidden rounded border"
    >
      <MapContainer
        center={PH_CENTROID}
        zoom={PH_DEFAULT_ZOOM}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={ESRI_URL} attribution={ESRI_ATTRIBUTION} />
        <GeomanWiring
          mode={mode}
          initialParsed={initialParsed}
          initialType={initialType ?? null}
          onGeometryChange={onGeometryChange}
        />
      </MapContainer>
    </div>
  );
}

interface GeomanWiringProps {
  mode: "create" | "edit";
  initialParsed: ReturnType<typeof geojsonToLeafletPositions>;
  initialType: GeometryType | null;
  onGeometryChange: AreaBoundaryEditorProps["onGeometryChange"];
}

// Minimal structural types for the geoman runtime surface we touch. Geoman's
// own d.ts is loose at the polymorphic Layer boundary, so we narrow here
// instead of casting to `any`.
interface PMEditable {
  enable: () => void;
}
interface PMMapControls {
  addControls: (opts: Record<string, unknown>) => void;
  removeControls: () => void;
}
interface PMLayer {
  pm: PMEditable;
}
interface PMMap {
  pm: PMMapControls;
}
interface LayerWithBounds {
  getBounds: () => unknown;
}

function GeomanWiring(props: GeomanWiringProps) {
  const { mode, initialParsed, initialType, onGeometryChange } = props;
  const map = useMap() as unknown as LeafletMap & PMMap;
  const currentLayerRef = useRef<Layer | null>(null);
  const [ready, setReady] = useState(false);

  // Stash onGeometryChange in a ref so the event-wiring effect below does NOT
  // re-subscribe on every parent render. Parents (Create/Edit dialogs) pass
  // inline arrow callbacks, so the prop identity changes constantly — without
  // this indirection, pm:create/pm:edit/pm:remove listeners would detach +
  // reattach on every render and risk dropping a geoman event during teardown.
  const onGeometryChangeRef = useRef(onGeometryChange);
  useEffect(() => {
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  // Initialize geoman toolbar once map is ready.
  useEffect(() => {
    const allowPolygon = mode === "create" || initialType === "Polygon";
    const allowLine = mode === "create" || initialType === "LineString";

    map.pm.addControls({
      position: "topleft",
      drawPolygon: allowPolygon,
      drawPolyline: allowLine,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawRectangle: false,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    });

    setReady(true);
    return () => {
      try {
        map.pm.removeControls();
      } catch {
        /* noop — geoman cleanup may throw if map already disposed */
      }
    };
  }, [map, mode, initialType]);

  // In edit mode, seed the map with the initial geometry once it's ready.
  useEffect(() => {
    if (!ready || mode !== "edit" || !initialParsed) return;
    // L is attached to window by leaflet at module load. Guard against test
    // environments (jsdom + mocked react-leaflet) where it may not exist.
    const L = (window as unknown as { L?: typeof import("leaflet") }).L;
    if (!L) return;
    const layer: Layer =
      initialParsed.kind === "Polygon"
        ? L.polygon(initialParsed.positions).addTo(map)
        : L.polyline(initialParsed.positions).addTo(map);
    currentLayerRef.current = layer;
    const withBounds = layer as unknown as LayerWithBounds;
    const bounds = withBounds.getBounds();
    if (bounds !== null && bounds !== undefined) {
      map.fitBounds(bounds as never, { padding: [16, 16] });
    }
    (layer as unknown as PMLayer).pm.enable();
  }, [ready, mode, initialParsed, map]);

  // Wire pm:create + pm:edit + pm:remove → onGeometryChange.
  useEffect(() => {
    if (!ready) return;

    const emitFromLayer = (layer: Layer | null) => {
      if (!layer) {
        onGeometryChangeRef.current(null, null);
        return;
      }
      const shape = layerToLeafletShape(layer);
      if (!shape) {
        onGeometryChangeRef.current(null, null);
        console.warn(
          "[AreaBoundaryEditor] geoman layer produced no valid shape descriptor",
        );
        return;
      }
      const geojson = leafletPositionsToGeojson(shape);
      if (!geojson) {
        onGeometryChangeRef.current(null, null);
        return;
      }
      onGeometryChangeRef.current(geojson, geojson.type);
    };

    const onCreate = (e: { layer: Layer }) => {
      if (currentLayerRef.current && currentLayerRef.current !== e.layer) {
        map.removeLayer(currentLayerRef.current);
      }
      currentLayerRef.current = e.layer;
      (e.layer as unknown as PMLayer).pm.enable();
      emitFromLayer(e.layer);
    };
    const onEdit = (e: { layer: Layer }) => {
      emitFromLayer(e.layer);
    };
    const onRemove = () => {
      currentLayerRef.current = null;
      emitFromLayer(null);
    };

    map.on("pm:create", onCreate as never);
    map.on("pm:edit", onEdit as never);
    map.on("pm:remove", onRemove as never);

    return () => {
      map.off("pm:create", onCreate as never);
      map.off("pm:edit", onEdit as never);
      map.off("pm:remove", onRemove as never);
    };
  }, [ready, map]);

  return null;
}

interface LayerWithLatLngs {
  getLatLngs?: () => LatLng[] | LatLng[][];
}

function layerToLeafletShape(layer: Layer): LeafletShape | null {
  const asPolygon = layer as unknown as LayerWithLatLngs;
  if (!asPolygon.getLatLngs) return null;
  const raw = asPolygon.getLatLngs();
  if (raw.length === 0) return null;
  if (Array.isArray(raw[0])) {
    return {
      kind: "Polygon",
      positions: (raw as LatLng[][]).map((ring) =>
        ring.map((p) => ({ lat: p.lat, lng: p.lng })),
      ),
    };
  }
  return {
    kind: "LineString",
    positions: (raw as LatLng[]).map((p) => ({ lat: p.lat, lng: p.lng })),
  };
}
