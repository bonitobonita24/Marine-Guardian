// coverage-report.test.tsx
//
// RSC-style test: render the component to a static string and assert on
// the output. No DOM needed since vitest is on the "node" environment.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoDocumentScaffold } from "./assert-no-document-scaffold";
import { getMonthlyPeriod } from "@marine-guardian/shared/lib/coverage-period";

// Page 2 + Page 3 client islands depend on a real browser (Leaflet + Recharts).
// Page 1 tests only need Page 2 + 3 to no-op. Mock the leaf islands so the
// react-dom server render stays in a node environment.
vi.mock("../components/area-coverage-map", () => ({
  AreaCoverageMap: () => null,
}));
vi.mock("../components/patrol-area-bar-chart", () => ({
  PatrolAreaBarChart: () => null,
}));
vi.mock("../components/area-covered-chart", () => ({
  AreaCoveredChart: () => null,
}));

import { CoverageReport } from "../coverage-report";
import type { CoverageReportData } from "@/server/coverage-report/get-coverage-report-data";

function buildData(
  overrides: Partial<CoverageReportData> = {},
): CoverageReportData {
  return {
    tenant: {
      id: "t1",
      name: "Mindoro MPA",
      slug: "mindoro",
      timezone: "Asia/Manila",
    },
    period: getMonthlyPeriod(2026, 5, 480),
    paperSize: "A4",
    excludeTestPatrols: true,
    generatedAt: new Date("2026-05-21T12:00:00.000Z"),
    patrols: [],
    enabledAreas: [],
    attributions: [],
    patrolCountsByArea: [],
    unattributedPatrolCount: 0,
    areaCoverage: [],
    missingTracksCount: 0,
    ...overrides,
  };
}

