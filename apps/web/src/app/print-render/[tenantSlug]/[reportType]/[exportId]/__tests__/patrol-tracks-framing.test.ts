// patrol-tracks-framing.test.ts
//
// Unit tests for computeTracksFraming — "frame to the DATA, not just the scope
// polygon", AND the containment guarantee that fix depended on.
//
// CONTEXT: the track clip was deliberately removed (owner decision — whole
// patrol tracks are drawn, not the portion inside the scope), so tracks
// routinely extend past the scope polygon. On a ZONE-scoped report the two can
// be entirely disjoint (Apo Reef spans lon 120.396–120.562 while Sablayan
// spans 120.622–121.399).
//
// The union fix alone was NOT enough: the union was computed correctly but
// then converted into a zoom that did not fit the real map box (assumed 360px
// tall, actually 235px, plus a rounded-UP zoom), so tracks still ran off the
// bottom edge in a real browser render. The `containment` block below is the
// regression guard: it asserts against the INVERSE projection that every
// vertex lands strictly inside the fitted viewport with margin, rather than
// re-asserting the formula that produced the view.

import { describe, expect, it } from "vitest";
import {
  computeContainedView,
  computeTracksFraming,
  viewportBoundsForView,
  DATA_UNION_PADDING_PX,
  SCOPE_ONLY_PADDING_PX,
} from "../components/patrol-tracks-framing";

/** The REAL rendered box: `.patrol-tracks-block { height: 235px }` in
 *  report-map-report.tsx, full-width in an A4 `.report-section`. */
const WIDTH_PX = 640;
const HEIGHT_PX = 235;

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

/** Web-Mercator Y, duplicated here so the assertions do not lean on the
 *  module's own private projection helper. */
function mercatorY(latDeg: number): number {
  return (
    Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360)) / (2 * Math.PI)
  );
}

/**
 * Assert every point sits strictly inside the viewport the plan produces,
 * with at least `minMarginPx` of slack on all four edges.
 */
function expectAllPointsInsideWithMargin(
  plan: ReturnType<typeof computeTracksFraming>,
  points: ReadonlyArray<[number, number]>,
  widthPx: number,
  heightPx: number,
  minMarginPx: number,
): void {
  expect(plan.kind).toBe("setView");
  if (plan.kind !== "setView") return;

  const view = viewportBoundsForView(plan.center, plan.zoom, widthPx, heightPx);
  // Convert the required pixel margin into degrees at this zoom, per axis.
  const lonMarginDeg = ((view.east - view.west) * minMarginPx) / widthPx;
  const latMarginDeg = ((view.north - view.south) * minMarginPx) / heightPx;

  for (const [lat, lon] of points) {
    expect(lon).toBeGreaterThan(view.west + lonMarginDeg);
    expect(lon).toBeLessThan(view.east - lonMarginDeg);
    expect(lat).toBeGreaterThan(view.south + latMarginDeg);
    expect(lat).toBeLessThan(view.north - latMarginDeg);
  }
}

