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

describe("municipalityCoverage.protectedZoneCoverage — range scoping (T4b)", () => {
  it("threads { dateFrom, dateTo } into the assignedAt filter", async () => {
    const caller = createCaller(makeCtx());
    await caller.protectedZoneCoverage({ dateFrom: FROM, dateTo: TO });

    const patrolZoneArgs = mockPrisma.patrolCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: { assignedAt: { gte: Date; lte: Date }; tenantId: string };
    };
    expect(patrolZoneArgs.where.tenantId).toBe(TENANT_ID);
    expect(patrolZoneArgs.where.assignedAt.gte).toEqual(FROM);
    expect(patrolZoneArgs.where.assignedAt.lte).toEqual(TO);

    const eventZoneArgs = mockPrisma.eventCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: { assignedAt: { gte: Date; lte: Date } };
    };
    expect(eventZoneArgs.where.assignedAt.gte).toEqual(FROM);
    expect(eventZoneArgs.where.assignedAt.lte).toEqual(TO);
  });

  it("keeps the open-ended 30-day default (no lte) when no range is supplied", async () => {
    const caller = createCaller(makeCtx());
    await caller.protectedZoneCoverage();

    const patrolZoneArgs = mockPrisma.patrolCoveredZone.groupBy.mock
      .calls[0]?.[0] as {
      where: { assignedAt: { gte: Date; lte?: Date } };
    };
    expect(patrolZoneArgs.where.assignedAt.gte).toBeInstanceOf(Date);
    // No upper bound by default — preserves original behaviour.
    expect(patrolZoneArgs.where.assignedAt.lte).toBeUndefined();
  });
});
