// 5.2a — materializePatrolTrack helper tests.
//
// Verifies the helper:
//  (1) loads the patrol + first segment with correct select,
//  (2) skips with skipReason="no_segment" / "no_leader" / "no_credentials"
//      when preconditions are not met,
//  (3) resolves ER credentials from tenant_er_connections (baseUrl plaintext,
//      apiTokenEnc decrypted) via platformPrisma — skips no_credentials when
//      the connection row is absent,
//  (4) calls EarthRangerClient.fetchSubjectTracks with the resolved time
//      range (segment.actualStart → segment.actualEnd preferred),
//  (5) summarises features into pointCount + hasTimestamps + lastTrackTime,
//  (6) upserts PatrolTrack on patrolId with source="er_api" + correct shape.
//
// All prisma calls + decrypt + the EarthRangerClient class are mocked.
// No real DB or HTTP I/O.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ErTrackResponse } from "../earthranger-client";

// Mock @marine-guardian/db: decrypt (plaintext echo) + platformPrisma, whose
// tenantErConnection.findUnique now backs the credential read / no_credentials.
// vi.hoisted ensures the fn is initialized before the hoisted vi.mock factory
// runs. Referencing the standalone fn (not platformPrisma.x.y) also avoids the
// unbound-method lint an inline method reference would trip.
const { mockErConnFindUnique } = vi.hoisted(() => ({
  mockErConnFindUnique: vi.fn(),
}));
vi.mock("@marine-guardian/db", () => ({
  decrypt: (s: string) => `decrypted:${s}`,
  platformPrisma: {
    tenantErConnection: { findUnique: mockErConnFindUnique },
  },
}));

// Mock the EarthRangerClient constructor + fetchSubjectTracks method.
const mockFetchSubjectTracks = vi.fn<
  (subjectId: string, since: string, until: string) => Promise<ErTrackResponse>
>();
const mockClientConstructor = vi.fn();

vi.mock("../earthranger-client", () => {
  return {
    EarthRangerClient: class MockEarthRangerClient {
      constructor(baseUrl: string, token: string, trackToken?: string) {
        mockClientConstructor(baseUrl, token, trackToken);
      }
      async fetchSubjectTracks(
        subjectId: string,
        since: string,
        until: string,
      ): Promise<ErTrackResponse> {
        return mockFetchSubjectTracks(subjectId, since, until);
      }
    },
  };
});

// Import AFTER mocks are registered (vi.mock is hoisted but explicit ordering
// keeps readers from second-guessing).
import {
  materializePatrolTrack,
  recomputeDistanceAndDuration,
  type PrismaClientLike,
} from "../patrol-track-materialization";
// Handle on the mocked cred read. materializePatrolTrack resolves ER creds via
// platformPrisma.tenantErConnection (not the passed-in prisma), mirroring the
// er-sync.processor.ts pattern.
const erConnFindUnique = mockErConnFindUnique;

// Canonical valid connection: baseUrl is stored plaintext, apiTokenEnc decrypted.
const VALID_CONN = {
  baseUrl: "https://er.example.test",
  apiTokenEnc: "enc:das-token",
};

const TENANT_A = "tenant-a";
const PATROL_A = "patrol-a";

interface MockPrisma {
  patrol: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  patrolTrack: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
}

function makePrismaMock(): MockPrisma {
  return {
    patrol: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    patrolTrack: { upsert: vi.fn(), findUnique: vi.fn() },
  };
}

function makePatrol(
  overrides: Partial<{
    id: string;
    tenantId: string;
    startTime: Date | null;
    endTime: Date | null;
    segments: Array<{
      leaderErId: string | null;
      actualStart: Date | null;
      actualEnd: Date | null;
      scheduledStart: Date | null;
      scheduledEnd: Date | null;
    }>;
  }> = {},
) {
  return {
    id: overrides.id ?? PATROL_A,
    tenantId: overrides.tenantId ?? TENANT_A,
    startTime: overrides.startTime ?? new Date("2026-05-01T00:00:00Z"),
    endTime: overrides.endTime ?? null,
    segments: overrides.segments ?? [
      {
        leaderErId: "subject-er-1",
        actualStart: new Date("2026-05-01T08:00:00Z"),
        actualEnd: new Date("2026-05-01T12:00:00Z"),
        scheduledStart: new Date("2026-05-01T07:00:00Z"),
        scheduledEnd: new Date("2026-05-01T13:00:00Z"),
      },
    ],
  };
}

function makeTrackResponse(
  features: ErTrackResponse["features"] = [],
): ErTrackResponse {
  return { type: "FeatureCollection", features };
}

