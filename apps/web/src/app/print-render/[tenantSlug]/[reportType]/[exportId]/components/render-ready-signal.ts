/**
 * Pure render-ready coordination logic, deliberately kept free of any
 * leaflet/react-leaflet import.
 *
 * `leaflet` (and therefore `react-leaflet`) touches `window` unconditionally
 * at module load time, which throws under the project's node-environment
 * Vitest config (see page-2-heatmaps.test.tsx's note on the same gotcha).
 * Isolating the pure counter/flip arithmetic here — with zero Leaflet
 * imports — lets it be unit tested directly without mocking react-leaflet.
 *
 * Consumed by `./map-render-gate.tsx`, which re-exports `flipRenderReady`
 * for the Leaflet-aware `MapRenderGate` component.
 */

declare global {
  interface Window {
    __renderReady?: boolean;
    /** Multi-map coordination counter. Set by the RSC host before render;
     *  each MapRenderGate decrements it. __renderReady is flipped only when
     *  the counter reaches 0. Single-map documents leave this undefined —
     *  the direct-flip fallback preserves backward compatibility. */
    __renderPending?: number;
  }
}

/**
 * Decrements the multi-map counter or direct-flips `__renderReady`. Accepts
 * an injectable target (defaults to the global `window`) so the
 * exactly-once / counter contract can be unit tested without a DOM.
 */
export function flipRenderReady(
  target: Pick<Window, "__renderPending" | "__renderReady"> = window,
): void {
  if (typeof target.__renderPending === "number") {
    target.__renderPending -= 1;
    if (target.__renderPending <= 0) target.__renderReady = true;
  } else {
    target.__renderReady = true;
  }
}
