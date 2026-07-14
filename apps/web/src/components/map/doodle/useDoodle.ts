"use client";

import { useCallback, useState } from "react";

/** A single freehand stroke, stored in GEO coordinates ([lng, lat] pairs) so
 *  it stays pinned to the map on pan/zoom. Screen-pixel projection happens
 *  only at draw time (see DoodleOverlay). */
export type DoodleStroke = {
  points: [number, number][];
  color: string;
  thickness: number;
};

const DEFAULT_COLOR = "#ef4444"; // red-500 — visible on both light/dark basemaps
const DEFAULT_THICKNESS = 5;

/**
 * Local controller state for the Doodle map-annotation feature. Deliberately
 * NOT persisted anywhere but this hook's own React state — the only
 * persistence path is the explicit Save button (trpc.doodle.create), wired
 * by the caller (DoodleToolbar). Kept self-contained so it never leaks into
 * InteractiveMap's own (already large) state surface.
 */
export function useDoodle() {
  const [active, setActive] = useState(false);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [thickness, setThickness] = useState(DEFAULT_THICKNESS);
  const [strokes, setStrokes] = useState<DoodleStroke[]>([]);

  const toggleActive = useCallback(() => {
    setActive((prev) => !prev);
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
  }, []);

  const reset = useCallback(() => {
    setStrokes([]);
    setActive(false);
  }, []);

  return {
    active,
    setActive,
    toggleActive,
    color,
    setColor,
    thickness,
    setThickness,
    strokes,
    setStrokes,
    undo,
    clear,
    reset,
  };
}

export type DoodleController = ReturnType<typeof useDoodle>;
