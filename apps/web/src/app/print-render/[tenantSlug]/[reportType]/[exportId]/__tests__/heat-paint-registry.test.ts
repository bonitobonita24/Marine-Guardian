// heat-paint-registry.test.ts
//
// Unit tests for the pure heat-layer paint registry + post-paint scheduler
// that back the torn-heatmap fix (see components/heat-paint-registry.ts for
// the full root cause). Imported directly from heat-paint-registry.ts —
// which carries no leaflet/react-leaflet import — because leaflet touches
// `window` unconditionally at module load and throws under this project's
// node-environment Vitest config (same gotcha noted in map-render-gate.test.ts
// and page-2-heatmaps.test.tsx).
//
// ⚠ SCOPE OF WHAT THESE TESTS CAN PROVE: they lock the registry's bookkeeping
// and the scheduler's ORDERING contract. They cannot prove the PDF no longer
// tears — that is a compositor-timing property of real Chromium and is only
// demonstrable by repeated real renders. See the task report.

import { describe, expect, it, vi } from "vitest";
import {
  afterPaintedFrames,
  heatLayerCount,
  registerHeatLayer,
  repaintHeatLayers,
  unregisterHeatLayer,
  type PaintScheduler,
} from "../components/heat-paint-registry";

/** Minimal stand-in for an L.HeatLayer — only `redraw` is contracted. */
function fakeLayer() {
  return { redraw: vi.fn() };
}

describe("heat layer registry", () => {
  it("registers layers per map and reports the count", () => {
    const map = {};
    expect(heatLayerCount(map)).toBe(0);
    const a = fakeLayer();
    const b = fakeLayer();
    registerHeatLayer(map, a);
    registerHeatLayer(map, b);
    expect(heatLayerCount(map)).toBe(2);
  });

  it("keeps each map's layers isolated from every other map's", () => {
    const mapA = {};
    const mapB = {};
    const a = fakeLayer();
    const b = fakeLayer();
    registerHeatLayer(mapA, a);
    registerHeatLayer(mapB, b);

    repaintHeatLayers(mapA);
    expect(a.redraw).toHaveBeenCalledTimes(1);
    // A multi-map print document mounts several islands; one island's gate
    // must never repaint (or wait on) another island's heat layers.
    expect(b.redraw).not.toHaveBeenCalled();
  });

  it("is idempotent on re-registering the same layer instance", () => {
    const map = {};
    const a = fakeLayer();
    registerHeatLayer(map, a);
    registerHeatLayer(map, a);
    expect(heatLayerCount(map)).toBe(1);
    expect(repaintHeatLayers(map)).toBe(1);
    expect(a.redraw).toHaveBeenCalledTimes(1);
  });

  it("stops repainting a layer once it is unregistered (effect cleanup)", () => {
    const map = {};
    const a = fakeLayer();
    const b = fakeLayer();
    registerHeatLayer(map, a);
    registerHeatLayer(map, b);
    unregisterHeatLayer(map, a);
    expect(heatLayerCount(map)).toBe(1);

    repaintHeatLayers(map);
    expect(a.redraw).not.toHaveBeenCalled();
    expect(b.redraw).toHaveBeenCalledTimes(1);
  });

  it("repaintHeatLayers is a safe no-op for a map with no heat layers (non-heat islands share the gate)", () => {
    expect(repaintHeatLayers({})).toBe(0);
  });

  it("unregistering an unknown map or layer does not throw", () => {
    const map = {};
    expect(() => {
      unregisterHeatLayer(map, fakeLayer());
    }).not.toThrow();
    registerHeatLayer(map, fakeLayer());
    expect(() => {
      unregisterHeatLayer(map, fakeLayer());
    }).not.toThrow();
    expect(heatLayerCount(map)).toBe(1);
  });
});

/**
 * Controllable scheduler: rAF and setTimeout callbacks are queued, never run
 * automatically, so the test drives the exact interleaving.
 */
function makeScheduler() {
  const rafQueue: FrameRequestCallback[] = [];
  const taskQueue: (() => void)[] = [];
  const scheduler: PaintScheduler = {
    requestAnimationFrame: (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    setTimeout: (cb) => {
      taskQueue.push(cb);
      return taskQueue.length;
    },
  };
  /** Run every queued rAF ("just before this frame paints"). */
  function flushFrame(): void {
    const due = rafQueue.splice(0, rafQueue.length);
    for (const cb of due) cb(0);
  }
  /** Run every queued task ("after that frame has painted"). */
  function flushTasks(): void {
    const due = taskQueue.splice(0, taskQueue.length);
    for (const cb of due) cb();
  }
  return { scheduler, flushFrame, flushTasks, rafQueue, taskQueue };
}

describe("afterPaintedFrames", () => {
  it("does NOT fire inside the rAF callback — only after the frame's paint (task phase)", () => {
    const { scheduler, flushFrame, flushTasks } = makeScheduler();
    const done = vi.fn();
    afterPaintedFrames(done, 1, scheduler);

    flushFrame();
    // This is the whole point of the fix: the old gate flipped here, before
    // the frame it was waiting on had actually been painted.
    expect(done).not.toHaveBeenCalled();

    flushTasks();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("waits for TWO painted frames by default", () => {
    const { scheduler, flushFrame, flushTasks } = makeScheduler();
    const done = vi.fn();
    afterPaintedFrames(done, undefined, scheduler);

    flushFrame();
    flushTasks();
    expect(done).not.toHaveBeenCalled(); // one painted frame is not enough

    flushFrame();
    flushTasks();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("waits for N painted frames and fires exactly once", () => {
    const { scheduler, flushFrame, flushTasks } = makeScheduler();
    const done = vi.fn();
    afterPaintedFrames(done, 3, scheduler);

    for (let i = 0; i < 3; i++) {
      expect(done).not.toHaveBeenCalled();
      flushFrame();
      flushTasks();
    }
    expect(done).toHaveBeenCalledTimes(1);

    // Nothing further is scheduled once it has fired.
    flushFrame();
    flushTasks();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("clamps a zero/negative frame count to a single painted frame", () => {
    const { scheduler, flushFrame, flushTasks } = makeScheduler();
    const done = vi.fn();
    afterPaintedFrames(done, 0, scheduler);

    flushFrame();
    expect(done).not.toHaveBeenCalled();
    flushTasks();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("orders the heat redraw BEFORE the wait — a repaint queued first draws first", () => {
    // Locks the ordering the gate depends on: L.HeatLayer.redraw() queues its
    // own rAF immediately, so the rAF afterPaintedFrames queues afterwards
    // runs later in the same frame (FIFO), i.e. after the heat draw executed.
    const { scheduler, flushFrame, flushTasks } = makeScheduler();
    const order: string[] = [];
    const map = {};
    registerHeatLayer(map, {
      redraw: () => {
        scheduler.requestAnimationFrame(() => order.push("heat-draw"));
      },
    });

    repaintHeatLayers(map);
    afterPaintedFrames(() => order.push("flip"), 1, scheduler);

    flushFrame();
    flushTasks();
    expect(order).toEqual(["heat-draw", "flip"]);
  });
});
