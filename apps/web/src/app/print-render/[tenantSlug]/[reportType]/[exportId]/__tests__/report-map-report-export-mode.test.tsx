// report-map-report-export-mode.test.tsx
//
// Export-mode split (2026-07-13) — a report_map PDF can render EITHER only
// the 4 chart+map sections ("charts"), only the 4 full-list sections
// ("lists"), or both (the default "combined" behavior, unchanged).
//
// Two layers, per the task's TDD guidance:
//   1. `resolveReportMapExportSections` — the pure mode → section-visibility
//      + map-island-count + page-numbering helper — unit tested directly,
//      no rendering involved.
//   2. A light RSC-style render (renderToStaticMarkup, same pattern as
//      coverage-report.test.tsx / report-header.test.tsx) asserting the
//      actual <section> markup + the window.__renderPending/__renderReady
//      init script reflect the resolved plan for each mode.
//
// Chart-bearing child islands (Recharts-based charts + the Leaflet map
// islands) are mocked to `() => null` — same rationale as
// coverage-report.test.tsx: they need a real browser environment, and this
// test only cares about section presence/absence and page numbering.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoDocumentScaffold } from "./assert-no-document-scaffold";

vi.mock("../components/event-breakdown-chart", () => ({
  EventBreakdownChart: () => null,
}));
vi.mock("../components/map-islands-client", () => ({
  EventPointsMap: () => null,
  PatrolTracksMap: () => null,
  PatrolHeatmapMap: () => null,
  EventHeatmapMap: () => null,
}));
vi.mock("../components/patrol-type-bar-chart", () => ({
  PatrolTotalsTable: () => null,
}));
vi.mock("../components/print-multi-series-chart", () => ({
  PrintMultiSeriesChart: () => null,
}));
vi.mock("../components/print-time-series-chart", () => ({
  PrintTimeSeriesChart: () => null,
}));
vi.mock("../components/row-height-sync", () => ({
  RowHeightSync: () => null,
}));

import {
  ReportMapReport,
  resolveReportMapExportSections,
} from "../report-map-report";
import type { ReportMapReportData } from "@/server/report-map-report/get-report-map-report-data";

// ─── resolveReportMapExportSections (pure helper) ──────────────────────────

describe("resolveReportMapExportSections", () => {
  it("combined (default): both groups render, all 7 map islands, 8 pages, list pages continue from 5", () => {
    const plan = resolveReportMapExportSections("combined");
    expect(plan).toEqual({
      showCharts: true,
      showLists: true,
      mapIslandCount: 7,
      totalPages: 8,
      listPageOffset: 4,
    });
  });

  it("charts: only chart sections, 7 map islands, 4 pages", () => {
    const plan = resolveReportMapExportSections("charts");
    expect(plan).toEqual({
      showCharts: true,
      showLists: false,
      mapIslandCount: 7,
      totalPages: 4,
      listPageOffset: 4,
    });
  });

  it("lists: only list sections, ZERO map islands, 4 pages, list pages renumber from 1", () => {
    const plan = resolveReportMapExportSections("lists");
    expect(plan).toEqual({
      showCharts: false,
      showLists: true,
      mapIslandCount: 0,
      totalPages: 4,
      listPageOffset: 0,
    });
  });
});

// ─── ReportMapReport render (RSC-style, react-dom/server) ──────────────────

