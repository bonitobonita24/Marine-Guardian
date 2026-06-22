/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
    },
    observation: {
      findMany: vi.fn(),
    },
    patrol: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    patrolArea: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { mapRouter } from "../map";

const createCaller = createCallerFactory(mapRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles: ["operator" as const],
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("map.events.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns events with non-null coordinates for the authenticated tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "ev-1",
        title: "Blast fishing",
        priority: 200,
        locationLat: 1.5,
        locationLon: 124.0,
        reportedAt: new Date("2026-05-10"),
        eventType: { display: "Blast Fishing", category: "law_enforcement" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.events.list({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "ev-1",
      locationLat: 1.5,
      locationLon: 124.0,
    });
    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      locationLat: { not: null },
      locationLon: { not: null },
    });
  });

  it("scopes the query to the tenant — never leaks cross-tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.events.list({});

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("filters by since timestamp when provided", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const since = new Date("2026-05-01");
    const caller = createCaller(makeCtx());
    await caller.events.list({ since });

    const findManyCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      reportedAt: { gte: since },
    });
  });
});

describe("map.subjects.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active subjects with last positions and computes staleness", async () => {
    const recentTime = new Date(Date.now() - 30 * 60 * 1000);
    const oldTime = new Date(Date.now() - 3 * 60 * 60 * 1000);

    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      {
        id: "sub-1",
        name: "Patrol Boat 1",
        subjectType: "patrol_boat",
        lastPositionLat: 1.5,
        lastPositionLon: 124.0,
        lastPositionAt: recentTime,
      },
      {
        id: "sub-2",
        name: "Ranger A",
        subjectType: "ranger",
        lastPositionLat: 1.6,
        lastPositionLon: 124.1,
        lastPositionAt: oldTime,
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.subjects.list();

    expect(result).toHaveLength(2);
    expect(result[0]?.isStale).toBe(false);
    expect(result[1]?.isStale).toBe(true);
    const findManyCall = vi.mocked(prisma.subject.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      isActive: true,
    });
  });

  it("scopes to tenant", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.subjects.list();

    const findManyCall = vi.mocked(prisma.subject.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
  });
});

describe("map.patrolTracks.byPatrolId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns observations along a patrol track scoped to the patrol's leader and time window", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-1",
      tenantId: TENANT_ID,
      startTime: new Date("2026-05-10T08:00:00Z"),
      endTime: new Date("2026-05-10T12:00:00Z"),
      segments: [
        { leaderErId: "er-leader-1" },
      ],
    } as any);

    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "sub-leader-1" },
    ] as any);

    vi.mocked(prisma.observation.findMany).mockResolvedValue([
      {
        locationLat: 1.5,
        locationLon: 124.0,
        recordedAt: new Date("2026-05-10T09:00:00Z"),
      },
      {
        locationLat: 1.51,
        locationLon: 124.01,
        recordedAt: new Date("2026-05-10T10:00:00Z"),
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.byPatrolId({ patrolId: "patrol-1" });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ lat: 1.5, lon: 124.0 });
  });

  it("rejects access to a patrol that belongs to a different tenant", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-x",
      tenantId: "other-tenant",
      startTime: new Date(),
      endTime: new Date(),
      segments: [],
    } as any);

    const caller = createCaller(makeCtx());
    await expect(
      caller.patrolTracks.byPatrolId({ patrolId: "patrol-x" })
    ).rejects.toThrow();
  });

  it("returns empty points if patrol has no segments with leaders", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "patrol-2",
      tenantId: TENANT_ID,
      startTime: new Date(),
      endTime: new Date(),
      segments: [],
    } as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.byPatrolId({ patrolId: "patrol-2" });

    expect(result.points).toEqual([]);
  });
});

describe("map.patrolTracks.active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one styled track per open patrol with its patrolType, scoped to tenant", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "patrol-sea",
        title: "Bay sweep",
        patrolType: "seaborne",
        startTime: new Date("2026-05-10T08:00:00Z"),
        endTime: new Date("2026-05-10T12:00:00Z"),
        segments: [{ leaderErId: "er-sea" }],
      },
      {
        id: "patrol-foot",
        title: "Shore walk",
        patrolType: "foot",
        startTime: new Date("2026-05-10T08:00:00Z"),
        endTime: new Date("2026-05-10T12:00:00Z"),
        segments: [{ leaderErId: "er-foot" }],
      },
    ] as any);

    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "sub-sea", erSubjectId: "er-sea" },
      { id: "sub-foot", erSubjectId: "er-foot" },
    ] as any);

    // Both patrols resolve to >= 2 points.
    vi.mocked(prisma.observation.findMany).mockResolvedValue([
      { locationLat: 1.5, locationLon: 124.0, recordedAt: new Date("2026-05-10T09:00:00Z") },
      { locationLat: 1.51, locationLon: 124.01, recordedAt: new Date("2026-05-10T10:00:00Z") },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toHaveLength(2);
    const byId = Object.fromEntries(result.tracks.map((t) => [t.patrolId, t]));
    expect(byId["patrol-sea"]?.patrolType).toBe("seaborne");
    expect(byId["patrol-foot"]?.patrolType).toBe("foot");
    expect(byId["patrol-sea"]?.points).toHaveLength(2);

    // Only open, non-deleted, non-test patrols for THIS tenant are queried.
    const patrolCall = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0];
    expect(patrolCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      state: "open",
      isDeleted: false,
      isTestPatrol: false,
    });
    // Bounded payload.
    expect(patrolCall?.take).toBe(50);
  });

  it("scopes to tenant — never leaks cross-tenant tracks", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toEqual([]);
    const patrolCall = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0];
    expect(patrolCall?.where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("omits patrols with fewer than 2 points (not renderable as a polyline)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "patrol-thin",
        title: "Single ping",
        patrolType: "foot",
        startTime: new Date("2026-05-10T08:00:00Z"),
        endTime: new Date("2026-05-10T12:00:00Z"),
        segments: [{ leaderErId: "er-thin" }],
      },
    ] as any);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "sub-thin", erSubjectId: "er-thin" },
    ] as any);
    vi.mocked(prisma.observation.findMany).mockResolvedValue([
      { locationLat: 1.5, locationLon: 124.0, recordedAt: new Date("2026-05-10T09:00:00Z") },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTracks.active();

    expect(result.tracks).toEqual([]);
  });
});

describe("map.patrolAreas.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active patrol areas for the tenant", async () => {
    vi.mocked(prisma.patrolArea.findMany).mockResolvedValue([
      {
        id: "pa-1",
        name: "Zone A",
        patrolType: "seaborne",
        polygonGeojson: { type: "Polygon", coordinates: [[]] },
        colorHex: "#ff0000",
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolAreas.list({ activeOnly: true });

    expect(result).toHaveLength(1);
    const findManyCall = vi.mocked(prisma.patrolArea.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      isActive: true,
    });
  });

  it("scopes to tenant and excludes inactive areas only when requested", async () => {
    vi.mocked(prisma.patrolArea.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.patrolAreas.list({ activeOnly: false });

    const findManyCall = vi.mocked(prisma.patrolArea.findMany).mock.calls[0]?.[0];
    expect(findManyCall?.where).toMatchObject({ tenantId: "other-tenant" });
    expect(findManyCall?.where).not.toHaveProperty("isActive");
  });
});