describe("computeTracksFraming", () => {
  describe("containment — every rendered vertex is inside the fitted viewport", () => {
    it("contains both the scope box and the tracks running outside it", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expectAllPointsInsideWithMargin(
        plan,
        [
          ...SABLAYAN_TRACK,
          [APO_REEF_BOUNDS.south, APO_REEF_BOUNDS.west],
          [APO_REEF_BOUNDS.north, APO_REEF_BOUNDS.east],
        ],
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
    });

    it("contains a WIDE-ASPECT track bundle in a SHORT map box (the reported defect)", () => {
      // Sablayan + children + traversing, 2026-01-01..2026-07-17: the western
      // fan-out to Apo Reef makes the bundle ~1° wide and ~0.6° tall, drawn
      // into a 640×235 box. Under the old code this fitted to an assumed
      // 360px-tall box and then ROUNDED the zoom UP — two whole zoom levels
      // too tight — and the bundle ran off the bottom edge.
      const scope = { south: 12.62, west: 120.62, north: 13.1, east: 121.4 };
      const bundle: Array<[number, number]> = [
        [12.5, 120.396], // Apo Reef, far south-west
        [12.55, 120.44],
        [12.72, 120.7],
        [12.95, 121.0],
        [13.08, 121.35],
        [12.52, 121.2], // southern leg — the edge that was clipping
      ];
      const plan = computeTracksFraming(bundle, scope, WIDTH_PX, HEIGHT_PX);
      expectAllPointsInsideWithMargin(
        plan,
        [...bundle, [scope.south, scope.west], [scope.north, scope.east]],
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
    });

    it("contains the scope box on the scope-only path", () => {
      const plan = computeTracksFraming(
        [],
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expectAllPointsInsideWithMargin(
        plan,
        [
          [APO_REEF_BOUNDS.south, APO_REEF_BOUNDS.west],
          [APO_REEF_BOUNDS.north, APO_REEF_BOUNDS.east],
        ],
        WIDTH_PX,
        HEIGHT_PX,
        SCOPE_ONLY_PADDING_PX,
      );
    });

    it("contains the track extent on the no-scope path", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expectAllPointsInsideWithMargin(
        plan,
        SABLAYAN_TRACK,
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
    });

    it("stays contained across a range of box aspect ratios", () => {
      const scope = { south: 12.4, west: 120.3, north: 13.2, east: 121.5 };
      const bundle: Array<[number, number]> = [
        [12.42, 120.32],
        [13.18, 121.48],
        [12.6, 121.4],
      ];
      for (const [w, h] of [
        [640, 235],
        [640, 120],
        [320, 480],
        [1000, 200],
      ] as const) {
        const plan = computeTracksFraming(bundle, scope, w, h);
        expectAllPointsInsideWithMargin(
          plan,
          bundle,
          w,
          h,
          DATA_UNION_PADDING_PX,
        );
      }
    });
  });

  describe("regression — the box height must match the rendered CSS box", () => {
    it("the OLD framing (round + 360px-tall box) does not contain the bundle; the new one does", () => {
      // Reproduces the exact defect. `oldStyleZoom` is the pre-fix
      // computation: fit to an assumed 560×360 box and Math.round the zoom.
      // Rendered into the REAL 640×235 box, that view clips the bundle —
      // which is what the browser repro measured as 176 track pixels on the
      // bottom edge.
      const scope = { south: 12.62, west: 120.62, north: 13.1, east: 121.4 };
      const bundle: Array<[number, number]> = [
        [12.5, 120.396],
        [13.08, 121.35],
        [12.52, 121.2],
      ];
      const union = { south: 12.5, west: 120.396, north: 13.1, east: 121.4 };

      const oldW = 560 - 2 * DATA_UNION_PADDING_PX;
      const oldH = 360 - 2 * DATA_UNION_PADDING_PX;
      const lonFraction = (union.east - union.west) / 360;
      const latFraction = mercatorY(union.north) - mercatorY(union.south);
      const oldStyleZoom = Math.round(
        Math.min(
          Math.log2(oldW / (256 * lonFraction)),
          Math.log2(oldH / (256 * latFraction)),
        ),
      );
      const oldCenter: [number, number] = [
        (union.south + union.north) / 2,
        (union.west + union.east) / 2,
      ];
      const oldViewport = viewportBoundsForView(
        oldCenter,
        oldStyleZoom,
        WIDTH_PX,
        HEIGHT_PX,
      );
      // The southern leg falls OUTSIDE the old viewport — off the bottom.
      expect(oldViewport.south).toBeGreaterThan(12.5);

      // The fixed framing contains all of it.
      const plan = computeTracksFraming(bundle, scope, WIDTH_PX, HEIGHT_PX);
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;
      expect(plan.zoom).toBeLessThan(oldStyleZoom);
      expectAllPointsInsideWithMargin(
        plan,
        bundle,
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
    });

    it("never rounds the zoom UP past a fit (floor, not round)", () => {
      // A span engineered so the exact fit lands just above an integer: a
      // rounding implementation would return the next zoom up and clip.
      const bounds = { south: 12.0, west: 120.0, north: 12.0001, east: 120.9 };
      const view = computeContainedView(bounds, 640, 235, 16);
      const vp = viewportBoundsForView(view.center, view.zoom, 640, 235);
      expect(vp.west).toBeLessThan(bounds.west);
      expect(vp.east).toBeGreaterThan(bounds.east);
      expect(vp.south).toBeLessThan(bounds.south);
      expect(vp.north).toBeGreaterThan(bounds.north);
    });

    it("centres in mercator space, not on the arithmetic mean of latitudes", () => {
      // Over a tall span the two differ; the mercator centre is the one
      // Leaflet actually pans to, so the frame is symmetric in PIXELS.
      const bounds = { south: 5, west: 120, north: 45, east: 121 };
      const view = computeContainedView(bounds, 640, 235, 0);
      expect(view.center[0]).not.toBeCloseTo(25, 3);
      const vp = viewportBoundsForView(view.center, view.zoom, 640, 235);
      // Equal slack north and south, measured in projected space.
      expect(mercatorY(bounds.south) - mercatorY(vp.south)).toBeCloseTo(
        mercatorY(vp.north) - mercatorY(bounds.north),
        9,
      );
    });
  });

  describe("scope with tracks extending beyond it", () => {
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
      const expected = computeContainedView(
        { south: 12.63, west: 120.396, north: 12.9, east: 121.399 },
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
      expect(plan.center[0]).toBeCloseTo(expected.center[0], 9);
      expect(plan.center[1]).toBeCloseTo(expected.center[1], 9);
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

  describe("scope with no tracks", () => {
    it("frames the plain scope box with the scope-only padding", () => {
      const plan = computeTracksFraming(
        [],
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const expected = computeContainedView(
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
        SCOPE_ONLY_PADDING_PX,
      );
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
      });
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
      const expected = computeContainedView(
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
        SCOPE_ONLY_PADDING_PX,
      );
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
      });
    });

    it("does not grow the frame when the tracks sit inside the scope box", () => {
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
      const expected = computeContainedView(
        APO_REEF_BOUNDS,
        WIDTH_PX,
        HEIGHT_PX,
        SCOPE_ONLY_PADDING_PX,
      );
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
      });
    });
  });

  describe("no scope", () => {
    it("frames the usable track vertices with a contained setView", () => {
      const plan = computeTracksFraming(
        SABLAYAN_TRACK,
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      const expected = computeContainedView(
        { south: 12.83, west: 120.622, north: 12.9, east: 121.399 },
        WIDTH_PX,
        HEIGHT_PX,
        DATA_UNION_PADDING_PX,
      );
      expect(plan).toEqual({
        kind: "setView",
        center: expected.center,
        zoom: expected.zoom,
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
      expect(
        computeTracksFraming(
          [[0, 0], ...SABLAYAN_TRACK],
          null,
          WIDTH_PX,
          HEIGHT_PX,
        ),
      ).toEqual(
        computeTracksFraming(SABLAYAN_TRACK, null, WIDTH_PX, HEIGHT_PX),
      );
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
      expect(plan.center[0]).toBeCloseTo(12.7, 9);
      expect(plan.center[1]).toBeCloseTo(120.5, 9);
      // Clamped to maxZoom rather than returning Infinity.
      expect(plan.zoom).toBe(15);
    });

    it("produces a finite clamped view for two identical vertices and no scope", () => {
      const plan = computeTracksFraming(
        [
          [12.7, 120.5],
          [12.7, 120.5],
        ],
        null,
        WIDTH_PX,
        HEIGHT_PX,
      );
      expect(plan.kind).toBe("setView");
      if (plan.kind !== "setView") return;
      expect(plan.zoom).toBe(15);
      expect(Number.isFinite(plan.center[0])).toBe(true);
    });
  });
});
