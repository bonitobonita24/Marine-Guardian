/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    patrol: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    patrolTrack: {
      findMany: vi.fn(),
    },
    municipality: {
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
import { reportMapRouter } from "../reportMap";

const createCaller = createCallerFactory(reportMapRouter);

const TENANT_ID = "tenant-abc";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: "user-123",
        tenantId: tenantId as string,
        tenantSlug: "",
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

describe("reportMap.summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns event/patrol/category counts and scopes every query to tenant + skylight-excluded + filters", async () => {
    // count order: totalEvents, lawEnforcementEvents, monitoringEvents, totalPatrols
    vi.mocked(prisma.event.count)
      .mockResolvedValueOnce(40 as any)
      .mockResolvedValueOnce(12 as any)
      .mockResolvedValueOnce(25 as any);
    vi.mocked(prisma.patrol.count).mockResolvedValue(7 as any);

    const from = new Date("2026-06-01");
    const to = new Date("2026-06-27");
    const caller = createCaller(makeCtx());
    const result = await caller.summary({ from, to, municipalityId: "muni-1" });

    expect(result).toEqual({
      totalEvents: 40,
      totalPatrols: 7,
      lawEnforcementEvents: 12,
      monitoringEvents: 25,
    });

    const totalEventsWhere = vi.mocked(prisma.event.count).mock.calls[0]?.[0]?.where;
    expect(totalEventsWhere).toMatchObject({
      tenantId: TENANT_ID,
      reportedAt: { gte: from, lte: to },
      municipalityId: "muni-1",
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
    const lawWhere = vi.mocked(prisma.event.count).mock.calls[1]?.[0]?.where;
    expect(lawWhere).toMatchObject({
      eventType: { category: "law-enforcement-and-apprehensions" },
    });
    const patrolWhereArg = vi.mocked(prisma.patrol.count).mock.calls[0]?.[0]?.where;
    expect(patrolWhereArg).toMatchObject({
      tenantId: TENANT_ID,
      isDeleted: false,
      isTestPatrol: false,
      startTime: { gte: from, lte: to },
      municipalityId: "muni-1",
    });
  });

  it("omits range + municipality from where clauses when not provided", async () => {
    vi.mocked(prisma.event.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.patrol.count).mockResolvedValue(0 as any);

    const caller = createCaller(makeCtx());
    await caller.summary({});

    const totalEventsWhere = vi.mocked(prisma.event.count).mock.calls[0]?.[0]?.where;
    expect(totalEventsWhere).not.toHaveProperty("reportedAt");
    expect(totalEventsWhere).not.toHaveProperty("municipalityId");
  });
});

describe("reportMap.eventBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buckets events by real EarthRanger category, ignoring other categories", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { eventType: { category: "law-enforcement-and-apprehensions", display: "Blast Fishing" } },
      { eventType: { category: "law-enforcement-and-apprehensions", display: "Blast Fishing" } },
      { eventType: { category: "monitoring_patrolling_and_surveillance", display: "Vessel Sighting" } },
      { eventType: { category: "observation", display: "Misc" } },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventBreakdown({ municipalityId: "muni-1" });

    expect(result.lawEnforcement).toEqual([{ type: "Blast Fishing", count: 2 }]);
    expect(result.monitoring).toEqual([{ type: "Vessel Sighting", count: 1 }]);

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: TENANT_ID, municipalityId: "muni-1" });
  });
});

