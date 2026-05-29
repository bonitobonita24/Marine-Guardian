import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    alertHistory: {
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
import { alertHistoryRouter } from "../alertHistory";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(alertHistoryRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
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

describe("alertHistory.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns alert history scoped to tenant", async () => {
    const mockItems = [
      {
        id: "h-1",
        tenantId: TENANT_ID,
        alertRuleId: "rule-1",
        eventId: "event-1",
        firedAt: new Date(),
        matchedPriority: 200,
        recipientCount: 2,
        ruleNameSnapshot: "Priority Alert",
        eventTitleSnapshot: "Poaching event",
        alertRule: { id: "rule-1", name: "Priority Alert" },
        event: { id: "event-1", title: "Poaching event", serialNumber: "E-001", state: "active" },
      },
    ];
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(mockItems);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(vi.mocked(prisma.alertHistory.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
        orderBy: { firedAt: "desc" },
      })
    );
  });

  it("filters by alertRuleId when provided", async () => {
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, alertRuleId: "rule-xyz" });

    expect(vi.mocked(prisma.alertHistory.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ alertRuleId: string }>({ alertRuleId: "rule-xyz" }),
      })
    );
  });

  it("paginates with nextCursor when more results exist than limit", async () => {
    const mockItems = Array.from({ length: 51 }, (_, i) => ({
      id: `h-${String(i)}`,
      tenantId: TENANT_ID,
      alertRuleId: "rule-1",
      eventId: "event-1",
      firedAt: new Date(),
      matchedPriority: 100,
      recipientCount: 1,
      ruleNameSnapshot: "Rule",
      eventTitleSnapshot: "Event",
      alertRule: null,
      event: null,
    }));
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(mockItems);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe("h-50");
  });

  it("returns no nextCursor when results fit within limit", async () => {
    const mockItems = Array.from({ length: 5 }, (_, i) => ({
      id: `h-${String(i)}`,
      tenantId: TENANT_ID,
      alertRuleId: "rule-1",
      eventId: "event-1",
      firedAt: new Date(),
      matchedPriority: 100,
      recipientCount: 1,
      ruleNameSnapshot: "Rule",
      eventTitleSnapshot: "Event",
      alertRule: null,
      event: null,
    }));
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(mockItems);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeUndefined();
  });

  it("throws UNAUTHORIZED when tenant context is missing", async () => {
    const caller = createCaller(makeCtx(null));

    await expect(caller.list({ limit: 50 })).rejects.toThrow(TRPCError);
  });
});
