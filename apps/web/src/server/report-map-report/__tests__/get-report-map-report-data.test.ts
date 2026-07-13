// get-report-map-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    reportTemplate: { findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
    patrolTrack: { findMany: vi.fn() },
    // findUnique used by the single-municipality bounds lookup;
    // findMany used by resolveMunicipalityScope's province rollup (real
    // implementation — not mocked — reads through this mocked prisma client).
    municipality: { findUnique: vi.fn(), findMany: vi.fn() },
    // findMany used by resolveChildZoneIds (Phase 4B "include children"
    // toggle) — real implementation, reads through this mocked client.
    protectedZone: { findMany: vi.fn() },
  },
}));

vi.mock("@marine-guardian/storage", () => ({
  getImageBytes: vi.fn(),
  getExportsBucketName: vi.fn().mockReturnValue("marine-guardian-dev-exports"),
}));

vi.mock("@/server/trpc/routers/reportMap", () => ({
  buildEventBreakdownWithCoords: vi.fn(),
  // Real-shaped stub: [] when the relation is absent (mock rows omit it).
  photoAssetIdsFrom: (assets: Array<{ id: string }> | undefined) =>
    (assets ?? []).map((a) => a.id),
}));

vi.mock("@/server/trpc/routers/map", () => ({
  pointsFromTrackGeojson: vi.fn(),
}));

import { prisma } from "@marine-guardian/db";
import { getImageBytes } from "@marine-guardian/storage";
import { buildEventBreakdownWithCoords } from "@/server/trpc/routers/reportMap";
import { pointsFromTrackGeojson } from "@/server/trpc/routers/map";
import {
  buildPatrolHeatPoints,
  buildPatrolTypeTotals,
  capHeatLayerPoints,
  clipTracksToMunicipalityGeometry,
  decimateHeatPointsByStride,
  getReportMapReportData,
  MAX_HEAT_POINTS_PER_LAYER,
  parseReportMapParams,
  unionGeometryBounds,
} from "../get-report-map-report-data";
import type {
  ReportMapPatrolRow,
  ReportMapTrackRow,
} from "../get-report-map-report-data";
import { BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI } from "../assets/blue-alliance-default-logo";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "tenant_a";
const TENANT_SLUG = "mindoro";
const EXPORT_ID = "exp_rm_1";
const TEMPLATE_ID = "tpl_1";

const TENANT_ROW = {
  id: TENANT_ID,
  name: "Mindoro MPA",
  slug: TENANT_SLUG,
  timezone: "Asia/Manila",
};

const EXPORT_ROW = {
  tenantId: TENANT_ID,
  reportType: "report_map" as const,
  paramsJson: {
    templateId: TEMPLATE_ID,
    from: "2026-05-01T00:00:00.000Z",
    to: "2026-06-01T00:00:00.000Z",
  },
};

const TEMPLATE_ROW = {
  id: TEMPLATE_ID,
  name: "Mindoro Template",
  layout: "two-column",
  reportTitle: "Mindoro Marine Report",
  footerNotes: "Confidential",
  municipalLogoKey: "logos/tenant_a/tpl_1.png",
  partnerLogoKey: null,
};

type EventDetailFixture = {
  id: string;
  title: string | null;
  typeDisplay: string;
  priority: number;
  reportedAt: Date | null;
  locationName: string | null;
  municipalityName: string | null;
  areaName: string | null;
  reportedByName: string | null;
  lat: number | null;
  lon: number | null;
  eventDetailsJson: unknown;
  hasPhoto: boolean;
  photoAssetIds: string[];
};

type BreakdownRow = {
  type: string;
  count: number;
  points: { id: string; title: string | null; lat: number; lon: number }[];
  events: EventDetailFixture[];
};

// buildEventBreakdownWithCoords returns empty arrays — these are assignable
// directly (no cast needed; the mock accepts the inferred structure).
const EMPTY_BREAKDOWN = {
  lawEnforcement: [] as BreakdownRow[],
  monitoring: [] as BreakdownRow[],
  highPriority: {
    total: 0,
    points: [] as { id: string; title: string | null; lat: number; lon: number }[],
    events: [] as EventDetailFixture[],
  },
};

function setupHappyPath() {
  vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
  vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
  vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
  vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
  vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
  vi.mocked(getImageBytes).mockResolvedValue(Buffer.from("fake-png-data"));
}

// ─── parseReportMapParams ─────────────────────────────────────────────────────

