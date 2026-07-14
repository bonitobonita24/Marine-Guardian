"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Map, useMap } from "@/components/ui/map";
import { cn } from "@/lib/utils";

/**
 * GeoJSON shape stored on PatrolSchedule.plannedTrackGeojson — a single
 * LineString Feature. The draw surface below is constrained to ONE stroke:
 * drawing again replaces the previous track rather than appending to it.
 */
export type PlannedTrackGeoJSON = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type PlannedTrackDrawProps = {
  value: PlannedTrackGeoJSON | null;
  onChange: (value: PlannedTrackGeoJSON | null) => void;
  className?: string;
};

// Mindoro AOI — matches this app's EarthRanger coverage area (mindoro.pamdas.org).
const DEFAULT_CENTER: [number, number] = [121.05, 13.15];
const DEFAULT_ZOOM = 10;
const TRACK_COLOR = "#3b82f6"; // blue-500
const TRACK_THICKNESS = 4;

function extractCoordinates(
  value: PlannedTrackGeoJSON | null,
): [number, number][] {
  const coords = value?.geometry.coordinates;
  return Array.isArray(coords) ? coords : [];
}

function toFeature(points: [number, number][]): PlannedTrackGeoJSON | null {
  if (points.length < 2) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: points },
  };
}

/**
 * Canvas draw surface layered above the shared MapLibre map — cloned from
 * the doodle annotation layer's projection/redraw pattern
 * (components/map/doodle/DoodleOverlay.tsx) but constrained to a SINGLE
 * committed stroke instead of an accumulating list.
 */
function TrackDrawSurface({
  points,
  onCommit,
}: {
  points: [number, number][];
  onCommit: (points: [number, number][]) => void;
}) {
  const { map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<[number, number][] | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = map?.getContainer();
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${String(rect.width)}px`;
    canvas.style.height = `${String(rect.height)}px`;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [map]);

  const redraw = useCallback(
    (liveTrack?: [number, number][]) => {
      const canvas = canvasRef.current;
      if (!canvas || !map) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const pts = liveTrack ?? pointsRef.current;
      if (pts.length < 2) return;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = TRACK_COLOR;
      ctx.lineWidth = TRACK_THICKNESS;
      ctx.beginPath();
      pts.forEach(([lng, lat], i) => {
        const { x, y } = map.project([lng, lat]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    },
    [map],
  );

  // Resize + redraw whenever the map container size changes.
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    resizeCanvas();
    redraw();
    const observer = new ResizeObserver(() => {
      resizeCanvas();
      redraw(drawingRef.current ?? undefined);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [map, resizeCanvas, redraw]);

  // Redraw on every map move/render so the track stays pinned during pan/zoom.
  useEffect(() => {
    if (!map) return;
    const handler = () => {
      redraw(drawingRef.current ?? undefined);
    };
    map.on("move", handler);
    map.on("render", handler);
    return () => {
      map.off("move", handler);
      map.off("render", handler);
    };
  }, [map, redraw]);

  // Redraw whenever the committed track changes (new stroke / clear / prefill).
  useEffect(() => {
    redraw();
  }, [points, redraw]);

  // Drawing is the sole interaction on this compact map — dragPan stays
  // disabled the whole time (unlike the doodle layer's toggleable mode).
  useEffect(() => {
    if (!map) return;
    map.dragPan.disable();
    return () => {
      map.dragPan.enable();
    };
  }, [map]);

  const getLngLat = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
      if (!map) return null;
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { lng, lat } = map.unproject([x, y]);
      return [lng, lat];
    },
    [map],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const lngLat = getLngLat(e);
      if (!lngLat) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = [lngLat];
      redraw(drawingRef.current);
    },
    [getLngLat, redraw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const lngLat = getLngLat(e);
      if (!lngLat) return;
      drawingRef.current.push(lngLat);
      redraw(drawingRef.current);
    },
    [getLngLat, redraw],
  );

  const commit = useCallback(() => {
    const pts = drawingRef.current;
    drawingRef.current = null;
    if (!pts || pts.length < 2) {
      redraw();
      return;
    }
    // A fresh stroke REPLACES the previous track — single-track constraint.
    onCommitRef.current(pts);
  }, [redraw]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="planned-track-canvas"
      className="absolute inset-0 z-10 cursor-crosshair"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={commit}
      onPointerLeave={commit}
    />
  );
}

/**
 * Compact (~320px) map-draw control for the patrol-schedule assignment
 * dialog's planned track. Replaces the patrol-area dropdown as the primary
 * spatial input — the area select remains available as an optional
 * secondary field alongside this component.
 */
export function PlannedTrackDraw({
  value,
  onChange,
  className,
}: PlannedTrackDrawProps) {
  const [points, setPoints] = useState<[number, number][]>(() =>
    extractCoordinates(value),
  );
  const lastValueRef = useRef(value);

  // Re-sync local draw state when the caller swaps in a different `value`
  // identity (e.g. the dialog opening for a different schedule in edit mode).
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setPoints(extractCoordinates(value));
    }
  }, [value]);

  const handleCommit = useCallback(
    (pts: [number, number][]) => {
      setPoints(pts);
      const feature = toFeature(pts);
      lastValueRef.current = feature;
      onChange(feature);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    setPoints([]);
    lastValueRef.current = null;
    onChange(null);
  }, [onChange]);

  // Only used to seed the map's initial viewport on mount — not reactive.
  const initialCenterRef = useRef<[number, number]>(points[0] ?? DEFAULT_CENTER);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="relative overflow-hidden rounded-md border"
        style={{ height: 320 }}
        data-testid="planned-track-map-container"
      >
        <Map center={initialCenterRef.current} zoom={DEFAULT_ZOOM}>
          <TrackDrawSurface points={points} onCommit={handleCommit} />
        </Map>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Draw the planned patrol track on the map.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          disabled={points.length === 0}
          onClick={handleClear}
          data-testid="planned-track-clear"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Clear
        </Button>
      </div>
    </div>
  );
}
