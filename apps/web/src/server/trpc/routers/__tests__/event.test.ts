import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    accompanyingRanger: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  },
  decrypt: (value: string): string => value,
}));

vi.mock("../../../lib/earthranger-push", () => ({
  pushEventUpdateToEarthRanger: vi.fn(),
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
import { pushEventUpdateToEarthRanger } from "../../../lib/earthranger-push";
import { createCallerFactory } from "../../trpc";
import { eventRouter } from "../event";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

const createCaller = createCallerFactory(eventRouter);

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

describe("event.updateState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates event state for the authenticated tenant", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.updateState({ id: "ev-1", state: "active" });

    expect(result).toEqual({ count: 1 });
    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith({
      where: { id: "ev-1", tenantId: TENANT_ID },
      data: { state: "active" },
    });
  });

  it("scopes the update to the tenant — never leaks cross-tenant", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.updateState({ id: "ev-1", state: "resolved" });

    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith(
      partial({ where: partial<{ tenantId: string }>({ tenantId: "other-tenant" }) })
    );
    // Critically: the tenantId in the where clause matches the session, not an arbitrary value
    const call = vi.mocked(prisma.event.updateMany).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));

    await expect(
      caller.updateState({ id: "ev-1", state: "active" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects an invalid state value at the schema boundary", async () => {
    const caller = createCaller(makeCtx());

    await expect(
      // @ts-expect-error — intentionally passing invalid state to test schema validation
      caller.updateState({ id: "ev-1", state: "invalid_state" })
    ).rejects.toThrow();
  });
});

describe("event.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
  });

  it("updates editable fields and returns the updated event with accompanyingRangers", async () => {
    const mockEvent = {
      id: "ev-1",
      tenantId: TENANT_ID,
      erEventId: "er-1",
      title: "Updated Title",
      priority: 2,
      notesJson: { text: "notes" },
      eventDetailsJson: null,
      accompanyingRangers: [],
    };
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as never);

    const caller = createCaller(makeCtx());
    const result = await caller.update({
      id: "ev-1",
      title: "Updated Title",
      priority: 2,
    });

    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith({
      where: { id: "ev-1", tenantId: TENANT_ID },
      data: { title: "Updated Title", priority: 2 },
    });
    expect(result).toMatchObject({ id: "ev-1", title: "Updated Title" });
  });

  it("throws NOT_FOUND when updateMany count is 0 (event missing or wrong tenant)", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "no-such-event", title: "X" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.update({ id: "ev-1", title: "X" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects unknown fields due to .strict() schema", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      // @ts-expect-error — intentionally passing unknown field
      caller.update({ id: "ev-1", unknownField: "bad" })
    ).rejects.toThrow();
  });

  it("pushes the update to EarthRanger when tenant has credentials configured", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
      erEventId: "er-event-42",
      accompanyingRangers: [],
    } as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      earthrangerUrl: "https://er.example.com",
      earthrangerDasToken: "secret-token",
    } as never);
    vi.mocked(pushEventUpdateToEarthRanger).mockResolvedValue({ ok: true });

    const caller = createCaller(makeCtx());
    await caller.update({
      id: "ev-1",
      title: "New Title",
      priority: 3,
      eventDetailsJson: { offenderName: "John Doe" },
    });

    expect(vi.mocked(pushEventUpdateToEarthRanger)).toHaveBeenCalledWith({
      baseUrl: "https://er.example.com",
      token: "secret-token",
      erEventId: "er-event-42",
      fields: {
        title: "New Title",
        priority: 3,
        eventDetails: { offenderName: "John Doe" },
      },
    });
  });

  it("local update succeeds even when EarthRanger push fails (best-effort)", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
      erEventId: "er-event-42",
      title: "Updated",
    } as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      earthrangerUrl: "https://er.example.com",
      earthrangerDasToken: "secret-token",
    } as never);
    vi.mocked(pushEventUpdateToEarthRanger).mockResolvedValue({
      ok: false,
      status: 502,
      error: "Bad gateway",
    });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "ev-1", title: "Updated" });

    expect(result).toMatchObject({ id: "ev-1", title: "Updated" });
    expect(vi.mocked(pushEventUpdateToEarthRanger)).toHaveBeenCalled();
  });
});

