/**
 * Heat-layer paint registry + a post-paint scheduling primitive.
 *
 * WHY THIS EXISTS — the torn-heatmap bug (intermittent, ~1 render in 3):
 * a generated PDF's heatmap came out with its lower band replaced by
 * black/white horizontal streaks. That signature is a canvas whose backing
 * store had been (re)allocated but whose new pixels had not been rastered /
 * composited when Puppeteer captured the page.
 *
 * The old `MapRenderGate` gated `window.__renderReady` on the *TileLayer's*
 * "load" event only. Nothing in the gate knew a heat layer existed. That is
 * survivable most of the time because `L.HeatLayer._reset` (bound to the
 * map's "moveend") redraws SYNCHRONOUSLY, so the framing `setView()` the gate
 * performs usually leaves the heat canvas already drawn. Two things break it:
 *
 *   1. `_reset` reassigns `canvas.width` / `canvas.height` whenever the map
 *      size changed. That reallocates (and blanks) the backing store, and the
 *      compositor must re-raster the whole layer — work that is asynchronous
 *      to JS and NOT guaranteed complete when a `requestAnimationFrame`
 *      callback runs.
 *   2. `map.invalidateSize()` early-returns without firing "moveend" when the
 *      re-measured centre offset rounds to (0,0), so a size change of a pixel
 *      or two can leave the heat canvas never re-reset for that view.
 *
 *   ...and the gate's own "paint flush" was `rAF(rAF(flip))`. A `rAF` callback
 *   runs BEFORE the paint of the frame it belongs to, so double-rAF is a
 *   heuristic that happens to be right most of the time, not a guarantee.
 *
 * WHAT THIS MODULE PROVIDES:
 *   - a per-map registry so each mounted `HeatLayer` publishes an explicit
 *     repaint handle, letting the gate force every heat layer to redraw
 *     against the FINAL post-framing view before it reports ready;
 *   - `afterPaintedFrames`, which schedules a task from inside a `rAF`
 *     callback. A task queued from a `rAF` callback is serviced AFTER the
 *     browser has painted that frame, which is the closest thing the platform
 *     exposes to "this frame is on screen".
 *
 * Deliberately free of any leaflet / react-leaflet import: `leaflet` touches
 * `window` unconditionally at module load and throws under this project's
 * node-environment Vitest config (same gotcha documented in
 * render-ready-signal.ts and page-2-heatmaps.test.tsx). Keeping the logic
 * pure here lets it be unit tested directly.
 */

/** Minimal structural view of `L.HeatLayer` — just the repaint entry point. */
export interface HeatRepaintable {
  redraw: () => unknown;
}

/** Injectable scheduler so `afterPaintedFrames` is testable without a DOM. */
export interface PaintScheduler {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  setTimeout: (handler: () => void, timeout: number) => number;
}

/**
 * map instance -> its mounted heat layers. A WeakMap so a torn-down print
 * page's Leaflet map (and its layers) stay collectable; the registry never
 * keeps a document alive.
 */
const heatLayersByMap = new WeakMap<object, Set<HeatRepaintable>>();

/** Called by `HeatLayer` right after `layer.addTo(map)`. */
export function registerHeatLayer(map: object, layer: HeatRepaintable): void {
  let layers = heatLayersByMap.get(map);
  if (layers === undefined) {
    layers = new Set<HeatRepaintable>();
    heatLayersByMap.set(map, layers);
  }
  layers.add(layer);
}

/** Called by `HeatLayer`'s effect cleanup, before `map.removeLayer(layer)`. */
export function unregisterHeatLayer(map: object, layer: HeatRepaintable): void {
  const layers = heatLayersByMap.get(map);
  if (layers === undefined) return;
  layers.delete(layer);
  if (layers.size === 0) heatLayersByMap.delete(map);
}

/** How many heat layers are currently mounted on `map` (test/diagnostic aid). */
export function heatLayerCount(map: object): number {
  return heatLayersByMap.get(map)?.size ?? 0;
}

/**
 * Force every heat layer mounted on `map` to repaint, and report how many were
 * asked. `L.HeatLayer.redraw()` schedules its draw on a `requestAnimationFrame`
 * it queues immediately — so any `rAF` the caller queues afterwards is
 * guaranteed (FIFO callback ordering) to run after that draw has executed.
 *
 * Safe to call when nothing is registered (returns 0) — non-heat map islands
 * share the same gate.
 */
export function repaintHeatLayers(map: object): number {
  const layers = heatLayersByMap.get(map);
  if (layers === undefined) return 0;
  for (const layer of layers) {
    layer.redraw();
  }
  return layers.size;
}

/**
 * Invoke `callback` after the browser has painted `frames` successive frames.
 *
 * The primitive is `rAF(() => setTimeout(..., 0))`: the `rAF` callback runs
 * just before the frame's paint, and a task queued from within it is serviced
 * after that paint has happened. One iteration therefore means "the frame
 * containing the work I just did has been painted".
 *
 * Default `frames = 2`. The FIRST iteration is the load-bearing one — it is
 * what actually proves the heat draw reached the screen. The SECOND is an
 * acknowledged heuristic: when `L.HeatLayer._reset` reassigns `canvas.width`
 * the compositor may raster the reallocated layer over more than one frame,
 * and the platform exposes no signal for "this layer finished rastering". One
 * extra painted frame costs ~16ms against an 8s budget and is the cheapest
 * available hedge; it is a hedge, not a proof.
 */
export function afterPaintedFrames(
  callback: () => void,
  frames = 2,
  scheduler: PaintScheduler = window,
): void {
  let remaining = Math.max(1, Math.floor(frames));

  function step(): void {
    scheduler.requestAnimationFrame(() => {
      scheduler.setTimeout(() => {
        remaining -= 1;
        if (remaining <= 0) callback();
        else step();
      }, 0);
    });
  }

  step();
}