describe("parseReportMapParams", () => {
  it("returns empty object for non-object inputs", () => {
    expect(parseReportMapParams(null)).toEqual({});
    expect(parseReportMapParams(undefined)).toEqual({});
    expect(parseReportMapParams(42)).toEqual({});
    expect(parseReportMapParams("string")).toEqual({});
  });

  it("parses all five fields", () => {
    const out = parseReportMapParams({
      templateId: "tpl_x",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
      municipalityId: "muni_a",
      protectedZoneId: "pz_a",
    });
    expect(out.templateId).toBe("tpl_x");
    expect(out.from?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(out.to?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(out.municipalityId).toBe("muni_a");
    expect(out.protectedZoneId).toBe("pz_a");
  });

  it("drops empty-string ids", () => {
    const out = parseReportMapParams({
      templateId: "",
      municipalityId: "",
      protectedZoneId: "",
    });
    expect(out.templateId).toBeUndefined();
    expect(out.municipalityId).toBeUndefined();
    expect(out.protectedZoneId).toBeUndefined();
  });

  it("drops invalid date strings", () => {
    const out = parseReportMapParams({ from: "not-a-date", to: 42 });
    expect(out.from).toBeUndefined();
    expect(out.to).toBeUndefined();
  });

  // ── exportMode (2026-07-13 export-mode split) ────────────────────────────

  it("leaves exportMode undefined when absent — caller applies the combined default", () => {
    expect(parseReportMapParams({}).exportMode).toBeUndefined();
  });

  it("echoes a recognised exportMode value verbatim", () => {
    expect(parseReportMapParams({ exportMode: "charts" }).exportMode).toBe("charts");
    expect(parseReportMapParams({ exportMode: "lists" }).exportMode).toBe("lists");
    expect(parseReportMapParams({ exportMode: "combined" }).exportMode).toBe(
      "combined",
    );
  });

  it("drops an unrecognised exportMode value", () => {
    expect(
      parseReportMapParams({ exportMode: "everything" }).exportMode,
    ).toBeUndefined();
    expect(parseReportMapParams({ exportMode: 42 }).exportMode).toBeUndefined();
  });
});

// ─── getReportMapReportData ───────────────────────────────────────────────────

describe("getReportMapReportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Null-contract tests ────────────────────────────────────────────────────

  it("returns null when tenant not found", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
    expect(await getReportMapReportData("unknown-slug", EXPORT_ID)).toBeNull();
  });

  it("returns null when export not found", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(null);
    expect(await getReportMapReportData(TENANT_SLUG, "no-such-export")).toBeNull();
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      tenantId: "other_tenant",
    } as never);
    expect(await getReportMapReportData(TENANT_SLUG, EXPORT_ID)).toBeNull();
  });

  it("returns null when reportType is not report_map", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      reportType: "area",
    } as never);
    expect(await getReportMapReportData(TENANT_SLUG, EXPORT_ID)).toBeNull();
  });

  // ── Template resolution ────────────────────────────────────────────────────

  it("uses the named template when templateId resolves", async () => {
    setupHappyPath();
    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.id).toBe(TEMPLATE_ID);
    expect(result.template.name).toBe("Mindoro Template");
    expect(result.template.reportTitle).toBe("Mindoro Marine Report");
    expect(result.template.layout).toBe("two-column");
    expect(result.template.footerNotes).toBe("Confidential");
  });

  it("falls back to isDefault template when templateId lookup returns null", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    const DEFAULT_TPL = { ...TEMPLATE_ROW, id: "tpl_default", name: "Default Template" };
    vi.mocked(prisma.reportTemplate.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(DEFAULT_TPL as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.id).toBe("tpl_default");
    expect(result.template.name).toBe("Default Template");
  });

  it("falls back to app-default when neither templateId nor isDefault template exists", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { from: "2026-05-01T00:00:00.000Z" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(null);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.id).toBeNull();
    expect(result.template.reportTitle).toBe("Marine Guardian Report");
    expect(result.template.municipalLogoDataUri).toBeNull();
    // APP_DEFAULT_TEMPLATE has no partnerLogoKey → falls back to the bundled
    // Blue Alliance default logo, never null.
    expect(result.template.partnerLogoDataUri).toBe(BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI);
  });

  // ── 5-chart shape ──────────────────────────────────────────────────────────

  it("returns all 5 chart keys", async () => {
    setupHappyPath();
    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.charts.lawEnforcement.key).toBe("law_enforcement");
    expect(result.charts.monitoring.key).toBe("monitoring");
    expect(result.charts.highPriority.key).toBe("high_priority");
    expect(result.charts.patrolList.key).toBe("patrol_list");
    expect(result.charts.eventsOverTime.key).toBe("events_over_time");
  });

  it("computes chart totals and breakdown arrays from event data", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue({
      lawEnforcement: [
        { type: "Illegal Fishing", count: 5, points: [], events: [] },
        { type: "Illegal Entry", count: 2, points: [], events: [] },
      ],
      monitoring: [{ type: "Routine Patrol", count: 10, points: [], events: [] }],
      highPriority: {
        total: 3,
        points: [{ id: "e1", title: "Catch", lat: 12, lon: 121 }],
        events: [],
      },
    });
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: "e1", title: null, locationLat: 12, locationLon: 121, reportedAt: new Date("2026-05-10") },
      { id: "e2", title: "Alert", locationLat: null, locationLon: null, reportedAt: new Date("2026-05-15") },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.charts.lawEnforcement.total).toBe(7); // 5 + 2
    expect(result.charts.lawEnforcement.breakdown).toHaveLength(2);
    expect(result.charts.monitoring.total).toBe(10);
    expect(result.charts.highPriority.total).toBe(3);
    expect(result.charts.highPriority.points).toHaveLength(1);
    // 2 event rows total; only 1 has valid lat/lon for overviewPoints
    expect(result.charts.eventsOverTime.total).toBe(2);
    expect(result.charts.eventsOverTime.overviewPoints).toHaveLength(1);
  });

  it("builds patrol list breakdown and tracks", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      {
        id: "p1",
        title: "P1",
        serialNumber: "SN1",
        patrolType: "seaborne",
        startTime: new Date("2026-05-01"),
        endTime: new Date("2026-05-02"),
        totalDistanceKm: 10,
        computedDistanceKm: 12,
        segments: [{ leaderName: "Juan" }],
      },
    ] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: { type: "LineString" },
        patrol: { id: "p1", title: "P1", serialNumber: "SN1", patrolType: "seaborne" },
      },
    ] as never);
    vi.mocked(pointsFromTrackGeojson).mockReturnValue([
      { lat: 12.5, lon: 121.5 },
      { lat: 12.6, lon: 121.6 },
    ] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.charts.patrolList.total).toBe(1);
    expect(result.charts.patrolList.breakdown).toHaveLength(1);
    const patrol = result.charts.patrolList.breakdown[0];
    expect(patrol?.patrolId).toBe("p1");
    expect(patrol?.distanceKm).toBe(12); // prefers computedDistanceKm over totalDistanceKm
    expect(patrol?.leaderName).toBe("Juan");
    expect(result.charts.patrolList.tracks).toHaveLength(1);
    expect(result.charts.patrolList.tracks[0]?.path).toHaveLength(2);
    // R1: patrolType is carried onto the track row (feeds the colored
    // polyline + the Patrol Tracks Heatmap seaborne/foot split).
    expect(result.charts.patrolList.tracks[0]?.patrolType).toBe("seaborne");
    // R5: patrolHeatPoints buckets this seaborne track's path points.
    expect(result.charts.patrolList.patrolHeatPoints.seaborne).toEqual([
      [12.5, 121.5, 1],
      [12.6, 121.6, 1],
    ]);
    expect(result.charts.patrolList.patrolHeatPoints.foot).toEqual([]);
  });

  it("skips patrol tracks with fewer than 2 points", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      {
        trackGeojson: null,
        patrol: { id: "p2", title: null, serialNumber: "SN2", patrolType: "foot" },
      },
    ] as never);
    vi.mocked(pointsFromTrackGeojson).mockReturnValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.charts.patrolList.tracks).toHaveLength(0);
  });

  // ── Template fields in response ────────────────────────────────────────────

  it("includes template fields and resolves logo to data URI", async () => {
    setupHappyPath();
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from("png-bytes"));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.layout).toBe("two-column");
    expect(result.template.reportTitle).toBe("Mindoro Marine Report");
    expect(result.template.footerNotes).toBe("Confidential");
    // municipalLogoKey is set → resolves to a data: URL
    expect(result.template.municipalLogoDataUri).toMatch(/^data:image\/png;base64,/);
    // partnerLogoKey is null → no S3 fetch, falls back to the bundled Blue
    // Alliance default logo (never null).
    expect(result.template.partnerLogoDataUri).toBe(BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI);
  });

  it("uses the uploaded partner logo when partnerLogoKey is set", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue({
      ...TEMPLATE_ROW,
      partnerLogoKey: "logos/tenant_a/partner.png",
    } as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from("uploaded-partner-bytes"));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    // Uploaded partner logo present → used verbatim, NOT the bundled default.
    expect(result.template.partnerLogoDataUri).toMatch(/^data:image\/png;base64,/);
    expect(result.template.partnerLogoDataUri).not.toBe(BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI);
  });

  it("falls back to the Blue Alliance default when the partner logo S3 fetch fails", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue({
      ...TEMPLATE_ROW,
      partnerLogoKey: "logos/tenant_a/partner.png",
    } as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockRejectedValue(new Error("S3 unavailable"));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.partnerLogoDataUri).toBe(BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI);
  });

  it("resolves jpeg logo key to data:image/jpeg dataUri", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue({
      ...TEMPLATE_ROW,
      municipalLogoKey: "logos/tenant_a/tpl_1.jpeg",
    } as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from("jpeg-bytes"));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.municipalLogoDataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns null dataUri and does not throw on S3 logo fetch error", async () => {
    setupHappyPath();
    vi.mocked(getImageBytes).mockRejectedValue(new Error("S3 unavailable"));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.municipalLogoDataUri).toBeNull();
  });

  // ── Events Over Time series ────────────────────────────────────────────────

  it("emits a continuous daily series when from+to are present", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        templateId: TEMPLATE_ID,
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-03T00:00:00.000Z",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: "e1", title: null, locationLat: null, locationLon: null, reportedAt: new Date("2026-05-02") },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    const series = result.charts.eventsOverTime.series;
    // Should have 3 days: May 1, 2, 3 (continuous fill with zeros)
    expect(series).toHaveLength(3);
    expect(series[0]?.date).toBe("2026-05-01");
    expect(series[0]?.count).toBe(0);
    expect(series[1]?.date).toBe("2026-05-02");
    expect(series[1]?.count).toBe(1);
    expect(series[2]?.date).toBe("2026-05-03");
    expect(series[2]?.count).toBe(0);
    expect(series[1]?.label).toBe("May 2");
  });

  it("buckets a >183-day range monthly, without the old 400-day truncation, and total reflects the full event count", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        templateId: TEMPLATE_ID,
        // ~552 days — the exact class of range the old `guard < 400` loop
        // silently truncated.
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-07-06T00:00:00.000Z",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    // 78 events spread across the range (mirrors the owner's Puerto Galera
    // Jan2025–Jul2026 sample total).
    const eventRows = Array.from({ length: 78 }, (_, i) => ({
      id: `e${String(i)}`,
      title: null,
      locationLat: null,
      locationLon: null,
      // Spread across ~550 days so events land in many different months.
      reportedAt: new Date(2025, 0, 1 + i * 7),
    }));
    vi.mocked(prisma.event.findMany).mockResolvedValue(eventRows as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;

    const { series, total } = result.charts.eventsOverTime;
    // The bug: a `guard < 400` daily loop over a 552-day range stopped after
    // 400 days and undercounted. Monthly bucketing over ~19 months yields far
    // fewer than 400 points — proving the series is NOT truncated.
    expect(series.length).toBeLessThan(25);
    expect(series.length).toBeGreaterThan(15);
    // Every bucket key is a month key (yyyy-MM), not a day key.
    for (const point of series) {
      expect(point.date).toMatch(/^\d{4}-\d{2}$/);
    }
    // Total must equal the full in-range event count, independent of bucketing.
    expect(total).toBe(78);
    expect(series.reduce((s, p) => s + p.count, 0)).toBe(78);
  });

  it("buckets a ~60-day range weekly", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        templateId: TEMPLATE_ID,
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-06-30T00:00:00.000Z",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: "e1", title: null, locationLat: null, locationLon: null, reportedAt: new Date("2026-05-10") },
      { id: "e2", title: null, locationLat: null, locationLon: null, reportedAt: new Date("2026-06-20") },
    ] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    const { series, total } = result.charts.eventsOverTime;
    for (const point of series) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // week-start day key
    }
    expect(total).toBe(2);
    expect(series.reduce((s, p) => s + p.count, 0)).toBe(2);
  });

  // ── Patrol-count-by-type over time series ─────────────────────────────────

  it("buckets patrolCountByTypeOverTime monthly (not truncated) for a >183-day range", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        templateId: TEMPLATE_ID,
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-07-06T00:00:00.000Z",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    const patrolRows = Array.from({ length: 40 }, (_, i) => ({
      id: `p${String(i)}`,
      title: `P${String(i)}`,
      serialNumber: `SN${String(i)}`,
      patrolType: i % 2 === 0 ? "seaborne" : "foot",
      boatName: null,
      startTime: new Date(2025, 0, 1 + i * 13),
      endTime: null,
      totalDistanceKm: null,
      computedDistanceKm: null,
      totalHours: null,
      computedDurationHours: null,
      startLocationLat: null,
      startLocationLon: null,
      segments: [],
    }));
    vi.mocked(prisma.patrol.findMany).mockResolvedValue(patrolRows as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    const { seaborne, foot } = result.charts.patrolList.patrolCountByTypeOverTime;
    for (const point of [...seaborne, ...foot]) {
      expect(point.date).toMatch(/^\d{4}-\d{2}$/); // month key — adaptive, not daily
    }
    expect(seaborne.length).toBeLessThan(25);
    expect(foot.length).toBeLessThan(25);
    expect(seaborne.reduce((s, p) => s + p.count, 0)).toBe(20);
    expect(foot.reduce((s, p) => s + p.count, 0)).toBe(20);
  });

  // ── municipalityBounds ─────────────────────────────────────────────────────

  it("returns null municipalityBounds when no municipalityId is set", async () => {
    setupHappyPath();
    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.municipalityBounds).toBeNull();
    expect(prisma.municipality.findUnique).not.toHaveBeenCalled();
    // Header municipality line (2026-07-06): regional/all-municipality
    // report — no municipalityId filter.
    expect(result.municipalityName).toBe("All Municipalities");
    // Region mode (2026-07-13): neither municipalityId nor province set —
    // this is the "All Municipalities" fallback, NOT region mode.
    expect(result.isRegionReport).toBe(false);
  });

  it("returns null municipalityBounds when the municipality has no geometry", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, municipalityId: "muni_a" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.municipalityBounds).toBeNull();
    expect(prisma.municipality.findUnique).toHaveBeenCalledWith({
      where: { id: "muni_a" },
      select: { name: true, boundaryGeojson: true, waterGeojson: true },
    });
    // Header municipality line (2026-07-06): a municipalityId was set but
    // the record didn't resolve — the header omits the line gracefully.
    expect(result.municipalityName).toBeNull();
  });

  it("computes municipalityBounds from waterGeojson ONLY (water-centered framing, R10) when both boundaryGeojson + waterGeojson resolve", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, municipalityId: "muni_a" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue({
      name: "Puerto Galera",
      boundaryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [121.0, 13.0],
            [121.2, 13.0],
            [121.2, 13.2],
            [121.0, 13.2],
            [121.0, 13.0],
          ],
        ],
      },
      // Coastal waters extend further east/south than the land boundary.
      waterGeojson: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [121.0, 12.8],
              [121.4, 12.8],
              [121.4, 13.0],
              [121.0, 13.0],
              [121.0, 12.8],
            ],
          ],
        ],
      },
    } as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    // R10: water-only framing — the land boundary (13.0–13.2 lat, 121.0–121.2
    // lon) is IGNORED when waterGeojson is present; only the water bound
    // (12.8–13.0 lat, 121.0–121.4 lon) is used, cropping the inland territory
    // so the print map centers on the coastline + municipal water.
    expect(result.municipalityBounds).toEqual({
      south: 12.8,
      west: 121.0,
      north: 13.0,
      east: 121.4,
    });
    // Header municipality line (2026-07-06): resolved Municipality.name.
    expect(result.municipalityName).toBe("Puerto Galera");
  });

  it("falls back to boundaryGeojson when the municipality has no waterGeojson", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, municipalityId: "muni_a" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue({
      name: "Puerto Galera",
      boundaryGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [121.0, 13.0],
            [121.2, 13.0],
            [121.2, 13.2],
            [121.0, 13.2],
            [121.0, 13.0],
          ],
        ],
      },
      waterGeojson: null,
    } as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.municipalityBounds).toEqual({
      south: 13.0,
      west: 121.0,
      north: 13.2,
      east: 121.2,
    });
  });

  // ── Province rollup (2026-07-09) ───────────────────────────────────────────

  it("scopes event + patrol filters to every municipality in the province, and titles the report with the province name, when province is set and municipalityId is not", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, province: "Oriental Mindoro" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([
      { id: "muni_pg" },
      { id: "muni_sj" },
    ] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;

    // Province lookup is tenant-scoped.
    expect(prisma.municipality.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, province: "Oriental Mindoro" },
      select: { id: true },
    });

    // Event + patrol where-clauses both resolve to the { in: [...] } clause.
    expect(
      vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: { in: ["muni_pg", "muni_sj"] } });
    expect(
      vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: { in: ["muni_pg", "muni_sj"] } });

    // Province-scoped (no municipalityId) — report titled with the province
    // name; no single-municipality geometry lookup or bounds are fetched.
    expect(result.municipalityName).toBe("Oriental Mindoro");
    expect(result.municipalityBounds).toBeNull();
    expect(prisma.municipality.findUnique).not.toHaveBeenCalled();
    // Region mode (2026-07-13): province set, no municipalityId — the print
    // header renders the province name alone, with no logos.
    expect(result.isRegionReport).toBe(true);
  });

  it("a specific municipalityId still wins over province when both are present", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        ...EXPORT_ROW.paramsJson,
        municipalityId: "muni_a",
        province: "Oriental Mindoro",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue({
      name: "Puerto Galera",
      boundaryGeojson: null,
      waterGeojson: null,
    } as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;

    // municipalityId wins — province lookup (findMany) is never consulted.
    expect(prisma.municipality.findMany).not.toHaveBeenCalled();
    expect(
      vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: "muni_a" });
    expect(
      vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: "muni_a" });
    expect(result.municipalityName).toBe("Puerto Galera");
    // Region mode (2026-07-13): a specific municipalityId wins over
    // province — this is NOT a region report.
    expect(result.isRegionReport).toBe(false);
  });

  it("parses province from paramsJson and drops empty-string province", () => {
    expect(parseReportMapParams({ province: "Oriental Mindoro" }).province).toBe(
      "Oriental Mindoro",
    );
    expect(parseReportMapParams({ province: "" }).province).toBeUndefined();
  });

  // ── includeChildren (Phase 4B, 2026-07-09) ────────────────────────────────

  it("parses includeChildren:true from paramsJson and leaves it undefined when absent", () => {
    expect(
      parseReportMapParams({ includeChildren: true }).includeChildren,
    ).toBe(true);
    expect(parseReportMapParams({ includeChildren: false }).includeChildren).toBe(
      false,
    );
    expect(parseReportMapParams({}).includeChildren).toBeUndefined();
  });

  it("folds child protected-zone events/patrols into the report when municipalityId + includeChildren:true are set", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        ...EXPORT_ROW.paramsJson,
        municipalityId: "muni_a",
        includeChildren: true,
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([
      { id: "zone_child_1" },
      { id: "zone_child_2" },
    ] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;

    // resolveChildZoneIds is consulted, tenant-scoped, for the resolved
    // municipality scope.
    expect(prisma.protectedZone.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, parentMunicipalityId: { in: ["muni_a"] } },
      select: { id: true },
    });

    // Event + patrol where-clauses widen to the OR(municipality, coveredZones)
    // shape carrying the resolved child zone ids.
    expect(
      vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({
      OR: [
        { municipalityId: "muni_a" },
        { coveredZones: { some: { protectedZoneId: { in: ["zone_child_1", "zone_child_2"] } } } },
      ],
    });
    expect(
      vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({
      OR: [
        { municipalityId: "muni_a" },
        { coveredZones: { some: { protectedZoneId: { in: ["zone_child_1", "zone_child_2"] } } } },
      ],
    });
  });

  it("does NOT resolve child zones when includeChildren is unset (plain municipality clause, unchanged behavior)", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, municipalityId: "muni_a" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(prisma.protectedZone.findMany).not.toHaveBeenCalled();
    expect(
      vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: "muni_a" });
    expect(
      vi.mocked(prisma.patrol.findMany).mock.calls[0]?.[0]?.where,
    ).toMatchObject({ municipalityId: "muni_a" });
  });

  // ── exportMode (2026-07-13 export-mode split) ────────────────────────────

  it("defaults exportMode to combined when paramsJson has no exportMode", async () => {
    setupHappyPath();
    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.exportMode).toBe("combined");
  });

  it("echoes exportMode charts/lists from paramsJson", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, exportMode: "charts" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const chartsResult = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(chartsResult?.exportMode).toBe("charts");

    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, exportMode: "lists" },
    } as never);
    const listsResult = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(listsResult?.exportMode).toBe("lists");
  });
});

