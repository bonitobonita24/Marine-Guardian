// coverage-clip vitest suite — covers the three pure-function modules:
//   clip-track-to-boundary       (line × polygon clipping primitive)
//   compute-coverage-hours       (pro-rated hours derivation)
//   accumulate-coverage-by-boundary  (aggregator across patrols × boundaries)
//
// Fixture polygon is a 10°×10° square from (10, 10) to (20, 20). Lat/lon
// distances at this scale are ~111 km per degree — large numbers but
// turf great-circle math is consistent so ratio assertions stay exact.

import { describe, expect, it } from "vitest";

import { accumulateCoverageByBoundary } from "../accumulate-coverage-by-boundary";
import { clipTrackToBoundary } from "../clip-track-to-boundary";
import { computeCoverageHours } from "../compute-coverage-hours";
import type {
  AreaBoundaryForDerivation,
  PatrolForCoverage,
} from "../types";

// ─────────────────────────────────────────────────────────────────────
// Fixtures

const square: AreaBoundaryForDerivation = {
  id: "boundary-square",
  name: "Square Reserve",
  aliases: [],
  isEnabled: true,
  geometryType: "Polygon",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
        [10, 10],
      ],
    ],
  },
};

const farSquare: AreaBoundaryForDerivation = {
  id: "boundary-far",
  name: "Aalpha Far",
  aliases: [],
  isEnabled: true,
  geometryType: "Polygon",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [50, 50],
        [60, 50],
        [60, 60],
        [50, 60],
        [50, 50],
      ],
    ],
  },
};

