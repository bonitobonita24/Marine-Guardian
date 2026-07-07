import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Minimal stand-in for Prisma's Sql/sql/join/empty/raw tagged-template
// helpers (from sql-template-tag). `@prisma/client` is not a direct
// dependency of the `web` package (only `@marine-guardian/db` depends on it),
// so it can't be `vi.importActual`'d here — this fake preserves just enough
// shape (`.text` / `.values`, nested-fragment flattening) for the
// event.list `search` ($queryRaw) path's tests to assert on the composed
// SQL text and bound parameters. Wrapped in vi.hoisted() so it's safely
// accessible from inside the (hoisted) vi.mock factory below.
const { fakeSql, fakeJoin, fakeEmpty, fakeRaw } = vi.hoisted(() => {
  class FakeSql {
    text: string;
    values: unknown[];
    constructor(text: string, values: unknown[]) {
      this.text = text;
      this.values = values;
    }
    get sql(): string { return this.text; }
  }
  function fakeSqlImpl(strings: TemplateStringsArray, ...exprs: unknown[]): FakeSql {
    let text = strings[0] ?? "";
    const values: unknown[] = [];
    exprs.forEach((expr, i) => {
      if (expr instanceof FakeSql) {
        text += expr.text;
        values.push(...expr.values);
      } else {
        values.push(expr);
        text += "?";
      }
      text += strings[i + 1] ?? "";
    });
    return new FakeSql(text, values);
  }
  function fakeJoinImpl(parts: FakeSql[], separator = ","): FakeSql {
    return new FakeSql(parts.map((p) => p.text).join(separator), parts.flatMap((p) => p.values));
  }
  const fakeEmptyImpl = new FakeSql("", []);
  function fakeRawImpl(s: string): FakeSql { return new FakeSql(s, []); }
  return { fakeSql: fakeSqlImpl, fakeJoin: fakeJoinImpl, fakeEmpty: fakeEmptyImpl, fakeRaw: fakeRawImpl };
});

