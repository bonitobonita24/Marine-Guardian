import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── mocks ──────────────────────────────────────────────────────────────────────

const _encryptImpl = (v: string) => `enc:${v}`;
const _decryptImpl = (v: string) => v.replace(/^enc:/, "");

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenantErConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    syncLog: {
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  encrypt: (v: string) => _encryptImpl(v),
  decrypt: (v: string) => _decryptImpl(v),
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

// ops-milestone-1: settings.ts now imports @marine-guardian/jobs for sync
// helpers — mock it so the existing connection tests are not affected.
vi.mock("@marine-guardian/jobs", () => ({
  enqueueErSyncWithWatermark: vi.fn().mockResolvedValue("job-id"),
  scheduleRecurringErSync: vi.fn().mockResolvedValue(undefined),
  removeRecurringErSync: vi.fn().mockResolvedValue(undefined),
}));

// Capture fetch calls so we can control probe results without real HTTP
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

import { prisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { settingsRouter } from "../settings";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(settingsRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-admin-1";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["site_admin"]
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

const mockConn = {
  id: "erc-1",
  tenantId: TENANT_ID,
  baseUrl: "https://er.example.com",
  apiTokenEnc: "enc:secret-token",
  status: "unchecked",
  lastValidatedAt: null,
  createdAt: new Date("2026-06-16"),
  updatedAt: new Date("2026-06-16"),
  // ops-milestone-1 fields
  recurringEnabled: false,
  intervalMs: 300_000,
};

// ── settings.getErConnection ───────────────────────────────────────────────────

describe("settings.getErConnection", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns null when no connection is configured", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    expect(await caller.getErConnection()).toBeNull();
  });

  it("returns masked connection — apiTokenMasked is set, raw token NOT returned", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    const caller = createCaller(makeCtx());
    const result = await caller.getErConnection();
    expect(result).not.toBeNull();
    expect(result?.apiTokenMasked).toBe("••••••••");
    // The raw encrypted (or plain) token must never appear in the output
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("enc:");
  });

  it("returns baseUrl, status, lastValidatedAt correctly", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    const caller = createCaller(makeCtx());
    const result = await caller.getErConnection();
    expect(result).toMatchObject({
      baseUrl: "https://er.example.com",
      status: "unchecked",
      lastValidatedAt: null,
    });
  });

  it("scopes query to authenticated tenantId", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await caller.getErConnection();
    expect(vi.mocked(prisma.tenantErConnection.findUnique)).toHaveBeenCalledWith(
      partial({ where: { tenantId: TENANT_ID } })
    );
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.getErConnection()).rejects.toThrow(TRPCError);
  });
});

// ── settings.upsertErConnection ───────────────────────────────────────────────

describe("settings.upsertErConnection", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("encrypts the token and upserts the connection", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenantErConnection.upsert).mockResolvedValue(mockConn);

    const caller = createCaller(makeCtx());
    const result = await caller.upsertErConnection({
      baseUrl: "https://er.example.com",
      apiToken: "secret-token",
    });

    // Token must be encrypted in the DB call — not plaintext
    expect(vi.mocked(prisma.tenantErConnection.upsert)).toHaveBeenCalledWith(
      partial({
        create: partial({ apiTokenEnc: "enc:secret-token" }),
      })
    );
    // Masked in the response
    expect(result.apiTokenMasked).toBe("••••••••");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("requires apiToken on create (no existing row)", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.upsertErConnection({ baseUrl: "https://er.example.com" })
    ).rejects.toThrow(TRPCError);
  });

  it("preserves existing token when apiToken is omitted on update", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    vi.mocked(prisma.tenantErConnection.upsert).mockResolvedValue(mockConn);

    const caller = createCaller(makeCtx());
    await caller.upsertErConnection({ baseUrl: "https://er2.example.com" });

    const upsertCall = vi.mocked(prisma.tenantErConnection.upsert).mock.calls[0]?.[0] as {
      create: { apiTokenEnc: string };
    };
    expect(upsertCall.create.apiTokenEnc).toBe("enc:secret-token");
  });

  it("writes an audit log entry on success", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.tenantErConnection.upsert).mockResolvedValue(mockConn);

    const caller = createCaller(makeCtx());
    await caller.upsertErConnection({
      baseUrl: "https://er.example.com",
      apiToken: "secret-token",
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "UPSERT_ER_CONNECTION", tenantId: TENANT_ID })
    );
  });

  it("throws FORBIDDEN for non-admin roles (field_coordinator)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(
      caller.upsertErConnection({ baseUrl: "https://er.example.com", apiToken: "tok" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN for non-admin roles (operator)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(
      caller.upsertErConnection({ baseUrl: "https://er.example.com", apiToken: "tok" })
    ).rejects.toThrow(TRPCError);
  });

  // administrator (narrowed 2026-07-06): full app access EXCEPT Users AND
  // Settings — Settings mutations moved from adminProcedure to
  // siteAdminProcedure (super_admin + site_admin ONLY), so administrator
  // must now be rejected here too (it previously passed via adminProcedure).
  it("throws FORBIDDEN for administrator (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(
      caller.upsertErConnection({ baseUrl: "https://er.example.com", apiToken: "tok" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.upsertErConnection({ baseUrl: "https://er.example.com", apiToken: "tok" })
    ).rejects.toThrow(TRPCError);
  });
});