describe("event.addAccompanyingRanger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a registered ranger (Mode A) and returns the created record", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
    } as never);
    const mockRanger = {
      id: "ar-1",
      tenantId: TENANT_ID,
      entityType: "event",
      entityId: "ev-1",
      rangerType: "registered",
      registeredUserId: "user-456",
      freetextName: null,
      addedByUserId: USER_ID,
    };
    vi.mocked(prisma.accompanyingRanger.create).mockResolvedValue(mockRanger as never);

    const caller = createCaller(makeCtx());
    const result = await caller.addAccompanyingRanger({
      eventId: "ev-1",
      registeredUserId: "user-456",
    });

    expect(vi.mocked(prisma.accompanyingRanger.create)).toHaveBeenCalledWith(
      partial({
        data: partial({
          registeredUserId: "user-456",
          addedByUserId: USER_ID,
          entityId: "ev-1",
          rangerType: "registered",
        }),
      })
    );
    expect(result).toMatchObject({ id: "ar-1", rangerType: "registered" });
  });

  it("adds a freetext ranger (Mode B) and returns the created record", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
    } as never);
    const mockRanger = {
      id: "ar-2",
      tenantId: TENANT_ID,
      entityType: "event",
      entityId: "ev-1",
      rangerType: "freetext",
      registeredUserId: null,
      freetextName: "John Doe",
      addedByUserId: USER_ID,
    };
    vi.mocked(prisma.accompanyingRanger.create).mockResolvedValue(mockRanger as never);

    const caller = createCaller(makeCtx());
    const result = await caller.addAccompanyingRanger({
      eventId: "ev-1",
      freetextName: "John Doe",
    });

    expect(vi.mocked(prisma.accompanyingRanger.create)).toHaveBeenCalledWith(
      partial({
        data: partial({
          freetextName: "John Doe",
          addedByUserId: USER_ID,
          rangerType: "freetext",
        }),
      })
    );
    expect(result).toMatchObject({ rangerType: "freetext", freetextName: "John Doe" });
  });

  it("throws BAD_REQUEST when both registeredUserId and freetextName are provided (XOR violation)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.addAccompanyingRanger({
        eventId: "ev-1",
        registeredUserId: "user-456",
        freetextName: "John Doe",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND when the event does not belong to the tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.addAccompanyingRanger({
        eventId: "ev-missing",
        registeredUserId: "user-456",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.addAccompanyingRanger({
        eventId: "ev-1",
        freetextName: "John Doe",
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("event.removeAccompanyingRanger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a ranger after verifying tenant ownership and returns success", async () => {
    vi.mocked(prisma.accompanyingRanger.findFirst).mockResolvedValue({
      id: "ar-1",
      tenantId: TENANT_ID,
      entityId: "ev-1",
    } as never);
    vi.mocked(prisma.accompanyingRanger.delete).mockResolvedValue({ id: "ar-1" } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.removeAccompanyingRanger({ id: "ar-1" });

    expect(vi.mocked(prisma.accompanyingRanger.findFirst)).toHaveBeenCalledWith(
      partial({
        where: partial({ id: "ar-1", tenantId: TENANT_ID }),
      })
    );
    expect(vi.mocked(prisma.accompanyingRanger.delete)).toHaveBeenCalledWith({
      where: { id: "ar-1" },
    });
    expect(result).toEqual({ success: true, removedId: "ar-1" });
  });

  it("throws NOT_FOUND when ranger does not exist or belongs to another tenant", async () => {
    vi.mocked(prisma.accompanyingRanger.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.removeAccompanyingRanger({ id: "ar-missing" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.removeAccompanyingRanger({ id: "ar-1" })
    ).rejects.toThrow(TRPCError);
  });
});
