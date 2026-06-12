// get-per-area-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    areaBoundary: { findUnique: vi.fn(), findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
    fuelEntry: { findMany: vi.fn() },
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
    // Default fuel entries to empty — tests that exercise fuel override this
    // with mockResolvedValueOnce. Keeps existing pre-6.2c tests untouched.
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValue([] as never);
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
      { id: "p1", patrolType: "foot", totalDistanceKm: 3.5, totalHours: 2.0, track: null },
      { id: "p2", patrolType: "foot", totalDistanceKm: 1.5, totalHours: 1.0, track: null },
      { id: "p3", patrolType: "foot", totalDistanceKm: null, totalHours: null, track: null },
      { id: "p4", patrolType: "seaborne", totalDistanceKm: 20.0, totalHours: 4.0, track: null },
      { id: "p5", patrolType: "seaborne", totalDistanceKm: 15.0, totalHours: 3.5, track: null },
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

  it("prefers computedDistanceKm over totalDistanceKm when both present (Patrol v2 a470e7a)", async () => {
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
      {
        id: "p1",
        patrolType: "seaborne",
        startTime: new Date("2026-02-10T00:00:00Z"),
        totalDistanceKm: 8.4,
        computedDistanceKm: 12.5,
        totalHours: 4.0,
        track: null,
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    // Both distance consumers resolve from the same effective value: the
    // recomputed haversine total (12.5) is preferred over the ER-supplied 8.4.
    expect(r?.patrolSummary.seaborne.totalDistanceKm).toBeCloseTo(12.5, 5);
    expect(r?.fuelConsumption?.totalSeabornePatrolKm).toBeCloseTo(12.5, 5);
  });

  it("falls back to totalDistanceKm when computedDistanceKm is null (Patrol v2 a470e7a)", async () => {
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
      {
        id: "p1",
        patrolType: "seaborne",
        startTime: new Date("2026-02-10T00:00:00Z"),
        totalDistanceKm: 8.4,
        computedDistanceKm: null,
        totalHours: 4.0,
        track: null,
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    // Recompute has not run (computedDistanceKm null) — ?? falls back to the
    // original ER total on both consumers.
    expect(r?.patrolSummary.seaborne.totalDistanceKm).toBeCloseTo(8.4, 5);
    expect(r?.fuelConsumption?.totalSeabornePatrolKm).toBeCloseTo(8.4, 5);
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

  // ───────────────────────────────────────────────────────────────────
  // Page 2 heatmap data — 6.2b-i extension
  // ───────────────────────────────────────────────────────────────────

  it("populates lawEnforcementEventLocations from events with finite lat/lon and matching category", async () => {
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
        locationLat: 13.42,
        locationLon: 121.05,
        eventType: {
          id: "et_illegal_fishing",
          value: "illegal_fishing",
          display: "Illegal Fishing",
          category: "Law Enforcement",
        },
      },
      {
        eventTypeId: "et_apprehension",
        locationLat: 13.43,
        locationLon: 121.06,
        eventType: {
          id: "et_apprehension",
          value: "apprehension",
          display: "Apprehension",
          category: "Law Enforcement / Marine",
        },
      },
      // Monitoring event — must NOT appear in lawEnforcementEventLocations
      {
        eventTypeId: "et_turtle",
        locationLat: 13.44,
        locationLon: 121.07,
        eventType: {
          id: "et_turtle",
          value: "turtle_sighting",
          display: "Turtle Sighting",
          category: "Monitoring",
        },
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.lawEnforcementEventLocations).toHaveLength(2);
    expect(r?.lawEnforcementEventLocations[0]).toEqual({
      lat: 13.42,
      lon: 121.05,
      eventTypeId: "et_illegal_fishing",
    });
    expect(r?.lawEnforcementEventLocations[1]?.eventTypeId).toBe(
      "et_apprehension",
    );
    expect(r?.monitoringEventLocations).toEqual([
      { lat: 13.44, lon: 121.07, eventTypeId: "et_turtle" },
    ]);
  });

  it("skips events with null or non-finite location coordinates from heatmap arrays", async () => {
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
      // null lat — skipped
      {
        eventTypeId: "et_a",
        locationLat: null,
        locationLon: 121.05,
        eventType: {
          id: "et_a",
          value: "a",
          display: "A",
          category: "Law Enforcement",
        },
      },
      // null lon — skipped
      {
        eventTypeId: "et_b",
        locationLat: 13.42,
        locationLon: null,
        eventType: {
          id: "et_b",
          value: "b",
          display: "B",
          category: "Law Enforcement",
        },
      },
      // NaN lat — skipped (Number.isFinite(NaN) === false)
      {
        eventTypeId: "et_c",
        locationLat: Number.NaN,
        locationLon: 121.05,
        eventType: {
          id: "et_c",
          value: "c",
          display: "C",
          category: "Law Enforcement",
        },
      },
      // Both finite — kept
      {
        eventTypeId: "et_d",
        locationLat: 13.45,
        locationLon: 121.08,
        eventType: {
          id: "et_d",
          value: "d",
          display: "D",
          category: "Law Enforcement",
        },
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.lawEnforcementEventLocations).toEqual([
      { lat: 13.45, lon: 121.08, eventTypeId: "et_d" },
    ]);
  });

  it("excludes events with null eventType from heatmap arrays (matches breakdown behavior)", async () => {
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
        eventTypeId: "et_orphan",
        locationLat: 13.5,
        locationLon: 121.1,
        eventType: null,
      },
      // Operational category — excluded from both heatmap arrays
      {
        eventTypeId: "et_test",
        locationLat: 13.5,
        locationLon: 121.1,
        eventType: {
          id: "et_test",
          value: "test",
          display: "Test",
          category: "Operational",
        },
      },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.lawEnforcementEventLocations).toEqual([]);
    expect(r?.monitoringEventLocations).toEqual([]);
  });

  it("builds patrolTracks from patrols with materialised LineString tracks", async () => {
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
      {
        id: "patrol_with_track",
        patrolType: "seaborne",
        totalDistanceKm: 5.0,
        totalHours: 2.5,
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [121.0, 13.4],
              [121.01, 13.405],
              [121.02, 13.41],
            ],
          },
        },
      },
      // Patrol with no track row — counted in summary, excluded from heatmap
      {
        id: "patrol_no_track",
        patrolType: "foot",
        totalDistanceKm: 1.0,
        totalHours: 0.5,
        track: null,
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrolTracks).toHaveLength(1);
    const tracked = r?.patrolTracks[0];
    expect(tracked?.patrolId).toBe("patrol_with_track");
    expect(tracked?.patrolType).toBe("seaborne");
    expect(tracked?.sampledPoints.length).toBeGreaterThan(0);
    // Each tuple is [lat, lon, weight=1]
    for (const [lat, lon, w] of tracked?.sampledPoints ?? []) {
      expect(lat).toBeGreaterThan(13.3);
      expect(lat).toBeLessThan(13.5);
      expect(lon).toBeGreaterThan(120.9);
      expect(lon).toBeLessThan(121.1);
      expect(w).toBe(1);
    }
    // Patrol summary still includes the trackless patrol
    expect(r?.patrolSummary.foot.count).toBe(1);
    expect(r?.patrolSummary.seaborne.count).toBe(1);
  });

  it("skips patrols whose track materialises to a non-LineString or <2 points", async () => {
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
      // Non-LineString geometry — extractor returns null → skipped
      {
        id: "p_point",
        patrolType: "foot",
        totalDistanceKm: 1.0,
        totalHours: 0.5,
        track: {
          trackGeojson: { type: "Point", coordinates: [121.0, 13.4] },
        },
      },
      // Single-point LineString — extractor returns null (needs >=2) → skipped
      {
        id: "p_one_point",
        patrolType: "seaborne",
        totalDistanceKm: null,
        totalHours: null,
        track: {
          trackGeojson: { type: "LineString", coordinates: [[121.0, 13.4]] },
        },
      },
      // Malformed JSON — extractor returns null → skipped
      {
        id: "p_malformed",
        patrolType: "foot",
        totalDistanceKm: null,
        totalHours: null,
        track: { trackGeojson: { foo: "bar" } },
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrolTracks).toEqual([]);
    // Summary still counts the patrols (they exist, just have unusable tracks)
    expect(r?.patrolSummary.foot.count).toBe(2);
    expect(r?.patrolSummary.seaborne.count).toBe(1);
  });

  it("includes track relation in the patrol query SELECT", async () => {
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
    const patrolCall = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0];
    // The new SELECT projection must include id + track.trackGeojson so the
    // heatmap densifier has a stable patrolId + the raw GeoJSON to extract.
    expect(patrolCall?.select).toMatchObject({
      id: true,
      patrolType: true,
      track: { select: { trackGeojson: true } },
    });
    // The event SELECT must include locationLat + locationLon for heatmap geo.
    const eventCall = vi.mocked(prisma.event.findMany).mock.calls[0]?.[0];
    expect(eventCall?.select).toMatchObject({
      locationLat: true,
      locationLon: true,
    });
  });

  it("returns empty heatmap arrays when no events/patrols match (regression)", async () => {
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
    expect(r?.lawEnforcementEventLocations).toEqual([]);
    expect(r?.monitoringEventLocations).toEqual([]);
    expect(r?.patrolTracks).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────
  // Page 3 fuel consumption — 6.2c extension
  // ───────────────────────────────────────────────────────────────────

  it("sums fuel liters + totalPrice across area + range and computes aggregate L/km", async () => {
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
      {
        id: "p_seaborne_1",
        patrolType: "seaborne",
        startTime: new Date("2026-05-05T00:00:00.000Z"),
        totalDistanceKm: 20.0,
        totalHours: 4.0,
        track: null,
      },
      {
        id: "p_seaborne_2",
        patrolType: "seaborne",
        startTime: new Date("2026-05-12T00:00:00.000Z"),
        totalDistanceKm: 30.0,
        totalHours: 6.0,
        track: null,
      },
      // Foot patrol — counted in patrolSummary but not in seaborne km
      {
        id: "p_foot",
        patrolType: "foot",
        startTime: new Date("2026-05-08T00:00:00.000Z"),
        totalDistanceKm: 2.0,
        totalHours: 1.0,
        track: null,
      },
    ] as never);
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValueOnce([
      {
        liters: 25.0,
        totalPrice: 1500.0,
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
      },
      {
        liters: 15.5,
        totalPrice: 930.0,
        currency: "PHP",
        dateReceived: new Date("2026-05-20T00:00:00.000Z"),
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.fuelConsumption).not.toBeNull();
    expect(r?.fuelConsumption?.totalLiters).toBeCloseTo(40.5, 5);
    expect(r?.fuelConsumption?.totalCost).toBeCloseTo(2430.0, 5);
    expect(r?.fuelConsumption?.currency).toBe("PHP");
    expect(r?.fuelConsumption?.totalSeabornePatrolKm).toBeCloseTo(50.0, 5);
    // 40.5 / 50 = 0.81 L/km (foot patrol km excluded from divisor)
    expect(r?.fuelConsumption?.averageLitersPerKm).toBeCloseTo(0.81, 5);
    expect(r?.fuelConsumption?.entryCount).toBe(2);
  });

  it("returns null averageLitersPerKm when seaborne distance is zero (divide-by-zero guard)", async () => {
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
      // Only foot patrols — totalSeabornePatrolKm stays 0
      {
        id: "p_foot",
        patrolType: "foot",
        startTime: new Date("2026-05-10T00:00:00.000Z"),
        totalDistanceKm: 3.0,
        totalHours: 1.0,
        track: null,
      },
    ] as never);
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValueOnce([
      {
        liters: 10.0,
        totalPrice: 600.0,
        currency: "PHP",
        dateReceived: new Date("2026-05-10T00:00:00.000Z"),
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.fuelConsumption?.totalLiters).toBeCloseTo(10.0, 5);
    expect(r?.fuelConsumption?.totalSeabornePatrolKm).toBe(0);
    expect(r?.fuelConsumption?.averageLitersPerKm).toBeNull();
  });

  it("buckets fuel + seaborne km into per-month rows sorted chronologically", async () => {
    // 3-month dateRange (Mar 2026 → Jun 2026 exclusive) so multiple months hit.
    const multiMonthExport = {
      ...EXPORT_ROW,
      paramsJson: {
        areaBoundaryId: AREA_ID,
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-06-01T00:00:00.000Z",
      },
    };
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      multiMonthExport as never,
    );
    vi.mocked(prisma.areaBoundary.findUnique).mockResolvedValueOnce(
      AREA_ROW as never,
    );
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p_march",
        patrolType: "seaborne",
        startTime: new Date("2026-03-15T02:00:00.000Z"),
        totalDistanceKm: 10.0,
        totalHours: 2.0,
        track: null,
      },
      {
        id: "p_may",
        patrolType: "seaborne",
        startTime: new Date("2026-05-20T02:00:00.000Z"),
        totalDistanceKm: 25.0,
        totalHours: 5.0,
        track: null,
      },
    ] as never);
    vi.mocked(prisma.fuelEntry.findMany).mockResolvedValueOnce([
      {
        liters: 8.0,
        totalPrice: 480.0,
        currency: "PHP",
        dateReceived: new Date("2026-03-10T00:00:00.000Z"),
      },
      {
        // April fuel — no patrols this month (shows fuel-only month)
        liters: 5.0,
        totalPrice: 300.0,
        currency: "PHP",
        dateReceived: new Date("2026-04-22T00:00:00.000Z"),
      },
      {
        liters: 20.0,
        totalPrice: 1200.0,
        currency: "PHP",
        dateReceived: new Date("2026-05-18T00:00:00.000Z"),
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    const months = r?.fuelConsumption?.perMonthBreakdown ?? [];
    expect(months.map((m) => m.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(months[0]?.liters).toBeCloseTo(8.0, 5);
    expect(months[0]?.seabornePatrolKm).toBeCloseTo(10.0, 5);
    expect(months[0]?.litersPerKm).toBeCloseTo(0.8, 5);
    // April fuel only, no patrol km → litersPerKm null
    expect(months[1]?.liters).toBeCloseTo(5.0, 5);
    expect(months[1]?.seabornePatrolKm).toBe(0);
    expect(months[1]?.litersPerKm).toBeNull();
    expect(months[2]?.liters).toBeCloseTo(20.0, 5);
    expect(months[2]?.seabornePatrolKm).toBeCloseTo(25.0, 5);
    expect(months[2]?.litersPerKm).toBeCloseTo(0.8, 5);
  });

  it("returns null fuelConsumption when no fuel entries AND no seaborne km", async () => {
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
    // Only foot patrols (zero seaborne km) + no fuel entries → null payload
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p_foot_only",
        patrolType: "foot",
        startTime: new Date("2026-05-10T00:00:00.000Z"),
        totalDistanceKm: 2.0,
        totalHours: 1.0,
        track: null,
      },
    ] as never);
    const r = await getPerAreaReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.fuelConsumption).toBeNull();
  });

  it("scopes the fuelEntry query to tenant + area + dateReceived range", async () => {
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
    const fuelCall = vi.mocked(prisma.fuelEntry.findMany).mock.calls[0]?.[0];
    expect(fuelCall?.where).toMatchObject({
      tenantId: TENANT_ID,
      areaBoundaryId: AREA_ID,
      dateReceived: {
        gte: new Date("2026-05-01T00:00:00.000Z"),
        lt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    expect(fuelCall?.select).toMatchObject({
      liters: true,
      totalPrice: true,
      currency: true,
      dateReceived: true,
    });
  });
});
