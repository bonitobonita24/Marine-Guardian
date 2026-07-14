"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMap } from "@/components/ui/map";
import type { DoodleStroke } from "./useDoodle";

type DoodleOverlayProps = {
  /** Draw mode on/off. When false the canvas is fully click-through and the
   *  map's own dragPan stays enabled (normal map interaction). */
  active: boolean;
  color: string;
  thickness: number;
  strokes: DoodleStroke[];
  onStrokesChange: (strokes: DoodleStroke[]) => void;
};

/**
 * Full-size canvas overlaid on the shared MapLibre map (a child of <Map>, so
 * it shares the map's relatively-positioned container — see ui/map.tsx). All
 * strokes are stored in GEO coordinates ([lng, lat]) and re-projected to
 * screen pixels on every redraw, so drawings stay pinned to the map on pan
 * and zoom exactly like any other map layer.
 *
 * Sits BELOW the floating MapControls / DoodleToolbar (both z-20) — z-10 —
 * and ABOVE the map's own canvas/markers, matching InteractiveMap's existing
 * floating-overlay z-layer convention.
 */
export function DoodleOverlay({
  active,
  color,
  thickness,
  strokes,
  onStrokesChange,
}: DoodleOverlayProps) {
  const { map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<[number, number][] | null>(null);

  // Latest-value refs so the imperative map event listeners (bound once)
  // always see current props/state without having to rebind on every render.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const colorRef = useRef(color);
  colorRef.current = color;
  const thicknessRef = useRef(thickness);
  thicknessRef.current = thickness;
  const onStrokesChangeRef = useRef(onStrokesChange);
  onStrokesChangeRef.current = onStrokesChange;

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
    (liveStroke?: [number, number][]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !map) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const drawPolyline = (
        points: [number, number][],
        strokeColor: string,
        strokeThickness: number,
      ) => {
        if (points.length < 2) return;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeThickness;
        ctx.beginPath();
        points.forEach(([lng, lat], i) => {
          const { x, y } = map.project([lng, lat]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };

      for (const s of strokesRef.current) {
        drawPolyline(s.points, s.color, s.thickness);
      }
      if (liveStroke) {
        drawPolyline(liveStroke, colorRef.current, thicknessRef.current);
      }
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

  // Redraw on every map move/render so strokes stay pinned during pan/zoom.
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

  // Redraw whenever the committed strokes change (undo/clear/new stroke).
  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  // Toggle map dragPan based on active state — drawing must not also pan.
  useEffect(() => {
    if (!map) return;
    if (active) map.dragPan.disable();
    else map.dragPan.enable();
    return () => {
      map.dragPan.enable();
    };
  }, [map, active]);

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
      if (!active) return;
      const lngLat = getLngLat(e);
      if (!lngLat) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = [lngLat];
      redraw(drawingRef.current);
    },
    [active, getLngLat, redraw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!active || !drawingRef.current) return;
      const lngLat = getLngLat(e);
      if (!lngLat) return;
      drawingRef.current.push(lngLat);
      redraw(drawingRef.current);
    },
    [active, getLngLat, redraw],
  );

  const commitStroke = useCallback(() => {
    const points = drawingRef.current;
    drawingRef.current = null;
    if (!points || points.length < 2) {
      redraw();
      return;
    }
    onStrokesChangeRef.current([
      ...strokesRef.current,
      { points, color: colorRef.current, thickness: thicknessRef.current },
    ]);
  }, [redraw]);

  const handlePointerUp = useCallback(() => {
    commitStroke();
  }, [commitStroke]);

  const handlePointerLeave = useCallback(() => {
    commitStroke();
  }, [commitStroke]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: active ? "auto" : "none", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    />
  );
}
