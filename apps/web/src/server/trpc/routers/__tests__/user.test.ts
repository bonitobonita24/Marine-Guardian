import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
    compare: vi.fn(),
  },
  hash: vi.fn().mockResolvedValue("$2b$10$hashedpassword"),
}));

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { userRouter } from "../user";

// Typed wrapper around expect.objectContaining — vitest matchers are typed `any`,
// which triggers @typescript-eslint/no-unsafe-assignment when nested in object literals.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(userRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["super_admin"]
) {
  return {
    session: {
      user: { id: USER_ID, tenantId: tenantId as string, roles, email: "admin@example.com", name: "Admin User" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("user.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a user with hashed password and returns tempPassword", async () => {
    const created = {
      id: "user-new",
      email: "new@example.com",
      fullName: "New User",
      role: "operator",
      tenantId: TENANT_ID,
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      email: "new@example.com",
      fullName: "New User",
      role: "operator",
    });

    expect(result.user.id).toBe("user-new");
    expect(result.user.email).toBe("new@example.com");
    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThan(0);
    expect(vi.mocked(prisma.user.create)).toHaveBeenCalledWith(
      partial({
        data: partial<{ tenantId: string; email: string; role: string }>({
          tenantId: TENANT_ID,
          email: "new@example.com",
          role: "operator",
        }),
      })
    );
  });

  it("rejects duplicate email within same tenant", async () => {
    const existing = {
      id: "user-existing",
      email: "existing@example.com",
      tenantId: TENANT_ID,
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(existing as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        email: "existing@example.com",
        fullName: "Duplicate User",
        role: "operator",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects non-admin roles", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(
      caller.create({
        email: "new@example.com",
        fullName: "New User",
        role: "operator",
      })
    ).rejects.toThrow(TRPCError);
  });

  // viewer role (2026-07-05) — strictly read-only. It is never listed in
  // adminProcedure/coordinatorProcedure/operatorProcedure (rbac.ts), so a
  // viewer session must be rejected FORBIDDEN by this admin-only mutation,
  // same as any other non-admin role.
  it("rejects a viewer session with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["viewer"]));
    await expect(
      caller.create({
        email: "new@example.com",
        fullName: "New User",
        role: "operator",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // administrator role (2026-07-06) — full app access EXCEPT user
  // management. user.create/resetPassword/updateRole/deactivate/activate
  // are gated to userManagementProcedure (super_admin + site_admin ONLY),
  // which administrator is deliberately never added to.
  it("rejects an administrator session with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(
      caller.create({
        email: "new@example.com",
        fullName: "New User",
        role: "operator",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still allows a site_admin session to create a user (regression)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-new-2",
      email: "new2@example.com",
      fullName: "New User Two",
      role: "operator",
      isActive: true,
      createdAt: new Date("2026-07-06T00:00:00Z"),
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(
      caller.create({
        email: "new2@example.com",
        fullName: "New User Two",
        role: "operator",
      })
    ).resolves.toMatchObject({ user: partial({ email: "new2@example.com" }) });
  });
});

describe("user.resetPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resets password, increments securityVersion, returns tempPassword", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.resetPassword({ id: "user-456" });

    expect(typeof result.tempPassword).toBe("string");
    expect(result.tempPassword.length).toBeGreaterThan(0);
    expect(vi.mocked(prisma.user.updateMany)).toHaveBeenCalledWith({
      where: { id: "user-456", tenantId: TENANT_ID },
      data: partial<{ securityVersion: { increment: number } }>({
        securityVersion: { increment: 1 },
      }),
    });
  });

  it("rejects when user not found in tenant", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx());
    await expect(
      caller.resetPassword({ id: "nonexistent-user" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("user.updateRole", () => {
  beforeEach(() => vi.clearAllMocks());

  const TARGET_ID = "user-target";
  const existingUser = {
    id: TARGET_ID,
    role: "operator" as const,
    tenantId: TENANT_ID,
  };

  it("throws NOT_FOUND when target user belongs to a different tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.updateRole({ id: TARGET_ID, role: "field_coordinator" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("updates role and writes audit log on success", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(existingUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...existingUser, role: "field_coordinator" } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.updateRole({ id: TARGET_ID, role: "field_coordinator" });

    expect(result).toEqual({ id: TARGET_ID });

    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: partial<{ role: string; securityVersion: { increment: number } }>({
        role: "field_coordinator",
        securityVersion: { increment: 1 },
      }),
    });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({
        action: "UPDATE_USER_ROLE",
        tenantId: TENANT_ID,
        entityType: "User",
        entityId: TARGET_ID,
        changesJson: { before: { role: "operator" }, after: { role: "field_coordinator" } },
      })
    );
  });

  // administrator (2026-07-06) — excluded from userManagementProcedure, so
  // it can never change another user's role.
  it("rejects an administrator session with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(
      caller.updateRole({ id: TARGET_ID, role: "field_coordinator" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
  });
});

describe("user.deactivate", () => {
  beforeEach(() => vi.clearAllMocks());

  const TARGET_ID = "user-target";
  const existingActiveUser = {
    id: TARGET_ID,
    isActive: true,
    tenantId: TENANT_ID,
  };

  it("throws NOT_FOUND when target user belongs to a different tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.deactivate({ id: TARGET_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when target user does not exist", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.deactivate({ id: "nonexistent-user" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("updates isActive + writes audit log on success", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(existingActiveUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...existingActiveUser, isActive: false } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.deactivate({ id: TARGET_ID });

    expect(result).toEqual({ id: TARGET_ID });

    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: partial<{ isActive: boolean; securityVersion: { increment: number } }>({
        isActive: false,
        securityVersion: { increment: 1 },
      }),
    });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({
        action: "DEACTIVATE_USER",
        tenantId: TENANT_ID,
        entityType: "User",
        entityId: TARGET_ID,
        changesJson: { before: { isActive: true }, after: { isActive: false } },
      })
    );
  });
});

describe("user.activate", () => {
  beforeEach(() => vi.clearAllMocks());

  const TARGET_ID = "user-target";
  const existingInactiveUser = {
    id: TARGET_ID,
    isActive: false,
    tenantId: TENANT_ID,
  };

  it("throws NOT_FOUND when target user belongs to a different tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.activate({ id: TARGET_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when target user does not exist", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.activate({ id: "nonexistent-user" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("updates isActive + writes audit log on success", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(existingInactiveUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...existingInactiveUser, isActive: true } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.activate({ id: TARGET_ID });

    expect(result).toEqual({ id: TARGET_ID });

    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: partial<{ isActive: boolean; securityVersion: { increment: number } }>({
        isActive: true,
        securityVersion: { increment: 1 },
      }),
    });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({
        action: "ACTIVATE_USER",
        tenantId: TENANT_ID,
        entityType: "User",
        entityId: TARGET_ID,
        changesJson: { before: { isActive: false }, after: { isActive: true } },
      })
    );
  });
});

describe("user.getCommandCenterMunicipality", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current user's saved municipality id", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      commandCenterMunicipalityId: "muni-1",
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getCommandCenterMunicipality();

    expect(result).toEqual({ municipalityId: "muni-1" });
    expect(vi.mocked(prisma.user.findUnique)).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: { commandCenterMunicipalityId: true },
    });
  });

  it("returns null when the user has no saved preference", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      commandCenterMunicipalityId: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getCommandCenterMunicipality();

    expect(result).toEqual({ municipalityId: null });
  });

  it("returns null when the user record is not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    const result = await caller.getCommandCenterMunicipality();

    expect(result).toEqual({ municipalityId: null });
  });
});

describe("user.setCommandCenterMunicipality", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the CURRENT user's municipality preference (never a userId from input)", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: USER_ID,
      commandCenterMunicipalityId: "muni-2",
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.setCommandCenterMunicipality({
      municipalityId: "muni-2",
    });

    expect(result).toEqual({ municipalityId: "muni-2" });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { commandCenterMunicipalityId: "muni-2" },
    });
  });

  it("clears the preference when passed null (All municipalities)", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: USER_ID,
      commandCenterMunicipalityId: null,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.setCommandCenterMunicipality({
      municipalityId: null,
    });

    expect(result).toEqual({ municipalityId: null });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { commandCenterMunicipalityId: null },
    });
  });
});
