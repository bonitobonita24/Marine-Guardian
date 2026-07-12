// patrol-type-bar-chart.test.tsx
//
// RSC-style render test for the "Total Patrols" summary table (Report Map PDF,
// Patrol List section) — a plain server component (no "use client", no chart
// island), so it renders via renderToStaticMarkup like the other print-render
// server components (see page-2-heatmaps.test.tsx).
//
// Owner mockup 2026-07-13 ("Patrol Review"): the section's former per-type
// figure/bar blocks (PatrolTypeBarChart + PatrolTotalsFigure) are replaced by
// a single three-column table — Foot / Seaborne / Total rows × No. of Patrols /
// Time / Distance. Total = Foot + Seaborne (internally reconciled).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PatrolTotalsTable,
  SEABORNE_COLOR,
  FOOT_COLOR,
} from "../components/patrol-type-bar-chart";
import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

function type(partial: Partial<PatrolTypeTotal>): PatrolTypeTotal {
  return { count: 0, hours: 0, km: 0, ...partial };
}

describe("PatrolTotalsTable", () => {
  it("renders the three-column table with Foot, Seaborne, and Total rows", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsTable
        seaborne={type({ count: 329, hours: 1974, km: 2477.8 })}
        foot={type({ count: 62, hours: 276.5, km: 474.1 })}
      />,
    );

    expect(html).toContain('data-testid="total-patrols-table"');
    expect(html).toContain("Total Patrols");
    // Column headers (mockup wording).
    expect(html).toContain("No. of Patrols");
    expect(html).toContain("Time");
    expect(html).toContain("Distance (Kms)");
    // Row labels.
    expect(html).toContain("Foot Patrol");
    expect(html).toContain("Seaborne Patrol");
    expect(html).toContain('data-testid="total-patrols-row-total"');
  });

  it("formats counts (thousands) and 1-decimal hours/km with unit suffixes", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsTable
        seaborne={type({ count: 329, hours: 1974, km: 2477.8 })}
        foot={type({ count: 62, hours: 276.5, km: 474.1 })}
      />,
    );

    // Foot row values.
    expect(html).toContain("276.5 Hrs");
    expect(html).toContain("474.1 Kms");
    // Seaborne row values (thousands separator on km).
    expect(html).toContain("1,974.0 Hrs");
    expect(html).toContain("2,477.8 Kms");
  });

  it("computes Total as the sum of Foot + Seaborne", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsTable
        seaborne={type({ count: 329, hours: 1974, km: 2477.8 })}
        foot={type({ count: 62, hours: 276.5, km: 474.1 })}
      />,
    );

    // 62 + 329 = 391 patrols; 276.5 + 1974 = 2,250.5 Hrs; 474.1 + 2477.8 = 2,951.9 Kms.
    expect(html).toContain("391");
    expect(html).toContain("2,250.5 Hrs");
    expect(html).toContain("2,951.9 Kms");
  });

  it("tints Seaborne green and Foot orange (report-wide legend convention)", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsTable
        seaborne={type({ count: 1, hours: 1, km: 1 })}
        foot={type({ count: 1, hours: 1, km: 1 })}
      />,
    );

    expect(SEABORNE_COLOR).toBe("#16A34A");
    expect(FOOT_COLOR).toBe("#F97316");
    // Both type-tint colors appear as inline row colors.
    expect(html.toLowerCase()).toContain("#16a34a");
    expect(html.toLowerCase()).toContain("#f97316");
  });

  it("renders zeros cleanly when there are no patrols", () => {
    const html = renderToStaticMarkup(
      <PatrolTotalsTable seaborne={type({})} foot={type({})} />,
    );

    expect(html).toContain('data-testid="total-patrols-table"');
    expect(html).toContain("0.0 Hrs");
    expect(html).toContain("0.0 Kms");
  });
});
