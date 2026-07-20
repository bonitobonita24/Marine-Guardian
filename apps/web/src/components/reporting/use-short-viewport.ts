"use client";

/**
 * Is the viewport too short to stack two chart overlay panels?
 *
 * Reads the SAME `(max-height: 799px)` threshold the compact chart CSS variants
 * use (SHORT_VIEWPORT_MEDIA_QUERY), so the runtime "one panel at a time" rule in
 * MapChartOverlayPanels and the CSS shrink in compact-chart-density.ts can never
 * disagree about what "short" means. See compact-chart-density.ts for the
 * measured height budget that makes two panels impossible below 800px.
 *
 * useSyncExternalStore (rather than useState + useEffect) is deliberate: it
 * gives React an explicit server snapshot, so the server renders the TALL
 * behaviour and the client corrects on hydration without a mismatch warning.
 */

import { useSyncExternalStore } from "react";
import { SHORT_VIEWPORT_MEDIA_QUERY } from "./compact-chart-density";

/** matchMedia is absent under SSR and under bare jsdom — treat both as "tall". */
function mediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  if (typeof window.matchMedia !== "function") return null;
  return window.matchMedia(SHORT_VIEWPORT_MEDIA_QUERY);
}

function subscribe(onStoreChange: () => void): () => void {
  const mql = mediaQueryList();
  if (mql === null) return () => undefined;
  mql.addEventListener("change", onStoreChange);
  return () => {
    mql.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(): boolean {
  return mediaQueryList()?.matches ?? false;
}

/** Server always renders the tall (multi-panel) variant. */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsShortViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
