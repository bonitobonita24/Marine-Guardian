// bounds-view.test.ts
//
// Unit tests for the pure boundsToView helper (R12) — the fix that replaces
// reliance on post-mount `fitBounds` (which needs a correctly-sized live
// container, confirmed unreliable in the Puppeteer print document — see
// bounds-view.ts's file header) with an initial-view computation derived
// purely from the municipality bounds + an assumed rendered pixel size.

import { describe, expect, it } from "vitest";
import { boundsToView } from "../components/bounds-view";

// Abra de Ilog municipality water bounds — the confirmed real value from the
// rendered flight data referenced in the PM's repro (R11/R12 regression).
const ABRA_DE_ILOG_BOUNDS = {
  south: 13.1418,
  west: 120.442,
  north: 13.636,
  east: 121.026,
};

describe("boundsToView", () => {
  it("centers on the bounds' midpoint", () => {
    const { center } = boundsToView(ABRA_DE_ILOG_BOUNDS, 1010, 360);
    expect(center[0]).toBeCloseTo((13.1418 + 13.636) / 2, 5);
    expect(center[1]).toBeCloseTo((120.442 + 121.026) / 2, 5);
  });

  it("computes zoom=10 for the Abra de Ilog box in a ~1010x360 full-width container", () => {
    // Exact formula result: min(zoomLon≈11.225, zoomLat≈9.895) → round → 10.
    const { zoom } = boundsToView(ABRA_DE_ILOG_BOUNDS, 1010, 360);
    expect(zoom).toBe(10);
    // The KEY regression assertion: this must be strictly greater than the
    // MapContainer default zoom (9) that the bug left the map stuck at.
    expect(zoom).toBeGreaterThan(9);
  });

  it("computes the same zoom for the narrower ~560x360 tracks-column container (height is the limiting dimension)", () => {
    const { zoom } = boundsToView(ABRA_DE_ILOG_BOUNDS, 560, 360);
    expect(zoom).toBe(10);
    expect(zoom).toBeGreaterThan(9);
  });

  it("clamps to maxZoom for a tiny/degenerate bounds box", () => {
    const tiny = { south: 13.0, west: 121.0, north: 13.0001, east: 121.0001 };
    const { zoom } = boundsToView(tiny, 1010, 360);
    expect(zoom).toBe(15);
  });

  it("clamps to minZoom for a huge bounds box (e.g. accidentally passed a whole-world span)", () => {
    const huge = { south: -85, west: -180, north: 85, east: 180 };
    const { zoom } = boundsToView(huge, 1010, 360);
    expect(zoom).toBe(3);
  });

  it("respects custom minZoom/maxZoom/paddingPx options", () => {
    const { zoom } = boundsToView(ABRA_DE_ILOG_BOUNDS, 1010, 360, {
      minZoom: 3,
      maxZoom: 8,
    });
    expect(zoom).toBe(8);
  });

  it("never throws on a zero-span (degenerate point) bounds", () => {
    const point = { south: 13.5, west: 120.9, north: 13.5, east: 120.9 };
    expect(() => boundsToView(point, 1010, 360)).not.toThrow();
    const { zoom, center } = boundsToView(point, 1010, 360);
    expect(Number.isFinite(zoom)).toBe(true);
    expect(center[0]).toBeCloseTo(13.5, 5);
    expect(center[1]).toBeCloseTo(120.9, 5);
  });
});
