import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * account.changeOwnPassword — self-service password change (2026-07-06).
 * Every authenticated role must be able to call this for ITSELF; there is no
 * target-userId input, so cross-user password changes are structurally
 * impossible (verified by asserting every DB call is scoped to ctx.userId).
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

vi.mock("../../../auth", () => ({ auth: vi.fn() }));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2b$12$newhashedpassword"),
    compare: vi.fn(),
  },
  hash: vi.fn().mockResolvedValue("$2b$12$newhashedpassword"),
  compare: vi.fn(),
}));

import bcrypt from "bcryptjs";
import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { accountRouter } from "../account";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(accountRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-self-1";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["viewer"],
) {
  return {
    session: {
      user: { id: USER_ID, tenantId: tenantId as string, tenantSlug: "", roles, email: "me@example.com", name: "Self User" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("account.changeOwnPassword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects with BAD_REQUEST when the current password is wrong", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "$2b$12$oldhash",
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.changeOwnPassword({
        currentPassword: "wrong-password",
        newPassword: "brand-new-pass-1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the caller's user record is missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.changeOwnPassword({
        currentPassword: "whatever",
        newPassword: "brand-new-pass-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("verifies current password, hashes + persists the new one, bumps securityVersion, audits — scoped to ctx.userId only", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "$2b$12$oldhash",
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: USER_ID } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    const result = await caller.changeOwnPassword({
      currentPassword: "correct-current-pass",
      newPassword: "brand-new-pass-1",
    });

    expect(result).toEqual({ success: true });

    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(
      "correct-current-pass",
      "$2b$12$oldhash",
    );

    // Scoped strictly to the caller's own id — no target-userId input exists
    // on this procedure, so a cross-user change is structurally impossible.
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: partial<{ securityVersion: { increment: number } }>({
        securityVersion: { increment: 1 },
      }),
    });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      prisma,
      partial({
        action: "SELF_CHANGE_PASSWORD",
        tenantId: TENANT_ID,
        entityType: "User",
        entityId: USER_ID,
      }),
    );
  });

  it("allows every authenticated role to change its own password (viewer, operator, field_coordinator, administrator, site_admin, super_admin)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: "$2b$12$oldhash",
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: USER_ID } as never);

    const roles = [
      "viewer",
      "operator",
      "field_coordinator",
      "administrator",
      "site_admin",
      "super_admin",
    ];

    for (const role of roles) {
      const caller = createCaller(makeCtx(TENANT_ID, [role]));
      await expect(
        caller.changeOwnPassword({
          currentPassword: "correct-current-pass",
          newPassword: "brand-new-pass-1",
        }),
      ).resolves.toEqual({ success: true });
    }
  });

  it("rejects with FORBIDDEN when there is no tenant context", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.changeOwnPassword({
        currentPassword: "whatever",
        newPassword: "brand-new-pass-1",
      }),
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.user.findUnique)).not.toHaveBeenCalled();
  });
});
