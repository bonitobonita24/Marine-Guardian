// Issue B fix (2026-06-23): dashboard.recentEvents, eventBreakdown, and
// lastIncident must exclude events whose eventType.category = "skylight".
// Skylight is a maritime satellite AIS/radar monitoring provider; its events
// are automated vessel-detection records, not human-reported incidents.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    patrol: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    accompanyingRanger: {
      findMany: vi.fn(),
    },
    alertHistory: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { dashboardRouter } from "../dashboard";

const createCaller = createCallerFactory(dashboardRouter);

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
  event: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  patrol: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  accompanyingRanger: { findMany: ReturnType<typeof vi.fn> };
  alertHistory: { count: ReturnType<typeof vi.fn> };
};

describe("dashboard.recentEvents — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  it("excludes Skylight-category events from the WHERE clause", async () => {
    const caller = createCaller(makeCtx());
    await caller.recentEvents();

    expect(mockPrisma.event.findMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    // The where clause must contain NOT: { eventType: { category: { contains: "skylight", mode: "insensitive" } } }
    // so variants like "Skylight", "SKYLIGHT", "skylight_ais" are all excluded.
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      NOT: { eventType: { category: { contains: "skylight", mode: "insensitive" } } },
    });
  });

  it("returns events that passed the Skylight filter", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        title: "Illegal fishing",
        priority: 200,
        state: "active",
        reportedAt: new Date("2026-06-23T08:00:00Z"),
        eventType: { display: "Poaching", category: "law_enforcement" },
      },
    ]);

    const caller = createCaller(makeCtx());
    const result = await caller.recentEvents();

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Illegal fishing");
  });
});

describe("dashboard.eventBreakdown — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findMany.mockResolvedValue([]);
  });

  it("excludes Skylight-category events from the breakdown query", async () => {
    const caller = createCaller(makeCtx());
    await caller.eventBreakdown();

    expect(mockPrisma.event.findMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      NOT: { eventType: { category: { contains: "skylight", mode: "insensitive" } } },
    });
  });
});

describe("dashboard.lastIncident — Skylight filter (Issue B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.event.findFirst.mockResolvedValue(null);
  });

  it("excludes Skylight-category events from lastIncident lookup", async () => {
    const caller = createCaller(makeCtx());
    await caller.lastIncident();

    expect(mockPrisma.event.findFirst).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockPrisma.event.findFirst.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      tenantId: TENANT_ID,
      priority: { gte: 200 },
      NOT: { eventType: { category: { contains: "skylight", mode: "insensitive" } } },
    });
  });
});
