/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-type-assertion */
// Mock-heavy router test: vi.mocked() over plain PrismaClient methods triggers
// unbound-method; `as never` casts on vi.fn() returns are required for some
// shapes but flagged on others. File-level disable matches project convention
// for tests that mock platformPrisma (unextended client).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: { count: vi.fn() },
    event: { count: vi.fn() },
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

import { platformPrisma, writeAuditLog } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { platformRouter } from "../platform";

// Typed partial matcher — avoids unsafe-assignment on objectContaining.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(platformRouter);

const USER_ID = "user-platform-001";

function makeCtx(tenantId = "", roles: string[] = ["super_admin"]) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId,
        roles,
        email: "platform@mg.local",
        name: "Platform Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

describe("platform — auth gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws FORBIDDEN when caller is not super_admin", async () => {
    const caller = createCaller(makeCtx("", ["site_admin"]));
    await expect(caller.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN when caller is super_admin but tenantId is non-empty", async () => {
    const caller = createCaller(makeCtx("tenant-scoped-001", ["super_admin"]));
    await expect(caller.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws UNAUTHORIZED when no session", async () => {
    const caller = createCaller({ session: null, ip: "127.0.0.1", impersonationTenantId: null });
    await expect(caller.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

// ---------------------------------------------------------------------------
// platform.list
// ---------------------------------------------------------------------------

describe("platform.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tenants with userCount + eventCount30d aggregated", async () => {
    const now = new Date("2026-01-01T00:00:00Z");

    const tenantRows = [
      {
        id: "cln1111111111aaaaaa",
        name: "Demo MPA",
        slug: "demo-mpa",
        isActive: true,
        earthrangerUrl: "https://er.demo.mpa",
        currency: "PHP",
        timezone: "Asia/Manila",
        createdAt: now,
        _count: { users: 5 },
      },
      {
        id: "cln2222222222bbbbbb",
        name: "Test Site",
        slug: "test-site",
        isActive: false,
        earthrangerUrl: null,
        currency: "IDR",
        timezone: "UTC",
        createdAt: now,
        _count: { users: 2 },
      },
    ];

    vi.mocked(platformPrisma.tenant.findMany).mockResolvedValue(
      tenantRows as never,
    );
    vi.mocked(platformPrisma.event.count)
      .mockResolvedValueOnce(12 as never)
      .mockResolvedValueOnce(3 as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "cln1111111111aaaaaa",
      name: "Demo MPA",
      slug: "demo-mpa",
      isActive: true,
      earthrangerUrl: "https://er.demo.mpa",
      currency: "PHP",
      timezone: "Asia/Manila",
      createdAt: now,
      userCount: 5,
      eventCount30d: 12,
    });
    expect(result[1]).toMatchObject({
      id: "cln2222222222bbbbbb",
      userCount: 2,
      eventCount30d: 3,
    });
  });

  it("handles empty tenant list", async () => {
    vi.mocked(platformPrisma.tenant.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list();

    expect(result).toEqual([]);
    expect(vi.mocked(platformPrisma.event.count)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// platform.metrics
// ---------------------------------------------------------------------------

describe("platform.metrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns totals for tenants, users, events", async () => {
    vi.mocked(platformPrisma.tenant.count).mockResolvedValue(7 as never);
    vi.mocked(platformPrisma.user.count).mockResolvedValue(42 as never);
    vi.mocked(platformPrisma.event.count).mockResolvedValue(300 as never);

    const caller = createCaller(makeCtx());
    const result = await caller.metrics();

    expect(result).toEqual({ totalTenants: 7, totalUsers: 42, totalEvents: 300 });
    expect(vi.mocked(platformPrisma.tenant.count)).toHaveBeenCalledOnce();
    expect(vi.mocked(platformPrisma.user.count)).toHaveBeenCalledOnce();
    expect(vi.mocked(platformPrisma.event.count)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// platform.create
// ---------------------------------------------------------------------------

describe("platform.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates tenant with valid name + slug and writes audit log", async () => {
    const created = {
      id: "cln3333333333cccccc",
      name: "New Reef",
      slug: "new-reef",
      timezone: "UTC",
      currency: "IDR",
      isActive: true,
      createdAt: new Date(),
    };

    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);
    vi.mocked(platformPrisma.tenant.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({ name: "New Reef", slug: "new-reef" });

    expect(result.id).toBe("cln3333333333cccccc");
    expect(result.slug).toBe("new-reef");

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial<{
        action: string;
        tenantId: null;
        entityType: string;
      }>({
        action: "PLATFORM:CREATE_TENANT",
        tenantId: null,
        entityType: "Tenant",
      }),
    );
  });

  it("throws CONFLICT when slug already exists", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: "cln9999999999zzzzzz",
    } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ name: "Duplicate", slug: "existing-slug" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects slug with uppercase letters", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ name: "Bad Slug", slug: "Bad-Slug" }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects slug starting with a hyphen", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({ name: "Bad Start", slug: "-bad-start" }),
    ).rejects.toThrow(TRPCError);
  });

  it("uses default timezone UTC and currency IDR when omitted", async () => {
    const created = {
      id: "cln4444444444dddddd",
      name: "Defaults",
      slug: "defaults",
      timezone: "UTC",
      currency: "IDR",
      isActive: true,
      createdAt: new Date(),
    };

    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);
    vi.mocked(platformPrisma.tenant.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    await caller.create({ name: "Defaults", slug: "defaults" });

    expect(vi.mocked(platformPrisma.tenant.create)).toHaveBeenCalledWith(
      partial({
        data: partial<{ timezone: string; currency: string }>({
          timezone: "UTC",
          currency: "IDR",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// platform.update
// ---------------------------------------------------------------------------

describe("platform.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates name only — update call contains only name in data", async () => {
    const existing = {
      id: "cln5555555555eeeeee",
      name: "Old Name",
      timezone: "UTC",
      currency: "IDR",
      syncFrequencySeconds: 300,
      isActive: true,
    };
    const updated = { ...existing, name: "New Name" };

    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(
      existing as never,
    );
    vi.mocked(platformPrisma.tenant.update).mockResolvedValue(updated as never);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "cln5555555555eeeeee", name: "New Name" });

    expect(vi.mocked(platformPrisma.tenant.update)).toHaveBeenCalledWith({
      where: { id: "cln5555555555eeeeee" },
      data: { name: "New Name" },
    });
  });

  it("updates all fields when provided", async () => {
    const existing = {
      id: "cln6666666666ffffff",
      name: "Alpha",
      timezone: "UTC",
      currency: "IDR",
      syncFrequencySeconds: 60,
      isActive: true,
    };
    const updated = {
      ...existing,
      name: "Beta",
      timezone: "Asia/Manila",
      currency: "PHP",
      syncFrequencySeconds: 120,
    };

    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(
      existing as never,
    );
    vi.mocked(platformPrisma.tenant.update).mockResolvedValue(updated as never);

    const caller = createCaller(makeCtx());
    const result = await caller.update({
      id: "cln6666666666ffffff",
      name: "Beta",
      timezone: "Asia/Manila",
      currency: "PHP",
      syncFrequencySeconds: 120,
    });

    expect(result.name).toBe("Beta");
    expect(vi.mocked(platformPrisma.tenant.update)).toHaveBeenCalledWith(
      partial({
        data: partial<{ name: string; timezone: string; currency: string }>({
          name: "Beta",
          timezone: "Asia/Manila",
          currency: "PHP",
        }),
      }),
    );
  });

  it("throws NOT_FOUND when tenant id does not exist", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "cln0000000000000000", name: "Ghost" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes audit log with PLATFORM:UPDATE_TENANT including before+after in changesJson", async () => {
    const existing = {
      id: "cln7777777777gggggg",
      name: "Before",
      timezone: "UTC",
      currency: "IDR",
      syncFrequencySeconds: 300,
      isActive: true,
    };
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(
      existing as never,
    );
    vi.mocked(platformPrisma.tenant.update).mockResolvedValue({
      ...existing,
      name: "After",
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "cln7777777777gggggg", name: "After" });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial<{
        action: string;
        entityId: string;
        changesJson: { before: { name: string }; after: { name: string } };
      }>({
        action: "PLATFORM:UPDATE_TENANT",
        entityId: "cln7777777777gggggg",
        changesJson: partial({
          before: partial<{ name: string }>({ name: "Before" }),
          after: partial<{ name: string }>({ name: "After" }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// platform.deactivate
// ---------------------------------------------------------------------------

describe("platform.deactivate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flips isActive to false and writes audit log", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: "cln8888888888hhhhhh",
      isActive: true,
    } as never);
    vi.mocked(platformPrisma.tenant.update).mockResolvedValue({} as never);

    const caller = createCaller(makeCtx());
    const result = await caller.deactivate({ id: "cln8888888888hhhhhh" });

    expect(result).toEqual({ id: "cln8888888888hhhhhh", isActive: false });
    expect(vi.mocked(platformPrisma.tenant.update)).toHaveBeenCalledWith({
      where: { id: "cln8888888888hhhhhh" },
      data: { isActive: false },
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      platformPrisma,
      partial<{ action: string; entityId: string }>({
        action: "PLATFORM:DEACTIVATE_TENANT",
        entityId: "cln8888888888hhhhhh",
      }),
    );
  });

  it("throws NOT_FOUND when tenant id is missing", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue(null as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.deactivate({ id: "cln0000000000000000" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when tenant already deactivated", async () => {
    vi.mocked(platformPrisma.tenant.findUnique).mockResolvedValue({
      id: "cln8888888888hhhhhh",
      isActive: false,
    } as never);

    const caller = createCaller(makeCtx());
    await expect(
      caller.deactivate({ id: "cln8888888888hhhhhh" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
