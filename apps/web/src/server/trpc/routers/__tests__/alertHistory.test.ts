import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    alertHistory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
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

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { alertHistoryRouter } from "../alertHistory";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(alertHistoryRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["operator"],
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const stubAlert = {
  id: "h-1",
  tenantId: TENANT_ID,
  alertRuleId: "rule-1",
  eventId: "event-1",
  firedAt: new Date(),
  matchedPriority: 200,
  recipientCount: 2,
  ruleNameSnapshot: "Priority Alert",
  eventTitleSnapshot: "Poaching event",
  acknowledgedAt: null,
  acknowledgedBy: null,
  alertRule: { id: "rule-1", name: "Priority Alert" },
  event: { id: "event-1", title: "Poaching event", serialNumber: "E-001", state: "active" },
};

// ---------------------------------------------------------------------------
// alertHistory.list
// ---------------------------------------------------------------------------
describe("alertHistory.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns alert history scoped to tenant", async () => {
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([stubAlert]);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(vi.mocked(prisma.alertHistory.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
        orderBy: { firedAt: "desc" },
      }),
    );
  });

  it("filters by alertRuleId when provided", async () => {
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, alertRuleId: "rule-xyz" });

    expect(vi.mocked(prisma.alertHistory.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ alertRuleId: string }>({ alertRuleId: "rule-xyz" }),
      }),
    );
  });

  it("paginates with nextCursor when more results exist than limit", async () => {
    const mockItems = Array.from({ length: 51 }, (_, i) => ({
      ...stubAlert,
      id: `h-${String(i)}`,
    }));
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(mockItems);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe("h-50");
  });

  it("returns no nextCursor when results fit within limit", async () => {
    const mockItems = Array.from({ length: 5 }, (_, i) => ({
      ...stubAlert,
      id: `h-${String(i)}`,
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

// ---------------------------------------------------------------------------
// alertHistory.acknowledge
// ---------------------------------------------------------------------------
describe("alertHistory.acknowledge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-admin (operator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.acknowledge({ id: "h-1" })).rejects.toThrow(TRPCError);
  });

  it("rejects a field_coordinator with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.acknowledge({ id: "h-1" })).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND when alert belongs to a different tenant", async () => {
    vi.mocked(prisma.alertHistory.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(caller.acknowledge({ id: "h-other" })).rejects.toThrow(TRPCError);
  });

  it("sets acknowledgedAt + acknowledgedBy, writes audit log", async () => {
    // findFirst → unacknowledged row
    vi.mocked(prisma.alertHistory.findFirst).mockResolvedValue({
      id: "h-1",
      acknowledgedAt: null,
    } as never);

    const ackNow = new Date();
    vi.mocked(prisma.alertHistory.update).mockResolvedValue({
      id: "h-1",
      tenantId: TENANT_ID,
      acknowledgedAt: ackNow,
      acknowledgedBy: USER_ID,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.acknowledge({ id: "h-1" });

    // Update called with correct data
    const updateArg = vi.mocked(prisma.alertHistory.update).mock.calls[0]?.[0] as {
      where: { id: string };
      data: { acknowledgedAt: Date; acknowledgedBy: string };
    };
    expect(updateArg.where.id).toBe("h-1");
    expect(updateArg.data.acknowledgedAt).toBeInstanceOf(Date);
    expect(updateArg.data.acknowledgedBy).toBe(USER_ID);

    // Audit log written
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        action: "alertHistory.acknowledge",
        entityType: "AlertHistory",
        entityId: "h-1",
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    );

    expect(result.acknowledgedBy).toBe(USER_ID);
  });

  it("is idempotent — already-acked alerts are returned without re-auditing", async () => {
    const alreadyAckedAt = new Date("2026-06-21T08:00:00Z");
    vi.mocked(prisma.alertHistory.findFirst).mockResolvedValue({
      id: "h-1",
      acknowledgedAt: alreadyAckedAt,
    } as never);
    vi.mocked(prisma.alertHistory.findFirstOrThrow).mockResolvedValue({
      id: "h-1",
      tenantId: TENANT_ID,
      acknowledgedAt: alreadyAckedAt,
      acknowledgedBy: "some-admin",
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    const result = await caller.acknowledge({ id: "h-1" });

    // No update or audit when already acked
    expect(vi.mocked(prisma.alertHistory.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
    expect(result.acknowledgedAt).toEqual(alreadyAckedAt);
  });

  it("is tenant-scoped — the L6 WHERE clause includes tenantId", async () => {
    vi.mocked(prisma.alertHistory.findFirst).mockResolvedValue({
      id: "h-1",
      acknowledgedAt: null,
    } as never);
    vi.mocked(prisma.alertHistory.update).mockResolvedValue({
      id: "h-1",
      tenantId: TENANT_ID,
      acknowledgedAt: new Date(),
      acknowledgedBy: USER_ID,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["super_admin"]));
    await caller.acknowledge({ id: "h-1" });

    const findArg = vi.mocked(prisma.alertHistory.findFirst).mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(findArg.where.tenantId).toBe(TENANT_ID);
    expect(findArg.where.id).toBe("h-1");
  });

  it("throws UNAUTHORIZED when no tenant context", async () => {
    const caller = createCaller(makeCtx(null, ["site_admin"]));
    await expect(caller.acknowledge({ id: "h-1" })).rejects.toThrow(TRPCError);
  });
});

// ---------------------------------------------------------------------------
// alertHistory.unacknowledgedCount
// ---------------------------------------------------------------------------
describe("alertHistory.unacknowledgedCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unacknowledged count scoped to tenant, last 24h", async () => {
    vi.mocked(prisma.alertHistory.count).mockResolvedValue(3);

    const caller = createCaller(makeCtx());
    const result = await caller.unacknowledgedCount();

    expect(result.count).toBe(3);

    const countArg = vi.mocked(prisma.alertHistory.count).mock.calls[0]?.[0] as {
      where: { tenantId: string; acknowledgedAt: null; firedAt: { gte: Date } };
    };
    expect(countArg.where.tenantId).toBe(TENANT_ID);
    expect(countArg.where.acknowledgedAt).toBeNull();
    expect(countArg.where.firedAt.gte).toBeInstanceOf(Date);
    // gte must be approximately 24h ago
    const diffMs = Date.now() - countArg.where.firedAt.gte.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(23 * 3600 * 1000);
    expect(diffMs).toBeLessThanOrEqual(25 * 3600 * 1000);
  });

  it("returns 0 when all alerts are acknowledged", async () => {
    vi.mocked(prisma.alertHistory.count).mockResolvedValue(0);

    const caller = createCaller(makeCtx());
    const result = await caller.unacknowledgedCount();

    expect(result.count).toBe(0);
  });

  it("throws UNAUTHORIZED when no tenant context", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.unacknowledgedCount()).rejects.toThrow(TRPCError);
  });
});
