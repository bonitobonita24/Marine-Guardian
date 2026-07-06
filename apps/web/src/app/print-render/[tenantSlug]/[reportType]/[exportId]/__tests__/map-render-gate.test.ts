// map-render-gate.test.ts
//
// Unit tests for the pure `flipRenderReady` coordinator that backs the
// shared MapRenderGate (see components/map-render-gate.tsx). The pure
// arithmetic lives in components/render-ready-signal.ts — deliberately
// free of any leaflet/react-leaflet import — because leaflet touches
// `window` unconditionally at module load, which throws under this
// project's node-environment Vitest config (see page-2-heatmaps.test.tsx's
// note on the same gotcha). Importing from render-ready-signal.ts directly
// (rather than map-render-gate.tsx, which pulls in react-leaflet) lets this
// test run without mocking react-leaflet.
//
// Coverage:
//   - single-map case: __renderPending undefined -> direct flip of
//     __renderReady.
//   - multi-map case: __renderPending is a number -> decrements exactly
//     once per call, only flipping __renderReady once the counter reaches 0
//     (mirrors the 5-map counter set by report-map-report.tsx).
//   - the counter is never decremented below what a single call performs
//     (exactly-once-per-call contract — the calling MapRenderGate guards
//     re-entrancy with its own flippedRef, but this test locks the pure
//     function's own arithmetic).

import { describe, expect, it } from "vitest";
import { flipRenderReady } from "../components/render-ready-signal";

describe("flipRenderReady", () => {
  it("direct-flips __renderReady when __renderPending is undefined (single-map document)", () => {
    const target: { __renderPending?: number; __renderReady?: boolean } = {};
    flipRenderReady(target);
    expect(target.__renderReady).toBe(true);
    expect(target.__renderPending).toBeUndefined();
  });

  it("decrements __renderPending by exactly 1 per call without flipping __renderReady while > 0", () => {
    const target: { __renderPending?: number; __renderReady?: boolean } = {
      __renderPending: 5,
    };
    flipRenderReady(target);
    expect(target.__renderPending).toBe(4);
    expect(target.__renderReady).toBeUndefined();
  });

  it("flips __renderReady only once the counter reaches 0 across 5 sequential calls (5-map document)", () => {
    const target: { __renderPending?: number; __renderReady?: boolean } = {
      __renderPending: 5,
    };
    for (let i = 0; i < 4; i++) {
      flipRenderReady(target);
      expect(target.__renderReady).toBeUndefined();
    }
    flipRenderReady(target);
    expect(target.__renderPending).toBe(0);
    expect(target.__renderReady).toBe(true);
  });

  it("flips __renderReady when the counter is already at 0 or below (defensive)", () => {
    const target: { __renderPending?: number; __renderReady?: boolean } = {
      __renderPending: 0,
    };
    flipRenderReady(target);
    expect(target.__renderPending).toBe(-1);
    expect(target.__renderReady).toBe(true);
  });
});
