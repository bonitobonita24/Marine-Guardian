import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    customRole: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rolePermission: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
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

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { customRoleRouter } from "../customRole";

// Typed wrapper around expect.objectContaining — vitest matchers are typed `any`,
// which triggers @typescript-eslint/no-unsafe-assignment when nested in object literals.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(customRoleRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["tenant_superadmin"],
  customRoleId: string | null = null,
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
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
  vi.mocked(prisma.$transaction).mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    Promise.resolve(cb(prisma)),
  );
});

describe("customRole gate", () => {
  it("rejects a non-owner role (field_coordinator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects tenant_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_admin"]));
    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows tenant_superadmin", async () => {
    vi.mocked(prisma.customRole.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(caller.list()).resolves.toEqual({ items: [] });
  });

  it("allows tenant_manager (platform)", async () => {
    vi.mocked(prisma.customRole.findMany).mockResolvedValue([]);
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_manager"]));
    await expect(caller.list()).resolves.toEqual({ items: [] });
  });
});

describe("customRole.create", () => {
  it("rejects a reserved featureKey with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        name: "Escalator",
        permissions: [{ featureKey: "users", view: true, write: false, update: false, delete: false }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.customRole.create)).not.toHaveBeenCalled();
  });

  it("rejects a billing featureKey with BAD_REQUEST (also reserved)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        name: "Escalator2",
        permissions: [{ featureKey: "billing", view: true, write: false, update: false, delete: false }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an action not exposed by the feature (delete on dashboard) with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        name: "BadShape",
        permissions: [
          { featureKey: "dashboard", view: true, write: false, update: false, delete: true },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.customRole.create)).not.toHaveBeenCalled();
  });

  it("creates the role + writes RolePermission rows + audit log on the happy path", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.customRole.create).mockResolvedValue({
      id: "role-1",
      tenantId: TENANT_ID,
      name: "Field Viewer",
      description: null,
    } as never);
    vi.mocked(prisma.rolePermission.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      name: "Field Viewer",
      permissions: [
        { featureKey: "events", view: true, write: false, update: false, delete: false },
      ],
    });

    expect(result).toEqual({ id: "role-1" });
    expect(vi.mocked(prisma.customRole.create)).toHaveBeenCalledWith(
      partial({
        data: partial({ tenantId: TENANT_ID, name: "Field Viewer" }),
      }),
    );
    expect(vi.mocked(prisma.rolePermission.createMany)).toHaveBeenCalledWith(
      partial({
        data: [
          partial({
            tenantId: TENANT_ID,
            customRoleId: "role-1",
            featureKey: "events",
            view: true,
          }),
        ],
      }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({
        action: "CREATE_CUSTOM_ROLE",
        tenantId: TENANT_ID,
        entityType: "CustomRole",
        entityId: "role-1",
      }),
    );
  });

  it("rejects a duplicate name within the same tenant with CONFLICT", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({ id: "existing" } as never);
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ name: "Dup", permissions: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("customRole.getById", () => {
  it("returns NOT_FOUND for another tenant's id", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.getById({ id: "role-other-tenant" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns the role + permissions when found in-tenant", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({
      id: "role-1",
      tenantId: TENANT_ID,
      name: "Field Viewer",
      permissions: [{ featureKey: "events", view: true }],
    } as never);
    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "role-1" });
    expect(result).toMatchObject({ id: "role-1", name: "Field Viewer" });
  });
});

describe("customRole.update", () => {
  it("returns NOT_FOUND when role does not belong to tenant", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "role-x", name: "New Name" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid permission shape without ever writing", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({
      id: "role-1",
      name: "Field Viewer",
      description: null,
    } as never);
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({
        id: "role-1",
        permissions: [{ featureKey: "users", view: true, write: false, update: false, delete: false }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.customRole.update)).not.toHaveBeenCalled();
  });

  it("replaces permission rows atomically + writes audit log", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({
      id: "role-1",
      name: "Field Viewer",
      description: null,
    } as never);
    vi.mocked(prisma.customRole.update).mockResolvedValue({} as never);
    vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.rolePermission.createMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.update({
      id: "role-1",
      permissions: [
        { featureKey: "events", view: true, write: true, update: false, delete: false },
      ],
    });

    expect(result).toEqual({ id: "role-1" });
    expect(vi.mocked(prisma.rolePermission.deleteMany)).toHaveBeenCalledWith({
      where: { customRoleId: "role-1" },
    });
    expect(vi.mocked(prisma.rolePermission.createMany)).toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({ action: "UPDATE_CUSTOM_ROLE", entityId: "role-1" }),
    );
  });
});

describe("customRole.delete", () => {
  it("returns NOT_FOUND for a foreign-tenant id", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.delete({ id: "role-x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(vi.mocked(prisma.customRole.delete)).not.toHaveBeenCalled();
  });

  it("deletes + writes audit log on success", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({ id: "role-1", name: "X" } as never);
    vi.mocked(prisma.customRole.delete).mockResolvedValue({} as never);
    const caller = createCaller(makeCtx());
    const result = await caller.delete({ id: "role-1" });
    expect(result).toEqual({ id: "role-1" });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({ action: "DELETE_CUSTOM_ROLE", entityId: "role-1" }),
    );
  });
});

describe("customRole.assignToUser", () => {
  it("returns NOT_FOUND when the target user is not in-tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.assignToUser({ userId: "u-1", customRoleId: "role-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when the custom role is not in-tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", role: "field_coordinator", customRoleId: null } as never);
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.assignToUser({ userId: "u-1", customRoleId: "role-x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sets role=tenant_admin + customRoleId, bumps securityVersion, and audits", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u-1",
      role: "field_coordinator",
      customRoleId: null,
    } as never);
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue({ id: "role-1" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const caller = createCaller(makeCtx());
    const result = await caller.assignToUser({ userId: "u-1", customRoleId: "role-1" });

    expect(result).toEqual({ id: "u-1" });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: partial<{ role: string; customRoleId: string; securityVersion: { increment: number } }>({
        role: "tenant_admin",
        customRoleId: "role-1",
        securityVersion: { increment: 1 },
      }),
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({ action: "ASSIGN_CUSTOM_ROLE", entityId: "u-1" }),
    );
  });
});

describe("customRole.unassign", () => {
  it("returns NOT_FOUND when the target user is not in-tenant", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.unassign({ userId: "u-1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("clears customRoleId, bumps securityVersion, and audits", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u-1",
      role: "tenant_admin",
      customRoleId: "role-1",
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const caller = createCaller(makeCtx());
    const result = await caller.unassign({ userId: "u-1" });

    expect(result).toEqual({ id: "u-1" });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: partial<{ customRoleId: null; securityVersion: { increment: number } }>({
        customRoleId: null,
        securityVersion: { increment: 1 },
      }),
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({ action: "UNASSIGN_CUSTOM_ROLE", entityId: "u-1" }),
    );
  });
});

// TRPCError sanity — ensure our thrown errors are real TRPCError instances,
// consistent with the rest of the router suite.
describe("customRole error shape", () => {
  it("getById NOT_FOUND is a TRPCError", async () => {
    vi.mocked(prisma.customRole.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.getById({ id: "missing" })).rejects.toThrow(TRPCError);
  });
});
