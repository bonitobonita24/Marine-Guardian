import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  // Expose Prisma namespace with the JsonNull sentinel so route handlers can use it.
  Prisma: { JsonNull: "DbNull" },
  prisma: {
    patrol: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    patrolRevision: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    municipality: {
      findFirst: vi.fn(),
    },
    rolePermission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  // Faithful forwarder mirroring packages/db/src/helpers/audit.ts so audit-row
  // assertions land on the mocked prisma.auditLog.create.
  writeAuditLog: vi.fn(
    async (
      tx: { auditLog: { create: (args: unknown) => Promise<unknown> } },
      entry: {
        tenantId: string | null;
        userId: string;
        action: string;
        entityType: string;
        entityId: string;
        changesJson?: unknown;
        ipAddress?: string | null;
        severity?: string;
      },
    ) => {
      await tx.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ...(entry.changesJson != null
            ? { changesJson: entry.changesJson }
            : {}),
          ipAddress: entry.ipAddress ?? null,
          ...(entry.severity != null ? { severity: entry.severity } : {}),
        },
      });
    },
  ),
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueuePatrolTrackMaterialize: vi.fn().mockResolvedValue("job-id"),
  enqueueMunicipalityAssign: vi.fn().mockResolvedValue("job-id"),
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
import { enqueuePatrolTrackMaterialize, enqueueMunicipalityAssign } from "@marine-guardian/jobs";
import { createCallerFactory } from "../../trpc";
import { patrolRouter } from "../patrol";
import { HEURISTIC_METHODS } from "../../../attribution-filter";

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
  customRoleId: string | null = null,
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        customRoleId,
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

  it("excludes soft-deleted patrols from every stats tile (isDeleted: false on all counts)", async () => {
    vi.mocked(prisma.patrol.count)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);

    const caller = createCaller(makeCtx());
    await caller.stats();

    for (let i = 1; i <= 4; i++) {
      expect(vi.mocked(prisma.patrol.count)).toHaveBeenNthCalledWith(
        i,
        partial({ where: partial({ tenantId: TENANT_ID, isDeleted: false }) })
      );
    }
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

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
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
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
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

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_manager"]));
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

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_manager"]));
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
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    const result = await caller.rebuildTracks({});

    expect(result.enqueued).toBe(0);
    expect(vi.mocked(enqueuePatrolTrackMaterialize)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
  });
});

describe("patrol.list — v2 spec L119 isTestPatrol filter (default exclude)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default behavior — excludes test patrols (where isTestPatrol: false)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, isTestPatrol: false }) })
    );
  });

  it("includeTest=true — passes no isTestPatrol constraint (returns all patrols)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, includeTest: true });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).not.toHaveProperty("isTestPatrol");
    expect(call?.[0]?.where).toMatchObject({ tenantId: TENANT_ID });
  });
});

describe("patrol.list — Phase 7 soft-delete filter (default exclude)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default behavior — excludes soft-deleted patrols (where isDeleted: false)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, isDeleted: false }) })
    );
  });

  it("includeDeleted=true — passes no isDeleted constraint (surfaces deleted rows)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, includeDeleted: true });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).not.toHaveProperty("isDeleted");
    expect(call?.[0]?.where).toMatchObject({ tenantId: TENANT_ID });
  });
});

