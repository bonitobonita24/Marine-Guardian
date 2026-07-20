// event-map-print-framing.test.ts
//
// Guards the print-framing geometry of the two event map islands
// (event-points-map.tsx, event-heatmap-map.tsx).
//
// BACKGROUND — the defect these tests lock down:
// Both islands frame their view with `boundsToView(bounds, W, H)` (NOT
// `fitBounds`). Their W/H constants were written for the report's original
// LANDSCAPE layout (1010x360) and were never updated when the owner pinned the
// Report Map PDF to A4 PORTRAIT on 2026-07-12. Claiming a box ~1.5x taller than
// the real one made boundsToView pick a zoom a full level too tight, which is
// why markers/heat blobs sat hard against the crop edge.
//
// The fix corrects the constants to the real box (655x235) and adds an explicit
// ~1-inch print-scale inset, clamped so a short box cannot degenerate.

// Importing the island modules pulls in leaflet (+ leaflet.css), which touches
// `window` at module scope — so this suite needs a DOM even though every
// assertion below is pure geometry.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { boundsToView } from "../components/bounds-view";
import {
  EVENT_MAP_HEIGHT_PX,
  EVENT_MAP_WIDTH_PX,
  framingInsetPx,
  pointsBounds,
} from "../components/event-points-map";
import { framingInsetPx as heatmapFramingInsetPx } from "../components/event-heatmap-map";

// The pre-fix constants, kept only so the zoom-out assertion below compares
// against real historical behaviour rather than a hand-waved number.
const STALE_WIDTH_PX = 1010;
const STALE_HEIGHT_PX = 360;
const STALE_PADDING_PX = 8; // boundsToView's default

/** A representative multi-point municipal cluster (Abra de Ilog water area). */
const CLUSTER_BOUNDS = {
  south: 13.142,
  west: 120.443,
  north: 13.637,
  east: 121.027,
};

describe("event map print box constants", () => {
  it("matches the real A4-portrait .cat-map box, not the stale landscape box", () => {
    // 210mm paper - 24mm @page margin = 186mm = 703px @96dpi;
    // minus .report-section's 2x24px padding = 655px. Height = .cat-map 235px.
    expect(EVENT_MAP_WIDTH_PX).toBe(655);
    expect(EVENT_MAP_HEIGHT_PX).toBe(235);
    expect(EVENT_MAP_HEIGHT_PX).toBeLessThan(STALE_HEIGHT_PX);
  });
});

describe("framingInsetPx", () => {
  it("is 47px for the real box — the largest inset a 235px-tall box can carry", () => {
    // 96px (1 inch @96dpi) is unreachable here: it would leave 235-192=43px of
    // usable height. Clamped to 20% of the smaller dimension: floor(235*0.2)=47.
    expect(framingInsetPx(EVENT_MAP_WIDTH_PX, EVENT_MAP_HEIGHT_PX)).toBe(47);
  });

  it("reaches the full 1-inch (96px) target when the box is large enough", () => {
    // 20% of 600 = 120 > 96, so the 1-inch target binds instead of the clamp.
    expect(framingInsetPx(2000, 600)).toBe(96);
  });

  it("never lets the inset consume more than 20% of the smaller dimension", () => {
    for (const [w, h] of [
      [655, 235],
      [655, 100],
      [200, 2000],
      [50, 50],
      [2000, 600],
    ] as const) {
      const inset = framingInsetPx(w, h);
      expect(inset).toBeLessThanOrEqual(Math.min(w, h) * 0.2);
      expect(inset).toBeGreaterThanOrEqual(0);
    }
  });

  it("always leaves at least 60% of the box usable on both axes (degeneracy guard)", () => {
    for (const [w, h] of [
      [655, 235],
      [655, 100],
      [50, 50],
      [2000, 600],
    ] as const) {
      const inset = framingInsetPx(w, h);
      expect(w - 2 * inset).toBeGreaterThanOrEqual(0.6 * w);
      expect(h - 2 * inset).toBeGreaterThanOrEqual(0.6 * h);
    }
  });

  it("is identical in both islands — a category page stacks them and any mismatch reads as a bug", () => {
    for (const [w, h] of [
      [655, 235],
      [2000, 600],
      [655, 100],
    ] as const) {
      expect(heatmapFramingInsetPx(w, h)).toBe(framingInsetPx(w, h));
    }
  });
});