// ─── unionGeometryBounds ──────────────────────────────────────────────────────

describe("unionGeometryBounds", () => {
  it("computes bounds from a single Polygon", () => {
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.0],
          [121.5, 13.5],
          [121.0, 13.5],
          [121.0, 13.0],
        ],
      ],
    };
    expect(unionGeometryBounds(polygon)).toEqual({
      south: 13.0,
      west: 121.0,
      north: 13.5,
      east: 121.5,
    });
  });

  it("unions a MultiPolygon across multiple parts", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.0, 13.0],
            [121.2, 13.0],
            [121.2, 13.2],
            [121.0, 13.2],
            [121.0, 13.0],
          ],
        ],
        [
          [
            [122.0, 14.0],
            [122.3, 14.0],
            [122.3, 14.3],
            [122.0, 14.3],
            [122.0, 14.0],
          ],
        ],
      ],
    };
    expect(unionGeometryBounds(multi)).toEqual({
      south: 13.0,
      west: 121.0,
      north: 14.3,
      east: 122.3,
    });
  });

  it("extracts bounds from a FeatureCollection wrapper (the stored shape)", () => {
    // Municipality boundary/water Json columns are stored as a FeatureCollection
    // — {features:[{geometry:{coordinates}}]} — NOT a bare geometry. This is the
    // exact case that silently returned null and left the report map on the
    // whole-region view.
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [120.82, 13.31],
                [120.96, 13.35],
                [120.96, 13.5],
                [120.82, 13.5],
                [120.82, 13.31],
              ],
            ],
          },
        },
      ],
    };
    expect(unionGeometryBounds(fc)).toEqual({
      south: 13.31,
      west: 120.82,
      north: 13.5,
      east: 120.96,
    });
  });

  it("extracts bounds from a bare Feature wrapper", () => {
    const feature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[121.0, 13.0], [121.2, 13.2]]] },
    };
    expect(unionGeometryBounds(feature)).toEqual({
      south: 13.0,
      west: 121.0,
      north: 13.2,
      east: 121.2,
    });
  });

  it("unions across multiple geometry arguments", () => {
    const a = { type: "Polygon", coordinates: [[[121.0, 13.0], [121.1, 13.1]]] };
    const b = { type: "Polygon", coordinates: [[[120.5, 12.5], [121.0, 13.0]]] };
    expect(unionGeometryBounds(a, b)).toEqual({
      south: 12.5,
      west: 120.5,
      north: 13.1,
      east: 121.1,
    });
  });

  it("returns null for empty, null, or malformed geometry", () => {
    expect(unionGeometryBounds(null)).toBeNull();
    expect(unionGeometryBounds(undefined)).toBeNull();
    expect(unionGeometryBounds({})).toBeNull();
    expect(unionGeometryBounds({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(unionGeometryBounds("not-geojson")).toBeNull();
  });

  it("returns null when called with no geometries", () => {
    expect(unionGeometryBounds()).toBeNull();
  });

  it("ignores a null geometry argument mixed with a valid one", () => {
    const polygon = {
      type: "Polygon",
      coordinates: [[[121.0, 13.0], [121.5, 13.5]]],
    };
    expect(unionGeometryBounds(polygon, null)).toEqual({
      south: 13.0,
      west: 121.0,
      north: 13.5,
      east: 121.5,
    });
  });
});

// ─── buildPatrolTypeTotals ─────────────────────────────────────────────────────

function makePatrolRow(
  overrides: Partial<ReportMapPatrolRow> & { patrolId: string },
): ReportMapPatrolRow {
  return {
    label: overrides.patrolId,
    serialNumber: null,
    patrolType: "seaborne",
    boatName: null,
    startTime: null,
    endTime: null,
    distanceKm: null,
    hours: null,
    leaderName: null,
    leaderNames: [],
    startLocationLat: null,
    startLocationLon: null,
    ...overrides,
  };
}

describe("buildPatrolTypeTotals", () => {
  it("sums count/hours/km per patrol type", () => {
    const rows = [
      makePatrolRow({ patrolId: "p1", patrolType: "seaborne", hours: 2, distanceKm: 10 }),
      makePatrolRow({ patrolId: "p2", patrolType: "seaborne", hours: 3, distanceKm: 5 }),
      makePatrolRow({ patrolId: "p3", patrolType: "foot", hours: 1, distanceKm: 2 }),
    ];
    expect(buildPatrolTypeTotals(rows)).toEqual({
      seaborne: { count: 2, hours: 5, km: 15 },
      foot: { count: 1, hours: 1, km: 2 },
    });
  });

  it("treats null hours/distanceKm as 0", () => {
    const rows = [
      makePatrolRow({ patrolId: "p1", patrolType: "seaborne", hours: null, distanceKm: null }),
      makePatrolRow({ patrolId: "p2", patrolType: "foot", hours: null, distanceKm: null }),
    ];
    expect(buildPatrolTypeTotals(rows)).toEqual({
      seaborne: { count: 1, hours: 0, km: 0 },
      foot: { count: 1, hours: 0, km: 0 },
    });
  });

  it("ignores patrols whose type is neither seaborne nor foot", () => {
    const rows = [
      makePatrolRow({ patrolId: "p1", patrolType: "seaborne", hours: 1, distanceKm: 1 }),
      makePatrolRow({ patrolId: "p2", patrolType: "vehicle", hours: 99, distanceKm: 99 }),
    ];
    expect(buildPatrolTypeTotals(rows)).toEqual({
      seaborne: { count: 1, hours: 1, km: 1 },
      foot: { count: 0, hours: 0, km: 0 },
    });
  });

  it("returns zeroed totals for an empty breakdown", () => {
    expect(buildPatrolTypeTotals([])).toEqual({
      seaborne: { count: 0, hours: 0, km: 0 },
      foot: { count: 0, hours: 0, km: 0 },
    });
  });
});

// ─── buildPatrolHeatPoints (R5, 2026-07-06) ────────────────────────────────

function makeTrackRow(
  overrides: Partial<ReportMapTrackRow> & { patrolId: string },
): ReportMapTrackRow {
  return {
    label: overrides.patrolId,
    patrolType: "seaborne",
    path: [],
    ...overrides,
  };
}

describe("buildPatrolHeatPoints", () => {
  it("buckets track path points into seaborne/foot HeatLatLng tuples with weight 1", () => {
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        patrolType: "seaborne",
        path: [
          { lat: 12.5, lon: 121.5 },
          { lat: 12.6, lon: 121.6 },
        ],
      }),
      makeTrackRow({
        patrolId: "p2",
        patrolType: "foot",
        path: [{ lat: 13.0, lon: 122.0 }],
      }),
    ];
    expect(buildPatrolHeatPoints(tracks)).toEqual({
      seaborne: [
        [12.5, 121.5, 1],
        [12.6, 121.6, 1],
      ],
      foot: [[13.0, 122.0, 1]],
    });
  });

  it("concatenates points across multiple tracks of the same type", () => {
    const tracks = [
      makeTrackRow({ patrolId: "p1", patrolType: "seaborne", path: [{ lat: 1, lon: 1 }] }),
      makeTrackRow({ patrolId: "p2", patrolType: "seaborne", path: [{ lat: 2, lon: 2 }] }),
    ];
    expect(buildPatrolHeatPoints(tracks)).toEqual({
      seaborne: [
        [1, 1, 1],
        [2, 2, 1],
      ],
      foot: [],
    });
  });

  it("ignores tracks whose patrolType is neither seaborne nor foot", () => {
    const tracks = [
      makeTrackRow({ patrolId: "p1", patrolType: "vehicle", path: [{ lat: 1, lon: 1 }] }),
    ];
    expect(buildPatrolHeatPoints(tracks)).toEqual({ seaborne: [], foot: [] });
  });

  it("returns empty buckets for an empty track list", () => {
    expect(buildPatrolHeatPoints([])).toEqual({ seaborne: [], foot: [] });
  });

  // ─── Heat-point downsampling (perf/report-heatpoint-downsample) ───────────
  // A 1-year report's tracks feed tens of thousands of GPS vertices into each
  // of the TWO leaflet.heat layers. buildPatrolHeatPoints now caps each layer
  // to MAX_HEAT_POINTS_PER_LAYER via a uniform per-track stride, preserving
  // every track's endpoints so spatial coverage is never visually truncated.

  it("caps a large synthetic input (300 tracks × 500 vertices) at ~the per-layer cap", () => {
    const tracks: ReportMapTrackRow[] = [];
    for (let t = 0; t < 300; t += 1) {
      const path = [];
      for (let i = 0; i < 500; i += 1) {
        // spread points across a plausible Mindoro lat/lon box
        path.push({ lat: 13 + t * 0.001 + i * 0.0001, lon: 121 + t * 0.001 + i * 0.0001 });
      }
      tracks.push(makeTrackRow({ patrolId: `p${String(t)}`, patrolType: "seaborne", path }));
    }
    const { seaborne, foot } = buildPatrolHeatPoints(tracks);
    // 150k raw points collapse to a bounded set: at most the cap plus one
    // appended endpoint per track (300 tracks).
    expect(seaborne.length).toBeLessThanOrEqual(MAX_HEAT_POINTS_PER_LAYER + 300);
    // ...and dramatically fewer than the 150k raw vertices.
    expect(seaborne.length).toBeLessThan(150_000 / 10);
    expect(foot).toEqual([]);
    // every tuple is a valid HeatLatLng with weight 1
    for (const pt of seaborne) {
      expect(pt).toHaveLength(3);
      expect(pt[2]).toBe(1);
    }
  });

  it("preserves each track's first and last vertex when downsampling", () => {
    // Two dense tracks, well over the cap in aggregate. Their endpoints must
    // survive so coverage isn't truncated.
    const bigPath = (base: number) =>
      Array.from({ length: 5000 }, (_, i) => ({ lat: base + i * 0.0001, lon: base + i * 0.0001 }));
    const tracks: ReportMapTrackRow[] = [
      makeTrackRow({ patrolId: "a", patrolType: "seaborne", path: bigPath(13) }),
      makeTrackRow({ patrolId: "b", patrolType: "seaborne", path: bigPath(14) }),
    ];
    const { seaborne } = buildPatrolHeatPoints(tracks);
    // Track A endpoints
    expect(seaborne).toContainEqual([13, 13, 1]);
    expect(seaborne).toContainEqual([13 + 4999 * 0.0001, 13 + 4999 * 0.0001, 1]);
    // Track B endpoints
    expect(seaborne).toContainEqual([14, 14, 1]);
    expect(seaborne).toContainEqual([14 + 4999 * 0.0001, 14 + 4999 * 0.0001, 1]);
    expect(seaborne.length).toBeLessThanOrEqual(MAX_HEAT_POINTS_PER_LAYER + 2);
  });

  it("passes a below-cap input through unchanged (order preserved)", () => {
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        patrolType: "seaborne",
        path: [
          { lat: 12.5, lon: 121.5 },
          { lat: 12.6, lon: 121.6 },
          { lat: 12.7, lon: 121.7 },
        ],
      }),
    ];
    expect(buildPatrolHeatPoints(tracks).seaborne).toEqual([
      [12.5, 121.5, 1],
      [12.6, 121.6, 1],
      [12.7, 121.7, 1],
    ]);
  });
});

