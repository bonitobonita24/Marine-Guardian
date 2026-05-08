import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    alertRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
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
import { alertRuleRouter } from "../alertRule";

// Typed wrapper around expect.objectContaining — vitest matchers are typed `any`,
// which triggers @typescript-eslint/no-unsafe-assignment when nested in object literals.
function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(alertRuleRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["super_admin"]
) {
  return {
    session: {
      user: { id: USER_ID, tenantId: tenantId as string, roles, email: "test@example.com", name: "Test User" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

describe("alertRule.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated alert rules scoped to tenant", async () => {
    const mockItems = [
      { id: "ar-1", name: "High Priority", tenantId: TENANT_ID },
      { id: "ar-2", name: "Zone Breach", tenantId: TENANT_ID },
    ];
    vi.mocked(prisma.alertRule.findMany).mockResolvedValue(mockItems as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(vi.mocked(prisma.alertRule.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });

  it("filters by isActive when provided", async () => {
    vi.mocked(prisma.alertRule.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, isActive: true });

    expect(vi.mocked(prisma.alertRule.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ isActive: boolean }>({ isActive: true }),
      })
    );
  });
});

describe("alertRule.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an alert rule with tenant and creator scoping", async () => {
    const created = {
      id: "ar-new",
      name: "New Rule",
      tenantId: TENANT_ID,
      createdBy: USER_ID,
    };
    vi.mocked(prisma.alertRule.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      name: "New Rule",
      conditionJson: { severity: "critical" },
      notificationChannels: ["in_app"],
    });

    expect(result.id).toBe("ar-new");
    expect(vi.mocked(prisma.alertRule.create)).toHaveBeenCalledWith({
      data: partial<{ tenantId: string; createdBy: string }>({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
      }),
    });
  });

  it("rejects non-admin roles", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(
      caller.create({
        name: "Rule",
        conditionJson: {},
        notificationChannels: ["email"],
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("alertRule.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates scoped to tenant", async () => {
    vi.mocked(prisma.alertRule.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ar-1", isActive: false });

    expect(vi.mocked(prisma.alertRule.updateMany)).toHaveBeenCalledWith({
      where: { id: "ar-1", tenantId: TENANT_ID },
      data: partial<{ isActive: boolean }>({ isActive: false }),
    });
  });
});

describe("alertRule.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes scoped to tenant", async () => {
    vi.mocked(prisma.alertRule.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.delete({ id: "ar-1" });

    expect(vi.mocked(prisma.alertRule.deleteMany)).toHaveBeenCalledWith({
      where: { id: "ar-1", tenantId: TENANT_ID },
    });
  });

  it("rejects non-admin roles", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(caller.delete({ id: "ar-1" })).rejects.toThrow(TRPCError);
  });
});
