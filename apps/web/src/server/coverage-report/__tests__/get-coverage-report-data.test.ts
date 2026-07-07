// get-coverage-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    patrol: { findMany: vi.fn() },
    areaBoundary: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import {
  extractTrackEndpoints,
  extractTrackPolyline,
  getCoverageReportData,
  parseCoverageParams,
} from "../get-coverage-report-data";

const TENANT_ID = "tenant_a";
const TENANT_SLUG = "mindoro";
const EXPORT_ID = "exp_1";

describe("parseCoverageParams", () => {
  it("returns empty object for null/undefined/non-object input", () => {
    expect(parseCoverageParams(null)).toEqual({});
    expect(parseCoverageParams(undefined)).toEqual({});
    expect(parseCoverageParams("string")).toEqual({});
    expect(parseCoverageParams(42)).toEqual({});
  });

  it("preserves valid category + year + month + weekIndex + excludeTestPatrols", () => {
    const out = parseCoverageParams({
      category: "weekly",
      year: 2026,
      month: 5,
      weekIndex: 0,
      excludeTestPatrols: false,
    });
    expect(out).toEqual({
      category: "weekly",
      year: 2026,
      month: 5,
      weekIndex: 0,
      excludeTestPatrols: false,
    });
  });

  it("drops unrecognised category", () => {
    const out = parseCoverageParams({ category: "daily" });
    expect(out.category).toBeUndefined();
  });

  it("drops non-integer year", () => {
    const out = parseCoverageParams({ year: 2026.5 });
    expect(out.year).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    const out = parseCoverageParams({ category: "monthly", foo: "bar" });
    expect(out).toEqual({ category: "monthly" });
  });
});

describe("extractTrackEndpoints", () => {
  it("returns null/null for missing or non-object", () => {
    expect(extractTrackEndpoints(null)).toEqual({ start: null, end: null });
    expect(extractTrackEndpoints(undefined)).toEqual({
      start: null,
      end: null,
    });
    expect(extractTrackEndpoints("string")).toEqual({
      start: null,
      end: null,
    });
  });

  it("extracts first + last from LineString", () => {
    const r = extractTrackEndpoints({
      type: "LineString",
      coordinates: [
        [121.5, 13.5],
        [121.6, 13.6],
        [121.7, 13.7],
      ],
    });
    expect(r.start).toEqual({ lat: 13.5, lon: 121.5 });
    expect(r.end).toEqual({ lat: 13.7, lon: 121.7 });
  });

  it("extracts endpoints from MultiLineString", () => {
    const r = extractTrackEndpoints({
      type: "MultiLineString",
      coordinates: [
        [
          [121.5, 13.5],
          [121.6, 13.6],
        ],
        [
          [121.7, 13.7],
          [121.8, 13.8],
        ],
      ],
    });
    expect(r.start).toEqual({ lat: 13.5, lon: 121.5 });
    expect(r.end).toEqual({ lat: 13.8, lon: 121.8 });
  });

  it("returns null/null when coordinates malformed", () => {
    expect(
      extractTrackEndpoints({ type: "LineString", coordinates: [] }),
    ).toEqual({ start: null, end: null });
    expect(
      extractTrackEndpoints({
        type: "LineString",
        coordinates: [["bad", "data"]],
      }),
    ).toEqual({ start: null, end: null });
  });

  it("returns null/null for unsupported geometry type", () => {
    expect(
      extractTrackEndpoints({
        type: "Point",
        coordinates: [121.5, 13.5],
      }),
    ).toEqual({ start: null, end: null });
  });
});