// ─── decimateHeatPointsByStride ────────────────────────────────────────────
describe("decimateHeatPointsByStride", () => {
  const pts = (n: number): [number, number, number][] =>
    Array.from({ length: n }, (_, i) => [i, i, 1]);

  it("returns the input unchanged for stride <= 1", () => {
    const p = pts(10);
    expect(decimateHeatPointsByStride(p, 1)).toBe(p);
    expect(decimateHeatPointsByStride(p, 0)).toBe(p);
  });

  it("returns the input unchanged for <= 2 points regardless of stride", () => {
    const p = pts(2);
    expect(decimateHeatPointsByStride(p, 5)).toBe(p);
  });

  it("keeps every Nth point and always appends the last", () => {
    const p = pts(10); // indices 0..9
    const out = decimateHeatPointsByStride(p, 3);
    // indices 0,3,6,9 — 9 is both the strided endpoint and the last
    expect(out).toEqual([
      [0, 0, 1],
      [3, 3, 1],
      [6, 6, 1],
      [9, 9, 1],
    ]);
  });

  it("appends the last vertex when the stride would otherwise skip it", () => {
    const p = pts(10); // indices 0..9
    const out = decimateHeatPointsByStride(p, 4);
    // strided: 0,4,8 ; last (9) not on the stride grid → appended
    expect(out).toEqual([
      [0, 0, 1],
      [4, 4, 1],
      [8, 8, 1],
      [9, 9, 1],
    ]);
    expect(out[0]).toEqual([0, 0, 1]);
    expect(out[out.length - 1]).toEqual([9, 9, 1]);
  });
});

