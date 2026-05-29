import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    patrol: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueuePatrolTrackMaterialize: vi.fn().mockResolvedValue("job-id"),
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
import { enqueuePatrolTrackMaterialize } from "@marine-guardian/jobs";
import { createCallerFactory } from "../../trpc";
import { patrolRouter } from "../patrol";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(patrolRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["ranger"],
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles,
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("patrol.list — Sub-batch 4.1e area attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns patrols with area attribution fields surfacing as null when un-derived", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "pat-1",
        tenantId: TENANT_ID,
        erPatrolId: "er-1",
        title: "Morning patrol",
        patrolType: "foot",
        state: "open",
        areaName: null,
        areaBoundaryId: null,
        areaDerivedAt: null,
        segments: [],
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "pat-1",
      areaName: null,
      areaBoundaryId: null,
      areaDerivedAt: null,
    });
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });

  it("surfaces populated area attribution fields when the derivation job has run", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "pat-2",
        tenantId: TENANT_ID,
        erPatrolId: "er-2",
        title: "Reef sweep",
        patrolType: "seaborne",
        state: "done",
        areaName: "Solan Bajo Reef",
        areaBoundaryId: "cab123boundary456789abcd",
        areaDerivedAt: new Date("2026-05-20T08:00:00Z"),
        segments: [],
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]).toMatchObject({
      areaName: "Solan Bajo Reef",
      areaBoundaryId: "cab123boundary456789abcd",
    });
    expect(result.items[0]?.areaDerivedAt).toBeInstanceOf(Date);
  });
});

describe("patrol.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the patrol with area attribution fields for the matching tenant", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      tenantId: TENANT_ID,
      erPatrolId: "er-1",
      title: "Morning patrol",
      patrolType: "foot",
      state: "open",
      areaName: "Area 12",
      areaBoundaryId: null,
      areaDerivedAt: null,
      segments: [],
      accompanyingRangers: [],
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "pat-1" });

    expect(result).toMatchObject({
      id: "pat-1",
      areaName: "Area 12",
      areaBoundaryId: null,
    });
    expect(vi.mocked(prisma.patrol.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "pat-1", tenantId: TENANT_ID }) })
    );
  });

  it("returns null when the patrol is in a different tenant (cross-tenant isolation)", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx("other-tenant"));
    const result = await caller.getById({ id: "pat-1" });

    expect(result).toBeNull();
    const call = vi.mocked(prisma.patrol.findFirst).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.getById({ id: "pat-1" })).rejects.toThrow(TRPCError);
  });
});

describe("patrol.stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts grouped by state, scoped to the tenant", async () => {
    vi.mocked(prisma.patrol.count)
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(4) // open
      .mockResolvedValueOnce(5) // done
      .mockResolvedValueOnce(1); // cancelled

    const caller = createCaller(makeCtx());
    const result = await caller.stats();

    expect(result).toEqual({ total: 10, open: 4, done: 5, cancelled: 1 });
    expect(vi.mocked(prisma.patrol.count)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(prisma.patrol.count)).toHaveBeenNthCalledWith(
      1,
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });
});

// 5.2c — Admin manual patrol track rebuild. Re-fetches and materializes GPS
// tracks from EarthRanger for every state==='open' Patrol in a tenant by
// enqueueing one patrol-track-materialize job per active patrol. super_admin
// may target any tenant (PLATFORM:PATROL_TRACK_REBUILD action); site_admin
// may only rebuild own tenant (PATROL_TRACK_REBUILD action). Every
// invocation writes one AuditLog row. Closed patrols (state==='done' or
// 'cancelled') are skipped — their tracks are immutable once the patrol
// closed and re-fetching wastes ER API quota.
describe("patrol.rebuildTracks (5.2c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("rejects non-admin roles", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.rebuildTracks({})).rejects.toThrow(TRPCError);
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("rejects field_coordinator (admin-only mutation)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.rebuildTracks({})).rejects.toThrow(TRPCError);
  });

  it("site_admin rebuilds own tenant — only state='open' patrols enqueued, action PATROL_TRACK_REBUILD, AuditLog written", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "ptrl-1" },
      { id: "ptrl-2" },
      { id: "ptrl-3" },
    ] as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.rebuildTracks({});

    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.enqueued).toBe(3);
    expect(result.action).toBe("PATROL_TRACK_REBUILD");
    // The query MUST scope to state='open' + tenantId — closed patrols skipped.
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, state: "open" },
      select: { id: true },
    });
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).toHaveBeenCalledWith({
      patrolId: "ptrl-1",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).toHaveBeenCalledWith({
      patrolId: "ptrl-2",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: {
        action: "PATROL_TRACK_REBUILD",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "Patrol",
        entityId: TENANT_ID,
        changesJson: { enqueued: 3, scope: "tenant" },
      },
    });
  });

  it("site_admin attempting cross-tenant rebuild is FORBIDDEN (no fan-out, no AuditLog)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(
      caller.rebuildTracks({ tenantId: "other-tenant" })
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("super_admin rebuilding own tenant — action PATROL_TRACK_REBUILD (not PLATFORM:)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "ptrl-1" },
    ] as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["super_admin"]));
    const result = await caller.rebuildTracks({ tenantId: TENANT_ID });

    expect(result.action).toBe("PATROL_TRACK_REBUILD");
    expect(result.tenantId).toBe(TENANT_ID);
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: {
        action: "PATROL_TRACK_REBUILD",
        userId: USER_ID,
        tenantId: TENANT_ID,
        entityType: "Patrol",
        entityId: TENANT_ID,
        changesJson: { enqueued: 1, scope: "tenant" },
      },
    });
  });

  it("super_admin rebuilding cross-tenant — action PLATFORM:PATROL_TRACK_REBUILD, fan-out targets specified tenant", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "ptrl-x" },
      { id: "ptrl-y" },
    ] as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["super_admin"]));
    const result = await caller.rebuildTracks({ tenantId: "tenant-other" });

    expect(result.tenantId).toBe("tenant-other");
    expect(result.enqueued).toBe(2);
    expect(result.action).toBe("PLATFORM:PATROL_TRACK_REBUILD");
    // Query targets the SPECIFIED tenant, not the caller's tenant.
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith({
      where: { tenantId: "tenant-other", state: "open" },
      select: { id: true },
    });
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).toHaveBeenCalledWith({
      patrolId: "ptrl-x",
      tenantId: "tenant-other",
      userId: USER_ID,
    });
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith({
      data: {
        action: "PLATFORM:PATROL_TRACK_REBUILD",
        userId: USER_ID,
        tenantId: "tenant-other",
        entityType: "Patrol",
        entityId: "tenant-other",
        changesJson: { enqueued: 2, scope: "platform" },
      },
    });
  });

  it("rebuild with no open patrols still writes AuditLog (enqueued=0) — empty tenant is a valid no-op", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.rebuildTracks({});

    expect(result.enqueued).toBe(0);
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
  });
});
