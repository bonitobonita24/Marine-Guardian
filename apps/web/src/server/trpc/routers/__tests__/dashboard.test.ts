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
    knownRanger: {
      findMany: vi.fn(),
    },
    patrolSegment: {
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
        tenantSlug: "",
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
  knownRanger: { findMany: ReturnType<typeof vi.fn> };
  patrolSegment: { findMany: ReturnType<typeof vi.fn> };
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
    mockPrisma.patrolSegment.findMany.mockResolvedValue([]);
    mockPrisma.knownRanger.findMany.mockResolvedValue([]);
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

  it("activePatrols returns currently-open patrols and no longer scopes by startTime range", async () => {
    // 2026-07-12: the Recent Patrols panel must match the ACTIVE PATROLS KPI
    // (open patrols), not filter by startTime ∈ window — long-running/seed open
    // patrols started outside the window made it read "No active patrols".
    await createCaller(makeCtx()).activePatrols({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as {
      where: { startTime?: unknown; state?: unknown };
    };
    expect(call.where.state).toBe("open");
    expect(call.where.startTime).toBeUndefined();
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

  it("alertStats excludes Skylight ('Marine Entry') alerts from the KPI (owner 2026-07-12)", async () => {
    await createCaller(makeCtx()).alertStats();
    const call = mockPrisma.alertHistory.count.mock.calls[0]?.[0] as {
      where: { NOT?: unknown };
    };
    expect(call.where.NOT).toEqual({
      event: {
        eventType: { display: { contains: "skylight", mode: "insensitive" } },
      },
    });
  });

  it("kpis scopes the activeEvents count to the supplied range and open-patrol events", async () => {
    await createCaller(makeCtx()).kpis({ dateFrom: FROM, dateTo: TO });
    const call = mockPrisma.event.count.mock.calls[0]?.[0] as {
      where: { reportedAt?: unknown; state?: unknown; patrol?: unknown };
    };
    // count matches its drilldown list: state=active + linked to an open patrol
    expect(call.where.state).toEqual("active");
    expect(call.where.patrol).toEqual({ is: { state: "open", isDeleted: false } });
    expect(call.where.reportedAt).toEqual({ gte: FROM, lte: TO });
  });
});

// ── WAR ROOM KPI sparklines (Command Center redesign, sub-batch B) ──
describe("dashboard.kpiTrends — daily-bucketed sparkline series", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
    mockPrisma.patrol.findMany.mockResolvedValue([]);
  });

  it("buckets events and patrols per UTC day across the range, zero-filled", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      { reportedAt: new Date("2026-06-01T12:00:00Z") },
      { reportedAt: new Date("2026-06-01T18:00:00Z") },
      { reportedAt: new Date("2026-06-03T09:00:00Z") },
    ]);
    mockPrisma.patrol.findMany.mockResolvedValue([
      { startTime: new Date("2026-06-02T08:00:00Z") },
      { startTime: null },
    ]);

    const result = await createCaller(makeCtx()).kpiTrends({
      dateFrom: new Date("2026-06-01T00:00:00Z"),
      dateTo: new Date("2026-06-03T23:59:59Z"),
    });

    expect(result.events).toEqual([
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-02", count: 0 },
      { date: "2026-06-03", count: 1 },
    ]);
    expect(result.patrols).toEqual([
      { date: "2026-06-01", count: 0 },
      { date: "2026-06-02", count: 1 },
      { date: "2026-06-03", count: 0 },
    ]);
  });

  it("defaults to a last-7-days window (8 inclusive day buckets) and scopes to tenant", async () => {
    const result = await createCaller(makeCtx()).kpiTrends();
    expect(result.events).toHaveLength(8);
    expect(result.patrols).toHaveLength(8);

    const eventWhere = mockPrisma.event.findMany.mock.calls[0]?.[0] as {
      where: { tenantId?: unknown };
    };
    const patrolWhere = mockPrisma.patrol.findMany.mock.calls[0]?.[0] as {
      where: { tenantId?: unknown };
    };
    expect(eventWhere.where.tenantId).toBe(TENANT_ID);
    expect(patrolWhere.where.tenantId).toBe(TENANT_ID);
  });
});

