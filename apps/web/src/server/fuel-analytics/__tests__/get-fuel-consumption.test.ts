import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    fuelEntry: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import { getFuelConsumption, tenantLocalPeriodLabel } from "../get-fuel-consumption";

const TENANT_ID = "tenant-abc";
const AREA_A = "area-aaa";
const AREA_B = "area-bbb";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
});

describe("tenantLocalPeriodLabel", () => {
  // Asia/Manila is UTC+8 → offsetMinutes = 480.
  // Test instant: 2026-05-26 02:00 UTC == 2026-05-26 10:00 +08:00
  const instant = new Date("2026-05-26T02:00:00.000Z");

  it("returns YYYY-MM-DD for day grain", () => {
    const r = tenantLocalPeriodLabel(instant, 480, "day");
    expect(r.label).toBe("2026-05-26");
    // Bucket start = 2026-05-26 00:00 +08:00 == 2026-05-25 16:00 UTC
    expect(r.startUtc.toISOString()).toBe("2026-05-25T16:00:00.000Z");
  });

  it("returns YYYY-MM for month grain", () => {
    const r = tenantLocalPeriodLabel(instant, 480, "month");
    expect(r.label).toBe("2026-05");
    expect(r.startUtc.toISOString()).toBe("2026-04-30T16:00:00.000Z");
  });

  it("returns YYYY-Qn for quarter grain", () => {
    const r = tenantLocalPeriodLabel(instant, 480, "quarter");
    expect(r.label).toBe("2026-Q2");
    // Q2 starts April 1
    expect(r.startUtc.toISOString()).toBe("2026-03-31T16:00:00.000Z");
  });

  it("returns YYYY for year grain", () => {
    const r = tenantLocalPeriodLabel(instant, 480, "year");
    expect(r.label).toBe("2026");
    expect(r.startUtc.toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });

  it("returns YYYY-Www ISO week for week grain (Tuesday → W22)", () => {
    // 2026-05-26 is a Tuesday → ISO week 22 of 2026
    const r = tenantLocalPeriodLabel(instant, 480, "week");
    expect(r.label).toBe("2026-W22");
    // Bucket start = Monday 2026-05-25 00:00 +08:00 == 2026-05-24 16:00 UTC
    expect(r.startUtc.toISOString()).toBe("2026-05-24T16:00:00.000Z");
  });

  it("UTC (offsetMinutes=0) returns calendar day in UTC", () => {
    const r = tenantLocalPeriodLabel(instant, 0, "day");
    expect(r.label).toBe("2026-05-26");
    expect(r.startUtc.toISOString()).toBe("2026-05-26T00:00:00.000Z");
  });
});

describe("getFuelConsumption — empty + edge", () => {
  it("returns zeroed summary + empty perArea + empty trend when no data", async () => {
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.summary.totalLiters).toBe(0);
    expect(r.summary.totalCost).toBe(0);
    expect(r.summary.totalSeabornePatrolKm).toBe(0);
    expect(r.summary.averageLitersPerKm).toBeNull();
    expect(r.summary.entryCount).toBe(0);
    expect(r.summary.currency).toBe("PHP");
    expect(r.perArea).toEqual([]);
    expect(r.trend).toEqual([]);
  });

  it("uses defaultCurrency from caller when entries list is empty", async () => {
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
      defaultCurrency: "IDR",
    });
    expect(r.summary.currency).toBe("IDR");
  });

  it("uses currency from first fuel entry when present", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-1",
        liters: "100",
        totalPrice: "1000",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
      defaultCurrency: "IDR",
    });
    expect(r.summary.currency).toBe("PHP");
  });
});

