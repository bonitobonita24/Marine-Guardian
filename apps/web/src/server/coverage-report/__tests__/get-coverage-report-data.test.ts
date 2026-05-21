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
            startTime?: { gte?: Date; lt?: Date };
          };
        }
      | undefined;
    expect(arg?.where?.tenantId).toBe(TENANT_ID);
    expect(arg?.where?.startTime?.gte).toBeInstanceOf(Date);
    expect(arg?.where?.startTime?.lt).toBeInstanceOf(Date);
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
