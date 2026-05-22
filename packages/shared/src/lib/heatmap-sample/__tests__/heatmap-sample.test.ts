// heatmap-sample vitest suite — covers the two pure functions:
//   haversineDistanceMeters     (great-circle distance primitive)
//   sampleTrackPoints           (LineString → [lat, lon, weight] densifier)
//
// Fixtures use coordinates around 0°N (equator) to keep haversine arithmetic
// approximately equal to (lat × 111,200 m) in the simple cases. A handful of
// cases use Philippines-bbox coordinates (~13° N) to verify behavior in the
// production tenant zone where Marine-Guardian operates.

import { describe, expect, it } from "vitest";

import {
  haversineDistanceMeters,
  sampleTrackPoints,
} from "../sample-track-points";

// ─────────────────────────────────────────────────────────────────────
// haversineDistanceMeters — primitive geometric correctness
// ─────────────────────────────────────────────────────────────────────

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters([0, 0], [0, 0])).toBe(0);
    expect(haversineDistanceMeters([121.5, 13.4], [121.5, 13.4])).toBe(0);
  });

  it("matches known great-circle distance for 1° of latitude at equator (~111.2 km)", () => {
    // 1° latitude ≈ 111,195 m on WGS-84 mean sphere (radius 6,371,008.8 m).
    const d = haversineDistanceMeters([0, 0], [0, 1]);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("is symmetric: d(a, b) === d(b, a) within float epsilon", () => {
    const a: [number, number] = [121.0, 13.0];
    const b: [number, number] = [121.8, 13.9];
    const forward = haversineDistanceMeters(a, b);
    const reverse = haversineDistanceMeters(b, a);
    expect(Math.abs(forward - reverse)).toBeLessThan(1e-6);
  });
});

// ─────────────────────────────────────────────────────────────────────
// sampleTrackPoints — densification + edge cases
// ─────────────────────────────────────────────────────────────────────

describe("sampleTrackPoints — degenerate input", () => {
  it("returns [] for empty LineString", () => {
    expect(sampleTrackPoints([])).toEqual([]);
  });

  it("returns [] for single-vertex LineString", () => {
    expect(sampleTrackPoints([[0, 0]])).toEqual([]);
  });

  it("returns [start-flipped] for coincident two-vertex line (totalArc == 0)", () => {
    const result = sampleTrackPoints([
      [121.0, 13.0],
      [121.0, 13.0],
    ]);
    expect(result).toEqual([[13.0, 121.0, 1]]);
  });

  it("returns [start-flipped] for sub-interval line (totalArc < default 250m)", () => {
    // ~1m apart at the equator — vastly sub-interval.
    const result = sampleTrackPoints([
      [0, 0],
      [0.00001, 0.00001],
    ]);
    expect(result).toEqual([[0, 0, 1]]);
  });

  it("throws when intervalMeters <= 0", () => {
    expect(() =>
      sampleTrackPoints([[0, 0], [0, 1]], { intervalMeters: 0 }),
    ).toThrow(/intervalMeters/);
    expect(() =>
      sampleTrackPoints([[0, 0], [0, 1]], { intervalMeters: -5 }),
    ).toThrow(/intervalMeters/);
  });
});

describe("sampleTrackPoints — output convention", () => {
  it("emits [lat, lon, weight] tuples (NOT [lon, lat])", () => {
    // Input GeoJSON convention: [lon=121.5, lat=13.4]
    // Expected output Leaflet convention: [lat=13.4, lon=121.5, weight=1]
    const result = sampleTrackPoints(
      [
        [121.5, 13.4],
        [121.5, 13.5],
      ],
      { intervalMeters: 5000 },
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    const first = result[0];
    expect(first).toBeDefined();
    expect(first?.[0]).toBe(13.4);
    expect(first?.[1]).toBe(121.5);
    expect(first?.[2]).toBe(1);
  });

  it("emits start vertex at distance 0 as the first sample", () => {
    const result = sampleTrackPoints(
      [
        [0, 0],
        [0, 1],
      ],
      { intervalMeters: 50_000 },
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual([0, 0, 1]);
  });
});

describe("sampleTrackPoints — uniform straight line", () => {
  it("samples at exact intervals along a north-south meridian", () => {
    // 0.01° latitude ≈ 1,112 m. With interval 250m, expect ~5 samples
    // (at 0, 250, 500, 750, 1000) plus possibly one more close to 1112.
    const result = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.01],
      ],
      { intervalMeters: 250 },
    );
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThanOrEqual(6);
    // Lat monotonically increases across samples (south → north).
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1];
      const curr = result[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev !== undefined && curr !== undefined) {
        expect(curr[0]).toBeGreaterThanOrEqual(prev[0]);
        // Longitude stays constant along a meridian.
        expect(curr[1]).toBeCloseTo(prev[1], 6);
      }
    }
  });

  it("custom interval produces predictably more samples when smaller", () => {
    // Same 0.01° line; halving the interval roughly doubles sample count.
    const coarse = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.01],
      ],
      { intervalMeters: 250 },
    );
    const fine = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.01],
      ],
      { intervalMeters: 125 },
    );
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length * 2 - 1);
  });
});