describe("getFuelConsumption — aggregation", () => {
  it("sums liters/cost across all entries; averageLitersPerKm uses seaborne km only", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-1",
        liters: "100",
        totalPrice: "1000",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
      {
        id: "fe-2",
        liters: "50",
        totalPrice: "500",
        currency: "PHP",
        dateReceived: new Date("2026-05-15T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p-1",
        patrolType: "seaborne",
        startTime: new Date("2026-05-12T00:00:00.000Z"),
        totalDistanceKm: 30,
        areaBoundaryId: AREA_A,
      },
      {
        id: "p-2",
        patrolType: "seaborne",
        startTime: new Date("2026-05-18T00:00:00.000Z"),
        totalDistanceKm: 20,
        areaBoundaryId: AREA_A,
      },
    ] as never);

    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.summary.totalLiters).toBe(150);
    expect(r.summary.totalCost).toBe(1500);
    expect(r.summary.totalSeabornePatrolKm).toBe(50);
    expect(r.summary.averageLitersPerKm).toBe(3); // 150 / 50
    expect(r.summary.entryCount).toBe(2);
  });

  it("excludes foot patrols from km totals", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p-foot",
        patrolType: "foot",
        startTime: new Date("2026-05-10T00:00:00.000Z"),
        totalDistanceKm: 99,
        areaBoundaryId: AREA_A,
      },
      {
        id: "p-sea",
        patrolType: "seaborne",
        startTime: new Date("2026-05-12T00:00:00.000Z"),
        totalDistanceKm: 30,
        areaBoundaryId: AREA_A,
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.summary.totalSeabornePatrolKm).toBe(30);
  });

  it("excludes patrols with null totalDistanceKm", async () => {
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p-1",
        patrolType: "seaborne",
        startTime: new Date("2026-05-12T00:00:00.000Z"),
        totalDistanceKm: null,
        areaBoundaryId: AREA_A,
      },
      {
        id: "p-2",
        patrolType: "seaborne",
        startTime: new Date("2026-05-18T00:00:00.000Z"),
        totalDistanceKm: 25,
        areaBoundaryId: AREA_A,
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.summary.totalSeabornePatrolKm).toBe(25);
  });

  it("returns averageLitersPerKm = null when no seaborne km", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-1",
        liters: "100",
        totalPrice: "1000",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.summary.totalSeabornePatrolKm).toBe(0);
    expect(r.summary.averageLitersPerKm).toBeNull();
  });
});

describe("getFuelConsumption — perArea breakdown", () => {
  it("groups by areaBoundaryId and computes per-area L/km", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-a",
        liters: "100",
        totalPrice: "1000",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
      {
        id: "fe-b",
        liters: "60",
        totalPrice: "600",
        currency: "PHP",
        dateReceived: new Date("2026-05-12T00:00:00.000Z"),
        areaBoundaryId: AREA_B,
        areaName: "Area B",
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p-a",
        patrolType: "seaborne",
        startTime: new Date("2026-05-11T00:00:00.000Z"),
        totalDistanceKm: 25,
        areaBoundaryId: AREA_A,
      },
      {
        id: "p-b",
        patrolType: "seaborne",
        startTime: new Date("2026-05-13T00:00:00.000Z"),
        totalDistanceKm: 20,
        areaBoundaryId: AREA_B,
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.perArea).toHaveLength(2);
    const rowA = r.perArea.find((x) => x.areaBoundaryId === AREA_A);
    const rowB = r.perArea.find((x) => x.areaBoundaryId === AREA_B);
    expect(rowA?.liters).toBe(100);
    expect(rowA?.seabornePatrolKm).toBe(25);
    expect(rowA?.litersPerKm).toBe(4); // 100 / 25
    expect(rowB?.liters).toBe(60);
    expect(rowB?.litersPerKm).toBe(3); // 60 / 20
  });

  it("sorts perArea alphabetically by areaName", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-z",
        liters: "10",
        totalPrice: "100",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: "area-z",
        areaName: "Zebra",
      },
      {
        id: "fe-a",
        liters: "10",
        totalPrice: "100",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: "area-a",
        areaName: "Alpha",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.perArea.map((x) => x.areaName)).toEqual(["Alpha", "Zebra"]);
  });

  it("groups null areaBoundaryId entries into an Unallocated row", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-orphan",
        liters: "40",
        totalPrice: "400",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: null,
        areaName: "Some Area",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    const orphan = r.perArea.find((x) => x.areaBoundaryId === null);
    expect(orphan).toBeDefined();
    expect(orphan?.liters).toBe(40);
    expect(orphan?.areaName).toBe("Some Area");
  });
});

