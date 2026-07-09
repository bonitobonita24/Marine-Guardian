// War Room range-scoping (2026-06-25, T4b): municipalityCoverage and
// protectedZoneCoverage are time-based activity aggregations, so both honour
// the dashboard date range via an optional { dateFrom, dateTo } input. This
// suite verifies the range is threaded into the underlying Prisma WHERE clauses
// and that omitting the range preserves the original 30-day default behaviour.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: {
      findMany: vi.fn(),
    },
    patrol: {
      groupBy: vi.fn(),
    },
    event: {
      groupBy: vi.fn(),
    },
    protectedZone: {
      findMany: vi.fn(),
    },
    patrolCoveredZone: {
      groupBy: vi.fn(),
    },
    eventCoveredZone: {
      groupBy: vi.fn(),
    },
  },
}));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { municipalityCoverageRouter } from "../municipalityCoverage";

const createCaller = createCallerFactory(municipalityCoverageRouter);

const TENANT_ID = "tenant-xyz";

function makeCtx() {
  return {
    session: {
      user: {
        id: "user-1",
        tenantId: TENANT_ID,
        tenantSlug: "",
        roles: ["ranger" as const],
        email: "ranger@mg.test",
        name: "Ranger",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const mockPrisma = prisma as unknown as {
  municipality: { findMany: ReturnType<typeof vi.fn> };
  patrol: { groupBy: ReturnType<typeof vi.fn> };
  event: { groupBy: ReturnType<typeof vi.fn> };
  protectedZone: { findMany: ReturnType<typeof vi.fn> };
  patrolCoveredZone: { groupBy: ReturnType<typeof vi.fn> };
  eventCoveredZone: { groupBy: ReturnType<typeof vi.fn> };
};

const FROM = new Date("2026-06-01T00:00:00Z");
const TO = new Date("2026-06-15T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.municipality.findMany.mockResolvedValue([]);
  mockPrisma.patrol.groupBy.mockResolvedValue([]);
  mockPrisma.event.groupBy.mockResolvedValue([]);
  mockPrisma.protectedZone.findMany.mockResolvedValue([]);
  mockPrisma.patrolCoveredZone.groupBy.mockResolvedValue([]);
  mockPrisma.eventCoveredZone.groupBy.mockResolvedValue([]);
});

describe("municipalityCoverage.municipalityCoverage — range scoping (T4b)", () => {
  it("threads { dateFrom, dateTo } into patrol.startTime and event.reportedAt", async () => {
    const caller = createCaller(makeCtx());
    await caller.municipalityCoverage({ dateFrom: FROM, dateTo: TO });

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { startTime: { gte: Date; lte: Date }; tenantId: string };
    };
    expect(patrolArgs.where.tenantId).toBe(TENANT_ID);
    expect(patrolArgs.where.startTime.gte).toEqual(FROM);
    expect(patrolArgs.where.startTime.lte).toEqual(TO);

    const eventArgs = mockPrisma.event.groupBy.mock.calls[0]?.[0] as {
      where: { reportedAt: { gte: Date; lte: Date } };
    };
    expect(eventArgs.where.reportedAt.gte).toEqual(FROM);
    expect(eventArgs.where.reportedAt.lte).toEqual(TO);
  });

  it("dateFrom/dateTo take precedence over legacy since/until", async () => {
    const caller = createCaller(makeCtx());
    const legacySince = new Date("2020-01-01T00:00:00Z");
    await caller.municipalityCoverage({
      dateFrom: FROM,
      dateTo: TO,
      since: legacySince,
      until: legacySince,
    });

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { startTime: { gte: Date; lte: Date } };
    };
    expect(patrolArgs.where.startTime.gte).toEqual(FROM);
    expect(patrolArgs.where.startTime.lte).toEqual(TO);
  });

  it("defaults to a 30-day window when no range is supplied", async () => {
    const caller = createCaller(makeCtx());
    const before = Date.now();
    await caller.municipalityCoverage();
    const after = Date.now();

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { startTime: { gte: Date; lte: Date } };
    };
    const gte = patrolArgs.where.startTime.gte.getTime();
    const lte = patrolArgs.where.startTime.lte.getTime();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    // gte ~ now - 30d, lte ~ now (within the call window).
    expect(lte).toBeGreaterThanOrEqual(before);
    expect(lte).toBeLessThanOrEqual(after);
    expect(gte).toBeGreaterThanOrEqual(before - THIRTY_DAYS);
    expect(gte).toBeLessThanOrEqual(after - THIRTY_DAYS);
  });
});

