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
    },
    tenant: {
      findUnique: vi.fn(),
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

function makeCtx(tenantId = "", roles: string[] = ["super_admin"]) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId,
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
    const caller = createCaller(makeCtx("", ["site_admin"]));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when super_admin has non-empty tenantId (tenant-scoped)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["super_admin"]));
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
      caller.create({ ...baseInput, role: "super_admin", tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects non-super_admin role with null tenantId → BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "site_admin", tenantId: null }),
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
      caller.create({ ...baseInput, role: "site_admin", tenantId: TENANT_ID }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unknown or inactive tenant → NOT_FOUND", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ ...baseInput, role: "site_admin", tenantId: TENANT_ID }),
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
      role: "site_admin",
      tenantId: TENANT_ID,
      isActive: true,
      createdAt: new Date(),
    };
    vi.mocked(platformPrisma.user.create).mockResolvedValue(createdUser as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({ ...baseInput, role: "site_admin", tenantId: TENANT_ID });

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
      role: "site_admin",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    await expect(caller.updateRole({ id: "u1", role: "super_admin" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("happy path: updates role and audits PLATFORM:UPDATE_USER_ROLE with before/after", async () => {
    vi.mocked(platformPrisma.user.findUnique).mockResolvedValue({
      id: "u1",
      role: "site_admin",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(platformPrisma.user.update).mockResolvedValue({} as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.updateRole({ id: "u1", role: "field_coordinator" });

    expect(result).toEqual({ id: "u1", role: "field_coordinator" });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:UPDATE_USER_ROLE",
        entityType: "User",
        entityId: "u1",
        changesJson: { before: { role: "site_admin" }, after: { role: "field_coordinator" } },
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