function makeFeatureWithTimes(
  coords: Array<[number, number]>,
  times: string[],
): ErTrackResponse["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: { coordinateProperties: { times } },
  };
}

describe("materializePatrolTrack (5.2a)", () => {
  beforeEach(() => {
    mockFetchSubjectTracks.mockReset();
    mockClientConstructor.mockReset();
    erConnFindUnique.mockReset();
    // Default to a valid connection; no_credentials test overrides with null.
    erConnFindUnique.mockResolvedValue(VALID_CONN);
  });

  it("happy path: fetches tracks, summarises features, upserts PatrolTrack", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
            [120.2, 8.2],
          ],
          [
            "2026-05-01T08:00:00Z",
            "2026-05-01T08:30:00Z",
            "2026-05-01T09:00:00Z",
          ],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(false);
    expect(result.patrolTrackId).toBe("pt-1");
    expect(result.pointCount).toBe(3);
    expect(result.hasTimestamps).toBe(true);
    expect(result.lastTrackTime?.toISOString()).toBe(
      "2026-05-01T09:00:00.000Z",
    );
    expect(result.patrolEnded).toBe(false);

    expect(mockFetchSubjectTracks).toHaveBeenCalledWith(
      "subject-er-1",
      "2026-05-01T08:00:00.000Z",
      "2026-05-01T12:00:00.000Z",
    );

    const upsertCall = prisma.patrolTrack.upsert.mock.calls[0]?.[0] as {
      where: { patrolId: string };
      create: Record<string, unknown>;
    };
    expect(upsertCall.where).toEqual({ patrolId: PATROL_A });
    expect(upsertCall.create.tenantId).toBe(TENANT_A);
    expect(upsertCall.create.source).toBe("er_api");
    expect(upsertCall.create.patrolEnded).toBe(false);
    expect(upsertCall.create.pointCount).toBe(3);
    expect(upsertCall.create.hasTimestamps).toBe(true);
  });

  it("skips with skipReason=no_segment when patrol has no segments", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({ segments: [] }),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_segment");
    expect(erConnFindUnique).not.toHaveBeenCalled();
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("skips with skipReason=no_leader when segment has null leaderErId", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({
        segments: [
          {
            leaderErId: null,
            actualStart: new Date("2026-05-01T08:00:00Z"),
            actualEnd: null,
            scheduledStart: null,
            scheduledEnd: null,
          },
        ],
      }),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_leader");
    expect(erConnFindUnique).not.toHaveBeenCalled();
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("skips with skipReason=no_credentials when no ER connection row exists", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    erConnFindUnique.mockResolvedValue(null);

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_credentials");
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("skips with skipReason=no_geometry when ER returns only null-geometry features", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        { type: "Feature", geometry: null, properties: {} },
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_geometry");
    expect(result.pointCount).toBe(0);
    // ER WAS called (this is a post-fetch skip), but nothing is written.
    expect(mockFetchSubjectTracks).toHaveBeenCalledOnce();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("drops null-geometry features and materialises only the valid ones (mixed response)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        { type: "Feature", geometry: null, properties: {} },
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(false);
    expect(result.pointCount).toBe(2);

    // Stored GeoJSON must contain ONLY the valid feature (null geometry stripped).
    const upsertCall = prisma.patrolTrack.upsert.mock.calls[0]?.[0] as {
      create: { trackGeojson: { features: unknown[] } };
    };
    expect(upsertCall.create.trackGeojson.features).toHaveLength(1);
  });

  it("constructs ER client with plaintext baseUrl + decrypted apiToken (no track token)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    // baseUrl stored plaintext (not decrypted); apiTokenEnc decrypted.
    // TenantErConnection has no track-token column → third arg undefined.
    expect(mockClientConstructor).toHaveBeenCalledWith(
      "https://er.example.test",
      "decrypted:enc:das-token",
      undefined,
    );
  });

  it("mirrors patrol.endTime into result.patrolEnded + upsert payload", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({ endTime: new Date("2026-05-01T13:00:00Z") }),
    );    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.patrolEnded).toBe(true);
    const upsertCall = prisma.patrolTrack.upsert.mock.calls[0]?.[0] as {
      create: { patrolEnded: boolean };
    };
    expect(upsertCall.create.patrolEnded).toBe(true);
  });

  it("flags hasTimestamps=false when feature has no coordinateProperties.times", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [120.0, 8.0],
              [120.1, 8.1],
            ],
          },
          properties: {},
        },
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.hasTimestamps).toBe(false);
    expect(result.lastTrackTime).toBeNull();
    expect(result.pointCount).toBe(2);
  });

  it("flags hasTimestamps=false when times length mismatches coords length", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
            [120.2, 8.2],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z"], // mismatch
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.hasTimestamps).toBe(false);
    expect(result.lastTrackTime).toBeNull();
    expect(result.pointCount).toBe(3);
  });

  it("aggregates pointCount across multiple features + picks latest lastTrackTime", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z"],
        ),
        makeFeatureWithTimes(
          [
            [120.2, 8.2],
            [120.3, 8.3],
            [120.4, 8.4],
          ],
          [
            "2026-05-01T10:00:00Z",
            "2026-05-01T11:00:00Z",
            "2026-05-01T11:30:00Z",
          ],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.pointCount).toBe(5);
    expect(result.hasTimestamps).toBe(true);
    expect(result.lastTrackTime?.toISOString()).toBe(
      "2026-05-01T11:30:00.000Z",
    );
  });

  it("empty features (no usable geometry) skips no_geometry without upserting", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-empty" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_geometry");
    expect(result.pointCount).toBe(0);
    expect(result.hasTimestamps).toBe(false);
    expect(result.lastTrackTime).toBeNull();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("prefers segment.actualStart/actualEnd over scheduled or patrol-level range", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(mockFetchSubjectTracks).toHaveBeenCalledWith(
      "subject-er-1",
      "2026-05-01T08:00:00.000Z", // actualStart
      "2026-05-01T12:00:00.000Z", // actualEnd
    );
  });

  // ---------------------------------------------------------------------
  // trackChanged fingerprint (er-sync CPU-spiral fix follow-up) — compares
  // pointCount + lastTrackTime against the PRIOR PatrolTrack row (read
  // before the upsert overwrites it).
  // ---------------------------------------------------------------------

  it("trackChanged=true when no prior PatrolTrack row exists", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.findUnique.mockResolvedValue(null);
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.trackChanged).toBe(true);
  });

  it("trackChanged=true when pointCount differs from the prior row", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.findUnique.mockResolvedValue({
      pointCount: 2,
      lastTrackTime: new Date("2026-05-01T08:30:00Z"),
    });
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
            [120.2, 8.2],
          ],
          [
            "2026-05-01T08:00:00Z",
            "2026-05-01T08:30:00Z",
            "2026-05-01T09:00:00Z",
          ],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.pointCount).toBe(3);
    expect(result.trackChanged).toBe(true);
  });

  it("trackChanged=true when lastTrackTime differs from the prior row (pointCount unchanged)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.findUnique.mockResolvedValue({
      pointCount: 2,
      lastTrackTime: new Date("2026-05-01T08:00:00Z"),
    });
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.pointCount).toBe(2);
    expect(result.trackChanged).toBe(true);
  });

  it("trackChanged=false when pointCount AND lastTrackTime are identical to the prior row (unchanged patrol re-synced)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.patrolTrack.findUnique.mockResolvedValue({
      pointCount: 2,
      lastTrackTime: new Date("2026-05-01T08:30:00Z"),
    });
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(
      makeTrackResponse([
        makeFeatureWithTimes(
          [
            [120.0, 8.0],
            [120.1, 8.1],
          ],
          ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        ),
      ]),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.pointCount).toBe(2);
    expect(result.trackChanged).toBe(false);
  });

  it("trackChanged=false for every skip case (no_segment / no_leader / no_credentials / no_geometry)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({ segments: [] }),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.trackChanged).toBe(false);
    // Skipping never reads the prior PatrolTrack row (nothing to compare).
    expect(prisma.patrolTrack.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to scheduledStart/End when actuals are null", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({
        segments: [
          {
            leaderErId: "subject-er-1",
            actualStart: null,
            actualEnd: null,
            scheduledStart: new Date("2026-05-01T07:00:00Z"),
            scheduledEnd: new Date("2026-05-01T13:00:00Z"),
          },
        ],
      }),
    );    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(mockFetchSubjectTracks).toHaveBeenCalledWith(
      "subject-er-1",
      "2026-05-01T07:00:00.000Z", // scheduledStart
      "2026-05-01T13:00:00.000Z", // scheduledEnd
    );
  });
});

