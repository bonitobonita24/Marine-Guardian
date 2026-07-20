// patrol-tracks-framing.test.ts
//
// Unit tests for computeTracksFraming — the "frame to the DATA, not just the
// scope polygon" fix.
//
// CONTEXT: the track clip was deliberately removed (owner decision — whole
// patrol tracks are drawn, not the portion inside the scope), so tracks
// routinely extend past the scope polygon. On a ZONE-scoped report the two
// can be entirely disjoint (Apo Reef spans lon 120.396–120.562 while Sablayan
// spans 120.622–121.399), and framing on the scope box alone left the tracks
// running off all four edges of the rendered map.

import { describe, expect, it } from "vitest";
import { computeTracksFraming } from "../components/patrol-tracks-framing";
import { boundsToView } from "../components/bounds-view";

const WIDTH_PX = 560;
const HEIGHT_PX = 360;

/** The confirmed real zone bounds from the PM's repro. */
const APO_REEF_BOUNDS = {
  south: 12.63,
  west: 120.396,
  north: 12.78,
  east: 120.562,
};

/** Sablayan municipality — disjoint in longitude from Apo Reef. */
const SABLAYAN_TRACK: Array<[number, number]> = [
  [12.83, 120.622],
  [12.86, 121.1],
  [12.9, 121.399],
];

