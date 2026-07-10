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
        tenantSlug: "",
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