describe("getCoverageReportData", () => {
  const TENANT_ROW = {
    id: TENANT_ID,
    name: "Mindoro MPA",
    slug: TENANT_SLUG,
    timezone: "Asia/Manila",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tenant slug is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(null);
    const r = await getCoverageReportData("nope", EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export id is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(null);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: "tenant_b",
      reportType: "coverage",
      paramsJson: {},
      paperSize: "A4",
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when reportType is not coverage", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "area",
      paramsJson: {},
      paperSize: "A4",
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("shapes the full payload for a valid coverage export", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-0042",
        title: "Routine reef sweep",
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-15T03:00:00.000Z"),
        endTime: new Date("2026-05-15T07:30:00.000Z"),
        totalDistanceKm: 8.4,
        totalHours: 4.5,
        boatName: null,
        areaName: "North Reef",
        segments: [{ leaderName: "Maria Santos" }],
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [121.5, 13.5],
              [121.55, 13.55],
              [121.6, 13.6],
            ],
          },
        },
      },
      {
        id: "p2",
        serialNumber: "MG-0043",
        title: "Vessel boarding",
        patrolType: "seaborne",
        state: "done",
        startTime: new Date("2026-05-18T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: "Bantay 2",
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.tenant.name).toBe("Mindoro MPA");
    expect(r?.tenant.timezone).toBe("Asia/Manila");
    expect(r?.period.category).toBe("monthly");
    expect(r?.period.label).toBe("MAY 2026");
    expect(r?.paperSize).toBe("A4");
    expect(r?.excludeTestPatrols).toBe(true);
    expect(r?.patrols).toHaveLength(2);

    const [a, b] = r?.patrols ?? [];
    expect(a?.id).toBe("p1");
    expect(a?.serialNumber).toBe("MG-0042");
    expect(a?.leaderName).toBe("Maria Santos");
    expect(a?.startLocation).toEqual({ lat: 13.5, lon: 121.5 });
    expect(a?.endLocation).toEqual({ lat: 13.6, lon: 121.6 });

    expect(b?.id).toBe("p2");
    expect(b?.leaderName).toBeNull();
    expect(b?.startLocation).toBeNull();
    expect(b?.endLocation).toBeNull();

    // Confirms prisma query scoped to tenant + period bounds.
    const calls = vi.mocked(prisma.patrol.findMany).mock.calls;
    expect(calls).toHaveLength(1);
    const arg = calls[0]?.[0] as
      | {
          where?: {
            tenantId?: string;
            isDeleted?: boolean;
            isTestPatrol?: boolean;
            startTime?: { gte?: Date; lt?: Date };
          };
        }
      | undefined;
    expect(arg?.where?.tenantId).toBe(TENANT_ID);
    // Phase 7 soft-delete: deleted patrols excluded from funder report totals
    expect(arg?.where?.isDeleted).toBe(false);
    // excludeTestPatrols defaults true → test patrols filtered out of the query
    // (previously the flag was echoed but never applied — funder totals counted
    // test patrols). Matches canonical reportMap / municipalityCoverage.
    expect(arg?.where?.isTestPatrol).toBe(false);
    expect(arg?.where?.startTime?.gte).toBeInstanceOf(Date);
    expect(arg?.where?.startTime?.lt).toBeInstanceOf(Date);
  });

  it("does NOT filter isTestPatrol when excludeTestPatrols is explicitly false", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: {
        category: "monthly",
        year: 2026,
        month: 5,
        excludeTestPatrols: false,
      },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.excludeTestPatrols).toBe(false);
    const arg = vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0] as
      | { where?: { isTestPatrol?: boolean } }
      | undefined;
    // Flag off → no test-patrol filter (test patrols intentionally included).
    expect(arg?.where?.isTestPatrol).toBeUndefined();
  });

  it("prefers computedDistanceKm over totalDistanceKm when both present", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-0042",
        title: "Routine reef sweep",
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-15T03:00:00.000Z"),
        endTime: new Date("2026-05-15T07:30:00.000Z"),
        computedDistanceKm: 12.5,
        totalDistanceKm: 8.4,
        totalHours: 4.5,
        boatName: null,
        areaName: "North Reef",
        segments: [{ leaderName: "Maria Santos" }],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrols[0]?.totalDistanceKm).toBe(12.5);
  });

  it("falls back to totalDistanceKm when computedDistanceKm is null", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-0042",
        title: "Routine reef sweep",
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-15T03:00:00.000Z"),
        endTime: new Date("2026-05-15T07:30:00.000Z"),
        computedDistanceKm: null,
        totalDistanceKm: 8.4,
        totalHours: 4.5,
        boatName: null,
        areaName: "North Reef",
        segments: [{ leaderName: "Maria Santos" }],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrols[0]?.totalDistanceKm).toBe(8.4);
  });

  // P2-B regression — stored lat/lon fallback for location columns
  it("P2-B: uses startLocationLat/Lon + endLocationLat/Lon when no PatrolTrack exists", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p-hist",
        serialNumber: "MG-0099",
        title: "Historic closed patrol",
        patrolType: "seaborne",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: new Date("2026-05-10T06:00:00.000Z"),
        totalDistanceKm: 18.7,
        totalHours: 5,
        boatName: "Bantay 1",
        areaName: "South Shoal",
        computedDistanceKm: null,
        computedDurationHours: null,
        // Stored lat/lon from ER segment start/end_location
        startLocationLat: 12.1,
        startLocationLon: 120.5,
        endLocationLat: 12.3,
        endLocationLon: 120.7,
        segments: [{ leaderName: "Cruz" }],
        track: null, // no PatrolTrack row → extractTrackEndpoints returns null
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    const p = r?.patrols[0];
    // Should fall back to the stored columns, not return null.
    expect(p?.startLocation).toEqual({ lat: 12.1, lon: 120.5 });
    expect(p?.endLocation).toEqual({ lat: 12.3, lon: 120.7 });
    // Distance must come from ER totalDistanceKm since computedDistanceKm is null.
    expect(p?.totalDistanceKm).toBe(18.7);
    // Duration must fall back to totalHours since computedDurationHours is null.
    expect(p?.totalHours).toBe(5);
  });

  // P2-B regression — computedDurationHours preferred over totalHours
  it("P2-B: prefers computedDurationHours over totalHours when both present", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p-dur",
        serialNumber: null,
        title: "Duration test patrol",
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-15T03:00:00.000Z"),
        endTime: new Date("2026-05-15T07:00:00.000Z"),
        totalDistanceKm: 4,
        totalHours: 4,             // ER value — lower precision
        computedDistanceKm: 4,
        computedDurationHours: 3.8, // haversine-recomputed — preferred
        startLocationLat: null,
        startLocationLon: null,
        endLocationLat: null,
        endLocationLon: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrols[0]?.totalHours).toBe(3.8);
  });

  // P2-B regression — track endpoint takes priority over stored columns
  it("P2-B: track-derived endpoints take priority over stored startLocationLat/Lon", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p-track",
        serialNumber: null,
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-16T01:00:00.000Z"),
        endTime: new Date("2026-05-16T04:00:00.000Z"),
        totalDistanceKm: 5,
        totalHours: 3,
        computedDistanceKm: 5,
        computedDurationHours: 3,
        // Stored columns present but track exists → track wins.
        startLocationLat: 99.0,
        startLocationLon: 99.0,
        endLocationLat: 99.0,
        endLocationLon: 99.0,
        boatName: null,
        areaName: null,
        segments: [],
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [121.5, 13.5],
              [121.6, 13.6],
            ],
          },
        },
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    const p = r?.patrols[0];
    // Track-derived endpoints win over stored 99.0 sentinel values.
    expect(p?.startLocation).toEqual({ lat: 13.5, lon: 121.5 });
    expect(p?.endLocation).toEqual({ lat: 13.6, lon: 121.6 });
  });

  it("falls back to current month when paramsJson is empty {}", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: {},
      paperSize: "Letter",
      // Tue May 19 2026 12:00 PHT = May 19 04:00 UTC
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.period.label).toBe("MAY 2026");
    expect(r?.paperSize).toBe("Letter");
    expect(r?.patrols).toEqual([]);
    expect(r?.enabledAreas).toEqual([]);
    expect(r?.attributions).toEqual([]);
    expect(r?.patrolCountsByArea).toEqual([]);
    expect(r?.unattributedPatrolCount).toBe(0);
    expect(r?.areaCoverage).toEqual([]);
    expect(r?.missingTracksCount).toBe(0);
  });
});