// Manual-attribution work queue — surfaces patrols whose geometry could not be
// attributed to a municipality (municipality_id IS NULL) so an officer can
// assign one by hand. Automatic attribution is a ONE-TIME cleanup, so this
// filter is the permanent entry point to that workflow.
//
// NOTE on query paths: unlike event.list — which has BOTH a Prisma path and a
// hand-written $queryRaw path taken whenever `search` is non-empty — patrol.list
// has exactly ONE path (prisma.patrol.findMany) and accepts no `search` input at
// all. There is therefore no second path to mirror this filter into. If a raw
// search path is ever added to patrol.list, this filter MUST be implemented
// there too or it will silently stop narrowing the moment someone searches.
describe("patrol.list — unattributedOnly filter (manual-attribution work queue)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default behavior — passes no municipalityId constraint (returns all patrols)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).not.toHaveProperty("municipalityId");
    expect(call?.[0]?.where).toMatchObject({ tenantId: TENANT_ID });
  });

  it("unattributedOnly=true — narrows to municipalityId: null", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, unattributedOnly: true });
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, municipalityId: null }) })
    );
  });

  it("unattributedOnly=false — explicitly passing false does not narrow", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, unattributedOnly: false });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).not.toHaveProperty("municipalityId");
  });

  it("composes with state + type + includeTest + includeDeleted (all ANDed)", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({
      limit: 50,
      unattributedOnly: true,
      state: "done",
      patrolType: "seaborne",
    });
    // Defaults (includeTest/includeDeleted false) must still apply alongside it.
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial({
          tenantId: TENANT_ID,
          municipalityId: null,
          state: "done",
          patrolType: "seaborne",
          isTestPatrol: false,
          isDeleted: false,
        }),
      })
    );
  });

  it("composes with includeTest/includeDeleted=true — narrows municipality but drops the other two constraints", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({
      limit: 50,
      unattributedOnly: true,
      includeTest: true,
      includeDeleted: true,
    });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).toMatchObject({
      tenantId: TENANT_ID,
      municipalityId: null,
    });
    expect(call?.[0]?.where).not.toHaveProperty("isTestPatrol");
    expect(call?.[0]?.where).not.toHaveProperty("isDeleted");
  });

  it("stays tenant-scoped — never leaks another tenant's unattributed patrols", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, unattributedOnly: true });
    const call = vi.mocked(prisma.patrol.findMany).mock.calls[0];
    expect(call?.[0]?.where).toMatchObject({ tenantId: TENANT_ID });
  });
});

// Phase 7 soft-delete — patrol.softDelete + patrol.restore (write path).
// adminProcedure (super_admin + site_admin) Option B hardening: findFirst
// tenant-scoped → NOT_FOUND (same message for missing vs cross-tenant) →
// BAD_REQUEST idempotence guard → update → writeAuditLog (before/after).
// NOTE: severity recorded as "warning" (deployed Severity enum has no "medium").
describe("patrol.softDelete (Phase 7 soft-delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("happy path — sets isDeleted/deletedAt, writes audit, returns id", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      isDeleted: false,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    const result = await caller.softDelete({ id: "pat-1" });

    expect(result).toEqual({ id: "pat-1" });
    expect(vi.mocked(prisma.patrol.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "pat-1", tenantId: TENANT_ID }) })
    );
    expect(vi.mocked(prisma.patrol.update)).toHaveBeenCalledWith(
      partial({ where: { id: "pat-1" }, data: partial({ isDeleted: true }) })
    );
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledTimes(1);
  });

  it("already-deleted — throws BAD_REQUEST, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      isDeleted: true,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(caller.softDelete({ id: "pat-1" })).rejects.toThrow(
      "Patrol already deleted."
    );
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("cross-tenant (findFirst null) — throws NOT_FOUND, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx("other-tenant", ["tenant_superadmin"]));
    await expect(caller.softDelete({ id: "pat-1" })).rejects.toThrow(
      "Patrol not found."
    );
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("rejects non-admin role (operator) before any DB read", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.softDelete({ id: "pat-1" })).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.patrol.findFirst)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
  });

  it("writes audit row with DELETE_PATROL action + before/after + warning severity", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      isDeleted: false,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_manager"]));
    await caller.softDelete({ id: "pat-1" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith(
      partial({
        data: partial({
          action: "DELETE_PATROL",
          entityType: "Patrol",
          entityId: "pat-1",
          severity: "warning",
          changesJson: partial({
            before: { isDeleted: false, deletedAt: null },
            // after.deletedAt is a runtime ISO string (new Date()) — match isDeleted only
            after: partial({ isDeleted: true }),
          }),
        }),
      })
    );
  });
});

describe("patrol.restore (Phase 7 soft-delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("happy path — clears isDeleted/deletedAt, writes RESTORE_PATROL audit, returns id", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      isDeleted: true,
      deletedAt: new Date("2026-06-01T00:00:00Z"),
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    const result = await caller.restore({ id: "pat-1" });

    expect(result).toEqual({ id: "pat-1" });
    expect(vi.mocked(prisma.patrol.update)).toHaveBeenCalledWith(
      partial({
        where: { id: "pat-1" },
        data: { isDeleted: false, deletedAt: null },
      })
    );
    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith(
      partial({
        data: partial({
          action: "RESTORE_PATROL",
          changesJson: {
            // before.deletedAt is the fixture's deterministic ISO string
            before: { isDeleted: true, deletedAt: "2026-06-01T00:00:00.000Z" },
            after: { isDeleted: false, deletedAt: null },
          },
        }),
      })
    );
  });

  it("not-deleted — throws BAD_REQUEST, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      isDeleted: false,
      deletedAt: null,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(caller.restore({ id: "pat-1" })).rejects.toThrow(
      "Patrol not deleted."
    );
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("cross-tenant (findFirst null) — throws NOT_FOUND, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx("other-tenant", ["tenant_superadmin"]));
    await expect(caller.restore({ id: "pat-1" })).rejects.toThrow(
      "Patrol not found."
    );
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });
});