vi.mock("@marine-guardian/db", () => ({
  // Expose Prisma namespace with the JsonNull sentinel so route handlers can
  // use it, PLUS the fake sql/join/empty/raw helpers above so the
  // listViaSearch $queryRaw path can build its Prisma.Sql-shaped fragments.
  Prisma: {
    JsonNull: "DbNull",
    sql: fakeSql,
    join: fakeJoin,
    empty: fakeEmpty,
    raw: fakeRaw,
  },
  prisma: {
    $queryRaw: vi.fn(),
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    eventRevision: {
      createMany: vi.fn(),
      findMany: vi.fn(),
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
    user: {
      findMany: vi.fn(),
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
        tenantSlug: "",
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

describe("event.list — typeDisplay filter (War Room breakdown drill-down T5b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters by joined eventType.display (exact, case-insensitive) when typeDisplay is set", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ typeDisplay: "Illegal Fishing" });

    const call = vi.mocked(prisma.event.findMany).mock.calls[0];
    expect(call?.[0]?.where?.eventType).toEqual({
      display: { equals: "Illegal Fishing", mode: "insensitive" },
    });
    // still tenant-scoped (L6)
    expect(call?.[0]?.where?.tenantId).toBe(TENANT_ID);
  });

  it("merges typeDisplay with category into a single eventType filter", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({
      category: "Law Enforcement",
      typeDisplay: "Illegal Fishing",
    });

    const call = vi.mocked(prisma.event.findMany).mock.calls[0];
    expect(call?.[0]?.where?.eventType).toEqual({
      category: { equals: "Law Enforcement", mode: "insensitive" },
      display: { equals: "Illegal Fishing", mode: "insensitive" },
    });
  });

  it("omits the eventType filter entirely when neither category nor typeDisplay is set", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ state: "active" });

    const call = vi.mocked(prisma.event.findMany).mock.calls[0];
    expect(call?.[0]?.where?.eventType).toBeUndefined();
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

// ── event.update — revision writes (M2, q-ops-04) ──────────────────────────

describe("event.update — revision row writes", () => {
  const existingEvent = {
    id: "ev-1",
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

  const updatedEvent = {
    ...existingEvent,
    title: "New Title",
    eventType: null,
    accompanyingRangers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      ...existingEvent,
      tenantId: TENANT_ID,
    } as never);
    vi.mocked(prisma.event.update).mockResolvedValue(
      updatedEvent as never
    );
    vi.mocked(prisma.eventRevision.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null); // no ER push
  });

  it("writes an EventRevision row for each changed scalar field", async () => {
    const caller = createCaller(makeCtx());
    await caller.update({ id: "ev-1", title: "New Title" });

    expect(vi.mocked(prisma.eventRevision.createMany)).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.arrayContaining([
        expect.objectContaining({
          tenantId: TENANT_ID,
          eventId: "ev-1",
          userId: USER_ID,
          fieldName: "title",
          beforeJson: "Old Title",
          afterJson: "New Title",
        }),
      ]),
    });
  });

  it("writes multiple revision rows when multiple fields change", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      ...existingEvent,
      tenantId: TENANT_ID,
      offenderName: "OldName",
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({
      id: "ev-1",
      title: "New Title",
      offenderName: "NewName",
    });

    const createManyCall = vi.mocked(prisma.eventRevision.createMany).mock.calls[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const rows = (createManyCall?.[0] as { data: unknown[] })?.data;
    expect(rows).toHaveLength(2);
    const fieldNames = (rows as Array<{ fieldName: string }>).map((r) => r.fieldName);
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("offenderName");
  });

  it("does NOT call createMany when no fields actually changed value", async () => {
    // Update with the same value as existing — no real change.
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      ...existingEvent,
      tenantId: TENANT_ID,
      title: "Same Title",
    } as Awaited<ReturnType<typeof prisma.event.findFirst>>);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ev-1", title: "Same Title" });

    // No revision rows because value didn't change.
    expect(vi.mocked(prisma.eventRevision.createMany)).not.toHaveBeenCalled();
  });

  it("does NOT write revisions for a no-op update (no fields passed)", async () => {
    const caller = createCaller(makeCtx());
    // update with zero fields returns early before touching revision table.
    await caller.update({ id: "ev-1" });
    expect(vi.mocked(prisma.eventRevision.createMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.event.update)).not.toHaveBeenCalled();
  });
});

// ── event.getRevisions (M2, q-ops-04) ─────────────────────────────────────

describe("event.getRevisions", () => {
  const mockEvent = {
    id: "ev-1",
    erOriginalSnapshot: { er_id: "abc", title: "ER baseline" },
    syncedAt: new Date("2026-06-21T00:00:00Z"),
  };

  const mockRevision = {
    id: "rev-1",
    tenantId: TENANT_ID,
    eventId: "ev-1",
    userId: USER_ID,
    fieldName: "title",
    beforeJson: "Old Title",
    afterJson: "New Title",
    createdAt: new Date("2026-06-21T10:00:00Z"),
  };

  const mockUser = {
    id: USER_ID,
    fullName: "Test User",
    email: "test@example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(
      mockEvent as never
    );
    vi.mocked(prisma.eventRevision.findMany).mockResolvedValue(
      [mockRevision] as never
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      [mockUser] as never
    );
  });

  it("returns revisions newest-first with editor info", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.getRevisions({ eventId: "ev-1" });

    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]).toMatchObject({
      id: "rev-1",
      fieldName: "title",
      beforeJson: "Old Title",
      afterJson: "New Title",
      editor: { id: USER_ID, fullName: "Test User" },
    });
  });

  it("returns erOriginalSnapshot and erSyncedAt", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.getRevisions({ eventId: "ev-1" });

    expect(result.erOriginalSnapshot).toEqual({ er_id: "abc", title: "ER baseline" });
    expect(result.erSyncedAt).toEqual(mockEvent.syncedAt);
  });

  it("throws NOT_FOUND when event does not belong to tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue(null);

    const caller = createCaller(makeCtx());
    await expect(caller.getRevisions({ eventId: "ev-missing" })).rejects.toThrow(
      TRPCError
    );
  });

  it("returns empty revisions list when no edits have been made", async () => {
    vi.mocked(prisma.eventRevision.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    const result = await caller.getRevisions({ eventId: "ev-1" });

    expect(result.revisions).toHaveLength(0);
    expect(result.erOriginalSnapshot).toEqual(mockEvent.erOriginalSnapshot);
  });
});

