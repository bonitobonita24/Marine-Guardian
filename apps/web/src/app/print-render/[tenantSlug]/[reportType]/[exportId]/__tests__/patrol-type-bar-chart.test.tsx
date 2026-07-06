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

import { PatrolTypeBarChart } from "../components/patrol-type-bar-chart";
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
});
