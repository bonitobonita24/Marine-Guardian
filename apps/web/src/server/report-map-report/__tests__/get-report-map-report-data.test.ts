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
  },
}));

vi.mock("@marine-guardian/storage", () => ({
  getImageBytes: vi.fn(),
  getExportsBucketName: vi.fn().mockReturnValue("marine-guardian-dev-exports"),
}));

vi.mock("@/server/trpc/routers/reportMap", () => ({
  buildEventBreakdownWithCoords: vi.fn(),
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
} from "../get-report-map-report-data";

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

// buildEventBreakdownWithCoords returns empty arrays — these are assignable
// directly (no cast needed; the mock accepts the inferred structure).
const EMPTY_BREAKDOWN = {
  lawEnforcement: [] as { type: string; count: number; points: { id: string; title: string | null; lat: number; lon: number }[] }[],
  monitoring: [] as { type: string; count: number; points: { id: string; title: string | null; lat: number; lon: number }[] }[],
  highPriority: { total: 0, points: [] as { id: string; title: string | null; lat: number; lon: number }[] },
};

function setupHappyPath() {
  vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
  vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
  vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
  vi.mocked(buildEventBreakdownWithCoords).mockResolvedValue(EMPTY_BREAKDOWN);
  vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrol.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.patrolTrack.findMany).mockResolvedValue([] as never);
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
    expect(result.template.partnerLogoDataUri).toBeNull();
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
        { type: "Illegal Fishing", count: 5, points: [] },
        { type: "Illegal Entry", count: 2, points: [] },
      ],
      monitoring: [{ type: "Routine Patrol", count: 10, points: [] }],
      highPriority: {
        total: 3,
        points: [{ id: "e1", title: "Catch", lat: 12, lon: 121 }],
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
    // partnerLogoKey is null → no S3 fetch, dataUri is null
    expect(result.template.partnerLogoDataUri).toBeNull();
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
});
