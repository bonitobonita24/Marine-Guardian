/**
 * Regression guard for the "report map shows Africa" defect (2026-07-20).
 *
 * Four events in the dev DB carry location_lat = 0 AND location_lon = 0 —
 * "Null Island", ~1,300 km off West Africa. When a report's date range included
 * them, `pointsBounds` stretched the box from (0,0) to the real Philippine
 * cluster near (13.6, 121.26) and the printed map rendered the Indian Ocean
 * with the actual events pushed off the edge. Confirmed visually in a generated
 * PDF at the all-municipalities 2026-01-01..2026-07-20 scope.
 *
 * `pointsBounds` now filters bounds-unsafe coordinates first. These tests pin
 * that behaviour, including the "no valid points" fallback path.
 *
 * `pointsBounds` is a pure function, but it is exported from the Leaflet client
 * island, and importing that module evaluates `leaflet`, which touches
 * `window` at load time. jsdom is required purely to satisfy that import — the
 * assertions below are plain arithmetic and never render a map.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { pointsBounds } from "../components/event-points-map";
import { boundsToView } from "../components/bounds-view";

// The real (0,0) rows from the dev DB.
const NULL_ISLAND = { lat: 0, lon: 0 };
// A representative real cluster from the same report scope.
const REAL_CLUSTER = [
  { lat: 13.6, lon: 121.26 },
  { lat: 13.52, lon: 121.18 },
  { lat: 13.44, lon: 121.31 },
];

describe("pointsBounds — Null Island exclusion", () => {
  it("produces the SAME box whether or not (0,0) points are present", () => {
    const clean = pointsBounds(REAL_CLUSTER);
    const polluted = pointsBounds([
      NULL_ISLAND,
      ...REAL_CLUSTER,
      NULL_ISLAND,
      NULL_ISLAND,
      NULL_ISLAND,
    ]);

    expect(clean).not.toBeNull();
    expect(polluted).toEqual(clean);
  });

  it("keeps the box tight to the Philippine cluster, nowhere near (0,0)", () => {
    const bounds = pointsBounds([NULL_ISLAND, ...REAL_CLUSTER]);

    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    // Before the fix, south/west collapsed to ~0 and the span was ~13 degrees.
    expect(bounds.south).toBeGreaterThan(13);
    expect(bounds.west).toBeGreaterThan(120);
    expect(bounds.north - bounds.south).toBeLessThan(1);
    expect(bounds.east - bounds.west).toBeLessThan(1);
  });

  it("frames at a usable zoom instead of the whole-hemisphere zoom", () => {
    const polluted = pointsBounds([NULL_ISLAND, ...REAL_CLUSTER]);
    expect(polluted).not.toBeNull();
    if (polluted === null) return;

    const { zoom } = boundsToView(polluted, 655, 235, { paddingPx: 47 });
    // A (0,0)-to-Mindoro box fits only at the minZoom floor (3). A tight
    // municipal cluster must frame far closer in.
    expect(zoom).toBeGreaterThan(8);
  });

  it("excludes null/undefined coordinates from the box", () => {
    // Loosely-typed rows can reach this helper with missing coordinates.
    const points = [
      ...REAL_CLUSTER,
      { lat: null, lon: 121.2 },
      { lat: 13.5, lon: undefined },
    ] as unknown as { lat: number; lon: number }[];

    expect(pointsBounds(points)).toEqual(pointsBounds(REAL_CLUSTER));
  });

  it("leaves an all-valid point set unaffected", () => {
    const bounds = pointsBounds(REAL_CLUSTER);

    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    // Padding is 18% of span (min 0.02), applied around the raw extent.
    const latPad = Math.max((13.6 - 13.44) * 0.18, 0.02);
    const lonPad = Math.max((121.31 - 121.18) * 0.18, 0.02);
    expect(bounds.south).toBeCloseTo(13.44 - latPad, 10);
    expect(bounds.north).toBeCloseTo(13.6 + latPad, 10);
    expect(bounds.west).toBeCloseTo(121.18 - lonPad, 10);
    expect(bounds.east).toBeCloseTo(121.31 + lonPad, 10);
  });

  it("returns null when EVERY point is invalid, so the caller falls back", () => {
    // All-(0,0) input must not yield a box centred on Null Island — it must
    // yield null, which sends the island to municipalityBounds and then to the
    // default whole-region view.
    expect(pointsBounds([NULL_ISLAND, NULL_ISLAND, NULL_ISLAND])).toBeNull();
    expect(
      pointsBounds([{ lat: Number.NaN, lon: Number.NaN }]),
    ).toBeNull();
  });

  it("returns null for an empty point set (unchanged behaviour)", () => {
    expect(pointsBounds([])).toBeNull();
  });

  it("never emits NaN in a returned box", () => {
    const bounds = pointsBounds([
      NULL_ISLAND,
      { lat: Number.NaN, lon: Number.NaN },
      ...REAL_CLUSTER,
    ]);

    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    for (const v of [bounds.south, bounds.west, bounds.north, bounds.east]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