describe("extractTrackPolyline", () => {
  it("returns null for null / undefined / non-object input", () => {
    expect(extractTrackPolyline(null)).toBeNull();
    expect(extractTrackPolyline(undefined)).toBeNull();
    expect(extractTrackPolyline("not-an-object")).toBeNull();
  });

  it("returns the full point list from a LineString", () => {
    const result = extractTrackPolyline({
      type: "LineString",
      coordinates: [
        [121.5, 13.5],
        [121.55, 13.55],
        [121.6, 13.6],
      ],
    });
    expect(result).toEqual([
      [121.5, 13.5],
      [121.55, 13.55],
      [121.6, 13.6],
    ]);
  });

  it("flattens MultiLineString segments head-to-tail", () => {
    const result = extractTrackPolyline({
      type: "MultiLineString",
      coordinates: [
        [
          [121.5, 13.5],
          [121.55, 13.55],
        ],
        [
          [121.6, 13.6],
          [121.65, 13.65],
        ],
      ],
    });
    expect(result).toEqual([
      [121.5, 13.5],
      [121.55, 13.55],
      [121.6, 13.6],
      [121.65, 13.65],
    ]);
  });

  it("returns null for a track with fewer than 2 valid points", () => {
    expect(
      extractTrackPolyline({
        type: "LineString",
        coordinates: [[121.5, 13.5]],
      }),
    ).toBeNull();
    expect(
      extractTrackPolyline({ type: "LineString", coordinates: [] }),
    ).toBeNull();
  });

  it("skips malformed inner pairs but keeps valid ones", () => {
    const result = extractTrackPolyline({
      type: "LineString",
      coordinates: [
        [121.5, 13.5],
        ["bad", "data"],
        [121.6, 13.6],
      ],
    });
    expect(result).toEqual([
      [121.5, 13.5],
      [121.6, 13.6],
    ]);
  });

  it("returns null for unsupported geometry types", () => {
    expect(
      extractTrackPolyline({ type: "Point", coordinates: [121.5, 13.5] }),
    ).toBeNull();
  });
});

