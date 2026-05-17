import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    knownRanger: { findFirst: vi.fn() },
    accompanyingRanger: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
    patrolSegment: { findMany: vi.fn() },
    eventType: { findMany: vi.fn() },
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
import { rangerRouter } from "../ranger";

const TENANT_ID = "tenant-123";
const USER_ID = "user-456";
const RANGER_ID = "ranger-789";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles: ["ranger" as const],
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

const createCaller = createCallerFactory(rangerRouter);

const mockRanger = {
  id: RANGER_ID,
  tenantId: TENANT_ID,
  name: "Ranger Alice",
  source: "manual_entry" as const,
  erSubjectId: "er-subject-1",
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

function resetAllPrismaMocks() {
  vi.mocked(prisma.knownRanger.findFirst).mockReset();
  vi.mocked(prisma.accompanyingRanger.findMany).mockReset();
  vi.mocked(prisma.event.findMany).mockReset();
  vi.mocked(prisma.patrol.findMany).mockReset();
  vi.mocked(prisma.patrolSegment.findMany).mockReset();
  vi.mocked(prisma.eventType.findMany).mockReset();

  // safe defaults — empty
  vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrolSegment.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.eventType.findMany).mockResolvedValue([] as never);
}

describe("rangerRouter.getById", () => {
  beforeEach(() => {
    resetAllPrismaMocks();
  });

  it("returns full profile + zeroed stats for ranger with no activity", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.profile).toEqual({
      id: RANGER_ID,
      name: "Ranger Alice",
      source: "manual_entry",
      erSubjectId: "er-subject-1",
      isActive: true,
      createdAt: new Date("2024-01-01"),
    });
    expect(result.eventStats).toEqual({
      reportedCount: 0,
      accompaniedCount: 0,
      totalCredit: 0,
      categoryBreakdown: [],
    });
    expect(result.patrolStats).toEqual({
      foot: { count: 0, km: 0, hours: 0 },
      sea: { count: 0, km: 0, hours: 0 },
    });
    expect(result.recentActivity).toEqual([]);
  });

  it("throws NOT_FOUND when ranger does not exist", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.getById({ id: "missing" })).rejects.toThrow(
      new TRPCError({ code: "NOT_FOUND", message: "Ranger not found." }),
    );
  });

  it("throws NOT_FOUND when ranger belongs to a different tenant (isolation)", async () => {
    // findFirst returns null because tenantId filter excludes it
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx("other-tenant"));
    await expect(caller.getById({ id: RANGER_ID })).rejects.toThrow(
      new TRPCError({ code: "NOT_FOUND", message: "Ranger not found." }),
    );
    // and confirm the query was tenant-scoped
    const call = vi.mocked(prisma.knownRanger.findFirst).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: "other-tenant" });
  });

  it("computes reportedCount + accompaniedCount + totalCredit", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "event", entityId: "ev-acc-1", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date("2024-03-10") },
      { entityType: "event", entityId: "ev-acc-2", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date("2024-03-11") },
    ] as never);
    vi.mocked(prisma.event.findMany)
      // first call: reported
      .mockResolvedValueOnce([
        { id: "ev-rep-1", eventTypeId: "et-1", title: "Rep 1", reportedAt: new Date("2024-03-01") },
        { id: "ev-rep-2", eventTypeId: "et-1", title: "Rep 2", reportedAt: new Date("2024-03-02") },
        { id: "ev-rep-3", eventTypeId: null,   title: "Rep 3", reportedAt: new Date("2024-03-03") },
      ] as never)
      // second call: accompanied (id IN [...])
      .mockResolvedValueOnce([
        { id: "ev-acc-1", eventTypeId: "et-1", title: "Acc 1", reportedAt: new Date("2024-03-10") },
        { id: "ev-acc-2", eventTypeId: "et-2", title: "Acc 2", reportedAt: new Date("2024-03-11") },
      ] as never);
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([
      { id: "et-1", category: "Wildlife" },
      { id: "et-2", category: "Fishing Violation" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.eventStats.reportedCount).toBe(3);
    expect(result.eventStats.accompaniedCount).toBe(2);
    expect(result.eventStats.totalCredit).toBe(5);
  });

  it("splits categoryBreakdown into reported vs accompanied per category", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "event", entityId: "ev-acc-1", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.event.findMany)
      .mockResolvedValueOnce([
        { id: "ev-rep-1", eventTypeId: "et-1", title: "R1", reportedAt: new Date("2024-01-01") },
        { id: "ev-rep-2", eventTypeId: "et-1", title: "R2", reportedAt: new Date("2024-01-02") },
      ] as never)
      .mockResolvedValueOnce([
        { id: "ev-acc-1", eventTypeId: "et-1", title: "A1", reportedAt: new Date("2024-01-03") },
      ] as never);
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([
      { id: "et-1", category: "Wildlife" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.eventStats.categoryBreakdown).toContainEqual({
      category: "Wildlife",
      reported: 2,
      accompanied: 1,
      total: 3,
    });
  });

  it("buckets events with null category under 'Uncategorized'", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.event.findMany)
      .mockResolvedValueOnce([
        { id: "ev-r1", eventTypeId: "et-nocat", title: "X", reportedAt: new Date("2024-01-01") },
        { id: "ev-r2", eventTypeId: null, title: "Y", reportedAt: new Date("2024-01-02") },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.eventType.findMany).mockResolvedValue([
      { id: "et-nocat", category: null },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.eventStats.categoryBreakdown).toContainEqual({
      category: "Uncategorized",
      reported: 2,
      accompanied: 0,
      total: 2,
    });
  });

  it("matches reportedByName case-insensitively", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);

    const caller = createCaller(makeCtx());
    await caller.getById({ id: RANGER_ID });

    // first event.findMany call is for reported events — verify the query uses insensitive equals
    const firstCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(firstCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      reportedByName: { equals: "Ranger Alice", mode: "insensitive" },
    });
  });

  it("computes foot patrol KPIs: count, km, hours", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "patrol", entityId: "p-foot-1", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
      { entityType: "patrol", entityId: "p-foot-2", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "p-foot-1", title: "P1", patrolType: "foot", startTime: new Date("2024-02-01"), totalDistanceKm: 4.5, totalHours: 2 },
      { id: "p-foot-2", title: "P2", patrolType: "foot", startTime: new Date("2024-02-02"), totalDistanceKm: 6, totalHours: 3 },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.patrolStats.foot).toEqual({ count: 2, km: 10.5, hours: 5 });
    expect(result.patrolStats.sea).toEqual({ count: 0, km: 0, hours: 0 });
  });

  it("computes seaborne patrol KPIs: count, km, hours", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "patrol", entityId: "p-sea-1", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "p-sea-1", title: "S1", patrolType: "seaborne", startTime: new Date("2024-02-05"), totalDistanceKm: 22.3, totalHours: 6.5 },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.patrolStats.sea).toEqual({ count: 1, km: 22.3, hours: 6.5 });
    expect(result.patrolStats.foot).toEqual({ count: 0, km: 0, hours: 0 });
  });

  it("de-dupes patrols: ranger as both leader AND accompanying counted once", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "patrol", entityId: "p-dup", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.patrolSegment.findMany).mockResolvedValue([
      { patrolId: "p-dup", leaderErId: "er-subject-1", actualStart: new Date("2024-02-10") },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "p-dup", title: "Dup", patrolType: "foot", startTime: new Date("2024-02-10"), totalDistanceKm: 5, totalHours: 2 },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    // count once
    expect(result.patrolStats.foot.count).toBe(1);
    expect(result.patrolStats.foot.km).toBe(5);
    // activity timeline: patrol-led wins over patrol-accompanied (de-dupe by entityId)
    const dupActivity = result.recentActivity.filter(
      (a) => a.entityId === "p-dup",
    );
    expect(dupActivity).toHaveLength(1);
    expect(dupActivity[0]?.type).toBe("patrol-led");
  });

  it("does not query patrolSegment when ranger.erSubjectId is null", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue({
      ...mockRanger,
      erSubjectId: null,
    });
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "patrol", entityId: "p-1", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "p-1", title: "P1", patrolType: "foot", startTime: new Date("2024-02-01"), totalDistanceKm: 3, totalHours: 1 },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    // patrolSegment.findMany NOT called
    expect(vi.mocked(prisma.patrolSegment.findMany)).not.toHaveBeenCalled();
    // patrol still counted via accompanying
    expect(result.patrolStats.foot.count).toBe(1);
    // no patrol-led in activity (only accompanied)
    expect(result.recentActivity.find((a) => a.type === "patrol-led")).toBeUndefined();
    expect(result.recentActivity.find((a) => a.type === "patrol-accompanied")?.entityId).toBe("p-1");
  });

  it("recentActivity includes all 4 types, sorted DESC by timestamp, capped at 50", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { entityType: "event", entityId: "ev-acc", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
      { entityType: "patrol", entityId: "p-acc", knownRangerId: RANGER_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.event.findMany)
      .mockResolvedValueOnce([
        { id: "ev-rep", eventTypeId: null, title: "Reported", reportedAt: new Date("2024-04-01") },
      ] as never)
      .mockResolvedValueOnce([
        { id: "ev-acc", eventTypeId: null, title: "Accompanied", reportedAt: new Date("2024-04-02") },
      ] as never);
    vi.mocked(prisma.patrolSegment.findMany).mockResolvedValue([
      { patrolId: "p-led", leaderErId: "er-subject-1", actualStart: new Date("2024-04-03") },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "p-led", title: "Led", patrolType: "foot", startTime: new Date("2024-04-03"), totalDistanceKm: 1, totalHours: 1 },
      { id: "p-acc", title: "PAcc", patrolType: "seaborne", startTime: new Date("2024-04-04"), totalDistanceKm: 2, totalHours: 2 },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    const types = result.recentActivity.map((a) => a.type);
    expect(types).toContain("event-reported");
    expect(types).toContain("event-accompanied");
    expect(types).toContain("patrol-led");
    expect(types).toContain("patrol-accompanied");

    // sorted DESC: 2024-04-04 (p-acc) is newest
    expect(result.recentActivity[0]?.entityId).toBe("p-acc");

    // sort verification end-to-end
    const timestamps = result.recentActivity.map((a) => a.timestamp.getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it("recentActivity caps at 50 items", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(mockRanger);
    const manyReported = Array.from({ length: 80 }, (_, i) => ({
      id: `ev-${String(i)}`,
      eventTypeId: null,
      title: `E${String(i)}`,
      reportedAt: new Date(2024, 0, i + 1),
    }));
    vi.mocked(prisma.event.findMany)
      .mockResolvedValueOnce(manyReported as never)
      .mockResolvedValueOnce([] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: RANGER_ID });

    expect(result.recentActivity.length).toBeLessThanOrEqual(50);
  });
});
