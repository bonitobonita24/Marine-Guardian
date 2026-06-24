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
    impersonationTenantId: null,
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

describe("alertRule.create — canonical condition schema", () => {
  beforeEach(() => vi.clearAllMocks());

  // REGRESSION TEST: the rule created via the UI must store a conditionJson
  // shape that the alert evaluator (`ruleMatches`) will actually match.
  // Previously the form stored `{ severity: "critical" }` which the evaluator
  // ignores entirely — so no UI-created rule ever fired.
  it("stores canonical conditionJson { minPriority } that the evaluator understands", async () => {
    const created = {
      id: "ar-new",
      name: "High Priority Rule",
      tenantId: TENANT_ID,
      createdBy: USER_ID,
      // The stored conditionJson is what the evaluator will read.
      conditionJson: { minPriority: 200 },
    };
    vi.mocked(prisma.alertRule.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      name: "High Priority Rule",
      conditionJson: { minPriority: 200 },
      notificationChannels: ["in_app"],
    });

    expect(result.id).toBe("ar-new");
    // Verify the conditionJson passed to Prisma is the canonical shape.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(vi.mocked(prisma.alertRule.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
        conditionJson: { minPriority: 200 },
      }),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  it("stores canonical conditionJson { eventTypeId } for event-type rules", async () => {
    const created = {
      id: "ar-sos",
      name: "SOS Alert",
      tenantId: TENANT_ID,
      createdBy: USER_ID,
      conditionJson: { eventTypeId: "et-sos-id" },
    };
    vi.mocked(prisma.alertRule.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    await caller.create({
      name: "SOS Alert",
      conditionJson: { eventTypeId: "et-sos-id" },
      notificationChannels: ["in_app", "email"],
    });

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(vi.mocked(prisma.alertRule.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conditionJson: { eventTypeId: "et-sos-id" },
      }),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  it("stores catch-all rule when conditionJson is empty object", async () => {
    const created = { id: "ar-catchall", name: "All Events", tenantId: TENANT_ID, createdBy: USER_ID, conditionJson: {} };
    vi.mocked(prisma.alertRule.create).mockResolvedValue(created as never);

    const caller = createCaller(makeCtx());
    await caller.create({
      name: "All Events",
      conditionJson: {},
      notificationChannels: ["in_app"],
    });

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(vi.mocked(prisma.alertRule.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ conditionJson: {} }),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  it("rejects conditionJson with unknown fields (old severity shape)", async () => {
    const caller = createCaller(makeCtx());
    // { severity: "critical" } was the old broken shape — must now be rejected
    // by schema validation so no invalid rule can be persisted.
    await expect(
      caller.create({
        name: "Bad Rule",
        // @ts-expect-error intentionally passing invalid shape to test runtime validation
        conditionJson: { severity: "critical" },
        notificationChannels: ["in_app"],
      })
    ).rejects.toThrow();
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

  it("validates canonical conditionJson on update", async () => {
    vi.mocked(prisma.alertRule.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ar-1", conditionJson: { minPriority: 100 } });

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(vi.mocked(prisma.alertRule.updateMany)).toHaveBeenCalledWith({
      where: { id: "ar-1", tenantId: TENANT_ID },
      data: expect.objectContaining({ conditionJson: { minPriority: 100 } }),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
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
