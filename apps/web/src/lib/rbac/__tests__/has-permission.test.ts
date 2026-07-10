import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasPermission,
  resolvePermissions,
  type RolePermissionPrisma,
} from "../has-permission";

const TENANT_ID = "tenant-abc";
const CUSTOM_ROLE_ID = "role-123";

/**
 * Builds a minimal typed Prisma mock. `findMany`/`findUnique` are kept as
 * standalone typed `vi.fn()` references (not accessed back off the `prisma`
 * object) so `.mockResolvedValue(...)` calls stay type-safe instead of
 * resolving through the real Prisma method signature as `any`.
 */
function makePrisma(): {
  prisma: RolePermissionPrisma;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
} {
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    rolePermission: { findMany, findUnique },
  } as unknown as RolePermissionPrisma;
  return { prisma, findMany, findUnique };
}

describe("hasPermission", () => {
  let prisma: RolePermissionPrisma;
  let findUnique: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ prisma, findUnique } = makePrisma());
  });

  it("returns true regardless of feature/action when customRoleId is null (fixed-enum role)", async () => {
    const result = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: null },
      "users",
      "delete",
    );
    expect(result).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns true regardless of feature/action when customRoleId is undefined", async () => {
    const result = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: undefined },
      "events",
      "view",
    );
    expect(result).toBe(true);
  });

  it.each(["users", "settings", "billing", "profile"])(
    "hard-clamps reserved feature %s to false even with a row present",
    async (reservedFeature) => {
      findUnique.mockResolvedValue({
        tenantId: TENANT_ID,
        customRoleId: CUSTOM_ROLE_ID,
        featureKey: reservedFeature,
        view: true,
        write: true,
        update: true,
        delete: true,
      });

      const result = await hasPermission(
        prisma,
        { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
        reservedFeature,
        "view",
      );
      expect(result).toBe(false);
      // Hard clamp short-circuits before ever querying the DB.
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it("resolves view=true / write=false / delete=false from a matrix row for 'events'", async () => {
    findUnique.mockResolvedValue({
      tenantId: TENANT_ID,
      customRoleId: CUSTOM_ROLE_ID,
      featureKey: "events",
      view: true,
      write: false,
      update: false,
      delete: false,
    });

    const view = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "events",
      "view",
    );
    const write = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "events",
      "write",
    );
    const del = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "events",
      "delete",
    );

    expect(view).toBe(true);
    expect(write).toBe(false);
    expect(del).toBe(false);
  });

  it("denies by default when no matrix row exists for the feature", async () => {
    findUnique.mockResolvedValue(null);

    const result = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "events",
      "write",
    );
    expect(result).toBe(false);
  });

  it("denies an action the feature doesn't expose without querying the DB (e.g. delete on view-only 'dashboard')", async () => {
    const result = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "dashboard",
      "delete",
    );
    expect(result).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("denies when the found row's tenantId does not match the caller's tenant", async () => {
    findUnique.mockResolvedValue({
      tenantId: "other-tenant",
      customRoleId: CUSTOM_ROLE_ID,
      featureKey: "events",
      view: true,
      write: true,
      update: true,
      delete: true,
    });

    const result = await hasPermission(
      prisma,
      { tenantId: TENANT_ID, customRoleId: CUSTOM_ROLE_ID },
      "events",
      "view",
    );
    expect(result).toBe(false);
  });
});

describe("resolvePermissions", () => {
  let prisma: RolePermissionPrisma;
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ prisma, findMany } = makePrisma());
  });

  it("builds a summary keyed by featureKey from returned rows", async () => {
    findMany.mockResolvedValue([
      {
        id: "rp1",
        tenantId: TENANT_ID,
        customRoleId: CUSTOM_ROLE_ID,
        featureKey: "events",
        view: true,
        write: true,
        update: false,
        delete: false,
      },
    ]);

    const summary = await resolvePermissions(prisma, TENANT_ID, CUSTOM_ROLE_ID);
    expect(summary).toEqual({
      events: { view: true, write: true, update: false, delete: false },
    });
  });

  it("defensively skips a non-grantable (reserved) featureKey row", async () => {
    findMany.mockResolvedValue([
      {
        id: "rp1",
        tenantId: TENANT_ID,
        customRoleId: CUSTOM_ROLE_ID,
        featureKey: "events",
        view: true,
        write: false,
        update: false,
        delete: false,
      },
      {
        id: "rp2",
        tenantId: TENANT_ID,
        customRoleId: CUSTOM_ROLE_ID,
        featureKey: "users",
        view: true,
        write: true,
        update: true,
        delete: true,
      },
    ]);

    const summary = await resolvePermissions(prisma, TENANT_ID, CUSTOM_ROLE_ID);
    expect(Object.keys(summary)).toEqual(["events"]);
    expect(summary.users).toBeUndefined();
  });

  it("returns an empty summary when no rows exist", async () => {
    findMany.mockResolvedValue([]);

    const summary = await resolvePermissions(prisma, TENANT_ID, CUSTOM_ROLE_ID);
    expect(summary).toEqual({});
  });
});