describe("getCoverageReportData — Page 2 attribution", () => {
  const TENANT_ROW = {
    id: TENANT_ID,
    name: "Mindoro MPA",
    slug: TENANT_SLUG,
    timezone: "Asia/Manila",
  };
  const COVERAGE_EXPORT = {
    tenantId: TENANT_ID,
    reportType: "coverage",
    paramsJson: { category: "monthly", year: 2026, month: 5 },
    paperSize: "A4",
    createdAt: new Date("2026-05-21T08:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attributes patrols to enabled boundaries by nearest-start with name fallback", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      // Patrol nearest to "Alpha Reef" polygon.
      {
        id: "p1",
        serialNumber: "MG-1",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: new Date("2026-05-10T03:00:00.000Z"),
        totalDistanceKm: 5,
        totalHours: 2,
        boatName: null,
        areaName: "Bravo Bank", // intentionally wrong — nearest must win
        segments: [],
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [120.01, 13.01],
              [120.012, 13.012],
            ],
          },
        },
      },
      // No track, name matches "Bravo Bank".
      {
        id: "p2",
        serialNumber: "MG-2",
        title: null,
        patrolType: "seaborne",
        state: "done",
        startTime: new Date("2026-05-11T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: "Bravo Bank",
        segments: [],
        track: null,
      },
      // No track, no area name → unattributed.
      {
        id: "p3",
        serialNumber: "MG-3",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-12T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([
      {
        id: "boundary-alpha",
        name: "Alpha Reef",
        aliases: ["Alpha"],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.0, 13.0],
              [120.02, 13.0],
              [120.02, 13.02],
              [120.0, 13.02],
              [120.0, 13.0],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
      {
        id: "boundary-bravo",
        name: "Bravo Bank",
        aliases: [],
        region: "Mindoro",
        source: "arcgis",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.5, 13.5],
              [120.52, 13.5],
              [120.52, 13.52],
              [120.5, 13.52],
              [120.5, 13.5],
            ],
          ],
        },
        arcgisReferenceId: "arcgis-bravo-123",
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);

    expect(r).not.toBeNull();
    expect(r?.enabledAreas).toHaveLength(2);
    expect(r?.enabledAreas[0]?.id).toBe("boundary-alpha");
    expect(r?.enabledAreas[1]?.arcgisReferenceId).toBe("arcgis-bravo-123");

    expect(r?.attributions).toHaveLength(3);
    expect(r?.attributions[0]).toEqual({
      patrolId: "p1",
      areaBoundaryId: "boundary-alpha",
      matchedVia: "nearest",
    });
    expect(r?.attributions[1]).toEqual({
      patrolId: "p2",
      areaBoundaryId: "boundary-bravo",
      matchedVia: "feature-name",
    });
    expect(r?.attributions[2]).toEqual({
      patrolId: "p3",
      areaBoundaryId: null,
      matchedVia: null,
    });

    expect(r?.patrolCountsByArea).toHaveLength(2);
    expect(r?.patrolCountsByArea.find((c) => c.areaBoundaryId === "boundary-alpha")?.patrolCount).toBe(1);
    expect(r?.patrolCountsByArea.find((c) => c.areaBoundaryId === "boundary-bravo")?.patrolCount).toBe(1);
    expect(r?.unattributedPatrolCount).toBe(1);
  });

  it("returns empty roster + zero counts when tenant has no enabled boundaries", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-1",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);

    expect(r?.enabledAreas).toEqual([]);
    expect(r?.patrolCountsByArea).toEqual([]);
    expect(r?.unattributedPatrolCount).toBe(1);
    expect(r?.attributions).toEqual([
      { patrolId: "p1", areaBoundaryId: null, matchedVia: null },
    ]);
  });

  it("scopes areaBoundary.findMany to tenant + isEnabled=true", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);

    await getCoverageReportData(TENANT_SLUG, EXPORT_ID);

    const calls = vi.mocked(prisma.areaBoundary.findMany).mock.calls;
    expect(calls).toHaveLength(1);
    const arg = calls[0]?.[0] as
      | { where?: { tenantId?: string; isEnabled?: boolean } }
      | undefined;
    expect(arg?.where?.tenantId).toBe(TENANT_ID);
    expect(arg?.where?.isEnabled).toBe(true);
  });

  it("populates trackLineString on patrols with tracks and null on patrols without", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-1",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [121.5, 13.5],
              [121.6, 13.6],
            ],
          },
        },
      },
      {
        id: "p2",
        serialNumber: "MG-2",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-11T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.patrols[0]?.trackLineString).toEqual([
      [121.5, 13.5],
      [121.6, 13.6],
    ]);
    expect(r?.patrols[1]?.trackLineString).toBeNull();
  });
});