// ── M3 — event.list: cursor pagination + server-side filters ──────────────
// Vitest's expect.objectContaining() returns `any` when used as an argument
// to toHaveBeenCalledWith; disable the unsafe-assignment rule for this block.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe("event.list — cursor pagination (M3)", () => {
  const makeEvent = (id: string, state = "new_event") => ({
    id,
    tenantId: TENANT_ID,
    state,
    priority: 0,
    title: `Event ${id}`,
    serialNumber: null,
    reportedByName: null,
    reportedAt: null,
    areaName: null,
    eventType: { display: "Patrol", category: "Law Enforcement" },
    createdAt: new Date(),
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it("returns items and no nextCursor when result fits in one page", async () => {
    const events = [makeEvent("e1"), makeEvent("e2")];
    vi.mocked(prisma.event.findMany).mockResolvedValue(events as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeUndefined();
  });

  it("returns nextCursor when result exceeds the page limit", async () => {
    // Simulate limit=2 returning 3 items (limit+1) — the router pops the last
    const events = [makeEvent("e1"), makeEvent("e2"), makeEvent("e3")];
    vi.mocked(prisma.event.findMany).mockResolvedValue(events as never);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 2 });

    // The 3rd item is the sentinel; it's popped and its id becomes nextCursor
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe("e3");
  });

  it("passes cursor to findMany so subsequent pages start after the cursor", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, cursor: "cursor-id" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "cursor-id" } })
    );
  });

  it("always scopes findMany to the caller's tenantId (L6 guard)", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx("tenant-xyz"));
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-xyz" }) })
    );
  });

  it("orders by createdAt desc (newest-first)", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

describe("event.list — server-side filters (M3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
  });

  it("applies state filter when provided", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, state: "resolved" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: "resolved" }),
      })
    );
  });

  it("omits state filter when not provided (returns all states)", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledOnce();
    // Verify the where clause does NOT contain a 'state' key (no filter applied)
    expect(vi.mocked(prisma.event.findMany)).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ state: expect.anything() }) })
    );
  });

  it("applies category filter via eventType.category when provided", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, category: "Law Enforcement" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: { category: { equals: "Law Enforcement", mode: "insensitive" } },
        }),
      })
    );
  });

  it("applies areaName contains filter (case-insensitive) when provided", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, areaName: "Calapan" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          areaName: { contains: "Calapan", mode: "insensitive" },
        }),
      })
    );
  });

  it("applies dateFrom as gte on reportedAt for monthly-accomplishment view", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, dateFrom: "2026-06-01T00:00:00.000Z" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reportedAt: expect.objectContaining({
            gte: new Date("2026-06-01T00:00:00.000Z"),
          }),
        }),
      })
    );
  });

  it("applies dateTo as lte on reportedAt", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, dateTo: "2026-06-30T23:59:59.999Z" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reportedAt: expect.objectContaining({
            lte: new Date("2026-06-30T23:59:59.999Z"),
          }),
        }),
      })
    );
  });

  // event-patrol-link — Command Center "Active Events" drilldown filter
  it("applies patrol.state=open filter when linkedToActivePatrol is true", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, linkedToActivePatrol: true });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patrol: { is: { state: "open", isDeleted: false } },
        }),
      })
    );
  });

  it("omits the patrol filter when linkedToActivePatrol is not set", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.event.findMany)).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patrol: expect.anything() }) })
    );
  });

  it("omits the patrol filter when linkedToActivePatrol is explicitly false", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, linkedToActivePatrol: false });

    expect(vi.mocked(prisma.event.findMany)).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patrol: expect.anything() }) })
    );
  });

  it("combines linkedToActivePatrol with state + dateFrom/dateTo (Active Events drilldown shape)", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({
      limit: 100,
      state: "active",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-06-30T23:59:59.999Z",
      linkedToActivePatrol: true,
    });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: "active",
          patrol: { is: { state: "open", isDeleted: false } },
          reportedAt: expect.objectContaining({
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lte: new Date("2026-06-30T23:59:59.999Z"),
          }),
        }),
      })
    );
  });

  // Skylight automated vessel-detection events must never show in the
  // Operations List (defense-in-depth alongside the ER-sync ingestion block;
  // same marker as dashboard.ts:179 / reportMap.ts:59 — eventType.display
  // contains "skylight", case-insensitive).
  it("excludes Skylight-display events via NOT eventType.display filter by default (includeSkylight omitted)", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50 });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
        }),
      })
    );
  });

  it("excludes Skylight-display events when includeSkylight is explicitly false", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, includeSkylight: false });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
        }),
      })
    );
  });

  it("opts back in to Skylight events when includeSkylight is true (SKY-1 toggle)", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, includeSkylight: true });

    const call = vi.mocked(prisma.event.findMany).mock.calls.at(-1)?.[0];
    expect(call?.where).not.toHaveProperty("NOT");
  });

  it("keeps the Skylight exclusion alongside other filters (state + category)", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, state: "active", category: "Law Enforcement" });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: "active",
          eventType: { category: { equals: "Law Enforcement", mode: "insensitive" } },
          NOT: { eventType: { display: { contains: "skylight", mode: "insensitive" } } },
        }),
      })
    );
  });

  it("combines state + category + areaName filters in a single where clause", async () => {
    const caller = createCaller(makeCtx());
    await caller.list({
      limit: 50,
      state:    "active",
      category: "Law Enforcement",
      areaName: "Roxas",
    });

    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          state:    "active",
          eventType: { category: { equals: "Law Enforcement", mode: "insensitive" } },
          areaName:  { contains: "Roxas", mode: "insensitive" },
        }),
      })
    );
  });
});

