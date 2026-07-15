/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * cmsShowcase router tests (CMS_BUILD_PLAN.md — W3). Verifies: getAll
 * succeeds for an anonymous caller and returns a key -> {value,valueJson}
 * map; update rejects both an anonymous caller AND a non-platform-admin
 * (tenant-scoped) caller, and succeeds for a platform admin.
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    showcaseField: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
  writeAuditLog: vi.fn(),
  Prisma: {},
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

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { cmsShowcaseRouter } from "../cmsShowcase";

const createCaller = createCallerFactory(cmsShowcaseRouter);

const ANON_CTX = { session: null, ip: "127.0.0.1", impersonationTenantId: null };

function tenantUserCtx(roles: string[] = ["operator"], tenantId = "tenant-abc") {
  return {
    session: {
      user: { id: "user-1", tenantId, tenantSlug: "some-tenant", roles, email: "u@example.com", name: "U" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

function platformAdminCtx() {
  return {
    session: {
      user: {
        id: "admin-1",
        tenantId: "",
        tenantSlug: "",
        roles: ["tenant_manager"],
        email: "admin@example.com",
        name: "Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("cmsShowcase.getAll — public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an anonymous caller can read all fields, keyed by field key", async () => {
    vi.mocked(prisma.showcaseField.findMany).mockResolvedValue([
      { key: "hero.headline", value: "Protect the Coast", valueJson: null },
      { key: "feature.war-room.bullets", value: "", valueJson: ["a", "b"] },
    ] as any);

    const caller = createCaller(ANON_CTX as any);
    const fields = await caller.getAll();

    expect(fields).toEqual({
      "hero.headline": { value: "Protect the Coast", valueJson: null },
      "feature.war-room.bullets": { value: "", valueJson: ["a", "b"] },
    });
  });
});

describe("cmsShowcase.update — admin-gated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an anonymous caller", async () => {
    const caller = createCaller(ANON_CTX as any);
    await expect(
      caller.update({ key: "hero.headline", value: "New copy" }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.showcaseField.upsert).not.toHaveBeenCalled();
  });

  it("rejects a tenant-scoped (non-platform-admin) caller", async () => {
    const caller = createCaller(tenantUserCtx(["tenant_superadmin"]) as any);
    await expect(
      caller.update({ key: "hero.headline", value: "New copy" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.showcaseField.upsert).not.toHaveBeenCalled();
  });

  it("a platform admin can upsert a field", async () => {
    vi.mocked(prisma.showcaseField.upsert).mockResolvedValue({
      id: "f-1",
      key: "hero.headline",
      value: "New copy",
    } as any);

    const caller = createCaller(platformAdminCtx() as any);
    const row = await caller.update({ key: "hero.headline", value: "New copy" });

    expect(row).toMatchObject({ id: "f-1", key: "hero.headline" });
    const call = vi.mocked(prisma.showcaseField.upsert).mock.calls[0]?.[0];
    expect(call?.where).toEqual({ key: "hero.headline" });
    expect(call?.update).toMatchObject({ value: "New copy", updatedById: "admin-1" });
  });
});
