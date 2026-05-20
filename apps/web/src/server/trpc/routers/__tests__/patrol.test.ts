import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    patrol: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
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
import { patrolRouter } from "../patrol";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(patrolRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        roles: ["ranger" as const],
        email: "test@example.com",
        name: "Test User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

describe("patrol.list — Sub-batch 4.1e area attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns patrols with area attribution fields surfacing as null when un-derived", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "pat-1",
        tenantId: TENANT_ID,
        erPatrolId: "er-1",
        title: "Morning patrol",
        patrolType: "foot",
        state: "open",
        areaName: null,
        areaBoundaryId: null,
        areaDerivedAt: null,
        segments: [],
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "pat-1",
      areaName: null,
      areaBoundaryId: null,
      areaDerivedAt: null,
    });
    expect(vi.mocked(prisma.patrol.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });

  it("surfaces populated area attribution fields when the derivation job has run", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "pat-2",
        tenantId: TENANT_ID,
        erPatrolId: "er-2",
        title: "Reef sweep",
        patrolType: "seaborne",
        state: "done",
        areaName: "Solan Bajo Reef",
        areaBoundaryId: "cab123boundary456789abcd",
        areaDerivedAt: new Date("2026-05-20T08:00:00Z"),
        segments: [],
      },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]).toMatchObject({
      areaName: "Solan Bajo Reef",
      areaBoundaryId: "cab123boundary456789abcd",
    });
    expect(result.items[0]?.areaDerivedAt).toBeInstanceOf(Date);
  });
});

describe("patrol.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the patrol with area attribution fields for the matching tenant", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue({
      id: "pat-1",
      tenantId: TENANT_ID,
      erPatrolId: "er-1",
      title: "Morning patrol",
      patrolType: "foot",
      state: "open",
      areaName: "Area 12",
      areaBoundaryId: null,
      areaDerivedAt: null,
      segments: [],
      accompanyingRangers: [],
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "pat-1" });

    expect(result).toMatchObject({
      id: "pat-1",
      areaName: "Area 12",
      areaBoundaryId: null,
    });
    expect(vi.mocked(prisma.patrol.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "pat-1", tenantId: TENANT_ID }) })
    );
  });

  it("returns null when the patrol is in a different tenant (cross-tenant isolation)", async () => {
    vi.mocked(prisma.patrol.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx("other-tenant"));
    const result = await caller.getById({ id: "pat-1" });

    expect(result).toBeNull();
    const call = vi.mocked(prisma.patrol.findFirst).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.getById({ id: "pat-1" })).rejects.toThrow(TRPCError);
  });
});

describe("patrol.stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts grouped by state, scoped to the tenant", async () => {
    vi.mocked(prisma.patrol.count)
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(4) // open
      .mockResolvedValueOnce(5) // done
      .mockResolvedValueOnce(1); // cancelled

    const caller = createCaller(makeCtx());
    const result = await caller.stats();

    expect(result).toEqual({ total: 10, open: 4, done: 5, cancelled: 1 });
    expect(vi.mocked(prisma.patrol.count)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(prisma.patrol.count)).toHaveBeenNthCalledWith(
      1,
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });
});
