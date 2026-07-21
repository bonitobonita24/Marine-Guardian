// find-nearest-boundary.test.ts
// Unit tests for findNearestBoundary + haversineKm + pointToSegmentDistanceKm.
// Covers v2 spec L531-L561 step 2: geographic nearest-boundary fallback,
// edge-distance semantics, threshold check, malformed-geometry tolerance.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  findNearestBoundary,
  haversineKm,
  pointToSegmentDistanceKm,
  DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM,
} from "../find-nearest-boundary";
import type { AreaBoundaryForDerivation } from "../types";

function makeBoundary(
  overrides: Partial<AreaBoundaryForDerivation> = {},
): AreaBoundaryForDerivation {
  return {
    id: "boundary-1",
    name: "Test Boundary",
    aliases: [],
    isEnabled: true,
    geometryType: "Polygon",
    geometryGeojson: {
      type: "Polygon",
      coordinates: [
        [
          [120.0, 12.0],
          [120.1, 12.0],
          [120.1, 12.1],
          [120.0, 12.1],
          [120.0, 12.0],
        ],
      ],
    },
    ...overrides,
  };
}

describe("haversineKm", () => {
  it("computes Manila to Cebu distance within 1%", () => {
    // Manila: 14.5995° N, 120.9842° E
    // Cebu City: 10.3157° N, 123.8854° E
    // Expected great-circle distance: ~568 km
    const manila = { lat: 14.5995, lon: 120.9842 };
    const cebu = { lat: 10.3157, lon: 123.8854 };
    const d = haversineKm(manila, cebu);
    expect(d).toBeGreaterThan(562);
    expect(d).toBeLessThan(574);
  });

  it("returns zero for identical points", () => {
    const p = { lat: 14.0, lon: 120.0 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it("is symmetric (a→b == b→a)", () => {
    const a = { lat: 14.0, lon: 120.0 };
    const b = { lat: 15.0, lon: 121.0 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe("pointToSegmentDistanceKm", () => {
  it("returns zero when point lies on the segment endpoint", () => {
    const p = { lat: 12.0, lon: 120.0 };
    const s = { lat: 12.0, lon: 120.0 };
    const e = { lat: 12.0, lon: 120.1 };
    expect(pointToSegmentDistanceKm(p, s, e)).toBeCloseTo(0, 3);
  });

  it("returns perpendicular distance when foot of perpendicular is on segment", () => {
    // Segment along the equator from (0,120) to (0,121).
    // Point at (0.01, 120.5) — directly above midpoint.
    // Perpendicular distance ≈ 0.01 deg lat ≈ 1.111 km
    const p = { lat: 0.01, lon: 120.5 };
    const s = { lat: 0.0, lon: 120.0 };
    const e = { lat: 0.0, lon: 121.0 };
    const d = pointToSegmentDistanceKm(p, s, e);
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.2);
  });

  it("clamps to start endpoint when foot is past segment start", () => {
    // Segment (0,120) → (0,121). Point at (0, 119.5) is before the segment start.
    // Distance should be from point to start, not perpendicular distance.
    const p = { lat: 0.0, lon: 119.5 };
    const s = { lat: 0.0, lon: 120.0 };
    const e = { lat: 0.0, lon: 121.0 };
    const d = pointToSegmentDistanceKm(p, s, e);
    const dToStart = haversineKm(p, s);
    expect(d).toBeCloseTo(dToStart, 2);
  });

  it("clamps to end endpoint when foot is past segment end", () => {
    const p = { lat: 0.0, lon: 121.5 };
    const s = { lat: 0.0, lon: 120.0 };
    const e = { lat: 0.0, lon: 121.0 };
    const d = pointToSegmentDistanceKm(p, s, e);
    const dToEnd = haversineKm(p, e);
    expect(d).toBeCloseTo(dToEnd, 2);
  });

  it("handles degenerate segment (start == end) as point distance", () => {
    const p = { lat: 0.0, lon: 120.5 };
    const s = { lat: 0.0, lon: 120.0 };
    const e = { lat: 0.0, lon: 120.0 };
    const d = pointToSegmentDistanceKm(p, s, e);
    expect(d).toBeCloseTo(haversineKm(p, s), 3);
  });
});

describe("findNearestBoundary", () => {
  it("returns nearest boundary when point is within threshold", () => {
    // Boundary is a small polygon around (12.0-12.1, 120.0-120.1).
    // Point is at (12.05, 120.105) — about 0.005 deg ≈ 0.55 km from east edge.
    const b = makeBoundary();
    const point = { lat: 12.05, lon: 120.105 };
    expect(findNearestBoundary(point, [b])).toBe(b);
  });

  it("returns null when point is outside threshold", () => {
    // Point is roughly 100 km away from the boundary.
    const b = makeBoundary();
    const point = { lat: 13.0, lon: 121.0 };
    expect(findNearestBoundary(point, [b])).toBe(null);
  });

  it("returns boundary when point is exactly on edge (distance 0)", () => {
    const b = makeBoundary();
    // Point on the south edge of the polygon.
    const point = { lat: 12.0, lon: 120.05 };
    expect(findNearestBoundary(point, [b])).toBe(b);
  });

  it("returns boundary for point JUST inside threshold (4.9 km)", () => {
    // Build a polygon with one edge along the equator from (0, 120) → (0, 120.5).
    // Point at (0.044, 120.25) is ≈ 4.89 km north of the edge.
    // (0.044 deg lat ≈ 4.89 km)
    const b = makeBoundary({
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.0, 0.0],
            [120.5, 0.0],
            [120.5, -0.5],
            [120.0, -0.5],
            [120.0, 0.0],
          ],
        ],
      },
    });
    const point = { lat: 0.044, lon: 120.25 };
    expect(findNearestBoundary(point, [b])).toBe(b);
  });

  it("returns null for point JUST outside threshold (5.1 km)", () => {
    const b = makeBoundary({
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.0, 0.0],
            [120.5, 0.0],
            [120.5, -0.5],
            [120.0, -0.5],
            [120.0, 0.0],
          ],
        ],
      },
    });
    // 0.046 deg ≈ 5.12 km north of edge.
    const point = { lat: 0.046, lon: 120.25 };
    expect(findNearestBoundary(point, [b])).toBe(null);
  });

  it("treats interior point as nearest-edge distance (not zero)", () => {
    // Point inside the polygon. Edge-distance semantics: nearest edge ≈ some km > 0.
    // We're not testing whether interior counts as 0 — we're testing edge-distance.
    // A polygon spanning 0.1 deg (~11 km) on each side has interior points up to ~5.5 km from any edge.
    // Centre point should be ~5.5 km from each edge → outside 5 km threshold → null.
    const b = makeBoundary({
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.0, 12.0],
            [120.1, 12.0],
            [120.1, 12.1],
            [120.0, 12.1],
            [120.0, 12.0],
          ],
        ],
      },
    });
    // Dead center: equidistant from all 4 edges.
    const point = { lat: 12.05, lon: 120.05 };
    // 0.05 deg ≈ 5.56 km from each edge — just OUTSIDE default 5 km threshold.
    expect(findNearestBoundary(point, [b])).toBe(null);

    // Now widen threshold to 10 km — should match.
    expect(findNearestBoundary(point, [b], 10)).toBe(b);
  });

  it("respects custom threshold parameter", () => {
    const b = makeBoundary();
    // Point ~6 km away from boundary
    const point = { lat: 12.05, lon: 120.155 };
    expect(findNearestBoundary(point, [b])).toBe(null);
    expect(findNearestBoundary(point, [b], 10)).toBe(b);
  });

  it("handles LineString geometry", () => {
    const b = makeBoundary({
      geometryType: "LineString",
      geometryGeojson: {
        type: "LineString",
        coordinates: [
          [120.0, 12.0],
          [120.1, 12.0],
          [120.1, 12.1],
        ],
      },
    });
    // Point ~0.5 km from first segment.
    const point = { lat: 12.0045, lon: 120.05 };
    expect(findNearestBoundary(point, [b])).toBe(b);
  });

  it("returns nearest among multiple boundaries (not first)", () => {
    const closer = makeBoundary({
      id: "closer",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.0, 12.0],
            [120.01, 12.0],
            [120.01, 12.01],
            [120.0, 12.01],
            [120.0, 12.0],
          ],
        ],
      },
    });
    const farther = makeBoundary({
      id: "farther",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.03, 12.0],
            [120.04, 12.0],
            [120.04, 12.01],
            [120.03, 12.01],
            [120.03, 12.0],
          ],
        ],
      },
    });
    // Point just east of the closer polygon's east edge.
    const point = { lat: 12.005, lon: 120.012 };
    // farther is listed FIRST to ensure we don't just pick first.
    const result = findNearestBoundary(point, [farther, closer]);
    expect(result).toBe(closer);
  });

  it("skips disabled boundary even if it is nearest", () => {
    const disabled = makeBoundary({
      id: "disabled",
      isEnabled: false,
    });
    const enabled = makeBoundary({
      id: "enabled",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.001, 12.001],
            [120.002, 12.001],
            [120.002, 12.002],
            [120.001, 12.002],
            [120.001, 12.001],
          ],
        ],
      },
    });
    // Point inside the disabled boundary — would match it if enabled.
    const point = { lat: 12.05, lon: 120.05 };
    const result = findNearestBoundary(point, [disabled, enabled], 100);
    expect(result).toBe(enabled);
  });

  it("skips malformed geometryGeojson without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = makeBoundary({
      id: "bad",
      geometryGeojson: { type: "Polygon" }, // missing coordinates
    });
    const good = makeBoundary({ id: "good" });
    const point = { lat: 12.05, lon: 120.105 };
    expect(() => findNearestBoundary(point, [bad, good])).not.toThrow();
    expect(findNearestBoundary(point, [bad, good])).toBe(good);
    warnSpy.mockRestore();
  });

  it("warns about a given malformed boundary only ONCE per process, not on every call", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Unique id so this assertion is independent of any prior test that may
    // have already warned about a shared id (the suppression set is
    // module-level / process-lifetime by design).
    const bad = makeBoundary({
      id: "malformed-once-regression",
      geometryGeojson: { type: "Polygon" }, // missing coordinates
    });
    const good = makeBoundary({ id: "good-once" });
    const point = { lat: 12.05, lon: 120.105 };

    findNearestBoundary(point, [bad, good]);
    findNearestBoundary(point, [bad, good]);
    findNearestBoundary(point, [bad, good]);

    const warnsForThisBoundary = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("malformed-once-regression"),
    );
    expect(warnsForThisBoundary).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it("skips geometry with wrong type field without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = makeBoundary({
      id: "bad",
      geometryGeojson: { type: "MultiPolygon", coordinates: [] },
    });
    const good = makeBoundary({ id: "good" });
    const point = { lat: 12.05, lon: 120.105 };
    expect(findNearestBoundary(point, [bad, good])).toBe(good);
    warnSpy.mockRestore();
  });

  it("returns null for invalid lat (out of range)", () => {
    const b = makeBoundary();
    expect(findNearestBoundary({ lat: 95.0, lon: 120.0 }, [b])).toBe(null);
    expect(findNearestBoundary({ lat: -95.0, lon: 120.0 }, [b])).toBe(null);
  });

  it("returns null for invalid lon (out of range)", () => {
    const b = makeBoundary();
    expect(findNearestBoundary({ lat: 12.0, lon: 185.0 }, [b])).toBe(null);
    expect(findNearestBoundary({ lat: 12.0, lon: -185.0 }, [b])).toBe(null);
  });

  it("returns null for NaN lat or lon", () => {
    const b = makeBoundary();
    expect(findNearestBoundary({ lat: NaN, lon: 120.0 }, [b])).toBe(null);
    expect(findNearestBoundary({ lat: 12.0, lon: NaN }, [b])).toBe(null);
  });

  it("returns null for empty boundaries list", () => {
    expect(findNearestBoundary({ lat: 12.0, lon: 120.0 }, [])).toBe(null);
  });

  it("default threshold is 5 km", () => {
    expect(DEFAULT_NEAREST_BOUNDARY_THRESHOLD_KM).toBe(5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