// ── settings.testErConnection ─────────────────────────────────────────────────

describe("settings.testErConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("probes the ER URL with the decrypted token and marks status=connected on success", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConn,
      status: "connected",
      lastValidatedAt: new Date(),
    });
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const caller = createCaller(makeCtx());
    const result = await caller.testErConnection();

    // Probe should have been called with the decrypted token (not enc:)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("er.example.com"),
      partial({ headers: partial({ Authorization: "Bearer secret-token" }) })
    );
    expect(result.status).toBe("connected");
    expect(result.probeResult.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("marks status=error on failed probe", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConn,
      status: "error",
      lastValidatedAt: new Date(),
    });
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as Response);

    const caller = createCaller(makeCtx());
    const result = await caller.testErConnection();

    expect(result.probeResult.ok).toBe(false);
    expect(result.status).toBe("error");
  });

  it("throws NOT_FOUND when no connection exists", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.testErConnection()).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN for non-admin roles", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.testErConnection()).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN for administrator (Settings excluded 2026-07-06)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["administrator"]));
    await expect(caller.testErConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("writes an audit log entry on test", async () => {
    vi.mocked(prisma.tenantErConnection.findUnique).mockResolvedValue(mockConn);
    vi.mocked(prisma.tenantErConnection.update).mockResolvedValue({
      ...mockConn,
      status: "connected",
      lastValidatedAt: new Date(),
    });
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const caller = createCaller(makeCtx());
    await caller.testErConnection();

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "TEST_ER_CONNECTION", tenantId: TENANT_ID })
    );
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.testErConnection()).rejects.toThrow(TRPCError);
  });
});

// ── settings.getSyncLogs (M2, q-ops-10) ───────────────────────────────────────

describe("settings.getSyncLogs", () => {
  const mockLogs = [
    {
      id: "log-1",
      syncType: "full",
      status: "success",
      recordsSynced: 42,
      errorMessage: null,
      startedAt: new Date("2026-06-21T10:00:00Z"),
      completedAt: new Date("2026-06-21T10:00:05Z"),
    },
    {
      id: "log-2",
      syncType: "delta",
      status: "failed",
      recordsSynced: 0,
      errorMessage: "Connection timeout",
      startedAt: new Date("2026-06-21T09:00:00Z"),
      completedAt: new Date("2026-06-21T09:00:02Z"),
    },
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  it("returns last 10 sync log entries for the tenant", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue(mockLogs as never);
    const caller = createCaller(makeCtx());
    const result = await caller.getSyncLogs();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "log-1",
      syncType: "full",
      status: "success",
      recordsSynced: 42,
    });
  });

  it("scopes query to authenticated tenantId", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue(mockLogs as never);
    const caller = createCaller(makeCtx());
    await caller.getSyncLogs();
    expect(vi.mocked(prisma.syncLog.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ tenantId: TENANT_ID }),
      })
    );
  });

  it("orders results newest-first", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue(mockLogs as never);
    const caller = createCaller(makeCtx());
    await caller.getSyncLogs();
    expect(vi.mocked(prisma.syncLog.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        orderBy: expect.objectContaining({ startedAt: "desc" }),
      })
    );
  });

  it("limits results to 10 entries", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.getSyncLogs();
    expect(vi.mocked(prisma.syncLog.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("returns empty array when no sync runs exist", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    const result = await caller.getSyncLogs();
    expect(result).toEqual([]);
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.getSyncLogs()).rejects.toThrow(TRPCError);
  });

  it("is accessible to non-admin roles (tenantProcedure)", async () => {
    vi.mocked(prisma.syncLog.findMany).mockResolvedValue(mockLogs as never);
    // field_coordinator is a non-admin role — getSyncLogs should be readable by all tenant members
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.getSyncLogs()).resolves.toBeDefined();
  });
});
