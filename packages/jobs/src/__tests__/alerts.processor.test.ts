// alerts.processor.test.ts
// Tests for the Alert Rule Evaluation Engine
//
// Match fields used: conditionJson.eventTypeId, conditionJson.priority, conditionJson.state
// Recipient resolution: default fallback — all users with super_admin/admin role in tenant

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AlertJobPayload } from "../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

// vi.mock() is hoisted to top of file by vitest — use vi.hoisted() so factory
// can reference mockTransaction and mockTx without temporal dead zone errors.
const { mockTransaction, mockTx } = vi.hoisted(() => {
  const mockTx = {
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const mockTransaction = vi.fn().mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
  );
  return { mockTransaction, mockTx };
});

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    $transaction: mockTransaction,
    event: { findFirst: vi.fn() },
    alertRule: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { platformPrisma } from "@marine-guardian/db";
import { validateTenantContext } from "../workers/base-worker";
import { evaluateAlerts } from "../processors/alerts.processor";

const mockPrisma = platformPrisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  event: { findFirst: ReturnType<typeof vi.fn> };
  alertRule: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
};

const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;

function makeJob(overrides: Partial<AlertJobPayload> = {}) {
  return {
    id: "test-alert-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-system",
      alertRuleId: "",
      eventId: "event-1",
      priority: 0,
      ...overrides,
    },
  } as unknown as Job<AlertJobPayload>;
}

const mockEvent = {
  id: "event-1",
  tenantId: "tenant-1",
  eventTypeId: "et-poaching",
  priority: 200,
  state: "active",
  title: "Illegal fishing spotted",
};

const mockRule = {
  id: "rule-1",
  tenantId: "tenant-1",
  name: "High Priority Poaching Alert",
  conditionJson: {
    eventTypeId: "et-poaching",
    minPriority: 100,
  },
  isActive: true,
  notificationChannels: ["in_app"],
};

const mockAdminUser = {
  id: "admin-user-1",
  tenantId: "tenant-1",
  role: "site_admin",
};

const mockSuperAdminUser = {
  id: "super-admin-user-1",
  tenantId: "tenant-1",
  role: "super_admin",
};

describe("evaluateAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.notification.create.mockResolvedValue({ id: "notif-1" });
    mockTx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  // (a) tenant validation: missing tenantId → throws/rejects
  it("throws when validateTenantContext rejects (missing tenantId)", async () => {
    mockValidate.mockImplementationOnce(() => {
      throw new Error("tenantId is required");
    });

    const job = makeJob({ tenantId: "" });
    await expect(evaluateAlerts(job)).rejects.toThrow("tenantId is required");

    expect(mockPrisma.event.findFirst).not.toHaveBeenCalled();
  });

  // (b) no active rules → returns rulesMatched: 0, notificationsCreated: 0
  it("returns zero matches when no active rules exist for tenant", async () => {
    mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
    mockPrisma.alertRule.findMany.mockResolvedValue([]);

    const result = await evaluateAlerts(makeJob());

    expect(result.rulesEvaluated).toBe(0);
    expect(result.rulesMatched).toBe(0);
    expect(result.notificationsCreated).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // (c) one matching rule + one recipient → creates one Notification with correct fields
  it("creates one Notification with correct fields when rule matches and recipient exists", async () => {
    mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
    mockPrisma.alertRule.findMany.mockResolvedValue([mockRule]);
    mockPrisma.user.findMany.mockResolvedValue([mockAdminUser]);

    const result = await evaluateAlerts(makeJob());

    expect(result.rulesEvaluated).toBe(1);
    expect(result.rulesMatched).toBe(1);
    expect(result.notificationsCreated).toBe(1);

    expect(mockTx.notification.create).toHaveBeenCalledOnce();
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(mockTx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          userId: "admin-user-1",
          alertRuleId: "rule-1",
          eventId: "event-1",
          isRead: false,
          title: expect.any(String),
          message: expect.any(String),
          notificationType: expect.stringMatching(/^(critical|warning|info|system)$/),
        }),
      }),
    );

    expect(mockTx.auditLog.create).toHaveBeenCalledOnce();
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ALERT_FIRED",
          entityType: "Notification",
        }),
      }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  // (d) one matching rule + zero recipients → returns notificationsCreated: 0 (do not fail)
  it("returns notificationsCreated: 0 when rule matches but no recipients found", async () => {
    mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
    mockPrisma.alertRule.findMany.mockResolvedValue([mockRule]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await evaluateAlerts(makeJob());

    expect(result.rulesMatched).toBe(1);
    expect(result.notificationsCreated).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // (e) Prisma error during notification create → throws and does NOT partial-commit
  it("throws if transaction fails and does not partial-commit", async () => {
    mockPrisma.event.findFirst.mockResolvedValue(mockEvent);
    mockPrisma.alertRule.findMany.mockResolvedValue([mockRule]);
    mockPrisma.user.findMany.mockResolvedValue([mockSuperAdminUser]);

    const txError = new Error("DB connection lost");
    mockTransaction.mockRejectedValueOnce(txError);

    await expect(evaluateAlerts(makeJob())).rejects.toThrow("DB connection lost");

    // Transaction was attempted but failed atomically — no partial notifications
    expect(mockTx.notification.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });
});