// ---------------------------------------------------------------------------
// recomputeDistanceAndDuration tests (A2.1)
// ---------------------------------------------------------------------------

/** Minimal GeoJSON FeatureCollection compatible with ErTrackResponse shape. */
function makeTrackGeojson(
  features: Array<{
    coordinates: Array<[number, number]>;
    times?: string[];
  }>,
) {
  return {
    type: "FeatureCollection",
    features: features.map(({ coordinates, times }) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {
        coordinateProperties: { times: times ?? [] },
      },
    })),
  };
}

describe("recomputeDistanceAndDuration (A2.1)", () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrismaMock();
    // patrol.update always resolves (return value unused).
    prisma.patrol.update.mockResolvedValue({ id: PATROL_A });
  });

  it("computes distance and duration from single-feature GeoJSON track", async () => {
    // Two points ~1° of latitude apart (~111 km).
    const coordinates: Array<[number, number]> = [
      [120.0, 10.0],
      [120.0, 11.0],
    ];
    const times = ["2026-05-01T08:00:00Z", "2026-05-01T09:00:00Z"];
    prisma.patrolTrack.findUnique.mockResolvedValue({
      patrolId: PATROL_A,
      trackGeojson: makeTrackGeojson([{ coordinates, times }]),
    });

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    // ~111 km for 1° latitude at equator (±1 km tolerance).
    expect(result.computedDistanceKm).toBeGreaterThan(110);
    expect(result.computedDistanceKm).toBeLessThan(112);
    // 1 hour duration.
    expect(result.computedDurationHours).toBeCloseTo(1, 5);
    expect(result.pointCount).toBe(2);
    expect(prisma.patrol.update).toHaveBeenCalledWith({
      where: { id: PATROL_A },
      data: {
        computedDistanceKm: result.computedDistanceKm,
        computedDurationHours: result.computedDurationHours,
      },
    });
  });

  it("sums distance across multiple LineString features without connecting endpoints", async () => {
    // Feature A: [10.0,10.0] → [10.0,11.0] (~111 km)
    // Feature B: [20.0,10.0] → [20.0,11.0] (~111 km)
    // Total ~222 km; endpoints across features NOT bridged.
    prisma.patrolTrack.findUnique.mockResolvedValue({
      patrolId: PATROL_A,
      trackGeojson: makeTrackGeojson([
        {
          coordinates: [
            [10.0, 10.0],
            [10.0, 11.0],
          ],
          times: ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"],
        },
        {
          coordinates: [
            [20.0, 10.0],
            [20.0, 11.0],
          ],
          times: ["2026-05-01T09:00:00Z", "2026-05-01T09:30:00Z"],
        },
      ]),
    });

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.computedDistanceKm).toBeGreaterThan(220);
    expect(result.computedDistanceKm).toBeLessThan(224);
    expect(result.pointCount).toBe(4);
    // Duration spans 08:00 → 09:30 = 1.5 h.
    expect(result.computedDurationHours).toBeCloseTo(1.5, 5);
  });

  it("returns zero and skips Patrol update when no PatrolTrack row exists", async () => {
    prisma.patrolTrack.findUnique.mockResolvedValue(null);

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result).toEqual({
      computedDistanceKm: 0,
      computedDurationHours: 0,
      pointCount: 0,
    });
    expect(prisma.patrol.update).not.toHaveBeenCalled();
  });

  it("returns zero and skips Patrol update when trackGeojson is null", async () => {
    prisma.patrolTrack.findUnique.mockResolvedValue({
      patrolId: PATROL_A,
      trackGeojson: null,
    });

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result).toEqual({
      computedDistanceKm: 0,
      computedDurationHours: 0,
      pointCount: 0,
    });
    expect(prisma.patrol.update).not.toHaveBeenCalled();
  });

  it("handles missing coordinateProperties.times → duration 0, distance still computed", async () => {
    prisma.patrolTrack.findUnique.mockResolvedValue({
      patrolId: PATROL_A,
      trackGeojson: makeTrackGeojson([
        {
          coordinates: [
            [120.0, 10.0],
            [120.0, 11.0],
          ],
          // times deliberately omitted (empty array via makeTrackGeojson default).
        },
      ]),
    });

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.computedDurationHours).toBe(0);
    expect(result.computedDistanceKm).toBeGreaterThan(110);
    expect(result.pointCount).toBe(2);
  });

  it("writes computedDistanceKm + computedDurationHours to Patrol via prisma.patrol.update", async () => {
    prisma.patrolTrack.findUnique.mockResolvedValue({
      patrolId: PATROL_A,
      trackGeojson: makeTrackGeojson([
        {
          coordinates: [
            [120.0, 10.0],
            [120.0, 10.5],
          ],
          times: ["2026-05-01T08:00:00Z", "2026-05-01T08:15:00Z"],
        },
      ]),
    });

    const result = await recomputeDistanceAndDuration(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(prisma.patrol.update).toHaveBeenCalledOnce();
    expect(prisma.patrol.update).toHaveBeenCalledWith({
      where: { id: PATROL_A },
      data: {
        computedDistanceKm: result.computedDistanceKm,
        computedDurationHours: result.computedDurationHours,
      },
    });
    // 0.25 h = 15 min.
    expect(result.computedDurationHours).toBeCloseTo(0.25, 5);
  });
});
