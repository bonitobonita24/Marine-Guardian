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
    municipality: { findUnique: vi.fn() },
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
  getReportMapReportData,
  parseReportMapParams,
  unionGeometryBounds,
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
      { trackGeojson: { type: "LineString" }, patrol: { id: "p1", title: "P1", serialNumber: "SN1" } },
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
  });

  it("skips patrol tracks with fewer than 2 points", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([
      { trackGeojson: null, patrol: { id: "p2", title: null, serialNumber: "SN2" } },
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
  });

  // ── municipalityBounds ─────────────────────────────────────────────────────

  it("returns null municipalityBounds when no municipalityId is set", async () => {
    setupHappyPath();
    const result = await getReportMapReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.municipalityBounds).toBeNull();
    expect(prisma.municipality.findUnique).not.toHaveBeenCalled();
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
      select: { boundaryGeojson: true, waterGeojson: true },
    });
  });

  it("computes municipalityBounds from boundaryGeojson + waterGeojson when municipalityId resolves", async () => {
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
    // Union of boundary (13.0–13.2 lat, 121.0–121.2 lon) and water
    // (12.8–13.0 lat, 121.0–121.4 lon).
    expect(result.municipalityBounds).toEqual({
      south: 12.8,
      west: 121.0,
      north: 13.2,
      east: 121.4,
    });
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
