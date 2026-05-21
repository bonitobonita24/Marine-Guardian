// coverage-report.test.tsx
//
// RSC-style test: render the component to a static string and assert on
// the output. No DOM needed since vitest is on the "node" environment.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
  it("renders the header with tenant name, period label, generated timestamp, paper size", () => {
    const html = renderToStaticMarkup(<CoverageReport data={buildData()} />);
    expect(html).toContain("Mindoro MPA");
    expect(html).toContain("Patrol Coverage Report — MAY 2026");
    expect(html).toContain("Asia/Manila");
    expect(html).toContain("<strong>Paper:</strong> A4");
    expect(html).toContain("Marine Guardian Command Center");
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
});