// ── WAR ROOM ranger roster (Command Center redesign, sub-batch B) ──
describe("dashboard.rangerRoster — per-ranger status derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.knownRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrol.findMany.mockResolvedValue([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([]);
  });

  it("classifies rangers as on_patrol / active / idle with a summary", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "r1", name: "Alpha" },
      { id: "r2", name: "Bravo" },
      { id: "r3", name: "Charlie" },
    ]);
    // patrol.findMany is called twice: first openPatrols, then rangePatrols.
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open" }])
      .mockResolvedValueOnce([
        { id: "p-open", startTime: new Date("2026-06-02T08:00:00Z") },
        { id: "p-range", startTime: new Date("2026-06-04T08:00:00Z") },
      ]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([
      { knownRangerId: "r1", entityId: "p-open" },
      { knownRangerId: "r2", entityId: "p-range" },
    ]);

    const result = await createCaller(makeCtx()).rangerRoster();

    const byId = Object.fromEntries(result.rangers.map((r) => [r.id, r]));
    expect(byId.r1?.status).toBe("on_patrol");
    expect(byId.r2?.status).toBe("active");
    expect(byId.r2?.lastSeenAt).toEqual(new Date("2026-06-04T08:00:00Z"));
    expect(byId.r3?.status).toBe("idle");
    expect(byId.r3?.lastSeenAt).toBeNull();
    // 2026-07-06 fix: summary.active is a "currently on duty" rollup, so it
    // includes on_patrol rangers too (r1) in addition to range-active (r2) —
    // per-row status labels stay distinct (on_patrol vs active vs idle), only
    // the header count widens. Before the fix this was `active: 1` (r2 only),
    // which read as the confusing "1 on patrol · 0 active" the owner reported
    // even though r1 plainly IS on duty.
    expect(result.summary).toEqual({
      total: 3,
      onPatrol: 1,
      active: 2,
      idle: 1,
    });
  });

  it("scopes the known-ranger query to the tenant", async () => {
    await createCaller(makeCtx()).rangerRoster();
    const call = mockPrisma.knownRanger.findMany.mock.calls[0]?.[0] as {
      where: { tenantId?: unknown; isActive?: unknown };
    };
    expect(call.where.tenantId).toBe(TENANT_ID);
    expect(call.where.isActive).toBe(true);
  });

  it("counts on_patrol rangers within the 'active' (on-duty) summary rollup even with no range-active patrols", async () => {
    // Regression for the 2026-07-06 owner report: a ranger on a currently
    // OPEN patrol (no other in-range patrol) must still count toward
    // summary.active, not just summary.onPatrol.
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "r1", name: "Solo Ranger" },
    ]);
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open" }]) // openPatrols
      .mockResolvedValueOnce([]); // rangePatrols — none match the range window
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([
      { knownRangerId: "r1", entityId: "p-open" },
    ]);

    const result = await createCaller(makeCtx()).rangerRoster();

    expect(result.rangers[0]?.status).toBe("on_patrol");
    expect(result.summary).toEqual({ total: 1, onPatrol: 1, active: 1, idle: 0 });
  });

  // CC-5 fix (2026-07-06): all 17 open patrols have ZERO AccompanyingRanger
  // rows, but 2 of them have a patrol_segments leader that matches a
  // KnownRanger. Those rangers must count as on_patrol even with no
  // AccompanyingRanger link.
  it("counts a ranger as on_patrol when they lead an open patrol's segment, matched by erSubjectId, with no AccompanyingRanger row", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "r1", name: "Alpha", erSubjectId: "er-alpha" },
    ]);
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open" }]) // openPatrols
      .mockResolvedValueOnce([]); // rangePatrols
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]); // none
    mockPrisma.patrolSegment.findMany.mockResolvedValue([
      { leaderName: "Someone Else", leaderErId: "er-alpha" },
    ]);

    const result = await createCaller(makeCtx()).rangerRoster();

    expect(result.rangers[0]?.status).toBe("on_patrol");
    expect(result.summary).toEqual({ total: 1, onPatrol: 1, active: 1, idle: 0 });
  });

  it("falls back to a trimmed, case-insensitive name match when leaderErId is absent or unmatched", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "r1", name: "Bravo Ranger", erSubjectId: null },
    ]);
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open" }])
      .mockResolvedValueOnce([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([
      { leaderName: "  bravo ranger  ", leaderErId: null },
    ]);

    const result = await createCaller(makeCtx()).rangerRoster();

    expect(result.rangers[0]?.status).toBe("on_patrol");
  });

  it("does not mark a ranger on_patrol when no AccompanyingRanger link and no matching segment leader", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "r1", name: "Charlie", erSubjectId: "er-charlie" },
    ]);
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open" }])
      .mockResolvedValueOnce([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([
      { leaderName: "Nobody Matching", leaderErId: "er-other" },
    ]);

    const result = await createCaller(makeCtx()).rangerRoster();

    expect(result.rangers[0]?.status).toBe("idle");
  });

  it("scopes the patrolSegment query to the open patrol ids", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrol.findMany
      .mockResolvedValueOnce([{ id: "p-open-1" }, { id: "p-open-2" }])
      .mockResolvedValueOnce([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([]);

    await createCaller(makeCtx()).rangerRoster();

    const call = mockPrisma.patrolSegment.findMany.mock.calls[0]?.[0] as {
      where: { patrolId?: { in?: string[] } };
    };
    expect(call.where.patrolId?.in?.sort()).toEqual(["p-open-1", "p-open-2"]);
  });

  it("skips the patrolSegment query entirely when there are no open patrols", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrol.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);

    await createCaller(makeCtx()).rangerRoster();

    expect(mockPrisma.patrolSegment.findMany).not.toHaveBeenCalled();
  });
});

