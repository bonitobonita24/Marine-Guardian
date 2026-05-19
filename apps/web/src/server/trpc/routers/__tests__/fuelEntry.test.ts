import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    fuelEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tenant: {
      findFirst: vi.fn(),
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
import { fuelEntryRouter } from "../fuelEntry";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(fuelEntryRouter);

const TENANT_ID = "tenant-abc";
const OTHER_TENANT_ID = "tenant-xyz";
const USER_ID = "user-123";
const OTHER_USER_ID = "user-999";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["site_admin"],
  userId: string = USER_ID
) {
  return {
    session: {
      user: {
        id: userId,
        tenantId: tenantId as string,
        roles,
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

// Real-shape cuid for areaBoundaryId — zod cuid validator requires a 25-char id
// starting with 'c'. "ab-1" is rejected; we use a synthetic cuid throughout tests.
const AB_ID = "cabc123def456ghi789jkl012";

const VALID_CREATE_INPUT = {
  areaName: "Solan Bajo",
  areaBoundaryId: AB_ID,
  dateReceived: new Date("2026-05-10"),
  liters: "100.500",
  totalPrice: "1500000.00",
  receiptPhotoUrl: null,
  notes: null,
};

describe("fuelEntry.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated entries scoped to tenant", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      { id: "fe-1", tenantId: TENANT_ID },
      { id: "fe-2", tenantId: TENANT_ID },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(vi.mocked(prisma.fuelEntry.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });

  it("filters by areaBoundaryId and date range when provided", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");
    await caller.list({
      limit: 50,
      areaBoundaryId: "ab-1",
      dateReceivedFrom: from,
      dateReceivedTo: to,
    });

    expect(vi.mocked(prisma.fuelEntry.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{
          areaBoundaryId: string;
          dateReceived: { gte: Date; lte: Date };
        }>({
          areaBoundaryId: "ab-1",
          dateReceived: { gte: from, lte: to },
        }),
      })
    );
  });
});

describe("fuelEntry.getById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the entry when owned by current tenant", async () => {
    vi.mocked(prisma.fuelEntry.findFirst).mockResolvedValue({
      id: "fe-1",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "fe-1" });

    expect(result?.id).toBe("fe-1");
    expect(vi.mocked(prisma.fuelEntry.findFirst)).toHaveBeenCalledWith(
      partial({
        where: { id: "fe-1", tenantId: TENANT_ID },
      })
    );
  });

  it("returns null when entry belongs to a different tenant", async () => {
    vi.mocked(prisma.fuelEntry.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID));
    const result = await caller.getById({ id: "fe-other" });

    expect(result).toBeNull();
    expect(vi.mocked(prisma.fuelEntry.findFirst)).not.toHaveBeenCalledWith(
      partial({
        where: { id: "fe-other", tenantId: OTHER_TENANT_ID },
      })
    );
  });
});

describe("fuelEntry.create / update / delete (RBAC)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an entry with tenant scoping and currency snapshot from tenant", async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue({
      currency: "IDR",
    } as never);
    vi.mocked(prisma.fuelEntry.create).mockResolvedValue({
      id: "fe-new",
      tenantId: TENANT_ID,
      loggedByUserId: USER_ID,
      currency: "IDR",
    } as never);

    // Operator can log per fuel.log permission (spec §405)
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    const result = await caller.create(VALID_CREATE_INPUT);

    expect(result.id).toBe("fe-new");
    expect(vi.mocked(prisma.fuelEntry.create)).toHaveBeenCalledWith({
      data: partial<{
        tenantId: string;
        loggedByUserId: string;
        currency: string;
      }>({
        tenantId: TENANT_ID,
        loggedByUserId: USER_ID,
        currency: "IDR",
      }),
    });
  });

  it("update allows owner to edit their own entry (fuel.edit_own)", async () => {
    vi.mocked(prisma.fuelEntry.findFirst).mockResolvedValue({
      loggedByUserId: USER_ID,
    } as never);
    vi.mocked(prisma.fuelEntry.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await caller.update({ id: "fe-1", liters: "150.000" });

    expect(vi.mocked(prisma.fuelEntry.updateMany)).toHaveBeenCalledWith({
      where: { id: "fe-1", tenantId: TENANT_ID },
      data: partial<{ liters: string }>({ liters: "150.000" }),
    });
  });

  it("update rejects when operator tries to edit another user's entry", async () => {
    vi.mocked(prisma.fuelEntry.findFirst).mockResolvedValue({
      loggedByUserId: OTHER_USER_ID,
    } as never);

    const caller = createCaller(makeCtx(TENANT_ID, ["operator"], USER_ID));
    await expect(
      caller.update({ id: "fe-1", liters: "150.000" })
    ).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.fuelEntry.updateMany)).not.toHaveBeenCalled();
  });

  it("updateAny allows coordinator to edit any user's entry (fuel.edit_any)", async () => {
    vi.mocked(prisma.fuelEntry.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(
      makeCtx(TENANT_ID, ["field_coordinator"], USER_ID)
    );
    await caller.updateAny({ id: "fe-other-user", liters: "200.000" });

    expect(vi.mocked(prisma.fuelEntry.updateMany)).toHaveBeenCalledWith({
      where: { id: "fe-other-user", tenantId: TENANT_ID },
      data: partial<{ liters: string }>({ liters: "200.000" }),
    });
  });

  it("updateAny rejects operator role (fuel.edit_any requires coordinator+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));
    await expect(
      caller.updateAny({ id: "fe-1", liters: "200.000" })
    ).rejects.toThrow(TRPCError);
  });

  it("delete rejects coordinator role (fuel.delete requires site_admin+)", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["field_coordinator"]));
    await expect(caller.delete({ id: "fe-1" })).rejects.toThrow(TRPCError);
  });

  it("delete is scoped to tenant when admin role", async () => {
    vi.mocked(prisma.fuelEntry.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx(TENANT_ID, ["site_admin"]));
    await caller.delete({ id: "fe-1" });

    expect(vi.mocked(prisma.fuelEntry.deleteMany)).toHaveBeenCalledWith({
      where: { id: "fe-1", tenantId: TENANT_ID },
    });
  });
});
