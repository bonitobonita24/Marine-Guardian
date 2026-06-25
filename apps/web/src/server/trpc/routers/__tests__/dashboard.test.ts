// Issue B fix (2026-06-23): dashboard.recentEvents, eventBreakdown, and
// lastIncident must exclude Skylight events. Skylight events arrive from
// EarthRanger with eventType.category = "analyzer_event"; the only reliable
// Skylight marker is eventType.display ("Skylight Entry Alert", etc.), so the
// WHERE clause filters case-insensitively on display, NOT category.
// Skylight is a maritime satellite AIS/radar monitoring provider; its events
// are automated vessel-detection records, not human-reported incidents.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    patrol: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    accompanyingRanger: {
      findMany: vi.fn(),
    },
    alertHistory: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { dashboardRouter } from "../dashboard";

const createCaller = createCallerFactory(dashboardRouter);

const TENANT_ID = "tenant-xyz";

function makeCtx() {
  return {
    session: {
      user: {
        id: "user-1",
        tenantId: TENANT_ID,
        roles: ["ranger" as const],
        email: "ranger@mg.test",
        name: "Ranger",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const mockPrisma = prisma as unknown as {
  event: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  patrol: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  accompanyingRanger: { findMany: ReturnType<typeof vi.fn> };
  alertHistory: { count: ReturnType<typeof vi.fn> };
};

describe("dashboard.recentEvents — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  it("excludes Skylight-category events from the WHERE clause", async () => {
    const caller = createCaller(makeCtx());
    await caller.recentEvents();

    expect(mockPrisma.event.findMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    // The where clause must contain NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } }
    // so display variants like "Skylight Entry Alert", "SKYLIGHT", "Skylight
    // Detection Alert" are all excluded (category is "analyzer_event", not "skylight").
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  it("returns events that passed the Skylight filter", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        title: "Illegal fishing",
        priority: 200,
        state: "active",
        reportedAt: new Date("2026-06-23T08:00:00Z"),
        eventType: {
          display: "Poaching",
          category: "law-enforcement-and-apprehensions",
        },
      },
    ]);

    const caller = createCaller(makeCtx());
    const result = await caller.recentEvents();

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Illegal fishing");
  });
});

describe("dashboard.eventBreakdown — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  it("excludes Skylight-category events from the breakdown query", async () => {
    const caller = createCaller(makeCtx());
    await caller.eventBreakdown();

    expect(mockPrisma.event.findMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  it("buckets by the real EarthRanger category values and excludes everything else", async () => {
    // The DB stores the real category strings below. Law Enforcement events go
    // into the lawEnforcement bucket, Monitoring events into the monitoring
    // bucket, and every other category is excluded from BOTH buckets.
    mockPrisma.event.findMany.mockResolvedValue([
      {
        eventType: {
          display: "Apprehension",
          category: "law-enforcement-and-apprehensions",
        },
      },
      {
        eventType: {
          display: "Apprehension",
          category: "law-enforcement-and-apprehensions",
        },
      },
      {
        eventType: {
          display: "Patrol Sweep",
          category: "monitoring_patrolling_and_surveillance",
        },
      },
      // The following must NOT appear in either bucket.
      { eventType: { display: "Hidden Thing", category: "hidden" } },
      { eventType: { display: "Fire", category: "emergency" } },
      { eventType: { display: "Repair", category: "maintenance" } },
      { eventType: { display: "Vessel Ping", category: "analyzer_event" } },
      { eventType: { display: "Sighting", category: "observation" } },
      { eventType: { display: "Breach", category: "security" } },
      { eventType: { display: "Infraction", category: "violation" } },
      { eventType: { display: "No Category", category: null } },
    ]);

    const caller = createCaller(makeCtx());
    const result = await caller.eventBreakdown();

    expect(result.lawEnforcement).toEqual([{ type: "Apprehension", count: 2 }]);
    expect(result.monitoring).toEqual([{ type: "Patrol Sweep", count: 1 }]);
  });
});

describe("dashboard.lastIncident — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(null);
  });

  it("excludes Skylight-category events from lastIncident lookup", async () => {
    const caller = createCaller(makeCtx());
    await caller.lastIncident();

    expect(mockPrisma.event.findFirst).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findFirst.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      priority: { gte: 200 },
      NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
    });
  });
});

describe("dashboard — WAR ROOM date range (goal items 3-4, 2026-06-25)", () => {
  const FROM = new Date("2026-06-18T00:00:00Z");
  const TO = new Date("2026-06-25T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.patrol.count.mockResolvedValue(0);
    mockPrisma.patrol.findMany.mockResolvedValue([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.alertHistory.count.mockResolvedValue(0);
  });

  it("recentEvents scopes reportedAt to the supplied range", async () => {
    await createCaller(makeCtx()).recentEvents({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.event.findMany.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown };
    };
    expect(call.where.reportedAt).toEqual({ gte: FROM, lte: TO });
  });

  it("recentEvents omits reportedAt when no range supplied (backward compatible)", async () => {
    await createCaller(makeCtx()).recentEvents();
    const call = mockPrisma.event.findMany.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown };
    };
    expect(call.where.reportedAt).toBeUndefined();
  });

  it("eventBreakdown scopes reportedAt to the supplied range", async () => {
    await createCaller(makeCtx()).eventBreakdown({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.event.findMany.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown };
    };
    expect(call.where.reportedAt).toEqual({ gte: FROM, lte: TO });
  });

  it("lastIncident scopes reportedAt to the supplied range", async () => {
    await createCaller(makeCtx()).lastIncident({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.event.findFirst.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown };
    };
    expect(call.where.reportedAt).toEqual({ gte: FROM, lte: TO });
  });

  it("activePatrols scopes startTime to the supplied range", async () => {
    await createCaller(makeCtx()).activePatrols({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as {
      where: { startTime?: unknown };
    };
    expect(call.where.startTime).toEqual({ gte: FROM, lte: TO });
  });

  it("alertStats uses the supplied range for firedAt", async () => {
    await createCaller(makeCtx()).alertStats({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.alertHistory.count.mock.calls[0]?.[0] as {
      where: { firedAt?: unknown };
    };
    expect(call.where.firedAt).toEqual({ gte: FROM, lte: TO });
  });

  it("alertStats defaults to a 24h window when no range supplied", async () => {
    await createCaller(makeCtx()).alertStats();
    const call = mockPrisma.alertHistory.count.mock.calls[0]?.[0] as {
      where: { firedAt?: { gte?: Date; lte?: Date } };
    };
    expect(call.where.firedAt?.gte).toBeInstanceOf(Date);
    expect(call.where.firedAt?.lte).toBeUndefined();
  });

  it("kpis scopes the activeEvents count to the supplied range", async () => {
    await createCaller(makeCtx()).kpis({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.event.count.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown; state?: unknown };
    };
    expect(call.where.state).toEqual({ not: "resolved" });
    expect(call.where.reportedAt).toEqual({ gte: FROM, lte: TO });
  });
});