describe("computeTracksFraming", () => {
  describe("scope with tracks extending beyond it (the reported defect)", () => {
    it("frames the union of the scope box and the track extent", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );

      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;

      // The union spans lat 12.63→12.9 and lon 120.396→121.399 — the scope's
      // south/west corner and the track's north/east corner.
      const expected = boundsToView(
        { south: 12.63, west: 120.396, north: 12.9, east: 121.399 },
        WIDTH_PX,
        HEIGHT_PX,
        { paddingPx: 16 },
      );
      expect(plan.center[0]).toBeCloseTo(expected.center[0], 6);
      expect(plan.center[1]).toBeCloseTo(expected.center[1], 6);
      expect(plan.zoom).toBe(expected.zoom);
    });

    it("zooms out relative to the scope-only frame, so the tracks fit", () => {
      const unionPlan = computeTracksFraming(
        SABLAYAN_TRACK,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const scopeOnlyPlan = computeTracksFraming(
        [],
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );

      expect(unionPlan.kind).toBe("setView");
      expect(scopeOnlyPlan.kind).toBe("setView");
      if (unionPlan.kind !== "setView" || scopeOnlyPlan.kind !== "setView") {
        return;
      }
      // The defect was framing at the tighter scope-only zoom while tracks
      // continued past the edge.
      expect(unionPlan.zoom).toBeLessThan(scopeOnlyPlan.zoom);
    });

    it("keeps the scope polygon inside the frame (union contains both)", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;

      // Centre must sit between the scope box and the track extent — proof
      // the camera did not simply jump to the tracks and abandon the scope.
      const [lat, lon] = plan.center;
      expect(lat).toBeGreaterThan(APO_REEF_BOUNDS.south);
      expect(lat).toBeLessThan(12.9);
      expect(lon).toBeGreaterThan(APO_REEF_BOUNDS.west);
      expect(lon).toBeLessThan(121.399);
    });

    it("ignores Null-Island / non-finite vertices when growing the union", () => {
      const withGarbage: Array<[number, number]> = [
        ...SABLAYAN_TRACK,
        [0, 0],
        [Number.NaN, 120.7],
      ];
      const clean = computeTracksFraming(
        SABLAYAN_TRACK,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const dirty = computeTracksFraming(
        withGarbage,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(dirty).toEqual(clean);
    });
  });

  describe("scope with no tracks (must not regress)", () => {
    it("frames the plain scope box with the historical padding", () => {
      const plan = computeTracksFraming([], APO_REEF_BOUNDS, WIDTH_PX, HEIGHT_PX);
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;

      // Byte-identical to the pre-fix behaviour: boundsToView's default
      // paddingPx (8) over the scope bounds alone.
      const expected = boundsToView(APO_REEF_BOUNDS, WIDTH_PX, HEIGHT_PX);
      expect(plan.center).toEqual(expected.center);
      expect(plan.zoom).toBe(expected.zoom);
    });

    it("frames the plain scope box when every track vertex is unusable", () => {
      const plan = computeTracksFraming(
        [
          [0, 0],
          [Number.POSITIVE_INFINITY, 120.5],
        ],
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const expected = boundsToView(APO_REEF_BOUNDS, WIDTH_PX, HEIGHT_PX);
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
      });
    });

    it("does not change the frame when the tracks sit inside the scope box", () => {
      // The municipality+children case browser QA confirmed already frames
      // correctly — its scope bounds span the union already, so the union
      // must be a no-op and the padding must stay at the historical value.
      const insideTrack: Array<[number, number]> = [
        [12.7, 120.45],
        [12.72, 120.5],
      ];
      const plan = computeTracksFraming(
        insideTrack,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const expected = boundsToView(APO_REEF_BOUNDS, WIDTH_PX, HEIGHT_PX);
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
      });
    });
  });

  describe("no scope", () => {
    it("returns a fitBounds plan over the usable track vertices", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan).toEqual({
        kind: "fitBounds",
        bounds: SABLAYAN_TRACK,
        paddingPx: 16,
      });
    });

    it("treats undefined scope the same as null", () => {
      expect(
        computeTracksFraming(SABLAYAN_TRACK, undefined, WIDTH_PX, HEIGHT_PX),
      ).toEqual(
        computeTracksFraming(SABLAYAN_TRACK, null, WIDTH_PX, HEIGHT_PX),
      );
    });

    it("drops Null-Island vertices before fitting", () => {
      const plan = computeTracksFraming(
        [[0, 0], ...SABLAYAN_TRACK],
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan).toEqual({
        kind: "fitBounds",
        bounds: SABLAYAN_TRACK,
        paddingPx: 16,
      });
    });

    it("leaves the initial view alone when there are no tracks at all", () => {
      expect(computeTracksFraming([], null, WIDTH_PX, HEIGHT_PX)).toEqual({
        kind: "none",
      });
    });

    it("leaves the initial view alone with a single usable vertex", () => {
      expect(
        computeTracksFraming([[12.83, 120.622]], null, WIDTH_PX, HEIGHT_PX),
      ).toEqual({ kind: "none" });
    });
  });

  describe("degenerate single-point cases", () => {
    it("still produces a finite, clamped view for a single point plus scope", () => {
      const plan = computeTracksFraming(
        [[13.5, 121.9]],
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;
      expect(Number.isFinite(plan.center[0])).toBe(true);
      expect(Number.isFinite(plan.center[1])).toBe(true);
      expect(Number.isFinite(plan.zoom)).toBe(true);
      // Union grew north-east to the lone point, so the centre moved off the
      // scope centre.
      expect(plan.center[0]).toBeCloseTo((APO_REEF_BOUNDS.south + 13.5) / 2, 6);
      expect(plan.center[1]).toBeCloseTo((APO_REEF_BOUNDS.west + 121.9) / 2, 6);
    });

    it("produces a finite clamped view for a zero-span scope with no tracks", () => {
      const plan = computeTracksFraming(
        [],
        { south: 12.7, west: 120.5, north: 12.7, east: 120.5 },
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;
      expect(plan.center).toEqual([12.7, 120.5]);
      // boundsToView clamps the degenerate span to its maxZoom rather than
      // returning Infinity.
      expect(Number.isFinite(plan.zoom)).toBe(true);
      expect(plan.zoom).toBe(15);
    });

    it("produces a finite clamped view for a single point and no scope sibling span", () => {
      // Two identical vertices → a zero-span fitBounds box. Leaflet handles
      // this itself; we only assert we hand it the points rather than
      // bailing out, since 2 usable vertices exist.
      const plan = computeTracksFraming(
        [
          [12.7, 120.5],
          [12.7, 120.5],
        ],
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan).toEqual({
        kind: "fitBounds",
        bounds: [
          [12.7, 120.5],
          [12.7, 120.5],
        ],
        paddingPx: 16,
      });
    });
  });
});