function buildData(exportMode: ReportMapReportData["exportMode"]): ReportMapReportData {
  return {
    tenant: { id: "t1", name: "Mindoro MPA", slug: "mindoro", timezone: "Asia/Manila" },
    filter: {
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-06-01T00:00:00.000Z"),
      municipalityId: undefined,
      protectedZoneId: undefined,
    },
    generatedAt: new Date("2026-05-21T12:00:00.000Z"),
    template: {
      id: null,
      name: "Default",
      layout: "two-column",
      reportTitle: "Marine Guardian Report",
      footerNotes: null,
      municipalLogoDataUri: null,
      partnerLogoDataUri: "data:image/png;base64,",
    },
    municipalityBounds: null,
    municipalityName: "All Municipalities",
    isRegionReport: false,
    scopeTitleOverride: null,
    exportMode,
    eventTypeColumns: {},
    charts: {
      lawEnforcement: { key: "law_enforcement", title: "Law Enforcement", total: 0, breakdown: [] },
      monitoring: { key: "monitoring", title: "Monitoring", total: 0, breakdown: [] },
      highPriority: { key: "high_priority", title: "High Priority Events", total: 0, points: [], events: [] },
      patrolList: {
        key: "patrol_list",
        title: "Patrol List",
        total: 0,
        breakdown: [],
        tracks: [],
        patrolTotals: { count: 0, totalHours: 0, totalKm: 0 },
        patrolCountByTypeOverTime: { seaborne: [], foot: [] },
        patrolHeatPoints: { seaborne: [], foot: [] },
      },
      eventsOverTime: {
        key: "events_over_time",
        title: "Events Over Time",
        total: 0,
        series: [],
        overviewPoints: [],
        events: [],
      },
      patrolTypeTotals: {
        seaborne: { count: 0, hours: 0, km: 0 },
        foot: { count: 0, hours: 0, km: 0 },
      },
    },
  };
}

function sectionTestIds(html: string): string[] {
  return Array.from(html.matchAll(/data-testid="(section-[a-z-]+)"/g)).map((m) => m[1] ?? "");
}

describe("ReportMapReport — exportMode split", () => {
  // React #418 regression guard (2026-07-20) — browser QA confirmed this page
  // threw a hydration mismatch. Cause: the component emitted its own
  // <html><head><body> nested inside the app root layout's document, which the
  // HTML parser discards. See components/print-document-shell.tsx.
  it("emits NO nested <html>/<head>/<body> document scaffold (React #418)", () => {
    for (const mode of ["combined", "charts", "lists"] as const) {
      expectNoDocumentScaffold(
        renderToStaticMarkup(<ReportMapReport data={buildData(mode)} />),
      );
    }
  });

  it("combined (default): renders ALL 8 sections (4 chart + 4 list), seeds __renderPending=7", () => {
    const html = renderToStaticMarkup(<ReportMapReport data={buildData("combined")} />);
    expect(sectionTestIds(html)).toEqual([
      "section-law-enforcement",
      "section-monitoring",
      "section-patrol-list",
      "section-events-over-time",
      "section-law-enforcement-list",
      "section-monitoring-list",
      "section-patrol-list-list",
      "section-events-over-time-list",
    ]);
    expect(html).toContain("window.__renderPending = 7;");
    expect(html).not.toContain("window.__renderReady = true;");
    // List pages continue numbering after the 4 chart pages (5-8).
    expect(html).toContain("Page 5 of 8");
    expect(html).toContain("Page 8 of 8");
  });

  it('charts: renders ONLY the 4 chart sections, omits every "report-section-list", seeds __renderPending=7', () => {
    const html = renderToStaticMarkup(<ReportMapReport data={buildData("charts")} />);
    expect(sectionTestIds(html)).toEqual([
      "section-law-enforcement",
      "section-monitoring",
      "section-patrol-list",
      "section-events-over-time",
    ]);
    // The exact-order equality above already proves none of the 4
    // "*-list" sections rendered — sectionTestIds only picks up rendered
    // data-testid attributes, never the CSS block's ".report-section-list"
    // selector text.
    expect(html).toContain("window.__renderPending = 7;");
    expect(html).toContain("Page 1 of 4");
    expect(html).toContain("Page 4 of 4");
  });

  it('lists: renders ONLY the 4 list sections, omits every chart "report-section", flips __renderReady directly (no map islands to decrement a counter)', () => {
    const html = renderToStaticMarkup(<ReportMapReport data={buildData("lists")} />);
    expect(sectionTestIds(html)).toEqual([
      "section-law-enforcement-list",
      "section-monitoring-list",
      "section-patrol-list-list",
      "section-events-over-time-list",
    ]);
    // No chart section survives — the className "report-section" (not
    // "report-section-list") never appears.
    expect(html).not.toMatch(/class="report-section"/);
    expect(html).toContain("window.__renderReady = true;");
    expect(html).not.toContain("__renderPending");
    // List pages renumber from 1 (no chart pages precede them).
    expect(html).toContain("Page 1 of 4");
    expect(html).toContain("Page 4 of 4");
  });
});
