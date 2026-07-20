"use client";

/**
 * Shared render-ready gate for all Report Map print client islands
 * (EventPointsMap, PatrolTracksMap, AreaCoverageMap, PerAreaHeatmapMap).
 *
 * BUG THIS FIXES: previously each map island had two separate children —
 * `MapReadySignal` (flipped `window.__renderReady` after Leaflet's initial
 * "load" event) and `AutoFitBounds` (called `map.invalidateSize()` then
 * `fitBounds`/`setView`). Because `AutoFitBounds` ran in ITS OWN effect,
 * React does not guarantee ordering between sibling effects relative to
 * which "load" event `MapReadySignal` was listening for — in practice the
 * initial "load" (fired for the too-narrow pre-resize container) could
 * satisfy `MapReadySignal` BEFORE `invalidateSize` + `fitBounds` triggered
 * the new tile batch for the right-edge of the resized container. Puppeteer
 * then captured the PDF before those right-edge tiles painted, showing a
 * flat `#dbeafe` (the MapContainer background) band down the right side.
 *
 * FIX: this single component sequences all three steps deterministically
 * inside ONE effect:
 *   1. `map.invalidateSize({ animate: false })` — re-measure the FULL,
 *      final laid-out container width (print/SSR mounts the container
 *      before it reaches its final width).
 *   2. `applyFraming(map)` — the map-specific fitBounds/setView call,
 *      guaranteed to run AFTER invalidateSize so it frames against the
 *      true full width. Values are the caller's responsibility; this gate
 *      only sequences them.
 *   3. Gate `window.__renderReady` on the TileLayer's OWN "load" event
 *      fired AFTER step 2 (via `tileLayer.isLoading()` + a fresh `once`
 *      listener) — never a stale pre-resize/pre-fit "load". If no tiles
 *      are pending right after framing (already cached, or no tile layer
 *      ref yet), flips immediately since there's nothing to wait for.
 *   4. Repaint every registered heat layer (`repaintHeatLayers`) against the
 *      final framed view, then flip only after the browser has PAINTED that
 *      work (`afterPaintedFrames`). Added 2026-07-20 for the intermittent
 *      torn-heatmap bug: the gate previously waited on tile load alone and
 *      knew nothing about the heat canvas, so Puppeteer could capture a
 *      half-rastered heat layer (black/white streaks across the lower band
 *      of the map). Full root cause in heat-paint-registry.ts.
 *   5. 8s hard timeout backstop — always flips ready even if a tile never
 *      loads, so one flaky tile can never hang the whole render.
 *
 * `window.__renderReady` is flipped EXACTLY ONCE per mount (guarded by a
 * ref). When `window.__renderPending` is a number (multi-map documents —
 * see report-map-report.tsx's `__renderPending = 5`), this decrements that
 * counter exactly once instead of setting `__renderReady` directly, only
 * flipping it once the counter reaches 0. Single-map documents leave
 * `__renderPending` undefined, so the direct-flip fallback preserves
 * backward compatibility.
 */

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, TileLayer as LeafletTileLayer } from "leaflet";
import { useMap } from "react-leaflet";
import { afterPaintedFrames, repaintHeatLayers } from "./heat-paint-registry";
import { flipRenderReady } from "./render-ready-signal";

export { flipRenderReady } from "./render-ready-signal";

export interface MapRenderGateProps {
  /** Whether this map has any overlay (points/tracks/polygons/heat) worth
   *  waiting on tile paint for. When false, flips ready right after the
   *  paint flush without waiting for the TileLayer's "load" event —
   *  matches the previous fast empty-state path. */
  hasAnyOverlay: boolean;
  /** Map-specific fitBounds/setView call. Runs AFTER invalidateSize. Values
   *  are the caller's responsibility — this gate only sequences them. */
  applyFraming: (map: LeafletMap) => void;
  /** Ref to the underlying Leaflet TileLayer instance (react-leaflet
   *  forwards it via `<TileLayer ref={...} />`). May be null on the very
   *  first tick before the ref callback runs — treated the same as "no
   *  pending tiles" (nothing to wait for). */
  tileLayerRef: React.RefObject<LeafletTileLayer | null>;
}

export function MapRenderGate({
  hasAnyOverlay,
  applyFraming,
  tileLayerRef,
}: MapRenderGateProps) {
  const map = useMap();
  const flippedRef = useRef(false);

  useEffect(() => {
    if (flippedRef.current) return;

    function flip() {
      if (flippedRef.current) return;
      flippedRef.current = true;
      flipRenderReady();
    }

    function paintFlush() {
      // Force every heat layer mounted on THIS map to redraw against the
      // final, post-invalidateSize/post-framing view. leaflet.heat only
      // redraws on the map's "moveend", and `invalidateSize` skips firing
      // "moveend" when the re-measured centre offset rounds to (0,0) — so a
      // sub-pixel size change could leave the heat canvas drawn for a stale
      // view, or freshly reallocated (blank) by a canvas.width reassignment.
      // No-ops (returns 0) on the non-heat islands that share this gate.
      repaintHeatLayers(map);
      // Then wait for the browser to actually PAINT that work before
      // reporting ready. `afterPaintedFrames` queues its task from inside a
      // rAF callback, which is serviced after that frame's paint — unlike
      // the previous double-rAF, which fires before the paint it was meant
      // to be waiting on and let Puppeteer capture a half-rastered canvas.
      afterPaintedFrames(flip);
    }

    // Safety net: 8s hard timeout (matches Puppeteer's waitForFunction
    // timeout) — a tile that never loads can never hang the whole render.
    const timeoutId = window.setTimeout(paintFlush, 8000);

    // 1. Re-measure the FULL laid-out container width first — print/SSR
    //    mounts the container before it reaches its final width, so
    //    Leaflet otherwise measures too-narrow and never requests the
    //    right-edge tiles.
    map.invalidateSize({ animate: false });
    // 2. Apply framing AFTER the resize, so fitBounds/setView compute
    //    against the true full width (not the narrower pre-resize one).
    applyFraming(map);

    if (!hasAnyOverlay) {
      // Nothing to wait for — flip after the paint flush.
      paintFlush();
    } else {
      const tileLayer = tileLayerRef.current;
      if (tileLayer && tileLayer.isLoading()) {
        // invalidateSize + framing above triggered a NEW batch of tile
        // requests (e.g. the right-edge tiles) — wait for THIS "load",
        // never a stale one from the pre-resize/pre-fit initial mount.
        tileLayer.once("load", paintFlush);
      } else {
        // No tile layer ref yet, or every visible tile is already loaded
        // (no pending request from the resize/fit above) — nothing left
        // to wait for.
        paintFlush();
      }
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [map, tileLayerRef, hasAnyOverlay, applyFraming]);

  return null;
}
