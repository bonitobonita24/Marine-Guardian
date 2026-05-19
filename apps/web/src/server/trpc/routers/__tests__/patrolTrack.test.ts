import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    patrolTrack: {
      findMany: vi.fn(),
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
import { patrolTrackRouter } from "../patrolTrack";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(patrolTrackRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";
const OTHER_TENANT_ID = "tenant-xyz";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["operator"]
) {
  return {
    session: {
      user: {
        id: USER_ID,
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

describe("patrolTrack.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tracks scoped to current tenant only", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      { id: "pt-1", patrolId: "p-1", tenantId: TENANT_ID },
      { id: "pt-2", patrolId: "p-2", tenantId: TENANT_ID },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(vi.mocked(prisma.patrolTrack.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });

  it("filters by patrolId when provided", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, patrolId: "p-1" });

    expect(vi.mocked(prisma.patrolTrack.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ patrolId: string; tenantId: string }>({
          patrolId: "p-1",
          tenantId: TENANT_ID,
        }),
      })
    );
  });

  it("filters by patrolEnded when provided", async () => {
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, patrolEnded: false });

    expect(vi.mocked(prisma.patrolTrack.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ patrolEnded: boolean; tenantId: string }>({
          patrolEnded: false,
          tenantId: TENANT_ID,
        }),
      })
    );
  });
});

describe("patrolTrack.getById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the track when owned by current tenant", async () => {
    vi.mocked(prisma.patrolTrack.findFirst).mockResolvedValue({
      id: "pt-1",
      patrolId: "p-1",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getById({ id: "pt-1" });

    expect(result?.id).toBe("pt-1");
    expect(vi.mocked(prisma.patrolTrack.findFirst)).toHaveBeenCalledWith({
      where: { id: "pt-1", tenantId: TENANT_ID },
    });
  });

  it("returns null when track belongs to a different tenant (findFirst tenant scope)", async () => {
    // findFirst with tenant-scoped where returns null when the row exists
    // under a different tenantId — Prisma will NOT match it.
    vi.mocked(prisma.patrolTrack.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx(TENANT_ID));
    const result = await caller.getById({ id: "pt-other" });

    expect(result).toBeNull();
    expect(vi.mocked(prisma.patrolTrack.findFirst)).toHaveBeenCalledWith({
      where: { id: "pt-other", tenantId: TENANT_ID },
    });
    // Sanity: never call with the other tenant's id
    expect(vi.mocked(prisma.patrolTrack.findFirst)).not.toHaveBeenCalledWith({
      where: { id: "pt-other", tenantId: OTHER_TENANT_ID },
    });
  });
});

describe("patrolTrack.getByPatrolId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the track for the patrol (tenant-scoped)", async () => {
    vi.mocked(prisma.patrolTrack.findFirst).mockResolvedValue({
      id: "pt-1",
      patrolId: "p-1",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.getByPatrolId({ patrolId: "p-1" });

    expect(result?.patrolId).toBe("p-1");
    expect(vi.mocked(prisma.patrolTrack.findFirst)).toHaveBeenCalledWith({
      where: { patrolId: "p-1", tenantId: TENANT_ID },
    });
  });

  it("returns null when patrol has no materialized track yet", async () => {
    vi.mocked(prisma.patrolTrack.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    const result = await caller.getByPatrolId({ patrolId: "p-untracked" });

    expect(result).toBeNull();
  });
});
