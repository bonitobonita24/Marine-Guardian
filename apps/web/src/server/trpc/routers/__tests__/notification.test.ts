import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
import { notificationRouter } from "../notification";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(notificationRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";

function makeCtx(tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: { id: USER_ID, tenantId: tenantId as string, roles: ["operator" as const], email: "test@example.com", name: "Test User" },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
  };
}

describe("notification.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns notifications scoped to tenant and user", async () => {
    const mockItems = [
      { id: "n-1", title: "Zone alert", tenantId: TENANT_ID, userId: USER_ID },
    ];
    vi.mocked(prisma.notification.findMany).mockResolvedValue(
      mockItems as never
    );

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    expect(vi.mocked(prisma.notification.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ tenantId: string; userId: string }>({
          tenantId: TENANT_ID,
          userId: USER_ID,
        }),
      })
    );
  });

  it("filters by notificationType when provided", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, notificationType: "critical" });

    expect(vi.mocked(prisma.notification.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ notificationType: string }>({ notificationType: "critical" }),
      })
    );
  });

  it("returns notification.patrol when patrolId is set", async () => {
    const mockPatrol = { id: "p-1", title: "Night Patrol", serialNumber: "NP-001" };
    const mockItems = [
      {
        id: "n-2",
        title: "Patrol started",
        tenantId: TENANT_ID,
        userId: USER_ID,
        patrolId: "p-1",
        patrol: mockPatrol,
        event: null,
      },
    ];
    vi.mocked(prisma.notification.findMany).mockResolvedValue(
      mockItems as never
    );

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.patrol).toEqual(mockPatrol);
  });

  it("returns notification.patrol === null when patrolId is null", async () => {
    const mockItems = [
      {
        id: "n-3",
        title: "Zone alert",
        tenantId: TENANT_ID,
        userId: USER_ID,
        patrolId: null,
        patrol: null,
        event: null,
      },
    ];
    vi.mocked(prisma.notification.findMany).mockResolvedValue(
      mockItems as never
    );

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.patrol).toBeNull();
  });
});

describe("notification.markRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a single notification as read scoped to tenant+user", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.markRead({ id: "n-1" });

    expect(vi.mocked(prisma.notification.updateMany)).toHaveBeenCalledWith({
      where: { id: "n-1", tenantId: TENANT_ID, userId: USER_ID },
      data: { isRead: true },
    });
  });
});

describe("notification.markAllRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks all unread notifications as read for the user", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 5 });

    const caller = createCaller(makeCtx());
    await caller.markAllRead();

    expect(vi.mocked(prisma.notification.updateMany)).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, userId: USER_ID, isRead: false },
      data: { isRead: true },
    });
  });
});

describe("notification.unreadCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns count scoped to tenant and user", async () => {
    vi.mocked(prisma.notification.count).mockResolvedValue(3);

    const caller = createCaller(makeCtx());
    const count = await caller.unreadCount();

    expect(count).toBe(3);
    expect(vi.mocked(prisma.notification.count)).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, userId: USER_ID, isRead: false },
    });
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.unreadCount()).rejects.toThrow(TRPCError);
  });
});
