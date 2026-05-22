// get-per-area-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    areaBoundary: { findUnique: vi.fn(), findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import {
  getPerAreaReportData,
  parsePerAreaParams,
  resolveDefaultMonthRange,
} from "../get-per-area-report-data";

const TENANT_ID = "tenant_a";
const TENANT_SLUG = "mindoro";
const EXPORT_ID = "exp_per_area_1";
const AREA_ID = "area_a5";

const TENANT_ROW = {
  id: TENANT_ID,
  name: "Mindoro MPA",
  slug: TENANT_SLUG,
  timezone: "Asia/Manila",
};

const AREA_ROW = {
  id: AREA_ID,
  tenantId: TENANT_ID,
  name: "Area A5",
  region: "Mindoro Strait",
  source: "ARCGIS",
  isEnabled: true,
};

const EXPORT_ROW = {
  tenantId: TENANT_ID,
  reportType: "area" as const,
  paramsJson: {
    areaBoundaryId: AREA_ID,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-06-01T00:00:00.000Z",
  },
  paperSize: "A4" as const,
  createdAt: new Date("2026-05-22T02:00:00.000Z"),
};

describe("parsePerAreaParams", () => {
  it("returns empty object for null/undefined/non-object", () => {
    expect(parsePerAreaParams(null)).toEqual({});
    expect(parsePerAreaParams(undefined)).toEqual({});
    expect(parsePerAreaParams("string")).toEqual({});
    expect(parsePerAreaParams(42)).toEqual({});
  });

  it("preserves valid areaBoundaryId + startDate + endDate", () => {
    const out = parsePerAreaParams({
      areaBoundaryId: "area_xyz",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-06-01T00:00:00.000Z",
    });
    expect(out.areaBoundaryId).toBe("area_xyz");
    expect(out.startDate?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(out.endDate?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("drops empty areaBoundaryId", () => {
    const out = parsePerAreaParams({ areaBoundaryId: "" });
    expect(out.areaBoundaryId).toBeUndefined();
  });

  it("drops invalid date strings", () => {
    const out = parsePerAreaParams({
      startDate: "not-a-date",
      endDate: 42,
    });
    expect(out.startDate).toBeUndefined();
    expect(out.endDate).toBeUndefined();
  });
});

describe("resolveDefaultMonthRange", () => {
  it("returns the tenant-local current calendar month for UTC+8", () => {
    // 2026-05-22 02:00 UTC == 2026-05-22 10:00 UTC+8 (Asia/Manila)
    const now = new Date("2026-05-22T02:00:00.000Z");
    const r = resolveDefaultMonthRange(now, 480);
    // Tenant-local May starts 2026-05-01 00:00 +08:00 == 2026-04-30 16:00 UTC
    expect(r.start.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    // Tenant-local June starts 2026-06-01 00:00 +08:00 == 2026-05-31 16:00 UTC
    expect(r.end.toISOString()).toBe("2026-05-31T16:00:00.000Z");
    expect(r.label).toBe("May 2026");
  });

  it("returns the UTC current calendar month when offset is 0", () => {
    const now = new Date("2026-05-22T02:00:00.000Z");
    const r = resolveDefaultMonthRange(now, 0);
    expect(r.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.label).toBe("May 2026");
  });

  it("rolls over December → January correctly", () => {
    const now = new Date("2026-12-15T00:00:00.000Z");
    const r = resolveDefaultMonthRange(now, 0);
    expect(r.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(r.label).toBe("December 2026");
  });
});

describe("getPerAreaReportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tenant slug is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(null);
    const r = await getPerAreaReportData("nope", EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export id is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(null);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      ...EXPORT_ROW,
      tenantId: "other_tenant",
    } as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when reportType is not area", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      ...EXPORT_ROW,
      reportType: "coverage",
    } as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when explicit areaBoundaryId does not exist", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(null);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when areaBoundary belongs to another tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce({
      ...AREA_ROW,
      tenantId: "other_tenant",
    } as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("falls back to first enabled area when areaBoundaryId is missing from params", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      ...EXPORT_ROW,
      paramsJson: { startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-06-01T00:00:00.000Z" },
    } as never);
    vi.mocked(prisma.areaBoundary.findFirst).mockResolvedValueOnce({
      id: AREA_ID,
      name: "Area A5",
      region: "Mindoro Strait",
      source: "ARCGIS",
    } as never);
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.area.id).toBe(AREA_ID);
    // findUnique on areaBoundary must NOT be called in fallback path
    expect(prisma.areaBoundary.findUnique).not.toHaveBeenCalled();
    expect(prisma.areaBoundary.findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when fallback area lookup returns no enabled boundaries", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      ...EXPORT_ROW,
      paramsJson: {},
    } as never);
    vi.mocked(prisma.areaBoundary.findFirst).mockResolvedValueOnce(null);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("uses default month range when start/end missing, flagging isDefault", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      ...EXPORT_ROW,
      paramsJson: { areaBoundaryId: AREA_ID },
    } as never);
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.dateRange.isDefault).toBe(true);
    expect(r?.dateRange.label).toBe("May 2026");
  });

  it("uses explicit start/end when params provide both, label without isDefault", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.dateRange.isDefault).toBe(false);
    expect(r?.dateRange.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r?.dateRange.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r?.dateRange.label).toBe("2026-05-01 — 2026-05-31");
  });

  it("groups events by EventType.id and sorts DESC by count then ASC by display, filtered to law-enforcement category", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
      {
        eventTypeId: "et_illegal_fishing",
        eventType: {
          id: "et_illegal_fishing",
          value: "illegal_fishing",
          display: "Illegal Fishing",
          category: "Law Enforcement",
        },
      },
      {
        eventTypeId: "et_illegal_fishing",
        eventType: {
          id: "et_illegal_fishing",
          value: "illegal_fishing",
          display: "Illegal Fishing",
          category: "Law Enforcement",
        },
      },
      {
        eventTypeId: "et_destructive",
        eventType: {
          id: "et_destructive",
          value: "destructive_practices",
          display: "Destructive Practices",
          category: "law enforcement / blast fishing",
        },
      },
      // Equal-count tie — should sort by display ASC
      {
        eventTypeId: "et_apprehension",
        eventType: {
          id: "et_apprehension",
          value: "apprehension",
          display: "Apprehension",
          category: "Law Enforcement",
        },
      },
      {
        eventTypeId: "et_apprehension",
        eventType: {
          id: "et_apprehension",
          value: "apprehension",
          display: "Apprehension",
          category: "Law Enforcement",
        },
      },
      // Monitoring event — should appear in monitoring breakdown only
      {
        eventTypeId: "et_turtle",
        eventType: {
          id: "et_turtle",
          value: "turtle_sighting",
          display: "Turtle Sighting",
          category: "Monitoring",
        },
      },
      // Operational category — excluded from BOTH breakdowns
      {
        eventTypeId: "et_test",
        eventType: {
          id: "et_test",
          value: "test_event",
          display: "Test Event",
          category: "system",
        },
      },
      // Null eventType — defensively skipped
      {
        eventTypeId: "et_orphan",
        eventType: null,
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    // 2 illegal_fishing + 2 apprehension + 1 destructive — illegal_fishing
    // and apprehension tie at 2; tie broken by display ASC → Apprehension first
    expect(r?.lawEnforcementBreakdown.map((b) => b.display)).toEqual([
      "Apprehension",
      "Illegal Fishing",
      "Destructive Practices",
    ]);
    expect(r?.lawEnforcementBreakdown.map((b) => b.count)).toEqual([2, 2, 1]);
    expect(r?.monitoringBreakdown.map((b) => b.display)).toEqual([
      "Turtle Sighting",
    ]);
    expect(r?.monitoringBreakdown[0]?.count).toBe(1);
  });

  it("returns empty breakdowns when no events match the category needles", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
      {
        eventTypeId: "et_other",
        eventType: {
          id: "et_other",
          value: "other",
          display: "Other",
          category: "Operational",
        },
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.lawEnforcementBreakdown).toEqual([]);
    expect(r?.monitoringBreakdown).toEqual([]);
  });

  it("splits patrol summary by PatrolType and treats null km/hours as 0", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      { patrolType: "foot", totalDistanceKm: 3.5, totalHours: 2.0 },
      { patrolType: "foot", totalDistanceKm: 1.5, totalHours: 1.0 },
      { patrolType: "foot", totalDistanceKm: null, totalHours: null },
      { patrolType: "seaborne", totalDistanceKm: 20.0, totalHours: 4.0 },
      { patrolType: "seaborne", totalDistanceKm: 15.0, totalHours: 3.5 },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrolSummary.foot).toEqual({
      count: 3,
      totalDistanceKm: 5.0,
      totalHours: 3.0,
    });
    expect(r?.patrolSummary.seaborne).toEqual({
      count: 2,
      totalDistanceKm: 35.0,
      totalHours: 7.5,
    });
  });

  it("returns zero-row patrol summary when no patrols match", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrolSummary.foot).toEqual({
      count: 0,
      totalDistanceKm: 0,
      totalHours: 0,
    });
    expect(r?.patrolSummary.seaborne).toEqual({
      count: 0,
      totalDistanceKm: 0,
      totalHours: 0,
    });
  });

  it("scopes prisma queries to the resolved area + date range", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    const eventCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(eventCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      areaBoundaryId: AREA_ID,
      reportedAt: {
        gte: new Date("2026-05-01T00:00:00.000Z"),
        lt: new Date("2026-06-01T00:00:00.000Z"),
      },
      eventTypeId: { not: null },
    });
    const patrolCall = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0];
    expect(patrolCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      areaBoundaryId: AREA_ID,
      startTime: {
        gte: new Date("2026-05-01T00:00:00.000Z"),
        lt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
  });

  it("returns full shape with tenant + area + paperSize + generatedAt populated", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      EXPORT_ROW as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.tenant).toEqual({
      id: TENANT_ID,
      name: "Mindoro MPA",
      slug: TENANT_SLUG,
      timezone: "Asia/Manila",
    });
    expect(r?.area).toEqual({
      id: AREA_ID,
      name: "Area A5",
      region: "Mindoro Strait",
      source: "ARCGIS",
    });
    expect(r?.paperSize).toBe("A4");
    expect(r?.generatedAt).toBeInstanceOf(Date);
  });
});
