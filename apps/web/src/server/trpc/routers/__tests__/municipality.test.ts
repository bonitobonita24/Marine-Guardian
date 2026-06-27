/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: {
      findMany: vi.fn(),
    },
  },
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
import { municipalityRouter } from "../municipality";

const createCaller = createCallerFactory(municipalityRouter);

const TENANT_ID = "tenant-abc";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: "user-123",
        tenantId: tenantId as string,
        roles: ["operator" as const],
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("municipality.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the tenant's municipalities ordered by name", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "m-1", name: "Calapan City", province: "Oriental Mindoro", slug: "calapan-city" },
      { id: "m-2", name: "Naujan", province: "Oriental Mindoro", slug: "naujan" },
    ] as any);

    const caller = createCaller(makeCtx());
    const result = await caller.list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "m-1", name: "Calapan City" });

    const call = vi.mocked(prisma.municipality.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: TENANT_ID });
    expect(call?.orderBy).toMatchObject({ name: "asc" });
    expect(call?.select).toMatchObject({
      id: true,
      name: true,
      province: true,
      slug: true,
    });
  });

  it("scopes the query to the authenticated tenant — never leaks cross-tenant", async () => {
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.list();

    const call = vi.mocked(prisma.municipality.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ tenantId: "other-tenant" });
  });
});
