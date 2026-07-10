/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-type-assertion */
// Mock-heavy router test: vi.mocked() over plain PrismaClient methods triggers
// unbound-method; `as never` casts on vi.fn() returns are required for some
// shapes but flagged on others. File-level disable matches project convention
// for tests that mock platformPrisma (unextended client).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
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

import { platformPrisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { platformUserRouter } from "../platformUser";

// Typed partial matcher — avoids unsafe-assignment on objectContaining.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(platformUserRouter);

const USER_ID = "user-platform-001";
const TENANT_ID = "tenant-abc-001";

function makeCtx(tenantId = "", roles: string[] = ["tenant_manager"]) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId,
        tenantSlug: "",
        roles,
        email: "platform@mg.local",
        name: "Platform Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("platformUser — auth gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws FORBIDDEN when caller is not super_admin", async () => {
    const caller = createCaller(makeCtx("", ["tenant_superadmin"]));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when super_admin has non-empty tenantId (tenant-scoped)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_manager"]));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("platformUser.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns items and null nextCursor when fewer than limit+1 returned", async () => {
    const mockItems = [{ id: "u1" }, { id: "u2" }];
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue(mockItems as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it("returns nextCursor when overflow item present", async () => {
    const mockItems = Array.from({ length: 4 }, (_, i) => ({ id: `u${String(i)}` }));
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue(mockItems as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBe("u3");
  });

  it("applies tenantId: null filter when input.tenantId === null", async () => {
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.list({ tenantId: null });

    expect(vi.mocked(platformPrisma.user.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: null }) }),
    );
  });

  it("applies tenantId equality when input.tenantId is a string", async () => {
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.list({ tenantId: TENANT_ID });

    expect(vi.mocked(platformPrisma.user.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("platformUser.create", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    email: "new@mg.local",
    fullName: "New User",
    languagePreference: "en" as const,
  };

  it("rejects super_admin role with non-null tenantId → BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "tenant_manager", tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects non-super_admin role with null tenantId → BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "tenant_superadmin", tenantId: null }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects duplicate email → CONFLICT", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue({ id: "existing-user" } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "tenant_superadmin", tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unknown or inactive tenant → NOT_FOUND", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "tenant_superadmin", tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("happy path: creates user, returns tempPassword, calls audit with PLATFORM:CREATE_USER", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue(null as never);
    const createdUser = {
      id: "new-user-id",
      email: baseInput.email,
      fullName: baseInput.fullName,
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
      isActive: true,
      createdAt: new Date(),
    };
    vi.mocked(platformPrisma.user.create).mockResolvedValue(createdUser as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({ ...baseInput, role: "tenant_superadmin", tenantId: TENANT_ID });

    expect(result.user.id).toBe("new-user-id");
    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThan(0);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:CREATE_USER",
        entityType: "User",
        entityId: "new-user-id",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateRole
// ---------------------------------------------------------------------------

describe("platformUser.updateRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects role/tenantId mismatch (super_admin on tenant user) → BAD_REQUEST", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    await expect(caller.updateRole({ id: "u1", role: "tenant_manager" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("happy path: updates role and audits PLATFORM:UPDATE_USER_ROLE with before/after", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.updateRole({ id: "u1", role: "field_coordinator" });

    expect(result).toEqual({ id: "u1", role: "field_coordinator", tenantId: TENANT_ID });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:UPDATE_USER_ROLE",
        entityType: "User",
        entityId: "u1",
        changesJson: { before: { role: "tenant_superadmin" }, after: { role: "field_coordinator" } },
      }),
    );
  });

  it("reassigns tenantId to a different tenant and audits the change", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: "tenant-other",
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.updateRole({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: "tenant-other",
    });

    expect(result).toEqual({ id: "u1", role: "tenant_superadmin", tenantId: "tenant-other" });
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith(
      partial({
        data: partial({ tenantId: "tenant-other" }),
      }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:UPDATE_USER_ROLE",
        changesJson: {
          before: { role: "tenant_superadmin", tenantId: TENANT_ID },
          after: { role: "tenant_superadmin", tenantId: "tenant-other" },
        },
      }),
    );
  });

  it("rejects reassignment to a non-existent tenant → NOT_FOUND", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.updateRole({ id: "u1", role: "tenant_superadmin", tenantId: "tenant-missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("omits tenantId in input → preserves existing tenantId (backward compat)", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "tenant_superadmin",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.updateRole({ id: "u1", role: "field_coordinator" });

    expect(result).toEqual({ id: "u1", role: "field_coordinator", tenantId: TENANT_ID });
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith(
      partial({
        data: partial({ role: "field_coordinator" }),
      }),
    );
    // tenantId NOT in update data (no reassignment)
    expect(vi.mocked(platformPrisma.user.update).mock.calls[0]?.[0]).not.toHaveProperty(
      "data.tenantId",
    );
    // changesJson does not include tenantId
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        changesJson: {
          before: { role: "tenant_superadmin" },
          after: { role: "field_coordinator" },
        },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

describe("platformUser.deactivate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("already-inactive user → skips update and audit, returns isActive: false", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      tenantId: TENANT_ID,
      isActive: false,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.deactivate({ id: "u1" });

    expect(result).toEqual({ id: "u1", isActive: false });
    expect(vi.mocked(platformPrisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("active user → updates, audits PLATFORM:DEACTIVATE_USER, returns isActive: false", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      tenantId: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.deactivate({ id: "u1" });

    expect(result).toEqual({ id: "u1", isActive: false });
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith(
      partial({ data: partial({ isActive: false, securityVersion: { increment: 1 } }) }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({ action: "PLATFORM:DEACTIVATE_USER", entityId: "u1" }),
    );
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

describe("platformUser.resetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: updates passwordHash + securityVersion, audits PLATFORM:RESET_USER_PASSWORD, returns tempPassword", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.resetPassword({ id: "u1" });

    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThan(0);
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith(
      partial({
        where: { id: "u1" },
        data: partial({ securityVersion: { increment: 1 } }),
      }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:RESET_USER_PASSWORD",
        entityId: "u1",
        changesJson: { note: "password reset" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// reassignTenantSuperadmin — enforces the "one tenant_superadmin per tenant"
// invariant (backed by the one_tenant_superadmin_per_tenant partial unique
// index, migration 20260710093000_tenant_rbac_3tier) LOGICALLY: every
// existing tenant_superadmin on the target tenant is demoted to tenant_admin
// BEFORE the target is promoted, in the same transaction.
// ---------------------------------------------------------------------------

describe("platformUser.reassignTenantSuperadmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(platformPrisma.$transaction).mockImplementation(
      (cb: (tx: typeof platformPrisma) => unknown) => Promise.resolve(cb(platformPrisma)),
    );
  });

  const activeTarget = { id: "u-target", role: "tenant_admin", isActive: true };

  it("rejects unknown or inactive tenant → NOT_FOUND", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.reassignTenantSuperadmin({ tenantId: TENANT_ID, newSuperadminUserId: "u-target" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when target user does not belong to the tenant", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.reassignTenantSuperadmin({ tenantId: TENANT_ID, newSuperadminUserId: "u-target" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects BAD_REQUEST when target is deactivated", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue({
      ...activeTarget,
      isActive: false,
    } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.reassignTenantSuperadmin({ tenantId: TENANT_ID, newSuperadminUserId: "u-target" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("demotes every existing tenant_superadmin on the tenant BEFORE promoting the target, then audits", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue(activeTarget as never);
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue([
      { id: "old-owner-1" },
    ] as never);
    vi.mocked(platformPrisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.reassignTenantSuperadmin({
      tenantId: TENANT_ID,
      newSuperadminUserId: "u-target",
    });

    expect(result).toEqual({ id: "u-target", tenantId: TENANT_ID, role: "tenant_superadmin" });

    // findMany excludes the target itself and scopes to the tenant + role.
    expect(vi.mocked(platformPrisma.user.findMany)).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, role: "tenant_superadmin", id: { not: "u-target" } },
      select: { id: true },
    });

    // Existing owner(s) demoted to tenant_admin.
    expect(vi.mocked(platformPrisma.user.updateMany)).toHaveBeenCalledWith({
      where: { id: { in: ["old-owner-1"] } },
      data: partial<{ role: string; securityVersion: { increment: number } }>({
        role: "tenant_admin",
        securityVersion: { increment: 1 },
      }),
    });

    // Target promoted to tenant_superadmin.
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith({
      where: { id: "u-target" },
      data: partial<{ role: string; securityVersion: { increment: number } }>({
        role: "tenant_superadmin",
        securityVersion: { increment: 1 },
      }),
    });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:REASSIGN_TENANT_SUPERADMIN",
        entityType: "User",
        entityId: "u-target",
      }),
    );
  });

  it("skips the demotion updateMany when there is no existing tenant_superadmin on the tenant", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.user.findFirst).mockResolvedValue(activeTarget as never);
    vi.mocked(platformPrisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    await caller.reassignTenantSuperadmin({
      tenantId: TENANT_ID,
      newSuperadminUserId: "u-target",
    });

    expect(vi.mocked(platformPrisma.user.updateMany)).not.toHaveBeenCalled();
    expect(vi.mocked(platformPrisma.user.update)).toHaveBeenCalledWith(
      partial({ where: { id: "u-target" } }),
    );
  });
});