describe("getCoverageReportData — Page 3 area coverage", () => {
  const TENANT_ROW = {
    id: TENANT_ID,
    name: "Mindoro MPA",
    slug: TENANT_SLUG,
    timezone: "Asia/Manila",
  };
  const COVERAGE_EXPORT = {
    tenantId: TENANT_ID,
    reportType: "coverage",
    paramsJson: { category: "monthly", year: 2026, month: 5 },
    paperSize: "A4",
    createdAt: new Date("2026-05-21T08:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accumulates coverage_km and coverage_hrs per Polygon boundary by clipping tracks", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    // Patrol with a track that crosses entirely through the boundary polygon.
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-1",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: new Date("2026-05-10T03:00:00.000Z"),
        totalDistanceKm: 5,
        totalHours: 2,
        boatName: null,
        areaName: null,
        segments: [],
        track: {
          trackGeojson: {
            type: "LineString",
            // Long line that passes through the small polygon below.
            coordinates: [
              [120.005, 13.005],
              [120.015, 13.015],
            ],
          },
        },
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([
      {
        id: "boundary-alpha",
        name: "Alpha Reef",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.0, 13.0],
              [120.02, 13.0],
              [120.02, 13.02],
              [120.0, 13.02],
              [120.0, 13.0],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);

    expect(r?.areaCoverage).toHaveLength(1);
    const alpha = r?.areaCoverage[0];
    expect(alpha?.areaBoundaryId).toBe("boundary-alpha");
    expect(alpha?.areaName).toBe("Alpha Reef");
    expect(alpha?.patrolsCount).toBe(1);
    expect(alpha?.coverageKm).toBeGreaterThan(0);
    expect(alpha?.coverageHrs).toBeGreaterThan(0);
    expect(alpha?.hrsEstimatedCount).toBe(1);
    expect(r?.missingTracksCount).toBe(0);
  });

  it("counts missingTracksCount for patrols with hours but no track", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      // Has totalHours but no track — counted.
      {
        id: "p-no-track",
        serialNumber: "MG-1",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-10T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: 3,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
      // No totalHours and no track — NOT counted (likely draft).
      {
        id: "p-empty",
        serialNumber: "MG-2",
        title: null,
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-11T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: null,
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([
      {
        id: "boundary-alpha",
        name: "Alpha Reef",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120.0, 13.0],
              [120.02, 13.0],
              [120.02, 13.02],
              [120.0, 13.02],
              [120.0, 13.0],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.missingTracksCount).toBe(1);
    expect(r?.areaCoverage[0]?.patrolsCount).toBe(0);
    expect(r?.areaCoverage[0]?.coverageKm).toBe(0);
  });

  it("seeds areaCoverage with one zero-row per enabled Polygon boundary even when no patrols cover it", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([
      {
        id: "b1",
        name: "Alpha Reef",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120, 13],
              [120.01, 13],
              [120.01, 13.01],
              [120, 13.01],
              [120, 13],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
      {
        id: "b2",
        name: "Bravo Bank",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [121, 14],
              [121.01, 14],
              [121.01, 14.01],
              [121, 14.01],
              [121, 14],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.areaCoverage).toHaveLength(2);
    for (const row of r?.areaCoverage ?? []) {
      expect(row.patrolsCount).toBe(0);
      expect(row.coverageKm).toBe(0);
      expect(row.coverageHrs).toBe(0);
      expect(row.hrsEstimatedCount).toBe(0);
    }
  });

  it("excludes LineString boundaries from areaCoverage rows (coastline references render on Page 2 only)", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(
      COVERAGE_EXPORT as never,
    );
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.areaBoundary.findMany).mockResolvedValueOnce([
      {
        id: "polygon-boundary",
        name: "Polygon Reef",
        aliases: [],
        region: "Mindoro",
        source: "custom",
        geometryType: "Polygon",
        geometryGeojson: {
          type: "Polygon",
          coordinates: [
            [
              [120, 13],
              [120.01, 13],
              [120.01, 13.01],
              [120, 13.01],
              [120, 13],
            ],
          ],
        },
        arcgisReferenceId: null,
      },
      {
        id: "linestring-boundary",
        name: "North Coast",
        aliases: [],
        region: "Mindoro",
        source: "arcgis",
        geometryType: "LineString",
        geometryGeojson: {
          type: "LineString",
          coordinates: [
            [120, 13],
            [121, 13],
          ],
        },
        arcgisReferenceId: null,
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    // Both boundaries returned in enabledAreas (Page 2 needs LineString for dashed overlay).
    expect(r?.enabledAreas).toHaveLength(2);
    // But only the Polygon appears in areaCoverage (Page 3).
    expect(r?.areaCoverage).toHaveLength(1);
    expect(r?.areaCoverage[0]?.areaBoundaryId).toBe("polygon-boundary");
  });
});
