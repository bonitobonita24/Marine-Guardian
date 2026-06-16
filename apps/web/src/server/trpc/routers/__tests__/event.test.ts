import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    accompanyingRanger: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    knownRanger: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  decrypt: (value: string): string => value,
  writeAuditLog: vi.fn(),
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

import { prisma, writeAuditLog } from "@marine-guardian/db";
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
    impersonationTenantId: null,
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
  const existingEvent = {
    id: "ev-1",
    tenantId: TENANT_ID,
    erEventId: "er-event-42",
    title: "Old Title",
    priority: 1,
    notesJson: null,
    eventDetailsJson: null,
    offenderName: null,
    vesselName: null,
    vesselRegistration: null,
    address: null,
    actionTaken: null,
  };

  const updatedEventWithIncludes = {
    ...existingEvent,
    title: "Updated Title",
    priority: 2,
    eventType: null,
    accompanyingRangers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
  });

  it("updates editable fields and returns the updated event with accompanyingRangers", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce(updatedEventWithIncludes as never);

    const caller = createCaller(makeCtx());
    const result = await caller.update({
      id: "ev-1",
      title: "Updated Title",
      priority: 2,
    });

    expect(vi.mocked(prisma.event.update)).toHaveBeenCalledWith(
      partial({
        where: { id: "ev-1" },
        data: { title: "Updated Title", priority: 2 },
      })
    );
    expect(result).toMatchObject({ id: "ev-1", title: "Updated Title" });
  });

  it("throws NOT_FOUND when event is missing or belongs to another tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

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
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...existingEvent,
      title: "New Title",
      priority: 3,
      eventDetailsJson: { offenderName: "John Doe" },
      eventType: null,
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
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...existingEvent,
      title: "Updated",
      eventType: null,
      accompanyingRangers: [],
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

  it("writes UPDATE_EVENT audit log with before/after diff of changed fields", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...existingEvent,
      offenderName: "Acme",
      eventType: null,
      accompanyingRangers: [],
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ev-1", offenderName: "Acme" });

    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      partial({
        action: "UPDATE_EVENT",
        entityType: "Event",
        entityId: "ev-1",
        changesJson: {
          before: { offenderName: null },
          after: { offenderName: "Acme" },
        },
        severity: "info",
      })
    );
  });

  it("updates all 5 operator-fill fields in one call", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...existingEvent,
      offenderName: "John Doe",
      vesselName: "MV Pinas",
      vesselRegistration: "PH-001",
      address: "Brgy. San Juan",
      actionTaken: "Verbal warning issued",
      eventType: null,
      accompanyingRangers: [],
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({
      id: "ev-1",
      offenderName: "John Doe",
      vesselName: "MV Pinas",
      vesselRegistration: "PH-001",
      address: "Brgy. San Juan",
      actionTaken: "Verbal warning issued",
    });

    expect(vi.mocked(prisma.event.update)).toHaveBeenCalledWith(
      partial({
        data: partial({
          offenderName: "John Doe",
          vesselName: "MV Pinas",
          vesselRegistration: "PH-001",
          address: "Brgy. San Juan",
          actionTaken: "Verbal warning issued",
        }),
      })
    );
  });

  it("does NOT push to EarthRanger when only operator-fill fields change", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...existingEvent,
      offenderName: "John Doe",
      vesselName: "MV Pinas",
      eventType: null,
      accompanyingRangers: [],
    } as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      earthrangerUrl: "https://er.example.com",
      earthrangerDasToken: "secret-token",
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ev-1", offenderName: "John Doe", vesselName: "MV Pinas" });

    expect(vi.mocked(pushEventUpdateToEarthRanger)).not.toHaveBeenCalled();
  });

  it("skips audit and update when no fields change (empty mutation)", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "ev-1" });

    expect(vi.mocked(prisma.event.update)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "ev-1" });
  });

  it("cross-tenant id returns same NOT_FOUND message as missing id", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const caller = createCaller(makeCtx());
    const err = await caller.update({ id: "ev-cross-tenant", title: "X" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).message).toBe("Event not found.");
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

  it("links knownRangerId when provided and ranger belongs to tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue({
      id: "kr-1",
      tenantId: TENANT_ID,
    } as never);
    const mockRanger = {
      id: "ar-3",
      tenantId: TENANT_ID,
      entityType: "event",
      entityId: "ev-1",
      rangerType: "freetext",
      registeredUserId: null,
      freetextName: "Maria Cruz",
      knownRangerId: "kr-1",
      addedByUserId: USER_ID,
      knownRanger: { id: "kr-1", name: "Maria Cruz", source: "manual_entry" },
    };
    vi.mocked(prisma.accompanyingRanger.create).mockResolvedValue(mockRanger as never);

    const caller = createCaller(makeCtx());
    const result = await caller.addAccompanyingRanger({
      eventId: "ev-1",
      freetextName: "Maria Cruz",
      knownRangerId: "kr-1",
    });

    expect(vi.mocked(prisma.knownRanger.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ id: "kr-1", tenantId: TENANT_ID }) })
    );
    expect(vi.mocked(prisma.accompanyingRanger.create)).toHaveBeenCalledWith(
      partial({
        data: partial({ knownRangerId: "kr-1", freetextName: "Maria Cruz" }),
      })
    );
    expect(result).toMatchObject({ knownRangerId: "kr-1" });
  });

  it("throws NOT_FOUND when knownRangerId does not belong to tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      id: "ev-1",
      tenantId: TENANT_ID,
    } as never);
    // knownRanger lookup returns null → cross-tenant or missing
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(
      caller.addAccompanyingRanger({
        eventId: "ev-1",
        freetextName: "Ghost Ranger",
        knownRangerId: "kr-other-tenant",
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("event.suggestAccompanyingRangers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns known rangers matching the query (source 1)", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([
      { id: "kr-1", name: "Alice Reyes", source: "manual_entry", erSubjectId: null },
    ] as never);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    const result = await caller.suggestAccompanyingRangers({ query: "Alice" });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      id: "kr-1",
      name: "Alice Reyes",
      source: "known_ranger",
    });
  });

  it("includes recent freetext names as source 2", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { freetextName: "Pedro Santos", knownRangerId: null },
    ] as never);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    const result = await caller.suggestAccompanyingRangers({ query: "Pedro" });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      id: null,
      name: "Pedro Santos",
      source: "recent_freetext",
    });
  });

  it("includes ER subjects not already in KnownRanger as source 3", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "subj-1", name: "Juan dela Cruz", erSubjectId: "er-subj-1" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.suggestAccompanyingRangers({ query: "Juan" });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      id: null,
      name: "Juan dela Cruz",
      source: "er_subject",
      erSubjectId: "er-subj-1",
    });
  });

  it("dedupes: same name across all three sources appears only once — known_ranger wins", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([
      { id: "kr-1", name: "Ana Garcia", source: "earthranger_sync", erSubjectId: "er-1" },
    ] as never);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { freetextName: "Ana Garcia", knownRangerId: null },
    ] as never);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      // Same erSubjectId — should be skipped (already in knownRangers by erSubjectId)
      { id: "subj-1", name: "Ana Garcia", erSubjectId: "er-1" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.suggestAccompanyingRangers({ query: "Ana" });

    // Only one record, from source 1
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ id: "kr-1", source: "known_ranger" });
  });

  it("dedupes: name-only collision between source 2 and source 3 — er_subject wins", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([
      { freetextName: "Carlos Dizon", knownRangerId: null },
    ] as never);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: "subj-2", name: "Carlos Dizon", erSubjectId: "er-2" },
    ] as never);

    const caller = createCaller(makeCtx());
    const result = await caller.suggestAccompanyingRangers({ query: "Carlos" });

    expect(result.suggestions).toHaveLength(1);
    // er_subject processed before freetext, so it wins the slot
    expect(result.suggestions[0]).toMatchObject({ source: "er_subject", erSubjectId: "er-2" });
  });

  it("scopes all three DB queries to the authenticated tenant", async () => {
    vi.mocked(prisma.knownRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.accompanyingRanger.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subject.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.suggestAccompanyingRangers({ query: "" });

    expect(vi.mocked(prisma.knownRanger.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
    expect(vi.mocked(prisma.accompanyingRanger.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
    expect(vi.mocked(prisma.subject.findMany)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.suggestAccompanyingRangers({ query: "test" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("event.promoteToKnownRanger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new KnownRanger with source=manual_entry and returns created=true", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.knownRanger.create).mockResolvedValue({
      id: "kr-new",
      tenantId: TENANT_ID,
      name: "Tomas Bautista",
      source: "manual_entry",
      erSubjectId: null,
      isActive: true,
      createdAt: new Date("2026-06-16"),
      updatedAt: new Date("2026-06-16"),
    } as never);

    const caller = createCaller(makeCtx());
    const result = await caller.promoteToKnownRanger({ name: "Tomas Bautista" });

    expect(result.created).toBe(true);
    expect(result.knownRanger).toMatchObject({ id: "kr-new", name: "Tomas Bautista" });
    expect(vi.mocked(prisma.knownRanger.create)).toHaveBeenCalledWith(
      partial({
        data: partial({
          name: "Tomas Bautista",
          source: "manual_entry",
          tenantId: TENANT_ID,
        }),
      })
    );
  });

  it("returns existing KnownRanger with created=false (idempotent)", async () => {
    const existingKr = {
      id: "kr-existing",
      tenantId: TENANT_ID,
      name: "Tomas Bautista",
      source: "manual_entry",
      erSubjectId: null,
      isActive: true,
      createdAt: new Date("2026-06-10"),
      updatedAt: new Date("2026-06-10"),
    };
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(existingKr as never);

    const caller = createCaller(makeCtx());
    const result = await caller.promoteToKnownRanger({ name: "Tomas Bautista" });

    expect(result.created).toBe(false);
    expect(result.knownRanger).toMatchObject({ id: "kr-existing" });
    // create should NOT have been called
    expect(vi.mocked(prisma.knownRanger.create)).not.toHaveBeenCalled();
  });

  it("scopes the existence check to the authenticated tenant", async () => {
    vi.mocked(prisma.knownRanger.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.knownRanger.create).mockResolvedValue({
      id: "kr-new",
      name: "New Ranger",
      source: "manual_entry",
      tenantId: TENANT_ID,
    } as never);

    const caller = createCaller(makeCtx());
    await caller.promoteToKnownRanger({ name: "New Ranger" });

    expect(vi.mocked(prisma.knownRanger.findFirst)).toHaveBeenCalledWith(
      partial({ where: partial({ tenantId: TENANT_ID }) })
    );
  });

  it("throws FORBIDDEN when tenantId is absent from session", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(
      caller.promoteToKnownRanger({ name: "Ghost" })
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