describe("event.updateState — inline state transition (M3)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("transitions new_event → active", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    const caller = createCaller(makeCtx());
    const result = await caller.updateState({ id: "ev-1", state: "active" });
    expect(result).toEqual({ count: 1 });
    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith({
      where: { id: "ev-1", tenantId: TENANT_ID },
      data:  { state: "active" },
    });
  });

  it("transitions active → resolved", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    const caller = createCaller(makeCtx());
    await caller.updateState({ id: "ev-1", state: "resolved" });
    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: "resolved" } })
    );
  });

  it("always includes tenantId in where clause — tenant isolation preserved", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 1 });
    const caller = createCaller(makeCtx("isolated-tenant"));
    await caller.updateState({ id: "ev-99", state: "new_event" });

    const call = vi.mocked(prisma.event.updateMany).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("isolated-tenant");
  });
});

// ── BUG-2 regression: event.update accepts EarthRanger raw priority values ──
//
// ER syncs events with priority 0 / 100 / 200 / 300. The update schema
// previously capped priority at max(3), rejecting these values with a silent
// HTTP 400. This describe block guards the fix.
// (no-unsafe-assignment already disabled above for the whole bottom section)
describe("event.update — EarthRanger priority range (BUG-2 regression)", () => {
  const erSyncedEvent = {
    id: "ev-er",
    tenantId: TENANT_ID,
    erEventId: "er-event-99",
    title: "ER Synced Incident",
    priority: 200,  // raw ER priority — what the sync processor writes
    notesJson: null,
    eventDetailsJson: null,
    offenderName: null,
    vesselName: null,
    vesselRegistration: null,
    address: null,
    actionTaken: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
  });

  it.each([0, 100, 200, 300])(
    "accepts ER raw priority value %i without validation error",
    async (erPriority) => {
      vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({
        ...erSyncedEvent,
        priority: erPriority,
      } as never);
      vi.mocked(prisma.event.update).mockResolvedValueOnce({
        ...erSyncedEvent,
        priority: erPriority,
        eventType: null,
        accompanyingRangers: [],
      } as never);

      const caller = createCaller(makeCtx());
      // Must NOT throw — prior schema had max(3) which rejected 100/200/300
      await expect(
        caller.update({ id: "ev-er", priority: erPriority })
      ).resolves.toMatchObject({ id: "ev-er", priority: erPriority });
    }
  );

  it("passes the raw ER priority through to prisma.event.update unchanged", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(erSyncedEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce({
      ...erSyncedEvent,
      eventType: null,
      accompanyingRangers: [],
    } as never);

    const caller = createCaller(makeCtx());
    await caller.update({ id: "ev-er", priority: 200 });

    expect(vi.mocked(prisma.event.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 200 }),
      })
    );
  });
});
describe("event.update — BUG-2b required-field validation", () => {
  const existingEvent = {
    id: "ev-1",
    tenantId: TENANT_ID,
    erEventId: "er-event-42",
    title: "Existing Title",
    priority: 0,
    notesJson: null,
    eventDetailsJson: null,
    offenderName: null,
    vesselName: null,
    vesselRegistration: null,
    address: null,
    actionTaken: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
  });

  it("rejects an empty-string title with BAD_REQUEST", async () => {
    // The Zod schema should reject before hitting the DB.
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "ev-1", title: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // DB must never be reached.
    expect(vi.mocked(prisma.event.findFirst)).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only title with BAD_REQUEST", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.update({ id: "ev-1", title: "   " })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(prisma.event.findFirst)).not.toHaveBeenCalled();
  });

  it("accepts a valid non-empty title", async () => {
    const updated = {
      ...existingEvent,
      title: "New Title",
      eventType: null,
      accompanyingRangers: [],
    };
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce(updated as never);
    vi.mocked(prisma.eventRevision.createMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "ev-1", title: "New Title" });
    expect(result).toMatchObject({ id: "ev-1", title: "New Title" });
  });

  it("accepts omitting title entirely (partial update without touching title)", async () => {
    // No title key at all → no validation error; the field is optional.
    const updated = {
      ...existingEvent,
      priority: 100,
      eventType: null,
      accompanyingRangers: [],
    };
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingEvent as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce(updated as never);
    vi.mocked(prisma.eventRevision.createMany).mockResolvedValue({ count: 1 });

    const caller = createCaller(makeCtx());
    const result = await caller.update({ id: "ev-1", priority: 100 });
    expect(result).toMatchObject({ id: "ev-1", priority: 100 });
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-assignment */

describe("event.getById — Telegram asset include (Stage 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes archived assets scoped to the tenant", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({
      id: "ev-1",
      tenantId: TENANT_ID,
      assets: [],
    } as never);

    const caller = createCaller(makeCtx());
    await caller.getById({ id: "ev-1" });

    const call = vi.mocked(prisma.event.findFirst).mock.calls[0]?.[0];
    // Tenant-scoped lookup.
    expect(call?.where).toMatchObject({ id: "ev-1", tenantId: TENANT_ID });

    // The assets relation surfaces only archived rows (telegramFileId set),
    // ordered oldest-first, with telegramFileId omitted from the select.
    const assetsInclude = call?.include?.assets as {
      where: { telegramFileId: { not: null } };
      orderBy: { createdAt: string };
      select: Record<string, boolean>;
    };
    expect(assetsInclude.where).toEqual({ telegramFileId: { not: null } });
    expect(assetsInclude.orderBy).toEqual({ createdAt: "asc" });
    expect(assetsInclude.select).toMatchObject({
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
    });
    expect(assetsInclude.select).not.toHaveProperty("telegramFileId");
  });
});

