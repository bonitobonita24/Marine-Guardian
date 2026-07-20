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

  // Protected-zone scope (2026-07-20): a zone-scoped report also carries its
  // PARENT municipality, so the header must prefer the zone's own name and
  // render it unprefixed — "LGU Sablayan" was printed on an Apo Reef report.
  it("zone scope: renders the zone name alone (no LGU prefix, no brand subline) but keeps the logo slots", () => {
    const html = renderToStaticMarkup(
      <ReportHeader
        protectedZoneName="Apo Reef Natural Park"
        municipalityName="Sablayan"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );

    expect(html).toContain("Apo Reef Natural Park");
    expect(html).not.toContain("LGU");
    expect(html).not.toContain("Sablayan");
    expect(html).not.toContain("Blue Alliance Monitoring");
    // Logos/placeholders are NOT suppressed (unlike region mode).
    const placeholderMatches = html.match(/pr-header-logo-placeholder/g) ?? [];
    expect(placeholderMatches.length).toBe(2);
  });

  it("zone scope is generic — any zone name renders verbatim", () => {
    const html = renderToStaticMarkup(
      <ReportHeader
        protectedZoneName="Mangrove Sanctuary Zone 3"
        municipalityName="Calapan City"
        reportTitle="Patrol Coverage"
        dateRange="2026-02-01 — 2026-02-28"
      />,
    );

    expect(html).toContain("Mangrove Sanctuary Zone 3");
    expect(html).not.toContain("LGU Calapan City");
  });

  it("empty/null zone name falls back to the municipality line unchanged", () => {
    const htmlNull = renderToStaticMarkup(
      <ReportHeader
        protectedZoneName={null}
        municipalityName="Calapan City"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );
    expect(htmlNull).toContain("LGU Calapan City");

    const htmlEmpty = renderToStaticMarkup(
      <ReportHeader
        protectedZoneName=""
        municipalityName="Calapan City"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );
    expect(htmlEmpty).toContain("LGU Calapan City");
  });

  it("region mode still wins over a zone name", () => {
    const html = renderToStaticMarkup(
      <ReportHeader
        regionMode
        mainTitle="Occidental Mindoro"
        protectedZoneName="Apo Reef Natural Park"
        municipalityName="Sablayan"
        reportTitle="Law Enforcement Events"
        dateRange="2026-01-01 — 2026-01-31"
      />,
    );

    expect(html).toContain("Occidental Mindoro");
    expect(html).not.toContain("Apo Reef Natural Park");
    expect(html).not.toContain("pr-header-logo");
  });

  // No-scope fallback: neither zone nor municipality → the brand line.
  it("no scope: falls back to the brand title with both logo slots", () => {
    const html = renderToStaticMarkup(
      <ReportHeader reportTitle="Law Enforcement Events" dateRange="2026-01-01 — 2026-01-31" />,
    );

    expect(html).toContain("Blue Alliance Monitoring");
    expect(html).not.toContain("LGU");
    const placeholderMatches = html.match(/pr-header-logo-placeholder/g) ?? [];
    expect(placeholderMatches.length).toBe(2);
  });
});
