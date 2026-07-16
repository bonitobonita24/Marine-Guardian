// clip-track-to-municipality.test.ts — patrol track × municipality (land ∪
// water) clipping. Written BEFORE the implementation (TDD) — run RED first,
// then implement clip-track-to-municipality.ts until GREEN.
//
// Fixture squares are small (≤ a few degrees) so lat/lon planar ratios stay
// close enough to great-circle ratios for toBeCloseTo(…, 1) tolerance.

import { describe, expect, it } from "vitest";

import { clipTrackToMunicipality } from "../clip-track-to-municipality";

// Unit square land polygon: (0,0)-(1,1).
const landSquare = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

// Adjacent unit square water polygon: (1,0)-(2,1) — shares the x=1 edge
// with landSquare, non-overlapping.
const waterSquareAdjacent = {
  type: "Polygon",
  coordinates: [
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 0],
    ],
  ],
};

// Far-away water polygon — used when a test needs a `waterGeojson` present
// but never touched by the track.
const waterSquareFar = {
  type: "Polygon",
  coordinates: [
    [
      [20, 20],
      [21, 20],
      [21, 21],
      [20, 21],
      [20, 20],
    ],
  ],
};

// Far-away land polygon — used to give MultiPolygon / "only water" tests a
// land polygon that the track never touches.
const landSquareFar = {
  type: "Polygon",
  coordinates: [
    [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ],
  ],
};

const secondLandSquare = {
  type: "Polygon",
  coordinates: [
    [
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 6],
      [5, 5],
    ],
  ],
};

function lineTrack(coords: Array<[number, number]>): unknown {
  return { type: "LineString", coordinates: coords };
}