// ── patrol.update (M2, q-ops-02 + q-ops-04) ───────────────────────────────

describe("patrol.update", () => {
  const existingPatrol = {
    id: "pat-1",
    tenantId: TENANT_ID,
    title: "Old Title",
    boatName: null,
    areaName: null,
  };

  const updatedPatrol = {
    ...existingPatrol,
    title: "New Title",
    segments: [],
    accompanyingRangers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(
      existingPatrol as never
    );
    vi.mocked(prisma.patrol.update).mockResolvedValue(
      updatedPatrol as never
    );
    vi.mocked(prisma.patrolRevision.createMany).mockResolvedValue({ count: 1 });
  });

  it("updates title and writes a PatrolRevision row", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "pat-1", title: "New Title" });

    expect(vi.mocked(prisma.patrol.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pat-1" },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ title: "New Title" }),
      })
    );

    expect(vi.mocked(prisma.patrolRevision.createMany)).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.arrayContaining([
        expect.objectContaining({
          tenantId: TENANT_ID,
          patrolId: "pat-1",
          fieldName: "title",
          beforeJson: "Old Title",
          afterJson: "New Title",
        }),
      ]),
    });

    expect(result).toBeDefined();
  });

  it("writes L5 audit log on update", async () => {
    const caller = createCaller(makeCtx());
    await caller.update({ id: "pat-1", title: "New Title" });

    expect(vi.mocked(prisma.auditLog.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          action: "UPDATE_PATROL",
          entityType: "Patrol",
          entityId: "pat-1",
        }),
      })
    );
  });

  it("does NOT call update or createMany when no fields are passed", async () => {
    const caller = createCaller(makeCtx());
    await caller.update({ id: "pat-1" });

    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.patrolRevision.createMany)).not.toHaveBeenCalled();
  });

  it("does NOT write revision when value is unchanged", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      ...existingPatrol,
      title: "Same Title",
    } as Awaited<ReturnType<typeof prisma.patrol.findFirst>>);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "pat-1", title: "Same Title" });

    expect(vi.mocked(prisma.patrolRevision.createMany)).not.toHaveBeenCalled();
  });

  it("is tenant-scoped — throws NOT_FOUND for cross-tenant id", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.update({ id: "pat-other", title: "X" })).rejects.toThrow(
      "Patrol not found."
    );
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.update({ id: "pat-1", title: "X" })).rejects.toThrow(
      TRPCError
    );
  });
});

// ── patrol.getRevisions (M2, q-ops-04) ────────────────────────────────────

describe("patrol.getRevisions", () => {
  const mockPatrol = {
    id: "pat-1",
    erOriginalSnapshot: { er_id: "pat-er-1", title: "ER baseline" },
    syncedAt: new Date("2026-06-21T00:00:00Z"),
  };

  const mockRevision = {
    id: "prev-1",
    tenantId: TENANT_ID,
    patrolId: "pat-1",
    userId: USER_ID,
    fieldName: "title",
    beforeJson: "Old",
    afterJson: "New",
    createdAt: new Date("2026-06-21T10:00:00Z"),
  };

  const mockUser = {
    id: USER_ID,
    fullName: "Ranger User",
    email: "ranger@example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(
      mockPatrol as never
    );
    vi.mocked(prisma.patrolRevision.findMany).mockResolvedValue(
      [mockRevision] as never
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      [mockUser] as never
    );
  });

  it("returns revisions with editor display names", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.getRevisions({ patrolId: "pat-1" });

    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]).toMatchObject({
      fieldName: "title",
      beforeJson: "Old",
      afterJson: "New",
      editor: { fullName: "Ranger User" },
    });
  });

  it("returns erOriginalSnapshot", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.getRevisions({ patrolId: "pat-1" });
    expect(result.erOriginalSnapshot).toEqual(mockPatrol.erOriginalSnapshot);
  });

  it("throws NOT_FOUND when patrol not in tenant", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.getRevisions({ patrolId: "pat-missing" })).rejects.toThrow(
      TRPCError
    );
  });
});