// ── kpis.activePatrols — track-independence lock (2026-07-06 owner report:
// "Active Patrols: 0" with a real open patrol, no PatrolTrack because the ER
// track-fetch token was expired) ──
describe("dashboard.kpis.activePatrols — counts open patrols without requiring a PatrolTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrol.findMany.mockResolvedValue([]);
  });

  it("counts an open, non-deleted patrol even when it has zero PatrolTrack rows", async () => {
    // The kpis procedure never touches the PatrolTrack table for
    // activePatrols — patrol.count's WHERE clause is state/isDeleted only.
    mockPrisma.patrol.count.mockResolvedValue(1);

    const result = await createCaller(makeCtx()).kpis();

    expect(result.activePatrols).toBe(1);
    const call = mockPrisma.patrol.count.mock.calls.find(
      (c) => (c[0] as { where: { state?: unknown } }).where.state === "open",
    )?.[0] as { where: Record<string, unknown> } | undefined;
    expect(call?.where).toEqual({
      tenantId: TENANT_ID,
      state: "open",
      isDeleted: false,
    });
  });
});

// ── kpis.rangersOnDuty — count parity with the Ranger Roster (2026-07-12 owner
// report: tile read 0 while the roster showed many "on patrol", because open
// patrols recorded their main ranger only as a patrol_segments leader, with no
// AccompanyingRanger row). The KPI now unions segment leaders + accompanying. ──
describe("dashboard.kpis.rangersOnDuty — counts segment leaders AND accompanying rangers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.count.mockResolvedValue(0);
    mockPrisma.patrol.count.mockResolvedValue(1);
    mockPrisma.patrol.findMany.mockResolvedValue([{ id: "p1" }]);
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([]);
    mockPrisma.knownRanger.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([]);
  });

  it("counts a segment leader of an open patrol even with zero AccompanyingRanger rows", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "kr1", name: "Alpha", erSubjectId: "er-a" },
    ]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([
      { leaderName: "Alpha", leaderErId: "er-a" },
    ]);

    const result = await createCaller(makeCtx()).kpis();
    expect(result.rangersOnDuty).toBe(1);
  });

  it("unions accompanying rangers with segment leaders without double-counting the same known ranger", async () => {
    mockPrisma.knownRanger.findMany.mockResolvedValue([
      { id: "kr1", name: "Alpha", erSubjectId: "er-a" },
    ]);
    // kr1 is BOTH the accompanying ranger AND the segment leader → counted once;
    // a separate registered-user accompanying ranger adds one more → total 2.
    mockPrisma.accompanyingRanger.findMany.mockResolvedValue([
      { registeredUserId: null, knownRangerId: "kr1" },
      { registeredUserId: "u9", knownRangerId: null },
    ]);
    mockPrisma.patrolSegment.findMany.mockResolvedValue([
      { leaderName: "Alpha", leaderErId: "er-a" },
    ]);

    const result = await createCaller(makeCtx()).kpis();
    expect(result.rangersOnDuty).toBe(2);
  });
});
