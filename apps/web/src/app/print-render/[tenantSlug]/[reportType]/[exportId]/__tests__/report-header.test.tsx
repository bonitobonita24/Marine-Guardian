// report-header.test.tsx
//
// RSC-style render test for the shared print-render <ReportHeader> component
// (see ../components/report-header.tsx) — a plain server component, so it
// renders via renderToStaticMarkup like the other print-render server
// components (see patrol-type-bar-chart.test.tsx).
//
// Region-mode coverage (2026-07-13): a report_map report scoped to a whole
// PROVINCE (no single municipalityId) must render the header with the
// province name ALONE as the title — no "LGU " prefix, no "Blue Alliance
// Monitoring" brand subline, and NO logos at all (neither <img> nor the
// placeholder circle boxes). Non-region-mode behavior (single municipality,
// or the "All Municipalities" regional fallback) stays unchanged.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportHeader } from "../components/report-header";

describe("ReportHeader", () => {
  it("region mode: renders the region name alone, no LGU prefix, no brand subline, no logos", () => {
    const html = renderToStaticMarkup(
      <ReportHeader
        regionMode
        mainTitle="Occidental Mindoro"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );

    expect(html).toContain("Occidental Mindoro");
    expect(html).not.toContain("LGU");
    expect(html).not.toContain("Blue Alliance Monitoring");
    expect(html).not.toContain("pr-header-logo-placeholder");
    expect(html).not.toContain("pr-header-logo");
    expect(html).not.toContain("<img");
  });

  it("non-region mode: renders 'LGU <municipality>' title and both logo/placeholder slots", () => {
    const html = renderToStaticMarkup(
      <ReportHeader
        municipalityName="Calapan City"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );

    expect(html).toContain("LGU Calapan City");
    // Both logo slots render (as placeholders, since no logo URLs were passed).
    const placeholderMatches = html.match(/pr-header-logo-placeholder/g) ?? [];
    expect(placeholderMatches.length).toBe(2);
  });
});