describe("patrol.update — BUG-2b required-field validation", () => {
  const existingPatrol = {
    id: "pat-1",
    tenantId: TENANT_ID,
    title: "Existing Patrol Title",
    boatName: null,
    areaName: null,
    segments: [],
    accompanyingRangers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty-string title with BAD_REQUEST", async () => {
    // Zod .min(1) on title should reject before hitting the DB.
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "pat-1", title: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.patrol.findFirst)).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only title with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "pat-1", title: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.patrol.findFirst)).not.toHaveBeenCalled();
  });

  it("accepts a valid non-empty title", async () => {
    const updated = { ...existingPatrol, title: "New Title" };
    vi.mocked(prisma.patrol.findFirst).mockResolvedValueOnce(existingPatrol as never);
    vi.mocked(prisma.patrol.update).mockResolvedValueOnce(updated as never);
    vi.mocked(prisma.patrolRevision.createMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "pat-1", title: "New Title" });
    expect(result).toMatchObject({ id: "pat-1", title: "New Title" });
  });

  it("accepts omitting title entirely (partial update on boatName only)", async () => {
    const updated = { ...existingPatrol, boatName: "Sea Hawk" };
    vi.mocked(prisma.patrol.findFirst).mockResolvedValueOnce(existingPatrol as never);
    vi.mocked(prisma.patrol.update).mockResolvedValueOnce(updated as never);
    vi.mocked(prisma.patrolRevision.createMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "pat-1", boatName: "Sea Hawk" });
    expect(result).toMatchObject({ id: "pat-1", boatName: "Sea Hawk" });
  });
});

// ── patrol.setMunicipalityOverride (Task 3 — manual override anti-clobber) ──