describe("framing zoom outcome", () => {
  const inset = framingInsetPx(EVENT_MAP_WIDTH_PX, EVENT_MAP_HEIGHT_PX);

  it("zooms OUT relative to the stale-constant behaviour for a real cluster", () => {
    const before = boundsToView(
      CLUSTER_BOUNDS,
      STALE_WIDTH_PX,
      STALE_HEIGHT_PX,
      { paddingPx: STALE_PADDING_PX },
    );
    const after = boundsToView(
      CLUSTER_BOUNDS,
      EVENT_MAP_WIDTH_PX,
      EVENT_MAP_HEIGHT_PX,
      { paddingPx: inset },
    );
    // Lower zoom == more visible area == markers inset from the crop.
    expect(after.zoom).toBeLessThan(before.zoom);
    // Centre must not drift — only the zoom changes.
    expect(after.center).toEqual(before.center);
  });

  it("keeps the cluster comfortably inside the box (data spans <=60% of the box)", () => {
    const { zoom } = boundsToView(
      CLUSTER_BOUNDS,
      EVENT_MAP_WIDTH_PX,
      EVENT_MAP_HEIGHT_PX,
      { paddingPx: inset },
    );
    // Web-Mercator: world is 256*2^z px wide at zoom z.
    const worldPx = 256 * 2 ** zoom;
    const spanPx =
      ((CLUSTER_BOUNDS.east - CLUSTER_BOUNDS.west) / 360) * worldPx;
    expect(spanPx).toBeLessThanOrEqual(EVENT_MAP_WIDTH_PX * 0.6);
  });
});

describe("degenerate point sets", () => {
  it("returns null bounds for an EMPTY point set (island falls back to its default view)", () => {
    expect(pointsBounds([])).toBeNull();
  });

  it("frames a SINGLE point at a sane neighbourhood zoom, not the min/max clamp", () => {
    const bounds = pointsBounds([{ lat: 13.4, lon: 120.7 }]);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;

    // pointsBounds applies a 0.02deg minimum pad, so a lone point still spans a
    // real box rather than a zero-area degenerate one.
    expect(bounds.north - bounds.south).toBeCloseTo(0.04, 6);
    expect(bounds.east - bounds.west).toBeCloseTo(0.04, 6);

    const { center, zoom } = boundsToView(
      bounds,
      EVENT_MAP_WIDTH_PX,
      EVENT_MAP_HEIGHT_PX,
      { paddingPx: framingInsetPx(EVENT_MAP_WIDTH_PX, EVENT_MAP_HEIGHT_PX) },
    );

    expect(center[0]).toBeCloseTo(13.4, 6);
    expect(center[1]).toBeCloseTo(120.7, 6);
    // The point must stay legible: strictly inside boundsToView's 3..15 clamp.
    // If the inset ever degenerates the view this drops toward the floor.
    expect(zoom).toBeGreaterThan(9);
    expect(zoom).toBeLessThan(15);
  });

  it("frames two near-identical points without collapsing the view", () => {
    const bounds = pointsBounds([
      { lat: 13.4, lon: 120.7 },
      { lat: 13.4001, lon: 120.7001 },
    ]);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;

    const { zoom } = boundsToView(
      bounds,
      EVENT_MAP_WIDTH_PX,
      EVENT_MAP_HEIGHT_PX,
      { paddingPx: framingInsetPx(EVENT_MAP_WIDTH_PX, EVENT_MAP_HEIGHT_PX) },
    );
    expect(Number.isFinite(zoom)).toBe(true);
    expect(zoom).toBeGreaterThan(9);
    expect(zoom).toBeLessThan(15);
  });
});