describe("municipalityCoverage.municipalityCoverage — Skylight + municipality scope", () => {
  it("excludes Skylight events from the event group-by", async () => {
    const caller = createCaller(makeCtx());
    await caller.municipalityCoverage({ dateFrom: FROM, dateTo: TO });

    const eventArgs = mockPrisma.event.groupBy.mock.calls[0]?.[0] as {
      where: {
        NOT: { eventType: { display: { contains: string; mode: string } } };
      };
    };
    expect(eventArgs.where.NOT.eventType.display.contains).toBe("skylight");
    expect(eventArgs.where.NOT.eventType.display.mode).toBe("insensitive");
  });

  it("scopes municipalities + both group-bys to the supplied municipalityId", async () => {
    const caller = createCaller(makeCtx());
    await caller.municipalityCoverage({ municipalityId: "muni-1" });

    const muniArgs = mockPrisma.municipality.findMany.mock.calls[0]?.[0] as {
      where: { id?: string };
    };
    expect(muniArgs.where.id).toBe("muni-1");

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(patrolArgs.where.municipalityId).toBe("muni-1");

    const eventArgs = mockPrisma.event.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(eventArgs.where.municipalityId).toBe("muni-1");
  });

  it("counts every assigned municipality (not-null) when municipalityId is omitted", async () => {
    const caller = createCaller(makeCtx());
    await caller.municipalityCoverage({ dateFrom: FROM, dateTo: TO });

    const muniArgs = mockPrisma.municipality.findMany.mock.calls[0]?.[0] as {
      where: { id?: string };
    };
    expect(muniArgs.where.id).toBeUndefined();

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(patrolArgs.where.municipalityId).toEqual({ not: null });

    const eventArgs = mockPrisma.event.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(eventArgs.where.municipalityId).toEqual({ not: null });
  });
});

describe("municipalityCoverage.municipalityCoverage — province rollup (Phase 4B)", () => {
  it("resolves province to its municipality ids and narrows the group-bys + municipality list to an `in` clause", async () => {
    const caller = createCaller(makeCtx());
    // First findMany call is resolveMunicipalityScope's own province lookup;
    // the second is the chart's municipality list.
    mockPrisma.municipality.findMany.mockResolvedValueOnce([
      { id: "muni-1" },
      { id: "muni-2" },
    ]);
    mockPrisma.municipality.findMany.mockResolvedValueOnce([
      {
        id: "muni-1",
        name: "Coron",
        province: "Palawan",
        slug: "coron",
      },
      {
        id: "muni-2",
        name: "Araceli",
        province: "Palawan",
        slug: "araceli",
      },
    ]);

    await caller.municipalityCoverage({
      dateFrom: FROM,
      dateTo: TO,
      province: "Palawan",
    });

    // The resolver's own lookup — scoped to the tenant + requested province.
    const resolverArgs = mockPrisma.municipality.findMany.mock
      .calls[0]?.[0] as { where: { tenantId: string; province?: string } };
    expect(resolverArgs.where.tenantId).toBe(TENANT_ID);
    expect(resolverArgs.where.province).toBe("Palawan");

    // The chart's own municipality list — narrowed via an `in` clause to the
    // resolved ids (multiple ids never collapse to plain equality).
    const listArgs = mockPrisma.municipality.findMany.mock.calls[1]?.[0] as {
      where: { id?: { in: string[] } };
    };
    expect(listArgs.where.id).toEqual({ in: ["muni-1", "muni-2"] });

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(patrolArgs.where.municipalityId).toEqual({ in: ["muni-1", "muni-2"] });

    const eventArgs = mockPrisma.event.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(eventArgs.where.municipalityId).toEqual({ in: ["muni-1", "muni-2"] });
  });

  it("municipalityId always wins over province when both are supplied", async () => {
    const caller = createCaller(makeCtx());
    await caller.municipalityCoverage({
      dateFrom: FROM,
      dateTo: TO,
      municipalityId: "muni-1",
      province: "Palawan",
    });

    // No province-resolution lookup should occur — resolveMunicipalityScope
    // short-circuits on municipalityId before touching prisma for province.
    expect(mockPrisma.municipality.findMany).toHaveBeenCalledTimes(1);
    const listArgs = mockPrisma.municipality.findMany.mock.calls[0]?.[0] as {
      where: { id?: string };
    };
    expect(listArgs.where.id).toBe("muni-1");

    const patrolArgs = mockPrisma.patrol.groupBy.mock.calls[0]?.[0] as {
      where: { municipalityId: unknown };
    };
    expect(patrolArgs.where.municipalityId).toBe("muni-1");
  });
});