const coastlineRef: AreaBoundaryForDerivation = {
  id: "boundary-coast",
  name: "Coastline Reference",
  aliases: [],
  isEnabled: true,
  geometryType: "LineString",
  geometryGeojson: {
    type: "LineString",
    coordinates: [
      [10, 10],
      [20, 10],
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────
// clipTrackToBoundary

describe("clipTrackToBoundary", () => {
  it("returns zero for a LineString-typed boundary (coastline reference)", () => {
    const result = clipTrackToBoundary(
      [
        [11, 15],
        [19, 15],
      ],
      coastlineRef,
    );
    expect(result.totalKm).toBe(0);
    expect(result.trackTotalKm).toBe(0);
  });

  it("returns zero when track has fewer than 2 points", () => {
    const result = clipTrackToBoundary([[15, 15]], square);
    expect(result.totalKm).toBe(0);
    expect(result.trackTotalKm).toBe(0);
  });

  it("returns zero for a malformed polygon (missing coordinates array)", () => {
    const malformed: AreaBoundaryForDerivation = {
      ...square,
      geometryGeojson: { type: "Polygon" },
    };
    const result = clipTrackToBoundary(
      [
        [11, 15],
        [19, 15],
      ],
      malformed,
    );
    expect(result.totalKm).toBe(0);
  });

  it("returns zero for a polygon with too few ring points (< 4)", () => {
    const malformed: AreaBoundaryForDerivation = {
      ...square,
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [10, 10],
            [20, 20],
          ],
        ],
      },
    };
    const result = clipTrackToBoundary(
      [
        [11, 15],
        [19, 15],
      ],
      malformed,
    );
    expect(result.totalKm).toBe(0);
  });

  it("returns zero for a polygon with non-numeric coordinates", () => {
    const malformed: AreaBoundaryForDerivation = {
      ...square,
      geometryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [10, 10],
            ["bad", 10],
            [20, 20],
            [10, 20],
            [10, 10],
          ],
        ],
      },
    };
    const result = clipTrackToBoundary(
      [
        [11, 15],
        [19, 15],
      ],
      malformed,
    );
    expect(result.totalKm).toBe(0);
  });

  it("clips entire track when fully inside polygon", () => {
    const result = clipTrackToBoundary(
      [
        [12, 15],
        [18, 15],
      ],
      square,
    );
    expect(result.trackTotalKm).toBeGreaterThan(0);
    expect(result.totalKm).toBeCloseTo(result.trackTotalKm, 3);
  });

  it("returns zero clipped km when track is fully outside polygon", () => {
    const result = clipTrackToBoundary(
      [
        [30, 30],
        [40, 40],
      ],
      square,
    );
    expect(result.trackTotalKm).toBeGreaterThan(0);
    expect(result.totalKm).toBe(0);
  });

  it("clips approximately half the track when it crosses one edge", () => {
    // Track from (5, 15) → (15, 15) crosses polygon at x=10. Half inside.
    const result = clipTrackToBoundary(
      [
        [5, 15],
        [15, 15],
      ],
      square,
    );
    expect(result.trackTotalKm).toBeGreaterThan(0);
    expect(result.totalKm / result.trackTotalKm).toBeCloseTo(0.5, 2);
  });

  it("clips middle portion when track enters and exits polygon", () => {
    // Track from (5, 15) → (25, 15) enters at x=10, exits at x=20. 10 of 20 deg inside.
    const result = clipTrackToBoundary(
      [
        [5, 15],
        [25, 15],
      ],
      square,
    );
    expect(result.totalKm / result.trackTotalKm).toBeCloseTo(0.5, 2);
  });

  it("trackTotalKm matches turf length even when fully outside polygon", () => {
    // Sanity: trackTotalKm must always be the full track length, never the clipped.
    const result = clipTrackToBoundary(
      [
        [30, 30],
        [40, 40],
      ],
      square,
    );
    // Diagonal of 10 degrees lat/lon at 30N ≈ 1490 km, sanity-bounded.
    expect(result.trackTotalKm).toBeGreaterThan(1000);
    expect(result.trackTotalKm).toBeLessThan(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeCoverageHours

describe("computeCoverageHours", () => {
  it("returns zero when coverageKm is 0", () => {
    const r = computeCoverageHours(5, 0, 100);
    expect(r.coverageHrs).toBe(0);
    expect(r.estimated).toBe(false);
  });

  it("returns zero when totalHours is null", () => {
    const r = computeCoverageHours(null, 50, 100);
    expect(r.coverageHrs).toBe(0);
    expect(r.estimated).toBe(false);
  });

  it("returns zero when totalHours is non-positive", () => {
    expect(computeCoverageHours(0, 50, 100).coverageHrs).toBe(0);
    expect(computeCoverageHours(-3, 50, 100).coverageHrs).toBe(0);
  });

  it("returns zero when trackTotalKm is non-positive", () => {
    const r = computeCoverageHours(5, 50, 0);
    expect(r.coverageHrs).toBe(0);
    expect(r.estimated).toBe(false);
  });

  it("pro-rates correctly when coverageKm is fraction of trackTotalKm", () => {
    // 4 hours total, 25 km of 100 km inside → 1 hour
    const r = computeCoverageHours(4, 25, 100);
    expect(r.coverageHrs).toBe(1);
    expect(r.estimated).toBe(true);
  });

  it("clamps coverageHrs to totalHours when fraction exceeds 1 (float drift)", () => {
    const r = computeCoverageHours(4, 101, 100);
    expect(r.coverageHrs).toBe(4);
    expect(r.estimated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// accumulateCoverageByBoundary

describe("accumulateCoverageByBoundary", () => {
  it("returns empty rows when no polygon boundaries are given", () => {
    const result = accumulateCoverageByBoundary([], []);
    expect(result.rows).toEqual([]);
    expect(result.missingTracksCount).toBe(0);
  });

  it("filters out LineString boundaries — only Polygons appear in rows", () => {
    const result = accumulateCoverageByBoundary(
      [],
      [square, coastlineRef, farSquare],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.areaBoundaryId).sort()).toEqual(
      ["boundary-far", "boundary-square"].sort(),
    );
  });

  it("seeds polygon rows with zero counts when there are no patrols", () => {
    const result = accumulateCoverageByBoundary([], [square]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row?.patrolsCount).toBe(0);
    expect(row?.coverageKm).toBe(0);
    expect(row?.coverageHrs).toBe(0);
    expect(row?.hrsEstimatedCount).toBe(0);
  });

  it("counts a patrol with null trackLineString and positive hours toward missingTracksCount", () => {
    const patrols: PatrolForCoverage[] = [
      { id: "p1", trackLineString: null, totalHours: 3 },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    expect(result.missingTracksCount).toBe(1);
    expect(result.rows[0]?.patrolsCount).toBe(0);
  });

  it("does NOT flag patrols with null trackLineString AND null totalHours as missing", () => {
    // A draft/scheduled patrol with no track and no hours is not a "missing track".
    const patrols: PatrolForCoverage[] = [
      { id: "p1", trackLineString: null, totalHours: null },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    expect(result.missingTracksCount).toBe(0);
  });

  it("accumulates km and hrs for a patrol fully inside a polygon", () => {
    const patrols: PatrolForCoverage[] = [
      {
        id: "p1",
        trackLineString: [
          [12, 15],
          [18, 15],
        ],
        totalHours: 4,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    const row = result.rows[0];
    expect(row?.patrolsCount).toBe(1);
    expect(row?.coverageKm).toBeGreaterThan(0);
    expect(row?.coverageHrs).toBeCloseTo(4, 1);
    expect(row?.hrsEstimatedCount).toBe(1);
  });

  it("skips patrols whose tracks lie entirely outside every polygon", () => {
    const patrols: PatrolForCoverage[] = [
      {
        id: "p1",
        trackLineString: [
          [30, 30],
          [40, 40],
        ],
        totalHours: 4,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    expect(result.rows[0]?.patrolsCount).toBe(0);
    expect(result.rows[0]?.coverageKm).toBe(0);
    expect(result.missingTracksCount).toBe(0); // track exists, just outside
  });

  it("attributes one patrol to multiple boundaries when its track touches both", () => {
    // Track crosses both squares (skip from one to the other) — turf's
    // line-split handles each polygon independently, so the patrol counts
    // in both rows.
    const patrols: PatrolForCoverage[] = [
      {
        id: "p1",
        trackLineString: [
          [12, 15],
          [18, 15],
          [55, 55],
          [58, 58],
        ],
        totalHours: 4,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square, farSquare]);
    expect(result.rows.every((r) => r.patrolsCount === 1)).toBe(true);
  });

  it("sorts rows by coverageKm DESC", () => {
    const patrols: PatrolForCoverage[] = [
      {
        id: "long",
        trackLineString: [
          [55, 55],
          [59, 59],
        ],
        totalHours: 5,
      },
      {
        id: "short",
        trackLineString: [
          [13, 15],
          [14, 15],
        ],
        totalHours: 2,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square, farSquare]);
    expect(result.rows[0]?.coverageKm).toBeGreaterThan(
      result.rows[1]?.coverageKm ?? 0,
    );
  });

  it("tiebreaks by areaName ASC when coverageKm is equal (e.g. both zero)", () => {
    const result = accumulateCoverageByBoundary([], [square, farSquare]);
    // Both zero coverage; sorted by name ASC: "Aalpha Far" < "Square Reserve"
    expect(result.rows[0]?.areaName).toBe("Aalpha Far");
    expect(result.rows[1]?.areaName).toBe("Square Reserve");
  });

  it("does not increment hrsEstimatedCount when totalHours is null", () => {
    const patrols: PatrolForCoverage[] = [
      {
        id: "p1",
        trackLineString: [
          [12, 15],
          [18, 15],
        ],
        totalHours: null,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    expect(result.rows[0]?.patrolsCount).toBe(1);
    expect(result.rows[0]?.coverageKm).toBeGreaterThan(0);
    expect(result.rows[0]?.coverageHrs).toBe(0);
    expect(result.rows[0]?.hrsEstimatedCount).toBe(0);
  });

  it("aggregates multiple patrols summing km and hrs per boundary", () => {
    const patrols: PatrolForCoverage[] = [
      {
        id: "p1",
        trackLineString: [
          [12, 15],
          [18, 15],
        ],
        totalHours: 4,
      },
      {
        id: "p2",
        trackLineString: [
          [11, 12],
          [19, 18],
        ],
        totalHours: 6,
      },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square]);
    const row = result.rows[0];
    expect(row?.patrolsCount).toBe(2);
    expect(row?.hrsEstimatedCount).toBe(2);
    expect(row?.coverageKm).toBeGreaterThan(0);
    expect(row?.coverageHrs).toBeGreaterThan(0);
  });

  it("counts each missing-track patrol exactly once across multiple boundaries", () => {
    const patrols: PatrolForCoverage[] = [
      { id: "p1", trackLineString: null, totalHours: 2 },
      { id: "p2", trackLineString: null, totalHours: 5 },
    ];
    const result = accumulateCoverageByBoundary(patrols, [square, farSquare]);
    expect(result.missingTracksCount).toBe(2);
  });
});
