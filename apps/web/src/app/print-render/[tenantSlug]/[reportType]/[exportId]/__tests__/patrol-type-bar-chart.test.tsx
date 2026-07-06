// patrol-type-bar-chart.test.tsx
//
// RSC-style render test for the "Patrols by Type" bar chart (Report Map PDF,
// Patrol List section) — a plain server component (no "use client", no
// Recharts island), so it renders via renderToStaticMarkup like the other
// print-render server components (see page-2-heatmaps.test.tsx).
//
// The chart renders TWO separate per-type mini charts ("Seaborne" / "Foot"),
// each with 3 bars (Patrols / Hours (h) / Kilometers (km)) — owner directive
// 2026-07-06 (see report-map-report.tsx patrol section + components file
// header for the per-metric shared-max scaling rationale).

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
  it("renders both per-type mini charts with all three metric bars", () => {
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
    expect(html).toContain("Patrols");
    expect(html).toContain("Hours (h)");
    expect(html).toContain("Kilometers (km)");
    expect(html).toContain("Seaborne");
    expect(html).toContain("Foot");
    // Two mini charts × 3 metric bars each = 6 <rect> total.
    expect((html.match(/<rect/g) ?? []).length).toBe(6);
  });

  it("scales each metric's bars to that metric's own max across both types", () => {
    // Patrols max = 100 (seaborne), hours max = 2 (foot), km max = 50 (seaborne).
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals(
          { count: 100, hours: 1, km: 50 },
          { count: 10, hours: 2, km: 5 },
        )}
      />,
    );
    // The foot hours bar (the metric's own max) should reach the full chart
    // height (50 viewBox units) — i.e. its bar top sits at the baseline minus
    // the full chart height (y="8", baseline 58 - 50 = 8).
    expect(html).toContain('y="8"');
  });

  it("renders the sr-only alt table with per-metric seaborne/foot values", () => {
    const html = renderToStaticMarkup(
      <PatrolTypeBarChart
        totals={totals({ count: 3, hours: 4, km: 5 }, { count: 1, hours: 2, km: 3 })}
      />,
    );
    expect(html).toContain("sr-only");
    expect(html).toContain("<caption>Patrols by Type</caption>");
    expect(html).toContain("<td>3</td>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders an empty state when every metric is zero", () => {
    const html = renderToStaticMarkup(<PatrolTypeBarChart totals={totals({}, {})} />);
    expect(html).toContain('data-testid="patrol-type-bar-chart-empty"');
    expect(html).toContain("No patrol type data for this period.");
  });
});