describe("reportMap province rollup filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves province to its municipality ids and applies an `in` filter when no municipalityId is given", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
      { id: "muni-2" },
    ] as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.eventBreakdown({ province: "Oriental Mindoro" });

    expect(prisma.municipality.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, province: "Oriental Mindoro" },
      select: { id: true },
    });
    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where as any;
    expect(where.municipalityId).toEqual({ in: ["muni-1", "muni-2"] });
  });

  it("municipalityId wins over province when both are provided — province lookup is not applied", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-1" },
      { id: "muni-2" },
    ] as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.eventBreakdown({ municipalityId: "muni-9", province: "Oriental Mindoro" });

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where as any;
    expect(where.municipalityId).toBe("muni-9");
  });

  it("omits municipalityId from the where clause when neither municipalityId nor province is given", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.eventBreakdown({});

    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where as any;
    expect(where).not.toHaveProperty("municipalityId");
  });

  it("province with no matching municipalities yields an empty `in` filter (no rows match)", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([]);
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.eventBreakdown({ province: "Nonexistent Province" });

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where as any;
    expect(where.municipalityId).toEqual({ in: [] });
  });

  it("applies province scoping to patrol queries too (summary.totalPatrols)", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni-3" },
    ] as any);
    vi.mocked(prisma.event.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.patrol.count).mockResolvedValue(0 as any);

    const caller = createCaller(makeCtx());
    await caller.summary({ province: "Palawan" });

    const patrolWhereArg = vi.mocked(prisma.patrol.count).mock.calls[0]?.[0]?.where as any;
    // A single resolved municipality collapses to plain equality (matches the
    // existing municipalityId-only shape used by every other filter path).
    expect(patrolWhereArg.municipalityId).toBe("muni-3");
  });
});

describe("reportMap.eventsOverTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits a continuous daily series filling zero days when from+to are provided", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { reportedAt: new Date("2026-06-01T08:00:00") },
      { reportedAt: new Date("2026-06-01T20:00:00") },
      { reportedAt: new Date("2026-06-03T10:00:00") },
    ] as any);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { startTime: new Date("2026-06-01T06:00:00") },
      { startTime: new Date("2026-06-02T09:00:00") },
      { startTime: new Date("2026-06-02T15:00:00") },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventsOverTime({
      from: new Date("2026-06-01T00:00:00"),
      to: new Date("2026-06-03T23:59:59"),
    });

    expect(result).toEqual([
      { date: "2026-06-01", label: "Jun 1", count: 2, patrolCount: 1 },
      { date: "2026-06-02", label: "Jun 2", count: 0, patrolCount: 2 },
      { date: "2026-06-03", label: "Jun 3", count: 1, patrolCount: 0 },
    ]);

    const patrolWhereArg = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    expect(patrolWhereArg).toMatchObject({
      tenantId: TENANT_ID,
      isDeleted: false,
      isTestPatrol: false,
      startTime: {
        gte: new Date("2026-06-01T00:00:00"),
        lte: new Date("2026-06-03T23:59:59"),
      },
    });
  });

  it("returns only days with events or patrols (ascending) when no range is given", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { reportedAt: new Date("2026-06-03T10:00:00") },
      { reportedAt: new Date("2026-06-01T10:00:00") },
      { reportedAt: null },
    ] as any);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { startTime: new Date("2026-06-02T10:00:00") },
      { startTime: null },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventsOverTime({});

    expect(result).toEqual([
      { date: "2026-06-01", label: "Jun 1", count: 1, patrolCount: 0 },
      { date: "2026-06-02", label: "Jun 2", count: 0, patrolCount: 1 },
      { date: "2026-06-03", label: "Jun 3", count: 1, patrolCount: 0 },
    ]);
  });

  it("scopes to the authenticated tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.eventsOverTime({});

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: "other-tenant" });
    const patrolWhereArg = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    expect(patrolWhereArg).toMatchObject({ tenantId: "other-tenant" });
  });

  it("buckets monthly (not 400+ daily points) for a >6-month range, never truncating", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { reportedAt: new Date("2026-01-15T08:00:00") },
      { reportedAt: new Date("2026-03-03T10:00:00") },
    ] as any);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { startTime: new Date("2026-06-01T06:00:00") },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventsOverTime({
      from: new Date("2026-01-01T00:00:00"),
      to: new Date("2026-07-06T00:00:00"),
    });

    expect(result).toHaveLength(7); // Jan..Jul, one point per month
    expect(result[0]).toMatchObject({ date: "2026-01", label: "Jan 2026" });
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(2);
    expect(result.reduce((s, d) => s + d.patrolCount, 0)).toBe(1);
  });
});

