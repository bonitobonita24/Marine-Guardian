import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * DSR router — data-subject-rights unit tests (V32.9 / RA 10173 §16).
 * Mirrors settings.test.ts: mocks @marine-guardian/db and drives the router
 * through the real protected/admin procedure chains via createCallerFactory.
 *
 * Covers:
 *   access         — returns own data; never leaks passwordHash; records DSR + audit
 *   port           — portable export; records PORT
 *   rectify        — updates own profile; email conflict -> CONFLICT; bumps securityVersion
 *   requestErasure — creates a RECEIVED request (no immediate purge); legal-hold respected
 *   object         — records objection + consent-ledger row
 *   myRequests     — tenant + user scoped
 *   adminList / adminUpdateStatus — admin-gated, tenant-scoped, audited
 */

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    fuelEntry: { findMany: vi.fn() },
    reportExport: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    consentLog: { findMany: vi.fn(), create: vi.fn() },
    patrolSchedule: { findMany: vi.fn() },
    dataSubjectRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
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
import { dsrRouter } from "../dsr";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(dsrRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-1";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["operator"],
  userId: string = USER_ID,
) {
  return {
    session: {
      user: {
        id: userId,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        email: "user@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const stubUser = {
  id: USER_ID,
  email: "user@example.com",
  fullName: "Test User",
  role: "operator",
  languagePreference: "en",
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function resetEmpty() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(stubUser as never);
  vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.reportExport.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.consentLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.dataSubjectRequest.create).mockResolvedValue({ id: "dsr-1" } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── inform ───────────────────────────────────────────────────────────────────

describe("dsr.inform", () => {
  it("returns processing categories, retention, and the six rights", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.inform();
    expect(result.rights).toEqual([
      "inform",
      "access",
      "rectify",
      "erasure",
      "object",
      "port",
    ]);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.retention.length).toBeGreaterThan(0);
  });
});

// ── access ───────────────────────────────────────────────────────────────────

describe("dsr.access", () => {
  beforeEach(resetEmpty);

  it("returns own data, never leaks passwordHash, records DSR + audit", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.access();

    expect(result.user.id).toBe(USER_ID);
    expect(JSON.stringify(result)).not.toContain("passwordHash");

    expect(vi.mocked(prisma.dataSubjectRequest.create)).toHaveBeenCalledWith(
      partial({
        data: partial({ type: "access", status: "completed", tenantId: TENANT_ID, userId: USER_ID }),
      }),
    );
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "dsr.access", entityType: "DataSubjectRequest" }),
    );
  });

  it("scopes every sub-query to the session tenantId (not input)", async () => {
    const caller = createCaller(makeCtx());
    await caller.access();
    expect(vi.mocked(prisma.fuelEntry.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, loggedByUserId: USER_ID }) }),
    );
  });

  it("throws FORBIDDEN with no tenant context", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.access()).rejects.toThrow(TRPCError);
  });
});

// ── port ─────────────────────────────────────────────────────────────────────

describe("dsr.port", () => {
  beforeEach(resetEmpty);

  it("returns a JSON portable export + records a PORT request", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.port();
    expect(result.format).toBe("application/json");
    expect(result.data.user.id).toBe(USER_ID);
    expect(vi.mocked(prisma.dataSubjectRequest.create)).toHaveBeenCalledWith(
      partial({ data: partial({ type: "port", status: "completed" }) }),
    );
  });
});

// ── rectify ──────────────────────────────────────────────────────────────────

describe("dsr.rectify", () => {
  beforeEach(() => {
    vi.mocked(prisma.dataSubjectRequest.create).mockResolvedValue({ id: "dsr-2" } as never);
    vi.mocked(prisma.user.update).mockResolvedValue(stubUser as never);
  });

  it("updates fullName without bumping securityVersion", async () => {
    const caller = createCaller(makeCtx());
    await caller.rectify({ fullName: "New Name" });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith(
      partial({ where: { id: USER_ID }, data: partial({ fullName: "New Name" }) }),
    );
    const call = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty("securityVersion");
  });

  it("bumps securityVersion on email change", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await caller.rectify({ email: "new@example.com" });
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith(
      partial({ data: partial({ email: "new@example.com", securityVersion: { increment: 1 } }) }),
    );
  });

  it("rejects an email already in use with CONFLICT", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "other" } as never);
    const caller = createCaller(makeCtx());
    await expect(caller.rectify({ email: "taken@example.com" })).rejects.toThrow(TRPCError);
  });
});

