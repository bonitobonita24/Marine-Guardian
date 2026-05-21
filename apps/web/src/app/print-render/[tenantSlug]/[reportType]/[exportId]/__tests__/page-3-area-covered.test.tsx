// page-3-area-covered.test.tsx
//
// RSC-style test for Page 3 — coverage table content, ranking, Est badges,
// footer notes, empty state, and missing-tracks callout. The Recharts client
// island (AreaCoveredChart) is mocked because it requires a DOM and is
// exercised via Puppeteer integration in the pdf-render pipeline.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../components/area-covered-chart", () => ({
  AreaCoveredChart: () => null,
}));

import { Page3AreaCovered } from "../page-3-area-covered";
import type { BoundaryCoverage } from "@marine-guardian/shared/lib/coverage-clip";

function row(
  id: string,
  name: string,
  patrolsCount: number,
  coverageKm: number,
  coverageHrs: number,
  hrsEstimatedCount: number,
): BoundaryCoverage {
  return {
    areaBoundaryId: id,
    areaName: name,
    patrolsCount,
    coverageKm,
    coverageHrs,
    hrsEstimatedCount,
  };
}

describe("Page3AreaCovered", () => {
  it("renders the section frame with section header + methodology footer", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 2, 4.2, 1.6, 2)]}
        missingTracksCount={0}
      />,
    );
    expect(html).toContain("Page 3 — Area Covered");
    expect(html).toContain('data-testid="page-3-footer-notes"');
    expect(html).toContain("Coverage KMS = clipped length");
  });

  it("forces page-break-before: always so Page 3 starts on a new physical page", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered areaCoverage={[]} missingTracksCount={0} />,
    );
    expect(html).toMatch(/page-break-before:\s*always/);
  });

  it("shows empty state when areaCoverage is an empty array", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered areaCoverage={[]} missingTracksCount={0} />,
    );
    expect(html).toContain('data-testid="page-3-empty"');
    expect(html).toContain("No coverage in monitored boundaries for this period.");
  });

  it("renders the coverage table with one row per boundary sorted by coverageKm DESC", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[
          row("b1", "Alpha Reef", 2, 1.5, 0.8, 2),
          row("b2", "Bravo Bank", 5, 12.4, 6.2, 5),
          row("b3", "Charlie Cove", 0, 0, 0, 0),
        ]}
        missingTracksCount={0}
      />,
    );
    expect(html).toContain('data-testid="coverage-table"');
    // Bravo (12.4 km) must appear BEFORE Alpha (1.5 km).
    const idxBravo = html.indexOf("Bravo Bank");
    const idxAlpha = html.indexOf("Alpha Reef");
    const idxCharlie = html.indexOf("Charlie Cove");
    expect(idxBravo).toBeGreaterThan(-1);
    expect(idxAlpha).toBeGreaterThan(idxBravo);
    expect(idxCharlie).toBeGreaterThan(idxAlpha);
  });

  it("breaks coverageKm ties alphabetically by areaName ASC", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[
          row("b1", "Zulu Zone", 1, 5.0, 2.0, 1),
          row("b2", "Alpha Reef", 1, 5.0, 2.0, 1),
          row("b3", "Mike Marina", 1, 5.0, 2.0, 1),
        ]}
        missingTracksCount={0}
      />,
    );
    const idxAlpha = html.indexOf("Alpha Reef");
    const idxMike = html.indexOf("Mike Marina");
    const idxZulu = html.indexOf("Zulu Zone");
    expect(idxAlpha).toBeLessThan(idxMike);
    expect(idxMike).toBeLessThan(idxZulu);
  });

  it("shows an Est. badge on rows where hrsEstimatedCount > 0", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[
          row("b1", "Alpha Reef", 2, 4.2, 1.6, 2),
          row("b2", "Bravo Bank", 0, 0, 0, 0),
        ]}
        missingTracksCount={0}
      />,
    );
    expect(html).toContain('data-testid="est-badge-b1"');
    expect(html).not.toContain('data-testid="est-badge-b2"');
  });

  it("emphasises the Est. label in the footer when any row is estimated", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 2, 4.2, 1.6, 2)]}
        missingTracksCount={0}
      />,
    );
    expect(html).toContain('data-testid="est-footer-callout"');
  });

  it("renders a footer callout line when missingTracksCount > 0", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 1, 2.0, 1.0, 1)]}
        missingTracksCount={3}
      />,
    );
    expect(html).toContain('data-testid="missing-tracks-note"');
    expect(html).toContain("3");
    expect(html).toContain("patrols have");
  });

  it("uses singular 'patrol has' in the missing-tracks note when missingTracksCount === 1", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 1, 2.0, 1.0, 1)]}
        missingTracksCount={1}
      />,
    );
    expect(html).toContain("patrol has");
    expect(html).not.toContain("patrols have");
  });

  it("omits the missing-tracks footer line when missingTracksCount === 0", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 1, 2.0, 1.0, 1)]}
        missingTracksCount={0}
      />,
    );
    expect(html).not.toContain('data-testid="missing-tracks-note"');
  });

  it("computes totals row from the sum of all coverage rows", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[
          row("b1", "Alpha", 2, 3.5, 1.5, 2),
          row("b2", "Bravo", 3, 6.5, 3.0, 3),
        ]}
        missingTracksCount={0}
      />,
    );
    // Total patrols: 2 + 3 = 5, km: 10.00, hrs: 4.5
    expect(html).toMatch(/<tfoot>[\s\S]*Total[\s\S]*5[\s\S]*10\.00[\s\S]*4\.5[\s\S]*<\/tfoot>/);
  });

  it("mounts the chart column when there is at least one boundary row", () => {
    const html = renderToStaticMarkup(
      <Page3AreaCovered
        areaCoverage={[row("b1", "Alpha Reef", 1, 2.0, 1.0, 1)]}
        missingTracksCount={0}
      />,
    );
    expect(html).toContain('data-testid="page-3-chart-column"');
    expect(html).toContain("Coverage KMS by Boundary");
  });
});