describe("sampleTrackPoints — multi-segment polyline", () => {
  it("samples across segment boundaries seamlessly", () => {
    // L-shape: east 0.005° then north 0.005°. Total ~1,225m. interval 250m.
    const result = sampleTrackPoints(
      [
        [0, 0],
        [0.005, 0],
        [0.005, 0.005],
      ],
      { intervalMeters: 250 },
    );
    expect(result.length).toBeGreaterThanOrEqual(4);
    // First sample at origin.
    expect(result[0]).toEqual([0, 0, 1]);
    // Last sample at or before the corner-then-some.
    const last = result[result.length - 1];
    expect(last).toBeDefined();
    if (last !== undefined) {
      expect(last[0]).toBeGreaterThanOrEqual(0);
      expect(last[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it("skips degenerate intermediate segments (duplicate consecutive vertices)", () => {
    // Inject a 0-length segment in the middle — output must not crash and
    // must still produce a meaningful densification of the non-degenerate
    // portion.
    const result = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.005],
        [0, 0.005], // duplicate — 0-length segment
        [0, 0.01],
      ],
      { intervalMeters: 250 },
    );
    expect(result.length).toBeGreaterThan(0);
    // No NaN or Infinity in any output coordinate.
    for (const [lat, lon, w] of result) {
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lon)).toBe(true);
      expect(w).toBe(1);
    }
  });
});

describe("sampleTrackPoints — options", () => {
  it("default interval is 250 meters", () => {
    // 0.01° lat ≈ 1,112m. interval 250 → 5-6 samples. Compare against
    // explicit 250m option to confirm equivalence.
    const defaultRes = sampleTrackPoints([
      [0, 0],
      [0, 0.01],
    ]);
    const explicitRes = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.01],
      ],
      { intervalMeters: 250 },
    );
    expect(defaultRes).toEqual(explicitRes);
  });

  it("default weight is 1; custom weight propagates to every tuple", () => {
    const res = sampleTrackPoints(
      [
        [0, 0],
        [0, 0.01],
      ],
      { intervalMeters: 250, weight: 2.5 },
    );
    expect(res.length).toBeGreaterThan(0);
    for (const [, , w] of res) {
      expect(w).toBe(2.5);
    }
  });
});

describe("sampleTrackPoints — Philippines tenant zone sanity", () => {
  it("produces a valid sample set on a representative patrol track near Mindoro", () => {
    // 5 GPS points around Verde Island Passage (~13.4°N, 121.0°E), spanning
    // ~5km total. Validates the algorithm in the real production lat band.
    const track: ReadonlyArray<readonly [number, number]> = [
      [121.000, 13.400],
      [121.010, 13.402],
      [121.020, 13.405],
      [121.030, 13.408],
      [121.040, 13.410],
    ];
    const result = sampleTrackPoints(track, { intervalMeters: 250 });
    // Expect ~17-21 samples for a 5km track at 250m intervals.
    expect(result.length).toBeGreaterThanOrEqual(15);
    expect(result.length).toBeLessThanOrEqual(25);
    // First sample is the flipped start vertex.
    expect(result[0]).toEqual([13.4, 121.0, 1]);
    // All samples in the expected latitude band.
    for (const [lat, lon] of result) {
      expect(lat).toBeGreaterThan(13.3);
      expect(lat).toBeLessThan(13.5);
      expect(lon).toBeGreaterThan(120.9);
      expect(lon).toBeLessThan(121.1);
    }
  });
});
