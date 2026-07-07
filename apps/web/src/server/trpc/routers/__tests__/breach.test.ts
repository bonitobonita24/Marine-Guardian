import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * Breach-notification router — NPC Circular 16-03 unit tests (V32.9).
 * Admin-gated, tenant-scoped, audited. Mirrors settings.test.ts harness.
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    breachNotificationRecord: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
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

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { breachRouter } from "../breach";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(breachRouter);
const TENANT_ID = "tenant-abc";
const USER_ID = "admin-1";

function makeCtx(tenantId: string | null = TENANT_ID, roles: string[] = ["super_admin"]) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        email: "admin@example.com",
        name: "Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const stubBreach = {
  id: "breach-1",
  severity: "high",
  status: "detected",
  detectedAt: new Date("2026-06-02T00:00:00Z"),
  npcNotifiedAt: null,
  subjectsNotifiedAt: null,
  writtenReportDueAt: new Date("2026-06-12T00:00:00Z"),
  writtenReportSubmittedAt: null,
  affectedUserCount: 3,
  description: "Test breach",
  recordedByUserId: USER_ID,
  createdAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("breach.record", () => {
  it("rejects a non-admin (operator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(
      caller.record({
        severity: "low",
        detectedAt: new Date(),
        affectedUserCount: 0,
        description: "x",
      }),
    ).rejects.toThrow(TRPCError);
  });

  // administrator: Settings/breach-register mutations are gated to
  // superAdminProcedure (super_admin ONLY) — administrator is rejected.
  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(
      caller.record({
        severity: "low",
        detectedAt: new Date(),
        affectedUserCount: 0,
        description: "x",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // site_admin (tightened 2026-07-07): Settings/breach-register is now
  // super_admin ONLY — site_admin was removed from superAdminProcedure.
  it("rejects site_admin with FORBIDDEN (Settings tightened to super_admin 2026-07-07)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await expect(
      caller.record({
        severity: "low",
        detectedAt: new Date(),
        affectedUserCount: 0,
        description: "x",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records a breach, computes writtenReportDueAt (72h + 5 business days), audits", async () => {
    vi.mocked(prisma.breachNotificationRecord.create).mockResolvedValue(stubBreach as never);
    const caller = createCaller(makeCtx());

    // Detected Mon 2026-06-01 00:00Z -> +72h = Thu 06-04 -> +5 business days = Thu 06-11.
    await caller.record({
      severity: "high",
      detectedAt: new Date("2026-06-01T00:00:00Z"),
      affectedUserCount: 3,
      description: "Unauthorized access to patrol records",
    });

    const createArg = vi.mocked(prisma.breachNotificationRecord.create).mock.calls[0]?.[0] as {
      data: { writtenReportDueAt: Date; detectedAt: Date; recordedByUserId: string; tenantId: string };
    };
    const detected = new Date("2026-06-01T00:00:00Z");
    const due = createArg.data.writtenReportDueAt;
    expect(due.getTime()).toBeGreaterThan(detected.getTime() + 72 * 3600 * 1000);
    // Due date must land on a weekday (Mon–Fri).
    expect([0, 6]).not.toContain(due.getDay());
    expect(createArg.data.recordedByUserId).toBe(USER_ID);
    expect(createArg.data.tenantId).toBe(TENANT_ID);

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "breach.record", entityType: "BreachNotificationRecord" }),
    );
  });
});

describe("breach.markNpcNotified", () => {
  it("transitions to NOTIFIED, sets npcNotifiedAt, audits", async () => {
    vi.mocked(prisma.breachNotificationRecord.findFirst).mockResolvedValue({
      id: "breach-1",
      status: "detected",
    } as never);
    vi.mocked(prisma.breachNotificationRecord.update).mockResolvedValue(stubBreach as never);
    const caller = createCaller(makeCtx());
    await caller.markNpcNotified({ breachId: "breach-1" });
    const npcArg = vi.mocked(prisma.breachNotificationRecord.update).mock.calls[0]?.[0] as {
      data: { status: string; npcNotifiedAt: Date };
    };
    expect(npcArg.data.status).toBe("notified");
    expect(npcArg.data.npcNotifiedAt).toBeInstanceOf(Date);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "breach.notify.npc" }),
    );
  });

  it("throws NOT_FOUND for a breach outside the tenant", async () => {
    vi.mocked(prisma.breachNotificationRecord.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.markNpcNotified({ breachId: "nope" })).rejects.toThrow(TRPCError);
  });
});

describe("breach.markSubjectsNotified", () => {
  it("sets subjectsNotifiedAt + audits", async () => {
    vi.mocked(prisma.breachNotificationRecord.findFirst).mockResolvedValue({ id: "breach-1" } as never);
    vi.mocked(prisma.breachNotificationRecord.update).mockResolvedValue(stubBreach as never);
    const caller = createCaller(makeCtx());
    await caller.markSubjectsNotified({ breachId: "breach-1" });
    const subjArg = vi.mocked(prisma.breachNotificationRecord.update).mock.calls[0]?.[0] as {
      data: { subjectsNotifiedAt: Date };
    };
    expect(subjArg.data.subjectsNotifiedAt).toBeInstanceOf(Date);
  });
});

describe("breach.submitReport", () => {
  it("transitions to REPORTED + sets writtenReportSubmittedAt", async () => {
    vi.mocked(prisma.breachNotificationRecord.findFirst).mockResolvedValue({ id: "breach-1" } as never);
    vi.mocked(prisma.breachNotificationRecord.update).mockResolvedValue(stubBreach as never);
    const caller = createCaller(makeCtx());
    await caller.submitReport({ breachId: "breach-1" });
    const reportArg = vi.mocked(prisma.breachNotificationRecord.update).mock.calls[0]?.[0] as {
      data: { status: string; writtenReportSubmittedAt: Date };
    };
    expect(reportArg.data.status).toBe("reported");
    expect(reportArg.data.writtenReportSubmittedAt).toBeInstanceOf(Date);
  });
});

describe("breach.list", () => {
  it("returns tenant-scoped breaches newest first", async () => {
    vi.mocked(prisma.breachNotificationRecord.findMany).mockResolvedValue([stubBreach] as never);
    const caller = createCaller(makeCtx());
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(vi.mocked(prisma.breachNotificationRecord.findMany)).toHaveBeenCalledWith(
      partial({ where: { tenantId: TENANT_ID }, orderBy: { detectedAt: "desc" } }),
    );
  });

  it("rejects a non-admin caller", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.list()).rejects.toThrow(TRPCError);
  });

  it("rejects administrator with FORBIDDEN (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