describe("CoverageReport (Page 1 — Patrol Index)", () => {
  // React #418 regression guard (2026-07-20) — the nested-document defect was
  // shared by every print-render template, not just the two pages browser QA
  // happened to exercise. See components/print-document-shell.tsx.
  it("emits NO nested <html>/<head>/<body> document scaffold (React #418)", () => {
    expectNoDocumentScaffold(
      renderToStaticMarkup(<CoverageReport data={buildData()} />),
    );
  });

  it("renders the header with tenant name, report title, date range, generated timestamp, paper size", () => {
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    // Shared print-render header (2026-07-06 redesign) — big fixed brand
    // title, tenant name standing in for the municipality line (this
    // template has no logo/municipality concept), and a fixed report title.
    expect(html).toContain("Blue Alliance Monitoring");
    expect(html).toContain("Mindoro MPA");
    expect(html).toContain("Patrol Coverage");
    expect(html).toContain("Asia/Manila");
    expect(html).toContain("<strong>Paper:</strong> A4");
  });

  it("renders empty state when there are zero patrols", () => {
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    expect(html).toContain("No patrols recorded for this period.");
    expect(html).toContain('data-testid="card-total"');
    expect(html).toMatch(/<tfoot>[\s\S]*Total[\s\S]*0[\s\S]*<\/tfoot>/);
  });

  it("computes summary cards from foot + seaborne patrols", () => {
    const data = buildData({
      patrols: [
        {
          id: "p1",
          serialNumber: "MG-0001",
          title: "Foot sweep north",
          patrolType: "foot",
          state: "done",
          startTime: new Date("2026-05-10T03:00:00.000Z"),
          endTime: new Date("2026-05-10T07:00:00.000Z"),
          totalDistanceKm: 5.5,
          totalHours: 4,
          boatName: null,
          leaderName: "Maria Santos",
          areaName: "North Reef",
          startLocation: { lat: 13.5, lon: 121.5 },
          endLocation: { lat: 13.55, lon: 121.55 },
          trackLineString: null,
        },
        {
          id: "p2",
          serialNumber: "MG-0002",
          title: "Boat patrol south",
          patrolType: "seaborne",
          state: "done",
          startTime: new Date("2026-05-12T01:00:00.000Z"),
          endTime: new Date("2026-05-12T06:30:00.000Z"),
          totalDistanceKm: 22.4,
          totalHours: 5.5,
          boatName: "Bantay 2",
          leaderName: "Juan Cruz",
          areaName: null,
          startLocation: { lat: 13.6, lon: 121.6 },
          endLocation: { lat: 13.65, lon: 121.65 },
          trackLineString: null,
        },
        {
          id: "p3",
          serialNumber: null,
          title: null,
          patrolType: "foot",
          state: "active",
          startTime: new Date("2026-05-20T02:00:00.000Z"),
          endTime: null,
          totalDistanceKm: null,
          totalHours: null,
          boatName: null,
          leaderName: null,
          areaName: "East Cove",
          startLocation: null,
          endLocation: null,
          trackLineString: null,
        },
      ],
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    expect(html).toContain("5.5 km");
    expect(html).toContain("4.0 hrs");
    expect(html).toContain("22.4 km");
    expect(html).toContain("27.9 km");
  });

  it("renders the patrol detail table with one row per patrol", () => {
    const data = buildData({
      patrols: [
        {
          id: "p1",
          serialNumber: "MG-0001",
          title: "Routine sweep",
          patrolType: "foot",
          state: "done",
          startTime: new Date("2026-05-10T03:00:00.000Z"),
          endTime: new Date("2026-05-10T07:30:00.000Z"),
          totalDistanceKm: 6.2,
          totalHours: 4.5,
          boatName: null,
          leaderName: "Maria Santos",
          areaName: "North Reef",
          startLocation: { lat: 13.5, lon: 121.5 },
          endLocation: { lat: 13.55, lon: 121.55 },
          trackLineString: null,
        },
      ],
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    expect(html).toContain('data-testid="patrol-table"');
    expect(html).toContain("MG-0001");
    expect(html).toContain("Routine sweep");
    expect(html).toContain("Maria Santos");
    expect(html).toContain("13.5000, 121.5000");
    expect(html).toContain("4h 30m");
    expect(html).toContain("6.2");
    expect(html).toContain("Foot");
  });

  it("falls back to areaName when title is null in the detail row", () => {
    const data = buildData({
      patrols: [
        {
          id: "p1",
          serialNumber: null,
          title: null,
          patrolType: "foot",
          state: "open",
          startTime: new Date("2026-05-10T03:00:00.000Z"),
          endTime: null,
          totalDistanceKm: null,
          totalHours: null,
          boatName: null,
          leaderName: null,
          areaName: "South Bay",
          startLocation: null,
          endLocation: null,
          trackLineString: null,
        },
      ],
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    expect(html).toContain("South Bay");
  });

  it("uses @page size: A4 landscape by default", () => {
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    expect(html).toContain("size: A4 landscape");
  });

  it("switches @page size when paperSize=Letter or Legal", () => {
    const letterHtml = renderToStaticMarkup(
      <CoverageReport data={buildData({ paperSize: "Letter" })} />,
    );
    expect(letterHtml).toContain("size: Letter landscape");
    const legalHtml = renderToStaticMarkup(
      <CoverageReport data={buildData({ paperSize: "Legal" })} />,
    );
    expect(legalHtml).toContain("size: Legal landscape");
  });

  it("renders UTC timezone offset 0 when tenant.timezone === 'UTC'", () => {
    const data = buildData({
      tenant: {
        id: "t-utc",
        name: "UTC Test",
        slug: "utc-test",
        timezone: "UTC",
      },
      generatedAt: new Date("2026-05-21T08:00:00.000Z"),
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    expect(html).toContain("2026-05-21 08:00 (UTC)");
  });

  // -------------------------------------------------------------------------
  // P1-D regression — print stylesheet must be theme-independent
  // -------------------------------------------------------------------------

  it("P1-D: body style overrides dark-mode globals with !important on background and color", () => {
    // The app globals.css applies bg-background (≈ #0a0a0a) + text-foreground
    // (≈ #fafafa) to every page including print-render routes. The inline
    // <style> must force a light background + dark text via !important so the
    // PDF is readable regardless of the active theme.
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    expect(html).toContain("background: #fff !important");
    expect(html).toContain("color: #111 !important");
  });

  it("P1-D: even-row rule applies explicit light background AND dark text (no dark-on-dark)", () => {
    // Both background AND color must be set on even rows — setting background
    // alone leaves text colour at whatever globals.css injected.
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    // Even-row rule must carry an explicit light background.
    expect(html).toMatch(/nth-child\(even\)[^}]*background:\s*#f0f4f8\s*!important/);
    // Even-row rule must also explicitly set dark text — not just inherit it.
    expect(html).toMatch(/nth-child\(even\)[^}]*color:\s*#111\s*!important/);
  });

  it("P1-D: odd-row rule sets white background so rows do not inherit dark body", () => {
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    expect(html).toMatch(/nth-child\(odd\)[^}]*background:\s*#fff\s*!important/);
    expect(html).toMatch(/nth-child\(odd\)[^}]*color:\s*#111\s*!important/);
  });

  // -------------------------------------------------------------------------
  // P2-B regression — distance + duration must show real values for closed
  // historic patrols (totalDistanceKm from ER fallback, computedDurationHours)
  // -------------------------------------------------------------------------

  it("P2-B: renders totalDistanceKm when it is the only non-null distance field", () => {
    // Historic patrols backfilled from ER may have totalDistanceKm (from ER)
    // but null computedDistanceKm (not yet recomputed). The report must fall
    // through to totalDistanceKm so the KMS column is not "—".
    const data = buildData({
      patrols: [
        {
          id: "p-closed",
          serialNumber: "MG-0099",
          title: "Historic patrol",
          patrolType: "seaborne",
          state: "done",
          startTime: new Date("2025-06-01T00:00:00.000Z"),
          endTime: new Date("2025-06-01T05:00:00.000Z"),
          totalDistanceKm: 18.7, // ER-sourced; computedDistanceKm was null → fell back here
          totalHours: 5,
          boatName: "Bantay 1",
          leaderName: "Cruz",
          areaName: "South Shoal",
          startLocation: { lat: 12.1, lon: 120.5 },
          endLocation: { lat: 12.3, lon: 120.7 },
          trackLineString: null,
        },
      ],
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    expect(html).toContain("18.7");
    // Duration must also render — 5 hours.
    expect(html).toContain("5h 00m");
    // Start / End location must render.
    expect(html).toContain("12.1000, 120.5000");
    expect(html).toContain("12.3000, 120.7000");
  });

  it("P2-B: location columns show '—' only when both track endpoints AND stored lat/lon are null", () => {
    const data = buildData({
      patrols: [
        {
          id: "p-no-loc",
          serialNumber: null,
          title: "No track, no coords",
          patrolType: "foot",
          state: "done",
          startTime: new Date("2025-06-01T00:00:00.000Z"),
          endTime: new Date("2025-06-01T03:00:00.000Z"),
          totalDistanceKm: null,
          totalHours: null,
          boatName: null,
          leaderName: null,
          areaName: null,
          startLocation: null,
          endLocation: null,
          trackLineString: null,
        },
      ],
    });
    const html = renderToStaticMarkup(<CoverageReport data={data} />);
    // Expect the "—" sentinel (rendered by formatCoord(null)).
    // Count: at least 2 cells (Start Location + End Location).
    const dashes = html.match(/—/g) ?? [];
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