// ── event.list — pg_trgm fuzzy full-content search (T4) ────────────────────

function makeAdminCtx(roles: string[] = ["site_admin"], tenantId: string | null = TENANT_ID) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles: roles as ["site_admin"],
        email: "admin@example.com",
        name: "Admin User",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("event.list — fuzzy full-content search (search param, T4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to $queryRaw when `search` is supplied, scoped to the tenant", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50, search: "poacher" });

    expect(result).toEqual({ items: [], nextCursor: undefined });
    expect(vi.mocked(prisma.$queryRaw)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.event.findMany)).not.toHaveBeenCalled();

    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };
    expect(fragment.values).toContain(TENANT_ID);
    expect(fragment.values).toContain("%poacher%");
    expect(fragment.text).toContain("event_details_json");
    expect(fragment.text).toContain("notes_json");
    expect(fragment.text).toContain("ILIKE");
  });

  it("does NOT use the raw path when search is empty/whitespace", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, search: "   " });

    expect(vi.mocked(prisma.$queryRaw)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.event.findMany)).toHaveBeenCalledTimes(1);
  });

  it("matches against reportedByName, vesselRegistration, or eventDetailsJson content regardless of area", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const caller = createCaller(makeCtx());

    for (const term of ["Juan Dela Cruz", "MWB-1234", "illegal-fishing-net"]) {
      vi.mocked(prisma.$queryRaw).mockClear();
      await caller.list({ limit: 50, search: term });
      const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
        text: string;
        values: unknown[];
      };
      expect(fragment.values).toContain(`%${term}%`);
      // The single ILIKE predicate covers all scalar columns + both JSON blobs —
      // assert the reported_by_name / vessel_registration / event_details_json
      // columns are all present in that same predicate for every search.
      expect(fragment.text).toContain("reported_by_name");
      expect(fragment.text).toContain("vessel_registration");
      expect(fragment.text).toContain("event_details_json");
    }
  });

  it("excludes Skylight events by default in the search path (includeSkylight omitted)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, search: "anything" });

    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as { text: string };
    expect(fragment.text.toLowerCase()).toContain("skylight");
  });

  it("opts back in to Skylight events in the search path when includeSkylight is true", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, search: "anything", includeSkylight: true });

    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as { text: string };
    expect(fragment.text.toLowerCase()).not.toContain("skylight");
  });

  it("composes state + category + date-range + linkedToActivePatrol filters alongside search", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    await caller.list({
      limit: 50,
      search: "term",
      state: "active",
      category: "Law Enforcement",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      linkedToActivePatrol: true,
    });

    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };
    expect(fragment.text).toContain('::"EventState"');
    expect(fragment.values).toContain("active");
    expect(fragment.values).toContain("Law Enforcement");
    expect(fragment.text).toContain("JOIN patrols p");
    expect(fragment.text).toContain("p.state = 'open'");
  });

  it("emits a keyset cursor predicate when a cursor is supplied", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const caller = createCaller(makeCtx());
    await caller.list({ limit: 50, search: "term", cursor: "ev-cursor-1" });

    expect(vi.mocked(prisma.event.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ev-cursor-1", tenantId: TENANT_ID } })
    );
    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };
    expect(fragment.text).toContain("e.created_at, e.id");
    expect(fragment.values).toContain("ev-cursor-1");
  });

  it("pops the (limit+1)th row and returns its id as nextCursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `ev-${String(i)}`,
      tenantId: TENANT_ID,
      erEventId: `er-${String(i)}`,
      eventTypeId: null,
      serialNumber: null,
      title: `Event ${String(i)}`,
      priority: 0,
      state: "new_event",
      locationLat: null,
      locationLon: null,
      reportedByName: null,
      reportedAt: null,
      eventDetailsJson: null,
      notesJson: null,
      areaName: null,
      offenderName: null,
      vesselName: null,
      vesselRegistration: null,
      address: null,
      actionTaken: null,
      patrolId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      eventType_display: null,
      eventType_category: null,
    }));
    vi.mocked(prisma.$queryRaw).mockResolvedValue(rows);

    const caller = createCaller(makeCtx());
    const result = await caller.list({ limit: 50, search: "term" });

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe("ev-50");
  });

  // ER-content gap fix: the joined event type's display name (et.display) is
  // now searchable, closing the gap where a term matches ONLY the event
  // type name (e.g. "Skylight Entry Alert") and nowhere else on the event.
  it("ORs et.display into the fuzzy predicate, matching a term found only in the event type name", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const caller = createCaller(makeCtx());

    await caller.list({ limit: 50, search: "Skylight Entry Alert" });

    const fragment = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };
    // The events-only concat is preserved byte-identical (still present,
    // still ILIKE'd against the same term) — et.display is OR'd in alongside
    // it, not folded into the indexed concat.
    expect(fragment.text).toContain("event_details_json");
    expect(fragment.text).toContain("et.display");
    expect(fragment.text).toContain("OR");
    // Bound exactly once more per search term (concat ILIKE + et.display ILIKE).
    const matches = fragment.values.filter((v) => v === "%Skylight Entry Alert%");
    expect(matches).toHaveLength(2);
  });
});