// ── requestErasure ───────────────────────────────────────────────────────────

describe("dsr.requestErasure", () => {
  beforeEach(() => {
    vi.mocked(prisma.dataSubjectRequest.create).mockResolvedValue({ id: "dsr-3" } as never);
  });

  it("creates a RECEIVED erasure request (no immediate purge of the user)", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.requestErasure({ reason: "no longer a member" });
    expect(result.status).toBe("received");
    expect(vi.mocked(prisma.dataSubjectRequest.create)).toHaveBeenCalledWith(
      partial({ data: partial({ type: "erasure", status: "received" }) }),
    );
    // Legal-hold: the user record is NOT updated/deleted by the request itself.
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
  });
});

// ── object ───────────────────────────────────────────────────────────────────

describe("dsr.object", () => {
  beforeEach(() => {
    vi.mocked(prisma.dataSubjectRequest.create).mockResolvedValue({ id: "dsr-4" } as never);
    vi.mocked(prisma.consentLog.create).mockResolvedValue({} as never);
  });

  it("records an objection + a consent-ledger row (granted=false)", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.object({ purpose: "patrol-location-sharing" });
    expect(result.status).toBe("received");
    expect(vi.mocked(prisma.consentLog.create)).toHaveBeenCalledWith(
      partial({ data: partial({ purpose: "patrol-location-sharing", granted: false, tenantId: TENANT_ID }) }),
    );
  });
});

// ── myRequests ───────────────────────────────────────────────────────────────

describe("dsr.myRequests", () => {
  it("scopes to the caller tenant + user", async () => {
    vi.mocked(prisma.dataSubjectRequest.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.myRequests();
    expect(vi.mocked(prisma.dataSubjectRequest.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID, userId: USER_ID }) }),
    );
  });
});

// ── adminList / adminUpdateStatus (admin-gated) ──────────────────────────────

describe("dsr.adminList", () => {
  it("rejects a non-admin caller (operator) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.adminList(undefined)).rejects.toThrow(TRPCError);
  });

  it("allows site_admin and scopes to tenant", async () => {
    vi.mocked(prisma.dataSubjectRequest.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await caller.adminList(undefined);
    expect(vi.mocked(prisma.dataSubjectRequest.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) }),
    );
  });
});

describe("dsr.adminUpdateStatus", () => {
  it("sets resolvedAt on a terminal status + audits", async () => {
    vi.mocked(prisma.dataSubjectRequest.findFirst).mockResolvedValue({ id: "dsr-9" } as never);
    vi.mocked(prisma.dataSubjectRequest.update).mockResolvedValue({
      id: "dsr-9",
      type: "access",
      status: "completed",
      requestedAt: new Date(),
      dueAt: new Date(),
      resolvedAt: new Date(),
    } as never);
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await caller.adminUpdateStatus({ requestId: "dsr-9", status: "completed" });
    const updArg = vi.mocked(prisma.dataSubjectRequest.update).mock.calls[0]?.[0] as {
      data: { status: string; resolvedAt: Date };
    };
    expect(updArg.data.status).toBe("completed");
    expect(updArg.data.resolvedAt).toBeInstanceOf(Date);
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({ action: "dsr.updateStatus" }),
    );
  });

  it("throws NOT_FOUND when the request is outside the tenant", async () => {
    vi.mocked(prisma.dataSubjectRequest.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx(TENANT_ID, ["tenant_superadmin"]));
    await expect(
      caller.adminUpdateStatus({ requestId: "nope", status: "completed" }),
    ).rejects.toThrow(TRPCError);
  });
});