// ─── capHeatLayerPoints ────────────────────────────────────────────────────
describe("capHeatLayerPoints", () => {
  it("flattens a below-cap bucket unchanged", () => {
    const perTrack: [number, number, number][][] = [
      [
        [1, 1, 1],
        [2, 2, 1],
      ],
      [[3, 3, 1]],
    ];
    expect(capHeatLayerPoints(perTrack, 100)).toEqual([
      [1, 1, 1],
      [2, 2, 1],
      [3, 3, 1],
    ]);
  });

  it("caps an over-budget bucket while preserving per-track endpoints", () => {
    const track = (base: number): [number, number, number][] =>
      Array.from({ length: 1000 }, (_, i) => [base + i, base + i, 1]);
    const perTrack = [track(0), track(10_000)];
    const out = capHeatLayerPoints(perTrack, 200);
    expect(out.length).toBeLessThanOrEqual(200 + perTrack.length);
    expect(out.length).toBeLessThan(2000);
    // endpoints of both tracks survive
    expect(out).toContainEqual([0, 0, 1]);
    expect(out).toContainEqual([999, 999, 1]);
    expect(out).toContainEqual([10_000, 10_000, 1]);
    expect(out).toContainEqual([10_999, 10_999, 1]);
  });

  it("handles empty input", () => {
    expect(capHeatLayerPoints([], 100)).toEqual([]);
    expect(capHeatLayerPoints([[]], 100)).toEqual([]);
  });
});