describe("patrol.setMunicipalityOverride", () => {
  const existingPatrol = {
    id: "pat-1",
    municipalityId: null,
    municipalityManual: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(existingPatrol as never);
    vi.mocked(prisma.patrol.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("sets a valid municipality — municipalityManual=true, municipalityId written, audit logged", async () => {
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: "muni-1" } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: "muni-1" });

    expect(result).toEqual({ id: "pat-1", municipalityId: "muni-1", municipalityManual: true });
    expect(vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]).toMatchObject({
      where: { id: "pat-1" },
      data: { municipalityId: "muni-1", municipalityManual: true },
    });
    expect(vi.mocked(enqueueMunicipalityAssign)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({
      data: { action: "SET_PATROL_MUNICIPALITY_OVERRIDE", entityType: "Patrol", entityId: "pat-1" },
    });
  });

  it("clears the override (municipalityId: null) — municipalityManual=false, re-enqueues municipality-assign, audit logged", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      municipalityId: "muni-1",
      municipalityManual: true,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: null });

    expect(result).toEqual({ id: "pat-1", municipalityId: null, municipalityManual: false });
    expect(vi.mocked(prisma.patrol.update)).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: { municipalityManual: false },
    });
    expect(vi.mocked(enqueueMunicipalityAssign)).toHaveBeenCalledWith({
      entity: "patrol",
      id: "pat-1",
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({
      data: { action: "CLEAR_PATROL_MUNICIPALITY_OVERRIDE", entityType: "Patrol", entityId: "pat-1" },
    });
  });

  it("invalid municipality — throws BAD_REQUEST, no patrol.update, no audit", async () => {
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setMunicipalityOverride({ id: "pat-1", municipalityId: "muni-missing" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("missing patrol (cross-tenant) — throws NOT_FOUND, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setMunicipalityOverride({ id: "pat-missing", municipalityId: "muni-1" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });
});

// ── patrol.setTimeOverride (officer manual start/end time — anti-clobber) ──
//
// WHY this exists: the ER mobile app frequently fails to capture the phone's
// clock, leaving `startTime` NULL on ~190 patrols (189 of them Foot). Only 63
// are derivable from segments, so for the remaining 127 an officer override is
// the ONLY way the patrol ever gets a time. The `*Manual` flags these writes
// set are what stops the next ER sync from reverting them.

describe("patrol.setTimeOverride", () => {
  const START = new Date("2026-07-01T08:00:00.000Z");
  const END = new Date("2026-07-01T12:00:00.000Z");

  const existingPatrol = {
    id: "pat-1",
    startTime: null,
    endTime: null,
    startTimeManual: false,
    endTimeManual: false,
    startTimeDerivedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(existingPatrol as never);
    vi.mocked(prisma.patrol.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("sets both times — flags both *Manual=true, clears derived stamp, audit logged", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.setTimeOverride({
      id: "pat-1",
      startTime: START,
      endTime: END,
    });

    expect(result).toEqual({
      id: "pat-1",
      startTime: START,
      endTime: END,
      startTimeManual: true,
      endTimeManual: true,
    });
    expect(vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]).toMatchObject({
      where: { id: "pat-1" },
      data: {
        startTime: START,
        endTime: END,
        startTimeManual: true,
        endTimeManual: true,
        startTimeDerivedAt: null,
      },
    });
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({
      data: {
        action: "SET_PATROL_TIME_OVERRIDE",
        entityType: "Patrol",
        entityId: "pat-1",
      },
    });
  });

  it("sets only startTime — endTimeManual stays false and endTime is cleared", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.setTimeOverride({
      id: "pat-1",
      startTime: START,
      endTime: null,
    });

    expect(result).toMatchObject({ startTimeManual: true, endTimeManual: false });
    expect(vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]).toMatchObject({
      data: { startTime: START, endTime: null, startTimeManual: true, endTimeManual: false },
    });
  });

  it("clears both times (null, null) — flags drop to false, values nulled, audit logged", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      startTime: START,
      endTime: END,
      startTimeManual: true,
      endTimeManual: true,
      startTimeDerivedAt: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.setTimeOverride({
      id: "pat-1",
      startTime: null,
      endTime: null,
    });

    expect(result).toEqual({
      id: "pat-1",
      startTime: null,
      endTime: null,
      startTimeManual: false,
      endTimeManual: false,
    });
    expect(vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]).toMatchObject({
      data: {
        startTime: null,
        endTime: null,
        startTimeManual: false,
        endTimeManual: false,
        startTimeDerivedAt: null,
      },
    });
    expect(vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]).toMatchObject({
      data: { action: "SET_PATROL_TIME_OVERRIDE", entityId: "pat-1" },
    });
  });

  it("endTime earlier than startTime — throws BAD_REQUEST, no update, no audit", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.setTimeOverride({ id: "pat-1", startTime: END, endTime: START }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("endTime equal to startTime — accepted (boundary is >=, not >)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.setTimeOverride({ id: "pat-1", startTime: START, endTime: START }),
    ).resolves.toMatchObject({ startTimeManual: true, endTimeManual: true });
  });

  it("missing patrol (cross-tenant id) — throws NOT_FOUND, no update, no audit", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.setTimeOverride({ id: "pat-missing", startTime: START, endTime: END }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });

  it("scopes the existence check to the caller's tenant (L6)", async () => {
    const caller = createCaller(makeCtx());
    await caller.setTimeOverride({ id: "pat-1", startTime: START, endTime: END });

    expect(vi.mocked(prisma.patrol.findFirst).mock.calls[0]?.[0]).toMatchObject({
      where: { id: "pat-1", tenantId: TENANT_ID },
    });
  });

  it("custom-role user without patrols:update — FORBIDDEN, no update, no audit", async () => {
    // Deny-by-default: no RolePermission row for the custom role => hasPermission false.
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID, ["ranger"], "role-no-update"));
    await expect(
      caller.setTimeOverride({ id: "pat-1", startTime: START, endTime: END }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(vi.mocked(prisma.patrol.update)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.auditLog.create)).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// patrol.list — attribution-review filter
//
// The one-time backfill (96f7ff4) attributed 281 patrols by `title_hint` and 51
// by `nearest`. Every one of those rows has a NON-NULL municipality_id, so the
// pre-existing `unattributedOnly` filter (municipality_id IS NULL) excludes
// them BY DEFINITION — they were unreachable in the UI until this filter.
// ─────────────────────────────────────────────────────────────────────────────

describe("patrol.list — attributionMethod filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT constrain attribution when the filter is omitted", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({});

    const where = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    expect(where?.municipalityAttributionMethod).toBeUndefined();
    expect(where?.OR).toBeUndefined();
  });

  it.each(["containment", "nearest", "manual", "title_hint"] as const)(
    "narrows to exactly the %s method",
    async (method) => {
      vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

      const caller = createCaller(makeCtx());
      await caller.list({ attributionMethod: method });

      const where = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
      expect(where?.municipalityAttributionMethod).toBe(method);
      // An exact-method query must NOT also widen via the needs-review OR.
      expect(where?.OR).toBeUndefined();
    },
  );

  it("returns the UNION of the heuristic methods and ambiguous rows for needs_review", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ attributionMethod: "needs_review" });

    const where = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    expect(where?.OR).toEqual([
      { municipalityAttributionMethod: { in: ["title_hint", "nearest"] } },
      { municipalityAttributionAmbiguous: true },
    ]);
    // needs_review is an alias for a SET of methods — it must never be sent to
    // Prisma as an enum literal (there is no such column value).
    expect(where?.municipalityAttributionMethod).toBeUndefined();
  });

  it("EXCLUDES containment and manual from needs_review", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ attributionMethod: "needs_review" });

    const where = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    const methodClause = where?.OR?.[0] as
      | { municipalityAttributionMethod: { in: string[] } }
      | undefined;
    expect(methodClause?.municipalityAttributionMethod.in).not.toContain("containment");
    expect(methodClause?.municipalityAttributionMethod.in).not.toContain("manual");
  });

  it("composes with state / type / includeTest / includeDeleted / unattributedOnly", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({
      state: "done",
      patrolType: "seaborne",
      includeTest: false,
      includeDeleted: false,
      unattributedOnly: true,
      attributionMethod: "nearest",
    });

    const where = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where;
    // Every pre-existing filter survives alongside the new one (all ANDed).
    expect(where?.state).toBe("done");
    expect(where?.patrolType).toBe("seaborne");
    expect(where?.isTestPatrol).toBe(false);
    expect(where?.isDeleted).toBe(false);
    expect(where?.municipalityId).toBeNull();
    expect(where?.municipalityAttributionMethod).toBe("nearest");
  });

  it("rejects a method that is not a real enum value", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      // @ts-expect-error — deliberately invalid input; Zod must reject it.
      caller.list({ attributionMethod: "vibes" }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// patrol.setMunicipalityOverride — provenance re-stamping
//
// Regression guard for a defect found during browser verification of the
// attribution-review filter: overriding a municipality updated the VALUE but
// left the PROVENANCE columns describing the automatic guess it replaced. A
// corrected patrol therefore rendered "Baco — Nearest 21.1 km — Manual" (self-
// contradictory) and kept matching the needs-review filter forever, so rows a
// human had already reviewed never left the work queue.
// ─────────────────────────────────────────────────────────────────────────────

describe("patrol.setMunicipalityOverride — attribution provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      municipalityId: "muni-old",
      municipalityManual: false,
    } as never);
    vi.mocked(prisma.patrol.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("re-stamps the method to `manual` and clears the automatic-guess metadata", async () => {
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: "muni-1" } as never);

    const caller = createCaller(makeCtx());
    await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: "muni-1" });

    const data = vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      municipalityId: "muni-1",
      municipalityManual: true,
      municipalityAttributionMethod: "manual",
      // The distance and near-tie flag described the guess that was just
      // replaced — they must not survive to describe a human's decision.
      municipalityDistanceKm: null,
      municipalityAttributionAmbiguous: false,
    });
  });

  it("drops the overridden row OUT of the needs-review queue", async () => {
    // The whole point of the re-stamp: `manual` is deliberately excluded from
    // the needs_review union, so a reviewed row stops matching it.
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: "muni-1" } as never);

    const caller = createCaller(makeCtx());
    await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: "muni-1" });

    const data = vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]?.data as {
      municipalityAttributionMethod: string;
      municipalityAttributionAmbiguous: boolean;
    };
    expect(HEURISTIC_METHODS).not.toContain(data.municipalityAttributionMethod);
    expect(data.municipalityAttributionAmbiguous).toBe(false);
  });

  it("records the new provenance in the audit log", async () => {
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: "muni-1" } as never);

    const caller = createCaller(makeCtx());
    await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: "muni-1" });

    const auditData = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0]
      ?.data as unknown as {
      changesJson: { after: Record<string, unknown> };
    };
    expect(auditData.changesJson.after).toMatchObject({
      municipalityAttributionMethod: "manual",
    });
  });

  it("leaves provenance to the re-assign processor when the override is CLEARED", async () => {
    // Clearing does not null the columns out: municipalityId survives until the
    // enqueued municipality-assign job re-derives it, and that processor
    // re-stamps method/distance/ambiguous itself. Nulling them here would open
    // a window where a row has a municipality but claims no attribution method.
    const caller = createCaller(makeCtx());
    await caller.setMunicipalityOverride({ id: "pat-1", municipalityId: null });

    const data = vi.mocked(prisma.patrol.update).mock.calls[0]?.[0]?.data;
    expect(data).toEqual({ municipalityManual: false });
    expect(vi.mocked(enqueueMunicipalityAssign)).toHaveBeenCalled();
  });
});
