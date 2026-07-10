import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal prisma mock: rolePermission.findUnique (the matrix gate) plus the
// prisma reads the underlying handlers touch in the ALLOW-path cases below.
vi.mock("@marine-guardian/db", () => ({
  prisma: {
    rolePermission: {
      findUnique: vi.fn(),
    },
    syncLog: {
      findMany: vi.fn(),
    },
  },
  writeAuditLog: vi.fn(),
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
import { syncLogRouter } from "../syncLog";
import { reportExportRouter } from "../reportExport";
import { patrolScheduleRouter } from "../patrolSchedule";

const createSyncLogCaller = createCallerFactory(syncLogRouter);
const createReportExportCaller = createCallerFactory(reportExportRouter);
const createPatrolScheduleCaller = createCallerFactory(patrolScheduleRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  roles: string[] = ["tenant_admin"],
  customRoleId: string | null = null,
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: TENANT_ID,
        tenantSlug: "",
        roles,
        email: "admin@example.com",
        name: "Admin User",
        customRoleId,
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matrix enforcement — DENY on ungranted view (no matrix row)", () => {
  it("rejects syncLog.list for a custom-role user with no RolePermission row", async () => {
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue(null);
    const caller = createSyncLogCaller(makeCtx(["tenant_admin"], "cr-1"));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("matrix enforcement — DENY when the granted row has view=false", () => {
  it("rejects syncLog.list when the matrix row exists but view is false", async () => {
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue({
      tenantId: TENANT_ID,
      customRoleId: "cr-1",
      featureKey: "sync",
      view: false,
      write: false,
      update: false,
      delete: false,
    } as never);
    const caller = createSyncLogCaller(makeCtx(["tenant_admin"], "cr-1"));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("matrix enforcement — ALLOW when the granted row has view=true", () => {
  it("resolves syncLog.list when the matrix row grants view", async () => {
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue({
      tenantId: TENANT_ID,
      customRoleId: "cr-1",
      featureKey: "sync",
      view: true,
      write: false,
      update: false,
      delete: false,
    } as never);
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([]);

    const caller = createSyncLogCaller(makeCtx(["tenant_admin"], "cr-1"));
    await expect(caller.list({})).resolves.toEqual({ items: [], nextCursor: undefined });
  });
});

describe("matrix enforcement — fixed enum roles pass through unaffected (enum passthrough)", () => {
  it("resolves syncLog.list for a fixed-role user (customRoleId=null) without querying the matrix", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([]);

    const caller = createSyncLogCaller(makeCtx(["tenant_admin"], null));
    await expect(caller.list({})).resolves.toEqual({ items: [], nextCursor: undefined });

    expect(vi.mocked(prisma.rolePermission.findUnique)).not.toHaveBeenCalled();
  });
});

describe("matrix enforcement — hard-clamp on an unexposed action", () => {
  it("rejects reportExport.delete for a custom role even if a stray row grants delete=true", async () => {
    // "exports" only exposes ["view"] in the feature registry — "delete" is
    // never a valid action for this feature, so hasPermission hard-clamps
    // to false regardless of what the row says.
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue({
      tenantId: TENANT_ID,
      customRoleId: "cr-1",
      featureKey: "exports",
      view: true,
      write: true,
      update: true,
      delete: true,
    } as never);

    const caller = createReportExportCaller(makeCtx(["tenant_admin"], "cr-1"));
    await expect(caller.delete({ id: "re-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("matrix enforcement — WRITE deny when only view is granted", () => {
  it("rejects patrolSchedule.create for a custom role granted view-only on patrol-schedule", async () => {
    vi.mocked(prisma.rolePermission.findUnique).mockResolvedValue({
      tenantId: TENANT_ID,
      customRoleId: "cr-1",
      featureKey: "patrol-schedule",
      view: true,
      write: false,
      update: false,
      delete: false,
    } as never);

    const caller = createPatrolScheduleCaller(makeCtx(["tenant_admin"], "cr-1"));
    await expect(
      caller.create({
        patrolAreaId: "area-1",
        rangerName: "Ranger One",
        scheduledStart: new Date("2026-07-11T00:00:00Z"),
        scheduledEnd: new Date("2026-07-11T08:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
