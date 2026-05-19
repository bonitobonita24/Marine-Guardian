import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    notificationRecipient: {
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

// 25-char cuid-shaped IDs (z.cuid()-strict): start with 'c', 24 alphanumerics.
const TENANT_ID = "ctenantabcdefghijk0123456";
const USER_ID = "cuser123abcdefghijklmno12";

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

  it("returns notifications scoped to user with tenant join, flattened shape", async () => {
    const mockRecipients = [
      {
        id: "crecip000000000000000abc1",
        notificationId: "cnotifa00000000000000abcd",
        userId: USER_ID,
        isRead: false,
        readAt: null,
        notification: {
          id: "cnotifa00000000000000abcd",
          tenantId: TENANT_ID,
          alertRuleId: null,
          eventId: null,
          patrolId: null,
          subjectId: null,
          title: "Zone alert",
          message: "Sub entered restricted zone",
          notificationType: "warning",
          createdAt: new Date("2026-05-19T10:00:00Z"),
          event: null,
          patrol: null,
        },
      },
    ];
    vi.mocked(prisma.notificationRecipient.findMany).mockResolvedValue(
      mockRecipients as never,
    );

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(1);
    // Flattened shape: notification fields appear at top level.
    expect(result.items[0]?.title).toBe("Zone alert");
    expect(result.items[0]?.notificationType).toBe("warning");
    expect(result.items[0]?.isRead).toBe(false);
    // ID is the NotificationRecipient.id (used by markRead).
    expect(result.items[0]?.id).toBe("crecip000000000000000abc1");
    expect(result.items[0]?.notificationId).toBe("cnotifa00000000000000abcd");
    expect(vi.mocked(prisma.notificationRecipient.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ userId: string; notification: { tenantId: string } }>({
          userId: USER_ID,
          notification: { tenantId: TENANT_ID },
        }),
      }),
    );
  });

  it("filters by isRead (applied to recipient.isRead)", async () => {
    vi.mocked(prisma.notificationRecipient.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, isRead: false });

    expect(vi.mocked(prisma.notificationRecipient.findMany)).toHaveBeenCalledWith(
      partial({
        where: partial<{ isRead: boolean }>({ isRead: false }),
      }),
    );
  });

  it("filters by notificationType (applied to joined Notification.notificationType, tenant-scoped)", async () => {
    vi.mocked(prisma.notificationRecipient.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, notificationType: "critical" });

    const call = vi.mocked(prisma.notificationRecipient.findMany).mock.calls[0]?.[0];
    expect(call?.where?.notification).toEqual({
      tenantId: TENANT_ID,
      notificationType: "critical",
    });
  });

  it("returns notification.patrol when patrolId is set (flattened)", async () => {
    const mockPatrol = { id: "cpatrol00000000000000abcd", title: "Night Patrol", serialNumber: "NP-001" };
    const mockRecipients = [
      {
        id: "crecip000000000000000abc2",
        notificationId: "cnotifa00000000000000xyz1",
        userId: USER_ID,
        isRead: false,
        readAt: null,
        notification: {
          id: "cnotifa00000000000000xyz1",
          tenantId: TENANT_ID,
          alertRuleId: null,
          eventId: null,
          patrolId: "cpatrol00000000000000abcd",
          subjectId: null,
          title: "Patrol started",
          message: "patrol began",
          notificationType: "info",
          createdAt: new Date(),
          event: null,
          patrol: mockPatrol,
        },
      },
    ];
    vi.mocked(prisma.notificationRecipient.findMany).mockResolvedValue(
      mockRecipients as never,
    );

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items[0]?.patrol).toEqual(mockPatrol);
    expect(result.items[0]?.patrolId).toBe("cpatrol00000000000000abcd");
  });

  it("uses NotificationRecipient.id as the pagination cursor", async () => {
    vi.mocked(prisma.notificationRecipient.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, cursor: "crecip000000000000000ccc1" });

    expect(vi.mocked(prisma.notificationRecipient.findMany)).toHaveBeenCalledWith(
      partial({ cursor: { id: "crecip000000000000000ccc1" } }),
    );
  });
});

describe("notification.markRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the current user's recipient row as read (scoped by userId + tenant via join)", async () => {
    vi.mocked(prisma.notificationRecipient.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    await caller.markRead({ id: "crecip000000000000000abc1" });

    expect(vi.mocked(prisma.notificationRecipient.updateMany)).toHaveBeenCalledWith({
      where: {
        id: "crecip000000000000000abc1",
        userId: USER_ID,
        notification: { tenantId: TENANT_ID },
      },
      data: expect.objectContaining({ isRead: true }) as { isRead: boolean },
    });
  });

  it("cross-user attempt returns count=0 silently (ownership enforced via userId in WHERE)", async () => {
    // Simulate scenario: user A tries to mark user B's recipient — updateMany
    // returns count=0 because the WHERE clause forces userId match.
    vi.mocked(prisma.notificationRecipient.updateMany).mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx());
    const result = await caller.markRead({ id: "crecip000000000000000foreign1" });

    expect(result.count).toBe(0);
    // No throw — silent failure for safety.
    const call = vi.mocked(prisma.notificationRecipient.updateMany).mock.calls[0]?.[0];
    expect(call?.where?.userId).toBe(USER_ID);
  });
});

describe("notification.markAllRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks only the current user's unread recipients (scoped by userId + tenant via join)", async () => {
    vi.mocked(prisma.notificationRecipient.updateMany).mockResolvedValue({ count: 5 });

    const caller = createCaller(makeCtx());
    await caller.markAllRead();

    expect(vi.mocked(prisma.notificationRecipient.updateMany)).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        isRead: false,
        notification: { tenantId: TENANT_ID },
      },
      data: expect.objectContaining({ isRead: true }) as { isRead: boolean },
    });
  });
});

describe("notification.unreadCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns count scoped to user + tenant via join", async () => {
    vi.mocked(prisma.notificationRecipient.count).mockResolvedValue(3);

    const caller = createCaller(makeCtx());
    const count = await caller.unreadCount();

    expect(count).toBe(3);
    expect(vi.mocked(prisma.notificationRecipient.count)).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        isRead: false,
        notification: { tenantId: TENANT_ID },
      },
    });
  });

  it("throws FORBIDDEN when tenantId is absent", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.unreadCount()).rejects.toThrow(TRPCError);
  });
});
