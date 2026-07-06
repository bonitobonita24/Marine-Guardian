// page-2-area-boundary-summary.test.tsx
//
// RSC-style test for Page 2 — table content, ranking, totals, empty
// states, and callout presence. Client-island children (AreaCoverageMap +
// PatrolAreaBarChart) are mocked because they require a DOM/canvas and
// are exercised via Puppeteer integration in the pdf-render pipeline.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../components/area-coverage-map", () => ({
  AreaCoverageMap: () => null,
}));
vi.mock("../components/patrol-area-bar-chart", () => ({
  PatrolAreaBarChart: () => null,
}));

import { Page2AreaBoundarySummary } from "../page-2-area-boundary-summary";
import type {
  CoverageReportArea,
  CoverageReportAttribution,
  CoverageReportPatrolRow,
} from "@/server/coverage-report/get-coverage-report-data";
import type { AreaPatrolCount } from "@marine-guardian/shared/lib/area-attribution";

function makeArea(
  id: string,
  name: string,
  arcgisReferenceId: string | null = null,
): CoverageReportArea {
  return {
    id,
    name,
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
    arcgisReferenceId,
  };
}

function makePatrolStub(id: string): CoverageReportPatrolRow {
  return {
    id,
    serialNumber: id,
    title: null,
    patrolType: "foot",
    state: "done",
    startTime: null,
    endTime: null,
    totalDistanceKm: null,
    totalHours: null,
    boatName: null,
    leaderName: null,
    areaName: null,
    startLocation: null,
    endLocation: null,
    trackLineString: null,
  };
}

describe("Page2AreaBoundarySummary", () => {
  it("renders the section frame with section header + variance-info callout", () => {
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[]}
        patrols={[]}
        attributions={[]}
        patrolCountsByArea={[]}
        unattributedPatrolCount={0}
      />,
    );
    // Shared print-render header (2026-07-06 redesign) replaces the former
    // "Page 2 — Area Boundary Summary" h3 banner.
    expect(html).toContain("Blue Alliance Monitoring");
    expect(html).toContain("Area Boundaries");
    expect(html).toContain("Mindoro MPA");
    expect(html).toContain("MAY 2026");
    expect(html).toContain('data-testid="variance-info-callout"');
    expect(html).toContain("How patrols are attributed");
  });

  it("forces page-break-before: always so Page 2 starts on a new physical page", () => {
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[]}
        patrols={[]}
        attributions={[]}
        patrolCountsByArea={[]}
        unattributedPatrolCount={0}
      />,
    );
    // React converts pageBreakBefore to inline style on the section root.
    // The exact serialization is "page-break-before:always" with no spaces.
    expect(html).toMatch(/page-break-before:\s*always/);
  });

  it("shows the empty-state map message when there are no boundaries AND no patrols", () => {
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[]}
        patrols={[]}
        attributions={[]}
        patrolCountsByArea={[]}
        unattributedPatrolCount={0}
      />,
    );
    expect(html).toContain('data-testid="map-empty"');
    expect(html).toContain("No boundaries or tracks to display.");
  });

  it("shows the empty-state boundary table when there are no enabled boundaries", () => {
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[]}
        patrols={[]}
        attributions={[]}
        patrolCountsByArea={[]}
        unattributedPatrolCount={0}
      />,
    );
    expect(html).toContain('data-testid="boundary-table-empty"');
    expect(html).toContain("No enabled boundaries configured for this tenant.");
  });

  it("ranks the boundary table by patrolCount DESC then by name ASC for stable ties", () => {
    const counts: AreaPatrolCount[] = [
      { areaBoundaryId: "alpha", areaName: "Alpha Reef", patrolCount: 2 },
      { areaBoundaryId: "bravo", areaName: "Bravo Bank", patrolCount: 5 },
      { areaBoundaryId: "charlie", areaName: "Charlie Cove", patrolCount: 2 },
    ];
    const attributions: CoverageReportAttribution[] = [];

    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[
          makeArea("alpha", "Alpha Reef"),
          makeArea("bravo", "Bravo Bank"),
          makeArea("charlie", "Charlie Cove"),
        ]}
        patrols={[]}
        attributions={attributions}
        patrolCountsByArea={counts}
        unattributedPatrolCount={0}
      />,
    );

    // Strip whitespace then find positions of each name to assert order.
    const flat = html.replace(/\s+/g, " ");
    const idxBravo = flat.indexOf("Bravo Bank");
    const idxAlpha = flat.indexOf("Alpha Reef");
    const idxCharlie = flat.indexOf("Charlie Cove");
    expect(idxBravo).toBeGreaterThan(-1);
    expect(idxAlpha).toBeGreaterThan(-1);
    expect(idxCharlie).toBeGreaterThan(-1);
    // Bravo (5) before Alpha (2 — alphabetical tiebreak before Charlie's 2).
    expect(idxBravo).toBeLessThan(idxAlpha);
    expect(idxAlpha).toBeLessThan(idxCharlie);
  });

  it("renders By-Track + By-Name columns from attribution match sources", () => {
    const counts: AreaPatrolCount[] = [
      { areaBoundaryId: "alpha", areaName: "Alpha Reef", patrolCount: 3 },
    ];
    const attributions: CoverageReportAttribution[] = [
      { patrolId: "p1", areaBoundaryId: "alpha", matchedVia: "nearest" },
      { patrolId: "p2", areaBoundaryId: "alpha", matchedVia: "nearest" },
      { patrolId: "p3", areaBoundaryId: "alpha", matchedVia: "feature-name" },
    ];

    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[makeArea("alpha", "Alpha Reef")]}
        patrols={[]}
        attributions={attributions}
        patrolCountsByArea={counts}
        unattributedPatrolCount={0}
      />,
    );

    expect(html).toContain('data-testid="boundary-table"');
    // Row content has Patrols=3 / By Track=2 / By Name=1
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toMatch(/Alpha Reef.*?>3<.*?>2<.*?>1</);
  });

  it("includes Outside-enabled-boundaries row + total in the boundary table footer", () => {
    const counts: AreaPatrolCount[] = [
      { areaBoundaryId: "alpha", areaName: "Alpha Reef", patrolCount: 4 },
    ];
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[makeArea("alpha", "Alpha Reef")]}
        patrols={[]}
        attributions={[]}
        patrolCountsByArea={counts}
        unattributedPatrolCount={3}
      />,
    );
    expect(html).toContain('data-testid="outside-row"');
    expect(html).toContain("Outside enabled boundaries");
    // Total row: 4 attributed + 3 unattributed = 7
    expect(html).toMatch(/<tfoot>[\s\S]*?Total[\s\S]*?>7<[\s\S]*?<\/tfoot>/);
  });

  it("mounts the map container and chart column when content exists", () => {
    const html = renderToStaticMarkup(
      <Page2AreaBoundarySummary
        tenantName="Mindoro MPA"
        dateRange="MAY 2026"
        enabledAreas={[makeArea("alpha", "Alpha Reef")]}
        patrols={[makePatrolStub("p1")]}
        attributions={[]}
        patrolCountsByArea={[
          { areaBoundaryId: "alpha", areaName: "Alpha Reef", patrolCount: 1 },
        ]}
        unattributedPatrolCount={0}
      />,
    );
    expect(html).toContain('data-testid="map-container"');
    expect(html).toContain('data-testid="chart-column"');
    // Map empty state should NOT appear when patrols + boundaries are present.
    expect(html).not.toContain('data-testid="map-empty"');
  });
});
