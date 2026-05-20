// 5.2a — materializePatrolTrack helper tests.
//
// Verifies the helper:
//  (1) loads the patrol + first segment with correct select,
//  (2) skips with skipReason="no_segment" / "no_leader" / "no_credentials"
//      when preconditions are not met,
//  (3) resolves ER credentials from Tenant (decrypted), preferring
//      earthrangerTrackToken when present,
//  (4) calls EarthRangerClient.fetchSubjectTracks with the resolved time
//      range (segment.actualStart → segment.actualEnd preferred),
//  (5) summarises features into pointCount + hasTimestamps + lastTrackTime,
//  (6) upserts PatrolTrack on patrolId with source="er_api" + correct shape.
//
// All prisma calls + decrypt + the EarthRangerClient class are mocked.
// No real DB or HTTP I/O.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ErTrackResponse } from "../earthranger-client";

// Mock the @marine-guardian/db decrypt so credential reads return plaintext.
vi.mock("@marine-guardian/db", () => ({
  decrypt: (s: string) => `decrypted:${s}`,
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
  type PrismaClientLike,
} from "../patrol-track-materialization";

const TENANT_A = "tenant-a";
const PATROL_A = "patrol-a";

interface MockPrisma {
  patrol: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  patrolTrack: { upsert: ReturnType<typeof vi.fn> };
}

function makePrismaMock(): MockPrisma {
  return {
    patrol: { findUniqueOrThrow: vi.fn() },
    tenant: { findUnique: vi.fn() },
    patrolTrack: { upsert: vi.fn() },
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

function makeTenant(
  overrides: Partial<{
    earthrangerUrl: string | null;
    earthrangerDasToken: string | null;
    earthrangerTrackToken: string | null;
  }> = {},
) {
  // Use `in` checks to distinguish explicit null override from absent key.
  // `null ?? default` returns default — nullish coalescing eats null overrides.
  return {
    earthrangerUrl:
      "earthrangerUrl" in overrides
        ? overrides.earthrangerUrl
        : "enc:https://er.example.test",
    earthrangerDasToken:
      "earthrangerDasToken" in overrides
        ? overrides.earthrangerDasToken
        : "enc:das-token",
    earthrangerTrackToken:
      "earthrangerTrackToken" in overrides
        ? overrides.earthrangerTrackToken
        : "enc:track-token",
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
  });

  it("happy path: fetches tracks, summarises features, upserts PatrolTrack", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
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
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
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
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("skips with skipReason=no_credentials when tenant lacks earthrangerUrl", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ earthrangerUrl: null }),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_credentials");
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
    expect(prisma.patrolTrack.upsert).not.toHaveBeenCalled();
  });

  it("skips with skipReason=no_credentials when tenant lacks earthrangerDasToken", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ earthrangerDasToken: null }),
    );

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no_credentials");
    expect(mockFetchSubjectTracks).not.toHaveBeenCalled();
  });

  it("uses earthrangerTrackToken when present (passed to client constructor)", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(mockClientConstructor).toHaveBeenCalledWith(
      "decrypted:enc:https://er.example.test",
      "decrypted:enc:das-token",
      "decrypted:enc:track-token",
    );
  });

  it("falls back to DAS token (trackToken undefined) when earthrangerTrackToken is null", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ earthrangerTrackToken: null }),
    );
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(mockClientConstructor).toHaveBeenCalledWith(
      "decrypted:enc:https://er.example.test",
      "decrypted:enc:das-token",
      undefined,
    );
  });

  it("mirrors patrol.endTime into result.patrolEnded + upsert payload", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(
      makePatrol({ endTime: new Date("2026-05-01T13:00:00Z") }),
    );
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

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
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
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
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
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
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
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

  it("empty features returns pointCount=0, hasTimestamps=false, still upserts", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-empty" });
    mockFetchSubjectTracks.mockResolvedValue(makeTrackResponse([]));

    const result = await materializePatrolTrack(
      prisma as unknown as PrismaClientLike,
      PATROL_A,
    );

    expect(result.skipped).toBe(false);
    expect(result.pointCount).toBe(0);
    expect(result.hasTimestamps).toBe(false);
    expect(result.lastTrackTime).toBeNull();
    expect(prisma.patrolTrack.upsert).toHaveBeenCalledTimes(1);
  });

  it("prefers segment.actualStart/actualEnd over scheduled or patrol-level range", async () => {
    const prisma = makePrismaMock();
    prisma.patrol.findUniqueOrThrow.mockResolvedValue(makePatrol());
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
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
    );
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.patrolTrack.upsert.mockResolvedValue({ id: "pt-1" });
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