// ─── clipTracksToMunicipalityGeometry (cross-municipality leak fix, 2026-07-06) ─
//
// A simple square polygon standing in for a municipality's boundary/water
// geometry — PG (Puerto Galera): lat 13.0–13.6, lon 120.85–121.2. Points west
// of lon 120.85 stand in for the real-world Abra de Ilog leak this fix
// targets (a patrol attributed to PG by dominant-track share, but with GPS
// points that physically sit in the neighboring municipality).
const PG_GEOJSON = {
  type: "Polygon",
  coordinates: [
    [
      [120.85, 13.0],
      [121.2, 13.0],
      [121.2, 13.6],
      [120.85, 13.6],
      [120.85, 13.0],
    ],
  ],
};

describe("clipTracksToMunicipalityGeometry", () => {
  it("passes tracks through unchanged when geometries is null (regional / no-geometry report)", () => {
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        path: [
          { lat: 13.2, lon: 120.7 }, // outside PG_GEOJSON — must survive when geometries is null
          { lat: 13.2, lon: 121.0 },
        ],
      }),
    ];
    expect(clipTracksToMunicipalityGeometry(tracks, null)).toEqual(tracks);
  });

  it("drops points outside the municipality geometry, keeping the rest of the track", () => {
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        path: [
          { lat: 13.2, lon: 120.7 }, // outside — west of the PG boundary (Abra de Ilog side)
          { lat: 13.2, lon: 121.0 }, // inside
          { lat: 13.3, lon: 121.05 }, // inside
        ],
      }),
    ];
    const result = clipTracksToMunicipalityGeometry(tracks, [PG_GEOJSON]);
    expect(result).toEqual([
      {
        patrolId: "p1",
        label: "p1",
        patrolType: "seaborne",
        path: [
          { lat: 13.2, lon: 121.0 },
          { lat: 13.3, lon: 121.05 },
        ],
      },
    ]);
  });

  it("drops a track entirely when clipping leaves fewer than 2 points (mirrors the ADI mis-attributed-patrol case)", () => {
    // Every point of this track sits outside PG_GEOJSON — the exact shape of
    // the "ADI foot patrol" bug: a whole track physically in a neighboring
    // municipality, attributed to this one.
    const tracks = [
      makeTrackRow({
        patrolId: "adi-1",
        patrolType: "foot",
        path: [
          { lat: 13.48, lon: 120.83 },
          { lat: 13.48, lon: 120.70 },
        ],
      }),
      makeTrackRow({
        patrolId: "pg-1",
        patrolType: "seaborne",
        path: [
          { lat: 13.2, lon: 121.0 },
          { lat: 13.3, lon: 121.05 },
        ],
      }),
    ];
    const result = clipTracksToMunicipalityGeometry(tracks, [PG_GEOJSON]);
    expect(result).toEqual([
      {
        patrolId: "pg-1",
        label: "pg-1",
        patrolType: "seaborne",
        path: [
          { lat: 13.2, lon: 121.0 },
          { lat: 13.3, lon: 121.05 },
        ],
      },
    ]);
  });

  it("checks multiple geometries (boundary ∪ water) — a point inside EITHER is kept", () => {
    const waterGeojson = {
      type: "Polygon",
      coordinates: [
        [
          [121.2, 13.0],
          [121.4, 13.0],
          [121.4, 13.6],
          [121.2, 13.6],
          [121.2, 13.0],
        ],
      ],
    };
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        path: [
          { lat: 13.2, lon: 121.0 }, // inside boundary only
          { lat: 13.2, lon: 121.3 }, // inside water only
        ],
      }),
    ];
    const result = clipTracksToMunicipalityGeometry(tracks, [PG_GEOJSON, waterGeojson]);
    expect(result[0]?.path).toEqual([
      { lat: 13.2, lon: 121.0 },
      { lat: 13.2, lon: 121.3 },
    ]);
  });

  it("returns an empty array when every track is fully outside the geometry", () => {
    const tracks = [
      makeTrackRow({
        patrolId: "p1",
        path: [
          { lat: 13.2, lon: 120.7 },
          { lat: 13.3, lon: 120.6 },
        ],
      }),
    ];
    expect(clipTracksToMunicipalityGeometry(tracks, [PG_GEOJSON])).toEqual([]);
  });

  it("returns an empty array for an empty track list, regardless of geometries", () => {
    expect(clipTracksToMunicipalityGeometry([], [PG_GEOJSON])).toEqual([]);
    expect(clipTracksToMunicipalityGeometry([], null)).toEqual([]);
  });
});