describe("clipTrackToMunicipality", () => {
  it("track fully inside land: traverses=true, insideKm ≈ full length, hours ≈ totalHours", () => {
    const result = clipTrackToMunicipality(
      lineTrack([
        [0.2, 0.5],
        [0.8, 0.5],
      ]),
      { landGeojson: landSquare },
      4,
    );

    expect(result.traverses).toBe(true);
    expect(result.trackTotalKm).toBeGreaterThan(0);
    expect(result.insideKm / result.trackTotalKm).toBeCloseTo(1, 1);
    expect(result.insideHoursEst).toBeCloseTo(4, 0);
  });

  it("track fully outside land and water: all zeros, traverses=false", () => {
    const result = clipTrackToMunicipality(
      lineTrack([
        [5, 5],
        [6, 6],
      ]),
      { landGeojson: landSquare, waterGeojson: waterSquareFar },
      4,
    );

    expect(result.traverses).toBe(false);
    expect(result.insideKm).toBe(0);
    expect(result.insideHoursEst).toBe(0);
  });

  it("track crossing land into adjacent water: traverses=true, insideKm ≈ full (land ∪ water covers it)", () => {
    const result = clipTrackToMunicipality(
      lineTrack([
        [0.5, 0.5],
        [1.5, 0.5],
      ]),
      { landGeojson: landSquare, waterGeojson: waterSquareAdjacent },
      4,
    );

    expect(result.traverses).toBe(true);
    expect(result.insideKm / result.trackTotalKm).toBeCloseTo(1, 1);
  });

  it("track crossing from land into empty space (no water there): insideKm ≈ half", () => {
    // land (0,0)-(1,1); water present but FAR away — a gap sits between
    // x=1 and x=1.5 that belongs to neither polygon.
    const result = clipTrackToMunicipality(
      lineTrack([
        [0.5, 0.5],
        [1.5, 0.5],
      ]),
      { landGeojson: landSquare, waterGeojson: waterSquareFar },
      4,
    );

    expect(result.traverses).toBe(true);
    expect(result.insideKm / result.trackTotalKm).toBeCloseTo(0.5, 1);
  });

  it("track fully inside water only: traverses=true via water, insideKm ≈ full length", () => {
    const result = clipTrackToMunicipality(
      lineTrack([
        [1.2, 0.5],
        [1.8, 0.5],
      ]),
      { landGeojson: landSquareFar, waterGeojson: waterSquareAdjacent },
      4,
    );

    expect(result.traverses).toBe(true);
    expect(result.insideKm / result.trackTotalKm).toBeCloseTo(1, 1);
  });

  it("track with fewer than 2 points: all zeros, traverses=false", () => {
    const result = clipTrackToMunicipality(
      lineTrack([[0.5, 0.5]]),
      { landGeojson: landSquare },
      4,
    );

    expect(result).toEqual({
      traverses: false,
      insideKm: 0,
      trackTotalKm: 0,
      insideHoursEst: 0,
    });
  });

  it("handles a MultiPolygon land geometry (two disjoint squares)", () => {
    const multiPolygonLand = {
      type: "MultiPolygon",
      coordinates: [landSquare.coordinates, secondLandSquare.coordinates],
    };

    const result = clipTrackToMunicipality(
      lineTrack([
        [5.2, 5.5],
        [5.8, 5.5],
      ]),
      { landGeojson: multiPolygonLand },
      2,
    );

    expect(result.traverses).toBe(true);
    expect(result.insideKm / result.trackTotalKm).toBeCloseTo(1, 1);
    expect(result.insideHoursEst).toBeCloseTo(2, 0);
  });

  it("null/undefined totalHours yields insideHoursEst=0 without throwing", () => {
    const result = clipTrackToMunicipality(
      lineTrack([
        [0.2, 0.5],
        [0.8, 0.5],
      ]),
      { landGeojson: landSquare },
      null,
    );

    expect(result.traverses).toBe(true);
    expect(result.insideHoursEst).toBe(0);
  });

  describe("de-jitter guard (4th param cleanDistanceKm)", () => {
    it("scales inside distance by cleanDistanceKm using the raw clip fraction", () => {
      // Track crossing land into empty space (no water there): raw clip
      // fraction ≈ 0.5 (half the track is inside landSquare).
      const result = clipTrackToMunicipality(
        lineTrack([
          [0.5, 0.5],
          [1.5, 0.5],
        ]),
        { landGeojson: landSquare, waterGeojson: waterSquareFar },
        4,
        10,
      );

      expect(result.traverses).toBe(true);
      expect(result.insideKm).toBeCloseTo(5, 0);
      expect(result.trackTotalKm).toBe(10);
    });

    it("cleanDistanceKm = null excludes the patrol entirely", () => {
      const result = clipTrackToMunicipality(
        lineTrack([
          [0.2, 0.5],
          [0.8, 0.5],
        ]),
        { landGeojson: landSquare },
        4,
        null,
      );

      expect(result.traverses).toBe(false);
      expect(result.insideKm).toBe(0);
      expect(result.insideHoursEst).toBe(0);
    });

    it("cleanDistanceKm = 0 is treated as untrusted and excludes the patrol", () => {
      const result = clipTrackToMunicipality(
        lineTrack([
          [0.2, 0.5],
          [0.8, 0.5],
        ]),
        { landGeojson: landSquare },
        4,
        0,
      );

      expect(result.traverses).toBe(false);
      expect(result.insideKm).toBe(0);
      expect(result.insideHoursEst).toBe(0);
    });

    it("bounds insideKm by cleanDistanceKm even when the raw track is jitter-inflated", () => {
      // Build a heavily oscillating track that crosses the x=1 boundary
      // many times, inflating raw turf length far beyond a straight line —
      // but stays roughly half inside landSquare by clip fraction.
      const jitterPoints: Array<[number, number]> = [];
      for (let i = 0; i <= 200; i += 1) {
        const x = 0.5 + (i / 200) * 1; // sweeps 0.5 -> 1.5
        const yJitter = 0.5 + (i % 2 === 0 ? 0.001 : -0.001) * 50; // oscillation
        jitterPoints.push([x, yJitter]);
      }

      const result = clipTrackToMunicipality(
        lineTrack(jitterPoints),
        { landGeojson: landSquare, waterGeojson: waterSquareFar },
        4,
        4,
      );

      // insideKm must stay bounded by cleanDistanceKm regardless of how
      // inflated the raw (jitter) track length was internally.
      expect(result.trackTotalKm).toBe(4);
      expect(result.insideKm).toBeLessThanOrEqual(4);
    });

    it("pro-rates insideHoursEst by the raw clip fraction against totalHours", () => {
      const result = clipTrackToMunicipality(
        lineTrack([
          [0.5, 0.5],
          [1.5, 0.5],
        ]),
        { landGeojson: landSquare, waterGeojson: waterSquareFar },
        6,
        10,
      );

      expect(result.insideHoursEst).toBeCloseTo(3, 0);
    });
  });
});
