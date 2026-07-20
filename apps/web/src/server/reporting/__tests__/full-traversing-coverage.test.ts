// full-traversing-coverage.test.ts — the opt-in zone-scope FULL-crediting
// primitive: `collectFullTraversingPatrols`.
//
// Fixtures mirror traversing-coverage.test.ts: two adjacent unit squares so a
// straight track crossing the shared edge splits ~50/50 by raw clip fraction.
// That 50/50 split is what makes the headline assertion meaningful — this mode
// must return the FULL 10 km / 4 h, never the ~5 km / ~2 h clipped portion.
// `clipTrackToMunicipality` is NOT mocked; real turf geometry runs.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findMany: vi.fn() },
    patrolTrack: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import { bboxOfGeojson, type TraversingMember } from "../traversing-coverage";
import { collectFullTraversingPatrols } from "../full-traversing-coverage";

// Square "A" — (0,0)-(1,1) — is the patrols' ORIGIN territory and is
// deliberately never a member: it stands for the mainland port (Sablayan) the
// patrols leave from. Only the zones below are ever passed as members.
//
// Unit square "member B": (1,0)-(2,1) — shares the x=1 edge with A.
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

// Far-away square "member C": (10,10)-(11,11) — no track below reaches it.
const squareC = {
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

function zoneMember(id: string, land: unknown): TraversingMember {
  return { id, kind: "zone", landGeojson: land, waterGeojson: null, bbox: bboxOfGeojson(land) };
}

const zoneB = zoneMember("zone-b", squareB);
const zoneC = zoneMember("zone-c", squareC);

// Straight track from (0.5,0.5) to (1.5,0.5): half inside A (x: 0.5→1.0),
// half inside B (x: 1.0→1.5). Only B is ever a member, so the CLIPPED
// contribution would be ~half of the patrol's figures.
const crossingTrack = { type: "LineString", coordinates: [[0.5, 0.5], [1.5, 0.5]] };

// Track entirely inside A — never enters zone B or zone C.
const nonEnteringTrack = { type: "LineString", coordinates: [[0.1, 0.5], [0.9, 0.5]] };

interface PatrolOverrides {
  id?: string;
  title?: string | null;
  patrolType?: string;
  municipalityId?: string | null;
  municipalityName?: string | null;
  computedDistanceKm?: number | null;
  totalDistanceKm?: number | null;
  computedDurationHours?: number | null;
  totalHours?: number | null;
}

/** One prisma `patrolTrack.findMany` row. The patrol STARTS at (0.5,0.5) —
 *  inside square A, OUTSIDE zone B — so zone B is never an origin member and
 *  the track genuinely counts as traversing. */
function trackRow(track: unknown, overrides: PatrolOverrides = {}) {
  return {
    trackGeojson: track,
    patrol: {
      id: overrides.id ?? "patrol-1",
      title: overrides.title === undefined ? "Patrol One" : overrides.title,
      patrolType: overrides.patrolType ?? "seaborne",
      municipalityId: overrides.municipalityId === undefined ? "muni-a" : overrides.municipalityId,
      totalHours: overrides.totalHours === undefined ? null : overrides.totalHours,
      computedDurationHours:
        overrides.computedDurationHours === undefined ? 4 : overrides.computedDurationHours,
      computedDistanceKm:
        overrides.computedDistanceKm === undefined ? 10 : overrides.computedDistanceKm,
      totalDistanceKm: overrides.totalDistanceKm === undefined ? null : overrides.totalDistanceKm,
      startLocationLat: 0.5,
      startLocationLon: 0.5,
      municipality:
        overrides.municipalityName === null ? null : { name: overrides.municipalityName ?? "Sablayan" },
    },
  };
}

const trackFindMany = vi.mocked(prisma.patrolTrack.findMany);

function mockTracks(rows: ReturnType<typeof trackRow>[]): void {
  // The prisma mock is untyped by construction; the rows above are the exact
  // selected shape the module consumes.
  trackFindMany.mockResolvedValue(rows as never);
}

describe("collectFullTraversingPatrols", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("credits a patrol entering the zone its FULL km/hours, not the clipped inside portion", async () => {
    mockTracks([trackRow(crossingTrack)]);

    const result = await collectFullTraversingPatrols(
      "tenant-1",
      {},
      [zoneB],
      new Set<string>(),
    );

    expect(result.count).toBe(1);
    expect(result.rows).toHaveLength(1);
    // FULL patrol figures — the clipped inside-zone portion would be ~5 / ~2.
    expect(result.rows[0]?.fullKm).toBe(10);
    expect(result.rows[0]?.fullHours).toBe(4);
    expect(result.km).toBe(10);
    expect(result.hours).toBe(4);
    expect(result.rows[0]).toMatchObject({
      patrolId: "patrol-1",
      title: "Patrol One",
      patrolType: "seaborne",
      startMunicipalityName: "Sablayan",
    });
  });

  it("DOUBLE-CREDIT GUARD: omits a patrol whose id is in excludePatrolIds even though its track crosses the member", async () => {
    mockTracks([trackRow(crossingTrack, { id: "already-counted" })]);

    const result = await collectFullTraversingPatrols(
      "tenant-1",
      {},
      [zoneB],
      new Set<string>(["already-counted"]),
    );

    // The report's own where-clause already credits this patrol in full;
    // returning it here would count its km/hours twice.
    expect(result).toEqual({ rows: [], count: 0, km: 0, hours: 0 });
  });

  it("DEDUPE: counts a patrol ONCE when it has two PatrolTrack rows that both cross", async () => {
    mockTracks([
      trackRow(crossingTrack, { id: "patrol-dup" }),
      trackRow(crossingTrack, { id: "patrol-dup" }),
    ]);

    const result = await collectFullTraversingPatrols("tenant-1", {}, [zoneB], new Set<string>());

    expect(result.count).toBe(1);
    expect(result.km).toBe(10);
    expect(result.hours).toBe(4);
  });

  it("DEDUPE: counts a patrol ONCE when its track crosses two members", async () => {
    // Widen the track so it enters BOTH zone B (1→2) and a second zone D.
    const squareD = {
      type: "Polygon",
      coordinates: [
        [
          [2, 0],
          [3, 0],
          [3, 1],
          [2, 1],
          [2, 0],
        ],
      ],
    };
    const zoneD = zoneMember("zone-d", squareD);
    const longTrack = { type: "LineString", coordinates: [[0.5, 0.5], [2.5, 0.5]] };

    mockTracks([trackRow(longTrack, { id: "patrol-multi" })]);

    const result = await collectFullTraversingPatrols(
      "tenant-1",
      {},
      [zoneB, zoneD],
      new Set<string>(),
    );

    expect(result.count).toBe(1);
    // NOT 20 — full figures are credited once, never summed per member.
    expect(result.km).toBe(10);
    expect(result.hours).toBe(4);
  });

  it("omits a patrol whose track never enters any member", async () => {
    mockTracks([trackRow(nonEnteringTrack, { id: "patrol-outside" })]);

    const result = await collectFullTraversingPatrols(
      "tenant-1",
      {},
      [zoneB, zoneC],
      new Set<string>(),
    );

    expect(result).toEqual({ rows: [], count: 0, km: 0, hours: 0 });
  });

  it("falls back to total* when computed* is null", async () => {
    mockTracks([
      trackRow(crossingTrack, {
        id: "patrol-fallback",
        computedDistanceKm: null,
        totalDistanceKm: 7,
        computedDurationHours: null,
        totalHours: 3,
      }),
    ]);

    const result = await collectFullTraversingPatrols("tenant-1", {}, [zoneB], new Set<string>());

    expect(result.count).toBe(1);
    expect(result.rows[0]?.fullKm).toBe(7);
    expect(result.rows[0]?.fullHours).toBe(3);
    expect(result.km).toBe(7);
    expect(result.hours).toBe(3);
  });

  it("yields 0 (not NaN) for hours when both computed and total hours are null", async () => {
    mockTracks([
      trackRow(crossingTrack, {
        id: "patrol-no-hours",
        computedDurationHours: null,
        totalHours: null,
      }),
    ]);

    const result = await collectFullTraversingPatrols("tenant-1", {}, [zoneB], new Set<string>());

    expect(result.count).toBe(1);
    expect(result.rows[0]?.fullHours).toBe(0);
    expect(result.hours).toBe(0);
    expect(Number.isNaN(result.hours)).toBe(false);
  });

  it("excludes a patrol with NO clean distance at all — the shared de-jitter guard rejects it upstream", async () => {
    // Documented behaviour of `clipTrackToMunicipality`: when no clean
    // distance is available (computed AND total both null/non-positive) the
    // patrol is deemed untrusted/unprocessed and returns traverses=false,
    // rather than falling back to jitter-inflated raw turf length. So such a
    // patrol never passes this module's entry test and contributes nothing —
    // its `?? 0` distance coalescing is unreachable-but-defensive.
    mockTracks([
      trackRow(crossingTrack, {
        id: "patrol-no-distance",
        computedDistanceKm: null,
        totalDistanceKm: null,
      }),
    ]);

    const result = await collectFullTraversingPatrols("tenant-1", {}, [zoneB], new Set<string>());

    expect(result).toEqual({ rows: [], count: 0, km: 0, hours: 0 });
    expect(Number.isNaN(result.km)).toBe(false);
  });

  it("labels a patrol with no municipality as Unattributed", async () => {
    mockTracks([
      trackRow(crossingTrack, { id: "patrol-unattr", municipalityId: null, municipalityName: null }),
    ]);

    const result = await collectFullTraversingPatrols("tenant-1", {}, [zoneB], new Set<string>());

    expect(result.rows[0]?.startMunicipalityName).toBe("Unattributed");
  });

  it("returns the zero result for an empty member set without touching prisma", async () => {
    const result = await collectFullTraversingPatrols("tenant-1", {}, [], new Set<string>());

    expect(result).toEqual({ rows: [], count: 0, km: 0, hours: 0 });
    expect(trackFindMany).not.toHaveBeenCalled();
  });

  it("applies the window bounds to the prisma startTime filter", async () => {
    mockTracks([]);
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-02-01T00:00:00.000Z");

    await collectFullTraversingPatrols("tenant-1", { from, to }, [zoneB], new Set<string>());

    expect(trackFindMany).toHaveBeenCalledTimes(1);
    const arg = trackFindMany.mock.calls[0]?.[0] as {
      where: { tenantId: string; patrol: { startTime?: { gte?: Date; lte?: Date } } };
    };
    expect(arg.where.tenantId).toBe("tenant-1");
    expect(arg.where.patrol.startTime).toEqual({ gte: from, lte: to });
  });
});
