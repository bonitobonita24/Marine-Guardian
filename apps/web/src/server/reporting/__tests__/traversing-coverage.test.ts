// traversing-coverage.test.ts — the shared multi-municipality (province
// rollup) traversing-patrol coverage primitive: `clipTrackAcrossMembers`
// (pure, in-memory) + `sumTraversingCoverageAcross` (prisma-backed sum).
//
// Fixtures mirror packages/shared/.../clip-track-to-municipality.test.ts:
// two adjacent unit squares so a straight track crossing the shared edge
// splits ~50/50 by raw clip fraction. `clipTrackToMunicipality` itself is
// NOT mocked — real turf geometry runs, same as the router test suites
// (reportMap.test.ts / map.test.ts) that exercise this module indirectly.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findMany: vi.fn() },
    patrolTrack: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import {
  bboxOfGeojson,
  bboxesOverlap,
  clipTrackAcrossMembers,
  sumTraversingCoverageAcross,
  type TraversingMember,
  type TraversingPatrolMeta,
} from "../traversing-coverage";

// Unit square "member A": (0,0)-(1,1).
const squareA = {
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

// Adjacent unit square "member B": (1,0)-(2,1) — shares the x=1 edge with A.
const squareB = {
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

function member(id: string, land: unknown): TraversingMember {
  return { id, landGeojson: land, waterGeojson: undefined, bbox: bboxOfGeojson(land) };
}

const memberA = member("muni-a", squareA);
const memberB = member("muni-b", squareB);

// Straight track from (0.5,0.5) to (1.5,0.5): half inside A (x: 0.5→1.0),
// half inside B (x: 1.0→1.5) — a clean ~50/50 raw clip fraction split.
const crossingTrack = { type: "LineString", coordinates: [[0.5, 0.5], [1.5, 0.5]] };

function meta(originId: string | null): TraversingPatrolMeta {
  return {
    originMunicipalityId: originId,
    computedDurationHours: 4,
    totalHours: null,
    computedDistanceKm: 10,
    totalDistanceKm: null,
  };
}

describe("clipTrackAcrossMembers", () => {
  it("(a) single-member call reduces to one non-origin check; matches the hand-computed expected coverage", () => {
    // Origin is neither A nor B, so A is a non-origin check. Track's raw clip
    // fraction inside A is ~0.5, so with cleanDistanceKm=10 / hours=4:
    // insideKm ≈ 5, insideHoursEst ≈ 2 (de-jitter guard scales by cleanKm).
    const result = clipTrackAcrossMembers(crossingTrack, [memberA], meta("muni-other"));

    expect(result.traversesNonOrigin).toBe(true);
    expect(result.insideKm).toBeCloseTo(5, 0);
    expect(result.insideHoursEst).toBeCloseTo(2, 0);
  });

  it("(b) 2-member province equals the sum of the two single-member calls (additivity)", () => {
    const combined = clipTrackAcrossMembers(crossingTrack, [memberA, memberB], meta("muni-other"));
    const onlyA = clipTrackAcrossMembers(crossingTrack, [memberA], meta("muni-other"));
    const onlyB = clipTrackAcrossMembers(crossingTrack, [memberB], meta("muni-other"));

    expect(combined.insideKm).toBeCloseTo(onlyA.insideKm + onlyB.insideKm, 5);
    expect(combined.insideHoursEst).toBeCloseTo(onlyA.insideHoursEst + onlyB.insideHoursEst, 5);
    // Sanity: both members are actually touched by this fixture (a
    // degenerate additivity check where one side is zero would be weak).
    expect(onlyA.insideKm).toBeGreaterThan(0);
    expect(onlyB.insideKm).toBeGreaterThan(0);
  });

  it("(c) cross-member correctness: a patrol originating in A that crosses B is credited to B, never to A", () => {
    // Origin = memberA.id — A must be excluded from its own credited coverage
    // even though the track spends half its length inside A.
    const result = clipTrackAcrossMembers(crossingTrack, [memberA, memberB], meta(memberA.id));

    expect(result.traversesNonOrigin).toBe(true);
    // Only B's ~half is credited (A is the origin, self-excluded).
    expect(result.insideKm).toBeCloseTo(5, 0);
    expect(result.insideHoursEst).toBeCloseTo(2, 0);

    // Equivalent to a B-only call with the same origin — proves A contributed
    // nothing to the total (its exclusion, not partial credit, is exact).
    const bOnly = clipTrackAcrossMembers(crossingTrack, [memberB], meta(memberA.id));
    expect(result.insideKm).toBeCloseTo(bOnly.insideKm, 5);
    expect(result.insideHoursEst).toBeCloseTo(bOnly.insideHoursEst, 5);
  });

  it("(d) bug guard: adding a second member to the scope must not drop the A-origin patrol's credit to B", () => {
    // Regression guard against a blanket `notIn: [allMembers]` exclusion
    // (which would wrongly zero out B's credit too, since A is also in the
    // scope). Per-member exclusion means B's credit is IDENTICAL whether A is
    // present in the members list or not.
    const bScopeAlone = clipTrackAcrossMembers(crossingTrack, [memberB], meta(memberA.id));
    const bPlusAScope = clipTrackAcrossMembers(crossingTrack, [memberA, memberB], meta(memberA.id));

    expect(bPlusAScope.insideKm).toBeGreaterThan(0);
    expect(bPlusAScope.insideKm).toBeCloseTo(bScopeAlone.insideKm, 5);
    expect(bPlusAScope.insideHoursEst).toBeCloseTo(bScopeAlone.insideHoursEst, 5);
    expect(bPlusAScope.traversesNonOrigin).toBe(true);
  });

  it("a member matching the patrol's own origin is skipped entirely (no self-credit)", () => {
    const result = clipTrackAcrossMembers(crossingTrack, [memberA], meta(memberA.id));
    expect(result.traversesNonOrigin).toBe(false);
    expect(result.insideKm).toBe(0);
    expect(result.insideHoursEst).toBe(0);
  });
});

describe("bboxOfGeojson / bboxesOverlap", () => {
  it("computes a tight bbox and detects overlap/non-overlap correctly", () => {
    const bboxA = bboxOfGeojson(squareA);
    const bboxB = bboxOfGeojson(squareB);
    expect(bboxA).toEqual([0, 0, 1, 1]);
    expect(bboxB).toEqual([1, 0, 2, 1]);
    if (!bboxA || !bboxB) throw new Error("expected bboxA/bboxB fixture geometry");
    // Touching at x=1 counts as overlap (bboxesOverlap is inclusive).
    expect(bboxesOverlap(bboxA, bboxB)).toBe(true);

    const farBbox = bboxOfGeojson({
      type: "Polygon",
      coordinates: [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
    });
    if (!farBbox) throw new Error("expected farBbox fixture geometry");
    expect(bboxesOverlap(bboxA, farBbox)).toBe(false);
  });
});

describe("sumTraversingCoverageAcross", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero immediately for an empty municipalityIds array — no prisma calls at all", async () => {
    const result = await sumTraversingCoverageAcross("tenant-1", {}, []);
    expect(result).toEqual({ km: 0, hours: 0 });
    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.findMany).not.toHaveBeenCalled();
  });

  it("sums per-member clipped coverage across a province's members, tenant + window scoped, crediting only the non-origin member", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-a", boundaryGeojson: squareA, waterGeojson: null },
      { id: "muni-b", boundaryGeojson: squareB, waterGeojson: null },
    ] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: crossingTrack,
        patrol: {
          municipalityId: "muni-a",
          totalHours: null,
          computedDurationHours: 4,
          computedDistanceKm: 10,
          totalDistanceKm: null,
        },
      },
    ] as never);

    const from = new Date("2026-06-01");
    const to = new Date("2026-06-27");
    const result = await sumTraversingCoverageAcross("tenant-1", { from, to }, ["muni-a", "muni-b"]);

    expect(prisma.municipality.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["muni-a", "muni-b"] } },
      select: { id: true, boundaryGeojson: true, waterGeojson: true },
    });
    const trackCallWhere = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0]?.where as unknown;
    expect(trackCallWhere).toMatchObject({
      tenantId: "tenant-1",
      patrol: { tenantId: "tenant-1", isDeleted: false, isTestPatrol: false, startTime: { gte: from, lte: to } },
    });

    // Origin muni-a is excluded from its own credit; only muni-b's ~half is
    // summed (insideKm ≈ 5, insideHoursEst ≈ 2).
    expect(result.km).toBeCloseTo(5, 0);
    expect(result.hours).toBeCloseTo(2, 0);
  });

  it("sums across BOTH members when neither is the patrol's origin (additive across the whole set)", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-a", boundaryGeojson: squareA, waterGeojson: null },
      { id: "muni-b", boundaryGeojson: squareB, waterGeojson: null },
    ] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: crossingTrack,
        patrol: {
          municipalityId: "muni-other", // origin outside the scoped set
          totalHours: null,
          computedDurationHours: 4,
          computedDistanceKm: 10,
          totalDistanceKm: null,
        },
      },
    ] as never);

    const result = await sumTraversingCoverageAcross("tenant-1", {}, ["muni-a", "muni-b"]);

    // Both halves credited: ~5+5 = ~10km, ~2+2 = ~4h.
    expect(result.km).toBeCloseTo(10, 0);
    expect(result.hours).toBeCloseTo(4, 0);
  });

  it("returns zero when the resolved member rows come back empty (ids didn't match any municipality)", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([] as never);

    const result = await sumTraversingCoverageAcross("tenant-1", {}, ["missing-id"]);
    expect(result).toEqual({ km: 0, hours: 0 });
    expect(prisma.patrolTrack.findMany).not.toHaveBeenCalled();
  });
});
