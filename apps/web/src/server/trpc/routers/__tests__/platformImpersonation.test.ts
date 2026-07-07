/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-type-assertion */
// Mock-heavy router test: vi.mocked() over plain PrismaClient methods triggers
// unbound-method; `as never` casts on vi.fn() returns are required for some
// shapes but flagged on others. File-level disable matches project convention
// for tests that mock platformPrisma (unextended client).
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const cookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
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
import { platformImpersonationRouter } from "../platformImpersonation";
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_SLUG_COOKIE_NAME,
} from "../../../../lib/auth/impersonation";

// Typed partial matcher — avoids unsafe-assignment on objectContaining.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(platformImpersonationRouter);

const USER_ID = "user-platform-001";
const TENANT_ID = "cltenantabc0000000001";

function makeCtx(tenantId = "", roles: string[] = ["super_admin"]) {
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
// enter
// ---------------------------------------------------------------------------

describe("platformImpersonation.enter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.set.mockReset();
    cookieStore.get.mockReset();
    cookieStore.delete.mockReset();
  });

  it("rejects non-super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("", ["site_admin"]));
    await expect(caller.enter({ tenantId: TENANT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects super_admin who is already in tenant context (tenantId !== '') with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["super_admin"]));
    await expect(caller.enter({ tenantId: TENANT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws NOT_FOUND when tenant missing", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(caller.enter({ tenantId: TENANT_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws BAD_REQUEST when tenant is inactive", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      slug: "demo-site",
      name: "Demo Site",
      isActive: false,
    } as never);

    const caller = createCaller(makeCtx());
    await expect(caller.enter({ tenantId: TENANT_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("happy path — sets cookie, writes audit, returns tenant info", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      slug: "demo-site",
      name: "Demo Site",
      isActive: true,
    } as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.enter({ tenantId: TENANT_ID });

    expect(result).toEqual({
      tenantId: TENANT_ID,
      tenantSlug: "demo-site",
      tenantName: "Demo Site",
    });
    expect(cookieStore.set).toHaveBeenCalledWith(
      IMPERSONATION_COOKIE_NAME,
      TENANT_ID,
      partial({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 86400,
      }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:ENTER_TENANT",
        entityType: "Tenant",
        entityId: TENANT_ID,
        actingUserId: USER_ID,
        impersonatedAsTenantId: TENANT_ID,
        severity: "high",
      }),
    );
  });

  it("path-based tenancy — also sets the sibling mg-impersonate-slug cookie to the tenant slug", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      slug: "demo-site",
      name: "Demo Site",
      isActive: true,
    } as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    await caller.enter({ tenantId: TENANT_ID });

    expect(cookieStore.set).toHaveBeenCalledWith(
      IMPERSONATION_SLUG_COOKIE_NAME,
      "demo-site",
      partial({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 86400 }),
    );
  });

  it("enter audit includes targetTenantSlug + targetTenantName in changesJson", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: TENANT_ID,
      slug: "demo-site",
      name: "Demo Site",
      isActive: true,
    } as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    await caller.enter({ tenantId: TENANT_ID });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        changesJson: { targetTenantSlug: "demo-site", targetTenantName: "Demo Site" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// exit
// ---------------------------------------------------------------------------

describe("platformImpersonation.exit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.set.mockReset();
    cookieStore.get.mockReset();
    cookieStore.delete.mockReset();
  });

  it("rejects non-super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("", ["site_admin"]));
    await expect(caller.exit()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns wasImpersonating:false when no cookie present — no audit write", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const caller = createCaller(makeCtx());
    const result = await caller.exit();

    expect(result).toEqual({ wasImpersonating: false });
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("happy path — clears cookie, writes audit, returns wasImpersonating:true", async () => {
    cookieStore.get.mockReturnValue({ value: TENANT_ID });
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      slug: "demo-site",
    } as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.exit();

    expect(result).toEqual({ wasImpersonating: true });
    expect(cookieStore.delete).toHaveBeenCalledWith(IMPERSONATION_COOKIE_NAME);
    // path-based tenancy: the sibling slug cookie is cleared too
    expect(cookieStore.delete).toHaveBeenCalledWith(IMPERSONATION_SLUG_COOKIE_NAME);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        action: "PLATFORM:EXIT_TENANT",
        entityType: "Tenant",
        entityId: TENANT_ID,
        actingUserId: USER_ID,
        impersonatedAsTenantId: TENANT_ID,
        severity: "high",
      }),
    );
  });

  it("exit audit changesJson.targetTenantSlug is null when tenant lookup returns null (stale cookie)", async () => {
    cookieStore.get.mockReturnValue({ value: TENANT_ID });
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined as never);

    const caller = createCaller(makeCtx());
    const result = await caller.exit();

    expect(result).toEqual({ wasImpersonating: true });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial({
        changesJson: { targetTenantSlug: null },
      }),
    );
    // cookie still cleared despite stale lookup
    expect(cookieStore.delete).toHaveBeenCalledWith(IMPERSONATION_COOKIE_NAME);
  });
});