describe("municipalityCoverage.protectedZoneCoverage — occurrence-time scoping (Q1 fix 2026-07-07)", () => {
  it("windows by OCCURRENCE time (patrol.startTime / event.reportedAt), NOT the join row's assignedAt", async () => {
    const caller = createCaller(makeCtx());
    await caller.protectedZoneCoverage({ dateFrom: FROM, dateTo: TO });

    const patrolZoneArgs = mockPrisma.patrolCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: {
        tenantId: string;
        assignedAt?: unknown;
        patrol: {
          startTime: { gte: Date; lte: Date };
          isDeleted: boolean;
          isTestPatrol: boolean;
        };
      };
    };
    expect(patrolZoneArgs.where.tenantId).toBe(TENANT_ID);
    // The buggy assignedAt filter must be gone.
    expect(patrolZoneArgs.where.assignedAt).toBeUndefined();
    // Range is threaded through the patrol relation's startTime.
    expect(patrolZoneArgs.where.patrol.startTime.gte).toEqual(FROM);
    expect(patrolZoneArgs.where.patrol.startTime.lte).toEqual(TO);
    // Deleted/test patrols excluded (mirrors municipalityCoverage).
    expect(patrolZoneArgs.where.patrol.isDeleted).toBe(false);
    expect(patrolZoneArgs.where.patrol.isTestPatrol).toBe(false);

    const eventZoneArgs = mockPrisma.eventCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: {
        assignedAt?: unknown;
        event: {
          reportedAt: { gte: Date; lte: Date };
          NOT: { eventType: { display: { contains: string; mode: string } } };
        };
      };
    };
    expect(eventZoneArgs.where.assignedAt).toBeUndefined();
    expect(eventZoneArgs.where.event.reportedAt.gte).toEqual(FROM);
    expect(eventZoneArgs.where.event.reportedAt.lte).toEqual(TO);
    // Skylight events excluded (mirrors municipalityCoverage).
    expect(eventZoneArgs.where.event.NOT.eventType.display.contains).toBe(
      "skylight",
    );
  });

  it("keeps the open-ended 30-day default (no lte) when no range is supplied", async () => {
    const caller = createCaller(makeCtx());
    await caller.protectedZoneCoverage();

    const patrolZoneArgs = mockPrisma.patrolCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: { patrol: { startTime: { gte: Date; lte?: Date } } };
    };
    expect(patrolZoneArgs.where.patrol.startTime.gte).toBeInstanceOf(Date);
    // No upper bound by default — preserves original behaviour.
    expect(patrolZoneArgs.where.patrol.startTime.lte).toBeUndefined();
  });
});