describe("getFuelConsumption — trend bucketing", () => {
  it("buckets fuel + patrol km by month label, sorted ASC by startUtc", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-may",
        liters: "100",
        totalPrice: "1000",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
      {
        id: "fe-jun",
        liters: "200",
        totalPrice: "2000",
        currency: "PHP",
        dateReceived: new Date("2026-06-15T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p-may",
        patrolType: "seaborne",
        startTime: new Date("2026-05-20T00:00:00.000Z"),
        totalDistanceKm: 50,
        areaBoundaryId: AREA_A,
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(r.trend.map((b) => b.bucket)).toEqual(["2026-05", "2026-06"]);
    expect(r.trend[0]?.liters).toBe(100);
    expect(r.trend[0]?.seabornePatrolKm).toBe(50);
    expect(r.trend[0]?.litersPerKm).toBe(2);
    expect(r.trend[1]?.liters).toBe(200);
    expect(r.trend[1]?.seabornePatrolKm).toBe(0);
    expect(r.trend[1]?.litersPerKm).toBeNull();
  });

  it("buckets by day grain when periodGrain=day", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-1",
        liters: "10",
        totalPrice: "100",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
      {
        id: "fe-2",
        liters: "20",
        totalPrice: "200",
        currency: "PHP",
        dateReceived: new Date("2026-05-11T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "day",
    });
    expect(r.trend.map((b) => b.bucket)).toEqual(["2026-05-10", "2026-05-11"]);
  });

  it("buckets by quarter grain when periodGrain=quarter", async () => {
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([
      {
        id: "fe-q1",
        liters: "10",
        totalPrice: "100",
        currency: "PHP",
        dateReceived: new Date("2026-02-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
      {
        id: "fe-q2",
        liters: "20",
        totalPrice: "200",
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
        areaBoundaryId: AREA_A,
        areaName: "Area A",
      },
    ] as never);
    const r = await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-01-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-01T00:00:00.000Z"),
      periodGrain: "quarter",
    });
    expect(r.trend.map((b) => b.bucket)).toEqual(["2026-Q1", "2026-Q2"]);
  });
});

describe("getFuelConsumption — query shape", () => {
  // Prisma's where types are deep unions — direct property access trips
  // TS narrowing. View calls through a permissive shape so tests can
  // assert on the wire arguments without litigating Prisma's type tree.
  interface WhereShape {
    tenantId?: string;
    patrolType?: string;
    areaBoundaryId?: { in: string[] } | undefined;
    dateReceived?: { gte?: Date; lt?: Date };
    startTime?: { gte?: Date; lt?: Date };
  }
  const fuelCallWhere = (): WhereShape | undefined => {
    const arg = vi.mocked(prisma.fuelEntry.findMany).mock.calls[0]?.[0];
    return (arg as { where?: WhereShape } | undefined)?.where;
  };
  const patrolCallWhere = (): WhereShape | undefined => {
    const arg = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0];
    return (arg as { where?: WhereShape } | undefined)?.where;
  };

  it("passes tenantId, areaBoundaryIds, date range to prisma.fuelEntry.findMany", async () => {
    await getFuelConsumption({
      tenantId: TENANT_ID,
      areaBoundaryIds: [AREA_A, AREA_B],
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    const w = fuelCallWhere();
    expect(w?.tenantId).toBe(TENANT_ID);
    expect(w?.areaBoundaryId).toEqual({ in: [AREA_A, AREA_B] });
    expect(w?.dateReceived?.gte).toEqual(
      new Date("2026-05-01T00:00:00.000Z"),
    );
    expect(w?.dateReceived?.lt).toEqual(
      new Date("2026-06-01T00:00:00.000Z"),
    );
  });

  it("passes tenantId + seaborne filter + date range to prisma.patrol.findMany", async () => {
    await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    const w = patrolCallWhere();
    expect(w?.tenantId).toBe(TENANT_ID);
    expect(w?.patrolType).toBe("seaborne");
    expect(w?.startTime?.gte).toEqual(
      new Date("2026-05-01T00:00:00.000Z"),
    );
    expect(w?.startTime?.lt).toEqual(
      new Date("2026-06-01T00:00:00.000Z"),
    );
  });

  it("omits areaBoundaryId filter on patrol query when areaBoundaryIds undefined", async () => {
    await getFuelConsumption({
      tenantId: TENANT_ID,
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(patrolCallWhere()?.areaBoundaryId).toBeUndefined();
  });

  it("applies areaBoundaryIds filter to patrol query when provided", async () => {
    await getFuelConsumption({
      tenantId: TENANT_ID,
      areaBoundaryIds: [AREA_A],
      dateFrom: new Date("2026-05-01T00:00:00.000Z"),
      dateTo: new Date("2026-06-01T00:00:00.000Z"),
      periodGrain: "month",
    });
    expect(patrolCallWhere()?.areaBoundaryId).toEqual({ in: [AREA_A] });
  });
});