describe("reportMap.highPriorityEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped serious-incident events, tenant-scoped + ordered, with total", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "e1",
        title: "Boat A",
        priority: 300,
        reportedAt: new Date("2026-06-20"),
        eventType: {
          display: "Compressor Fishing",
          category: "law-enforcement-and-apprehensions",
        },
        municipality: { name: "Calapan City" },
        locationLat: 13.41,
        locationLon: 121.18,
      },
      {
        id: "e2",
        title: null,
        priority: 200,
        reportedAt: new Date("2026-06-19"),
        eventType: {
          display: "Threats on Habitat",
          category: "monitoring_patrolling_and_surveillance",
        },
        municipality: null,
        locationLat: null,
        locationLon: null,
      },
    ] as any);
    vi.mocked(prisma.event.count).mockResolvedValue(2 as any);

    const caller = createCaller(makeCtx());
    const result = await caller.highPriorityEvents({
      from: new Date("2026-06-01"),
      to: new Date("2026-06-27"),
      municipalityId: "muni-1",
    });

    expect(result.total).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      id: "e1",
      typeDisplay: "Compressor Fishing",
      municipalityName: "Calapan City",
      priority: 300,
      locationLat: 13.41,
      locationLon: 121.18,
    });
    expect(result.events[1]).toMatchObject({
      id: "e2",
      title: null,
      typeDisplay: "Threats on Habitat",
      municipalityName: null,
      locationLat: null,
      locationLon: null,
    });

    const arg = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0] as any;
    expect(arg.where.tenantId).toBe(TENANT_ID);
    expect(arg.where.municipalityId).toBe("muni-1");
    expect(arg.where.NOT.eventType.display.contains).toBe("skylight");
    expect(Array.isArray(arg.where.OR)).toBe(true);
    expect(arg.where.OR.length).toBeGreaterThan(0);
    expect(arg.where.OR[0].eventType.display.mode).toBe("insensitive");
    expect(arg.orderBy).toEqual([
      { priority: "desc" },
      { reportedAt: "desc" },
    ]);
    expect(arg.take).toBe(50);
  });

  it("returns empty list + zero total when none match", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    vi.mocked(prisma.event.count).mockResolvedValue(0 as any);

    const caller = createCaller(makeCtx());
    const result = await caller.highPriorityEvents({});

    expect(result.total).toBe(0);
    expect(result.events).toEqual([]);
  });
});

describe("reportMap.eventBreakdownWithCoords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts match eventBreakdown and points exclude null-coord rows", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "e1",
        title: "Blast Fishing A",
        locationLat: 13.41,
        locationLon: 121.18,
        eventType: { category: "law-enforcement-and-apprehensions", display: "Blast Fishing" },
      },
      {
        id: "e2",
        title: "Blast Fishing B",
        locationLat: null, // null coord — must be excluded from points
        locationLon: null,
        eventType: { category: "law-enforcement-and-apprehensions", display: "Blast Fishing" },
      },
      {
        id: "e3",
        title: "Vessel Sighting",
        locationLat: 13.42,
        locationLon: 121.19,
        eventType: { category: "monitoring_patrolling_and_surveillance", display: "Vessel Sighting" },
      },
      {
        // Serious event (compressor fishing) — must appear in highPriority
        id: "e4",
        title: "Compressor Fishing",
        locationLat: 13.43,
        locationLon: 121.20,
        eventType: { category: "law-enforcement-and-apprehensions", display: "Compressor Fishing" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventBreakdownWithCoords({ municipalityId: "muni-1" });

    // Count parity: 2 Blast Fishing, 1 Compressor Fishing (LE bucket)
    const blastType = result.lawEnforcement.find((t) => t.type === "Blast Fishing");
    expect(blastType?.count).toBe(2);
    // Only e1 has non-null coords
    expect(blastType?.points).toHaveLength(1);
    expect(blastType?.points[0]).toMatchObject({ id: "e1", lat: 13.41, lon: 121.18 });

    const compressor = result.lawEnforcement.find((t) => t.type === "Compressor Fishing");
    expect(compressor?.count).toBe(1);
    expect(compressor?.points).toHaveLength(1);

    // Monitoring bucket
    expect(result.monitoring).toHaveLength(1);
    expect(result.monitoring[0]).toMatchObject({ type: "Vessel Sighting", count: 1 });
    expect(result.monitoring[0]?.points).toHaveLength(1);
    expect(result.monitoring[0]?.points[0]).toMatchObject({ id: "e3" });

    // High priority: e4 is "Compressor Fishing" → matches "compressor" pattern
    expect(result.highPriority.total).toBe(1);
    expect(result.highPriority.points).toHaveLength(1);
    expect(result.highPriority.points[0]).toMatchObject({ id: "e4", lat: 13.43, lon: 121.20 });

    // Tenant scoping
    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: TENANT_ID, municipalityId: "muni-1" });
    expect(where).toHaveProperty("NOT.eventType.display.contains", "skylight");
  });

  it("excludes cross-tenant events via eventWhere tenantId scoping", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.eventBreakdownWithCoords({});

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("high-priority total is zero when no events match serious patterns", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: "e1",
        title: "Vessel Sighting",
        locationLat: 13.41,
        locationLon: 121.18,
        eventType: { category: "monitoring_patrolling_and_surveillance", display: "Vessel Sighting" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventBreakdownWithCoords({});

    expect(result.highPriority.total).toBe(0);
    expect(result.highPriority.points).toEqual([]);
  });
});

