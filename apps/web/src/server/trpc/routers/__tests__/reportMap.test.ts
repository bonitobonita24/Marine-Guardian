/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    patrol: {
      count: vi.fn(),
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

    const caller = createCaller(makeCtx());
    const result = await caller.eventsOverTime({
      from: new Date("2026-06-01T00:00:00"),
      to: new Date("2026-06-03T23:59:59"),
    });

    expect(result).toEqual([
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-02", count: 0 },
      { date: "2026-06-03", count: 1 },
    ]);
  });

  it("returns only days with events (ascending) when no range is given", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { reportedAt: new Date("2026-06-03T10:00:00") },
      { reportedAt: new Date("2026-06-01T10:00:00") },
      { reportedAt: null },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.eventsOverTime({});

    expect(result).toEqual([
      { date: "2026-06-01", count: 1 },
      { date: "2026-06-03", count: 1 },
    ]);
  });

  it("scopes to the authenticated tenant", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.eventsOverTime({});

    const where = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ tenantId: "other-tenant" });
  });
});
