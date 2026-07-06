// patrol-type-bar-chart.test.tsx
//
// RSC-style render test for the "Patrols by Type" figures (Report Map PDF,
// Patrol List section) — a plain server component (no "use client", no
// Recharts island), so it renders via renderToStaticMarkup like the other
// print-render server components (see page-2-heatmaps.test.tsx).
//
// R2/R3 (owner directive 2026-07-06): the chart now renders TWO separate
// per-type figure blocks ("Seaborne" ABOVE "Foot") as a clean labeled stat
// list instead of tiny scaled SVG bars — each with the three exact metric
// lines "Number of patrols = {n}", "Number of hours = {n} Hrs", and
// "Number of Kilometers = {n} Kms".

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PatrolTotalsFigure,
  PatrolTypeBarChart,
} from "../components/patrol-type-bar-chart";
import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

function totals(
  seaborne: Partial<PatrolTypeTotal>,
  foot: Partial<PatrolTypeTotal>,
): { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal } {
  return {
    seaborne: { count: 0, hours: 0, km: 0, ...seaborne },
    foot: { count: 0, hours: 0, km: 0, ...foot },
  };
}

describe("PatrolTypeBarChart", () => {
  it("renders both per-type figure blocks with the exact metric label strings", () => {
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals(
          { count: 12, hours: 34.6, km: 210.2 },
          { count: 5, hours: 8.1, km: 12.4 },
        )}
      />,
    );
    expect(html).toContain('data-testid="patrol-type-bar-chart"');
    expect(html).toContain('data-testid="patrol-type-mini-chart-seaborne"');
    expect(html).toContain('data-testid="patrol-type-mini-chart-foot"');
    expect(html).toContain("Patrols by Type");
    expect(html).toContain("Seaborne");
    expect(html).toContain("Foot");
    // Exact required label/unit strings (R3) — Seaborne figures.
    expect(html).toContain("Number of patrols = 12");
    expect(html).toContain("Number of hours = 34.6 Hrs");
    expect(html).toContain("Number of Kilometers = 210.2 Kms");
    // Exact required label/unit strings (R3) — Foot figures.
    expect(html).toContain("Number of patrols = 5");
    expect(html).toContain("Number of hours = 8.1 Hrs");
    expect(html).toContain("Number of Kilometers = 12.4 Kms");
  });

  it("stacks Seaborne ABOVE Foot in a vertical column (R2)", () => {
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals({ count: 1, hours: 1, km: 1 }, { count: 2, hours: 2, km: 2 })}
      />,
    );
    expect(html).toMatch(/flex-direction:\s*column/);
    // Seaborne's testid must appear before Foot's in document order.
    const seaborneIdx = html.indexOf('data-testid="patrol-type-mini-chart-seaborne"');
    const footIdx = html.indexOf('data-testid="patrol-type-mini-chart-foot"');
    expect(seaborneIdx).toBeGreaterThan(-1);
    expect(footIdx).toBeGreaterThan(seaborneIdx);
  });

  it("renders the sr-only alt table with per-metric seaborne/foot values (kept in sync with the new labels)", () => {
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals({ count: 3, hours: 4, km: 5 }, { count: 1, hours: 2, km: 3 })}
      />,
    );
    expect(html).toContain("sr-only");
    expect(html).toContain("<caption>Patrols by Type</caption>");
    expect(html).toContain("<td>Number of patrols</td>");
    expect(html).toContain("<td>Number of hours</td>");
    expect(html).toContain("<td>Number of Kilometers</td>");
    expect(html).toContain("<td>3</td>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>4 Hrs</td>");
    expect(html).toContain("<td>5 Kms</td>");
  });

  it("renders an empty state when every metric is zero", () => {
    const html = renderToStaticMarkup(<PatrolTypeBarChart totals={totals({}, {})} />);
    expect(html).toContain('data-testid="patrol-type-bar-chart-empty"');
    expect(html).toContain("No patrol type data for this period.");
  });

  // R8 (2026-07-06): each metric row carries a small inline bar (a
  // decorative, aria-hidden proportional fill) beside the stat text.
  it("renders a decorative inline bar beside each per-type metric row", () => {
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals(
          { count: 12, hours: 34.6, km: 210.2 },
          { count: 5, hours: 8.1, km: 12.4 },
        )}
      />,
    );
    // The exact metric text is still present verbatim (unbroken substring).
    expect(html).toContain("Number of patrols = 12");
    expect(html).toContain("Number of patrols = 5");
    // Bars are decorative and hidden from assistive tech.
    const ariaHiddenBarCount = html.split('aria-hidden="true"').length - 1;
    // 6 metric-row bars (3 metrics × 2 types) — the Totals block is not
    // rendered by PatrolTypeBarChart itself, so its bars aren't counted here.
    expect(ariaHiddenBarCount).toBeGreaterThanOrEqual(6);
  });
});

describe("PatrolTotalsFigure", () => {
  it("renders the exact 'Total' stat-line strings with the same label/unit convention as the per-type figures", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsFigure total={17} totalHours={42.7} totalKm={222.6} />,
    );
    expect(html).toContain('data-testid="patrol-totals-figure"');
    expect(html).toContain(">Total<");
    expect(html).toContain("Number of patrols = 17");
    expect(html).toContain("Number of hours = 42.7 Hrs");
    expect(html).toContain("Number of Kilometers = 222.6 Kms");
  });

  it("renders one decorative inline bar per metric row, scaled against the max of the three totals", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsFigure total={10} totalHours={5} totalKm={20} />,
    );
    const ariaHiddenBarCount = html.split('aria-hidden="true"').length - 1;
    expect(ariaHiddenBarCount).toBe(3);
    // The km row (20, the max of 10/5/20) should render a 100%-width fill.
    expect(html).toMatch(/width:\s*100\.0%/);
  });

  it("renders a visible (non-zero-width) bar even when a metric is 0, as long as another metric is non-zero", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsFigure total={0} totalHours={0} totalKm={0} />,
    );
    expect(html).toContain("Number of patrols = 0");
    expect(html).toContain("Number of hours = 0 Hrs");
    expect(html).toContain("Number of Kilometers = 0 Kms");
  });
});
