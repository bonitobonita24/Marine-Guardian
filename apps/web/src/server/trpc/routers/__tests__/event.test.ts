import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
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
import { eventRouter } from "../event";

const createCaller = createCallerFactory(eventRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId,
        roles: ["ranger" as const],
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

describe("event.updateState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates event state for the authenticated tenant", async () => {
    const mockPrisma = vi.mocked(prisma);
    mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.updateState({ id: "ev-1", state: "active" });

    expect(result).toEqual({ count: 1 });
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: "ev-1", tenantId: TENANT_ID },
      data: { state: "active" },
    });
  });

  it("scopes the update to the tenant — never leaks cross-tenant", async () => {
    const mockPrisma = vi.mocked(prisma);
    mockPrisma.event.updateMany.mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.updateState({ id: "ev-1", state: "resolved" });

    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "other-tenant" }) })
    );
    // Critically: the tenantId in the where clause matches the session, not an arbitrary value
    const call = mockPrisma.event.updateMany.mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));

    await expect(
      caller.updateState({ id: "ev-1", state: "active" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects an invalid state value at the schema boundary", async () => {
    const caller = createCaller(makeCtx());

    await expect(
      // @ts-expect-error — intentionally passing invalid state to test schema validation
      caller.updateState({ id: "ev-1", state: "invalid_state" })
    ).rejects.toThrow();
  });
});