describe("reportMap.allEventPointsInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns total = rows.length and points with only non-null coords, tenant-scoped", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: "e1", title: "Event A", locationLat: 13.41, locationLon: 121.18 },
      { id: "e2", title: null, locationLat: null, locationLon: null }, // excluded from points
      { id: "e3", title: "Event C", locationLat: 13.43, locationLon: 121.20 },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.allEventPointsInRange({
      from: new Date("2026-06-01"),
      to: new Date("2026-06-27"),
      municipalityId: "muni-1",
    });

    expect(result.total).toBe(3); // rows.length (includes null-coord row)
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ id: "e1", lat: 13.41, lon: 121.18 });
    expect(result.points[1]).toMatchObject({ id: "e3", lat: 13.43, lon: 121.20 });

    const findManyWhere = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(findManyWhere).toMatchObject({
      tenantId: TENANT_ID,
      reportedAt: { gte: new Date("2026-06-01"), lte: new Date("2026-06-27") },
      municipalityId: "muni-1",
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  it("excludes cross-tenant events via tenantId", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("tenant-xyz"));
    await caller.allEventPointsInRange({});

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: "tenant-xyz" });
  });
});

describe("reportMap.patrolTrackPointsInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleGeojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [121.18, 13.41],
            [121.19, 13.42],
            [121.20, 13.43],
          ],
        },
      },
    ],
  };

  it("returns patrol track polylines tenant-scoped, excludes tracks with < 2 points", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: sampleGeojson,
        patrol: { id: "p1", title: "Patrol Alpha", serialNumber: "PN-001" },
      },
      {
        // empty geojson — < 2 points, must be filtered out
        trackGeojson: { type: "FeatureCollection", features: [] },
        patrol: { id: "p2", title: "Patrol Beta", serialNumber: "PN-002" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTrackPointsInRange({
      from: new Date("2026-06-01"),
      to: new Date("2026-06-27"),
      municipalityId: "muni-1",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      patrolId: "p1",
      label: "Patrol Alpha",
    });
    expect(result[0]?.path).toHaveLength(3);
    expect(result[0]?.path[0]).toEqual({ lat: 13.41, lon: 121.18 });
    expect(result[0]?.path[2]).toEqual({ lat: 13.43, lon: 121.20 });

    const trackWhere = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0]?.where;
    expect(trackWhere).toMatchObject({
      tenantId: TENANT_ID,
      patrol: {
        tenantId: TENANT_ID,
        isDeleted: false,
        isTestPatrol: false,
        startTime: { gte: new Date("2026-06-01"), lte: new Date("2026-06-27") },
        municipalityId: "muni-1",
      },
    });
  });

  it("uses serialNumber as label when title is null", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: sampleGeojson,
        patrol: { id: "p1", title: null, serialNumber: "PN-007" },
      },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.patrolTrackPointsInRange({});

    expect(result[0]?.label).toBe("PN-007");
  });

  it("patrol tracks are scoped to the authenticated tenant", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("tenant-xyz"));
    await caller.patrolTrackPointsInRange({});

    const where = vi.mocked(prisma.patrolTrack.findMany).mock.calls[0]?.[0]?.where as any;
    expect(where).toMatchObject({ tenantId: "tenant-xyz" });
    expect(where?.patrol).toMatchObject({ tenantId: "tenant-xyz" });
  });
});
