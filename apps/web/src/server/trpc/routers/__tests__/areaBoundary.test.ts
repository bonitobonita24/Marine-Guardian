import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    areaBoundary: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
import { areaBoundaryRouter } from "../areaBoundary";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(areaBoundaryRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["super_admin"]
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

const VALID_GEOMETRY = {
  type: "Polygon",
  coordinates: [
    [
      [120.0, -8.0],
      [120.1, -8.0],
      [120.1, -8.1],
      [120.0, -8.0],
    ],
  ],
};

describe("areaBoundary.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated boundaries scoped to tenant", async () => {
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValue([
      { id: "ab-1", name: "Solan Bajo", tenantId: TENANT_ID },
      { id: "ab-2", name: "Tulus Reef", tenantId: TENANT_ID },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(vi.mocked(prisma.areaBoundary.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string }>({ tenantId: TENANT_ID }),
      })
    );
  });

  it("filters by isEnabled and region when provided", async () => {
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, isEnabled: true, region: "Mindoro" });

    expect(vi.mocked(prisma.areaBoundary.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ isEnabled: boolean; region: string }>({
          isEnabled: true,
          region: "Mindoro",
        }),
      })
    );
  });
});

describe("areaBoundary.create / update / delete (RBAC)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a boundary with tenant and creator scoping", async () => {
    vi.mocked(prisma.areaBoundary.create).mockResolvedValue({
      id: "ab-new",
      name: "Apo Reef Park",
      tenantId: TENANT_ID,
      createdByUserId: USER_ID,
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.create({
      name: "Apo Reef Park",
      aliases: ["Apo Reef"],
      region: "Mindoro",
      source: "custom",
      geometryType: "Polygon",
      geometryGeojson: VALID_GEOMETRY,
      isEnabled: true,
      overrideOfficial: true,
      arcgisReferenceId: null,
    });

    expect(result.id).toBe("ab-new");
    expect(vi.mocked(prisma.areaBoundary.create)).toHaveBeenCalledWith({
      data: partial<{ tenantId: string; createdByUserId: string }>({
        tenantId: TENANT_ID,
        createdByUserId: USER_ID,
      }),
    });
  });

  it("rejects non-admin roles on create / update / delete", async () => {
    const caller = createCaller(makeCtx(TENANT_ID, ["operator"]));

    await expect(
      caller.create({
        name: "Boundary",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: VALID_GEOMETRY,
        isEnabled: true,
        overrideOfficial: false,
        arcgisReferenceId: null,
      })
    ).rejects.toThrow(TRPCError);

    await expect(caller.update({ id: "ab-1", isEnabled: false })).rejects.toThrow(
      TRPCError
    );

    await expect(caller.delete({ id: "ab-1" })).rejects.toThrow(TRPCError);
  });

  it("update is scoped to tenant", async () => {
    vi.mocked(prisma.areaBoundary.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ab-1", isEnabled: false });

    expect(vi.mocked(prisma.areaBoundary.updateMany)).toHaveBeenCalledWith({
      where: { id: "ab-1", tenantId: TENANT_ID },
      data: partial<{ isEnabled: boolean }>({ isEnabled: false }),
    });
  });

  it("delete is scoped to tenant", async () => {
    vi.mocked(prisma.areaBoundary.deleteMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.delete({ id: "ab-1" });

    expect(vi.mocked(prisma.areaBoundary.deleteMany)).toHaveBeenCalledWith({
      where: { id: "ab-1", tenantId: TENANT_ID },
    });
  });
});