// ── event.bulkUpdateState — bulk "Mark resolved" action (T3) ────────────────

describe("event.bulkUpdateState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bulk-updates the given ids to the requested state, tenant-scoped", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 3 });

    const caller = createCaller(makeCtx());
    const result = await caller.bulkUpdateState({
      ids: ["ev-1", "ev-2", "ev-3"],
      state: "resolved",
    });

    expect(result).toEqual({ count: 3 });
    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith({
      where: { id: { in: ["ev-1", "ev-2", "ev-3"] }, tenantId: TENANT_ID },
      data: { state: "resolved" },
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "BULK_UPDATE_EVENT_STATE", tenantId: TENANT_ID })
    );
  });

  it("scopes the update to the tenant — never touches another tenant's events", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 0 });

    const caller = createCaller(makeCtx("other-tenant"));
    await caller.bulkUpdateState({ ids: ["ev-1"], state: "resolved" });

    const call = vi.mocked(prisma.event.updateMany).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });

  it("rejects an empty ids array at the schema boundary", async () => {
    const caller = createCaller(makeCtx());

    await expect(
      caller.bulkUpdateState({ ids: [], state: "resolved" })
    ).rejects.toThrow();
  });
});

// ── event.resolveAllEvents — one-time "resolve all" action (T3) ─────────────

describe("event.resolveAllEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves every non-resolved event for the tenant when called by an admin role", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 5 });

    const caller = createCaller(makeAdminCtx(["site_admin"]));
    const result = await caller.resolveAllEvents();

    expect(result).toEqual({ count: 5 });
    expect(vi.mocked(prisma.event.updateMany)).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, state: { not: "resolved" } },
      data: { state: "resolved" },
    });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "RESOLVE_ALL_EVENTS", tenantId: TENANT_ID })
    );
  });

  it("rejects a non-admin role with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx()); // default role: "ranger" — not admin-gated

    await expect(caller.resolveAllEvents()).rejects.toThrow(TRPCError);
    expect(vi.mocked(prisma.event.updateMany)).not.toHaveBeenCalled();
  });

  it("scopes the resolve-all to the calling admin's own tenant", async () => {
    vi.mocked(prisma.event.updateMany).mockResolvedValue({ count: 2 });

    const caller = createCaller(makeAdminCtx(["super_admin"], "other-tenant"));
    await caller.resolveAllEvents();

    const call = vi.mocked(prisma.event.updateMany).mock.calls[0];
    expect(call?.[0]?.where?.tenantId).toBe("other-tenant");
  });
});
