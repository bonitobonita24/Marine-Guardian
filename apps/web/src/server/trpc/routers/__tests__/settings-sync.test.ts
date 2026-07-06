/**
 * Tests for settings.syncNow and settings.updateErSyncConfig — ops-milestone-1.
 *
 * These are the two new mutations added in M1 (q-ops-05).
 * syncNow: admin-only one-shot delta sync trigger, gated on verified connection.
 * updateErSyncConfig: admin-only recurring toggle + interval update.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenantErConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ""),
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

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

// ── @marine-guardian/jobs mock ────────────────────────────────────────────────
// Use vi.hoisted so the fns are available inside the vi.mock factory
// (vi.mock factories are hoisted to the top of the file by vitest).
const {
  mockEnqueueErSyncWithWatermark,
  mockScheduleRecurringErSync,
  mockRemoveRecurringErSync,
} = vi.hoisted(() => ({
  mockEnqueueErSyncWithWatermark: vi.fn<
    (tenantId: string, userId: string, syncType: string) => Promise<string>
  >(),
  mockScheduleRecurringErSync: vi.fn<
    (tenantId: string, userId: string, intervalMs?: number) => Promise<void>
  >(),
  mockRemoveRecurringErSync: vi.fn<(tenantId: string) => Promise<void>>(),
}));

vi.mock("@marine-guardian/jobs", () => ({
  enqueueErSyncWithWatermark: mockEnqueueErSyncWithWatermark,
  scheduleRecurringErSync: mockScheduleRecurringErSync,
  removeRecurringErSync: mockRemoveRecurringErSync,
}));

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { settingsRouter } from "../settings";

const createCaller = createCallerFactory(settingsRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-admin-1";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["site_admin"],
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles,
        email: "admin@example.com",
        name: "Admin User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const mockConnVerified = {
  id: "erc-1",
  tenantId: TENANT_ID,
  baseUrl: "https://er.example.com",
  apiTokenEnc: "enc:secret-token",
  status: "connected",
  lastValidatedAt: new Date("2026-06-21T09:00:00.000Z"),
  createdAt: new Date("2026-06-20"),
  updatedAt: new Date("2026-06-21"),
  recurringEnabled: false,
  intervalMs: 300_000,
};

// ── settings.syncNow ──────────────────────────────────────────────────────────

describe("settings.syncNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueErSyncWithWatermark.mockResolvedValue("job-id-1");
  });

  it("enqueues 5 sync jobs (all types) when connection is verified", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    const caller = createCaller(makeCtx());

    const result = await caller.syncNow();

    expect(result.enqueued).toBe(5);
    expect(result.jobIds).toHaveLength(5);
    // Verify enqueueErSyncWithWatermark called once per sync type
    expect(mockEnqueueErSyncWithWatermark).toHaveBeenCalledTimes(5);
  });

  it("calls enqueueErSyncWithWatermark with correct tenantId and userId", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    const caller = createCaller(makeCtx());

    await caller.syncNow();

    expect(mockEnqueueErSyncWithWatermark).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      expect.any(String),
    );
  });

  it("enqueues all expected sync types", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    const caller = createCaller(makeCtx());

    await caller.syncNow();

    const calledTypes = mockEnqueueErSyncWithWatermark.mock.calls.map(
      (c) => c[2],
    );
    expect(calledTypes).toContain("events");
    expect(calledTypes).toContain("patrols");
    expect(calledTypes).toContain("observations");
    expect(calledTypes).toContain("subjects");
    expect(calledTypes).toContain("event_types");
  });

  it("rejects with NOT_FOUND when no connection is configured", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    const caller = createCaller(makeCtx());

    await expect(caller.syncNow()).rejects.toThrow(TRPCError);
    await expect(caller.syncNow()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects with PRECONDITION_FAILED when connection is not verified (status=unchecked)", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue({
      ...mockConnVerified,
      status: "unchecked",
    });
    const caller = createCaller(makeCtx());

    await expect(caller.syncNow()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(mockEnqueueErSyncWithWatermark).not.toHaveBeenCalled();
  });

  it("rejects with PRECONDITION_FAILED when connection is in error state", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue({
      ...mockConnVerified,
      status: "error",
    });
    const caller = createCaller(makeCtx());

    await expect(caller.syncNow()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("rejects with FORBIDDEN when no tenant context (no tenantId)", async () => {
    const caller = createCaller(makeCtx(null));

    await expect(caller.syncNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects for non-admin users (operator role)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(caller.syncNow()).rejects.toThrow(TRPCError);
  });

  it("rejects administrator (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));

    await expect(caller.syncNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("writes an audit log entry on success", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    mockEnqueueErSyncWithWatermark.mockResolvedValue("job-xyz");
    const caller = createCaller(makeCtx());

    await caller.syncNow();

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "TRIGGER_ER_SYNC_NOW",
        tenantId: TENANT_ID,
        userId: USER_ID,
        severity: "info",
      }),
    );
  });
});

// ── settings.updateErSyncConfig ───────────────────────────────────────────────

describe("settings.updateErSyncConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScheduleRecurringErSync.mockResolvedValue(undefined);
    mockRemoveRecurringErSync.mockResolvedValue(undefined);
  });

  it("enables recurring sync and calls scheduleRecurringErSync", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConnVerified,
      recurringEnabled: true,
      intervalMs: 300_000,
    });
    const caller = createCaller(makeCtx());

    const result = await caller.updateErSyncConfig({ recurringEnabled: true });

    expect(mockScheduleRecurringErSync).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      300_000,
    );
    expect(mockRemoveRecurringErSync).not.toHaveBeenCalled();
    expect(result.recurringEnabled).toBe(true);
  });

  it("disables recurring sync and calls removeRecurringErSync", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue({
      ...mockConnVerified,
      recurringEnabled: true,
    });
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConnVerified,
      recurringEnabled: false,
    });
    const caller = createCaller(makeCtx());

    const result = await caller.updateErSyncConfig({ recurringEnabled: false });

    expect(mockRemoveRecurringErSync).toHaveBeenCalledWith(TENANT_ID);
    expect(mockScheduleRecurringErSync).not.toHaveBeenCalled();
    expect(result.recurringEnabled).toBe(false);
  });

  it("updates intervalMs and persists it", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConnVerified,
      recurringEnabled: true,
      intervalMs: 120_000,
    });
    const caller = createCaller(makeCtx());

    await caller.updateErSyncConfig({
      recurringEnabled: true,
      intervalMs: 120_000,
    });

    expect(prisma.tenantErConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ intervalMs: 120_000 }),
      }),
    );
    expect(mockScheduleRecurringErSync).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      120_000,
    );
  });

  it("rejects with PRECONDITION_FAILED when enabling on non-verified connection", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue({
      ...mockConnVerified,
      status: "unchecked",
    });
    const caller = createCaller(makeCtx());

    await expect(
      caller.updateErSyncConfig({ recurringEnabled: true }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockScheduleRecurringErSync).not.toHaveBeenCalled();
  });

  it("allows disabling even on non-verified connection (toggle off = cleanup)", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue({
      ...mockConnVerified,
      status: "error",
      recurringEnabled: true,
    });
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConnVerified,
      status: "error",
      recurringEnabled: false,
    });
    const caller = createCaller(makeCtx());

    // Disabling should not be blocked by connection status
    await expect(
      caller.updateErSyncConfig({ recurringEnabled: false }),
    ).resolves.toBeDefined();
    expect(mockRemoveRecurringErSync).toHaveBeenCalled();
  });

  it("rejects intervalMs below 60_000 (1 minute minimum)", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    const caller = createCaller(makeCtx());

    await expect(
      caller.updateErSyncConfig({ recurringEnabled: true, intervalMs: 30_000 }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects for non-admin users", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));

    await expect(
      caller.updateErSyncConfig({ recurringEnabled: true }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects administrator (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));

    await expect(
      caller.updateErSyncConfig({ recurringEnabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("writes an audit log entry on success", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(
      mockConnVerified,
    );
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConnVerified,
      recurringEnabled: false,
    });
    const caller = createCaller(makeCtx());

    await caller.updateErSyncConfig({ recurringEnabled: false });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "UPDATE_ER_SYNC_CONFIG",
        tenantId: TENANT_ID,
        userId: USER_ID,
        severity: "info",
      }),
    );
  });
});
