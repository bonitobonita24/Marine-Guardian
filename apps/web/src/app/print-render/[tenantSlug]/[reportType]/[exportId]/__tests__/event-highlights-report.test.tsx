// event-highlights-report.test.tsx
//
// Light RSC-style render test (renderToStaticMarkup) — same pattern as
// report-map-report-export-mode.test.tsx / coverage-report.test.tsx. No
// mocking needed: EventHighlightsReport has no client-island children, it's
// a pure server-rendered static document.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EventHighlightsReport } from "../event-highlights-report";
import type {
  EventHighlightsEventBlock,
  EventHighlightsReportData,
} from "@/server/event-highlights-report/get-event-highlights-report-data";

// ─── Fixtures ─────────────────────────────────────────────────────────────

function block(overrides: Partial<EventHighlightsEventBlock> = {}): EventHighlightsEventBlock {
  return {
    id: "e1",
    title: "Illegal Fishing Sighted",
    typeDisplay: "Illegal Fishing",
    reportedAt: new Date("2026-05-10T08:00:00.000Z"),
    municipalityName: "Puerto Galera",
    areaName: null,
    lat: 13.1,
    lon: 121.1,
    reportedByName: "Juan Dela Cruz",
    actionTaken: "Confiscated illegal gear.",
    remarks: "Vessel warned and released.",
    photoAssetIds: ["a1", "a2"],
    photoCount: 2,
    layout: "half",
    ...overrides,
  };
}

function buildData(overrides: Partial<EventHighlightsReportData> = {}): EventHighlightsReportData {
  return {
    tenant: { id: "t1", name: "Mindoro MPA", slug: "mindoro", timezone: "Asia/Manila" },
    template: {
      id: null,
      name: "Default",
      layout: "two-column",
      reportTitle: "Marine Guardian Report",
      footerNotes: null,
      municipalLogoDataUri: null,
      partnerLogoDataUri: "data:image/png;base64,",
    },
    generatedAt: new Date("2026-05-21T12:00:00.000Z"),
    filter: {
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-06-01T00:00:00.000Z"),
      municipalityId: undefined,
      protectedZoneId: undefined,
    },
    scopeTitle: "Puerto Galera",
    isRegionReport: false,
    blocks: [block()],
    totalQualifying: 1,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("EventHighlightsReport", () => {
  it("renders both a half block (2 photos) and a full block (3+ photos) with the correct layout classes", () => {
    const halfBlock = block({ id: "e_half", photoAssetIds: ["a1", "a2"], photoCount: 2, layout: "half" });
    const fullBlock = block({
      id: "e_full",
      photoAssetIds: ["b1", "b2", "b3"],
      photoCount: 3,
      layout: "full",
    });
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [halfBlock, fullBlock], totalQualifying: 2 })} />,
    );

    // Class names per the component source: `hl-block hl-block-${layout}`.
    expect(html).toContain('class="hl-block hl-block-half"');
    expect(html).toContain('class="hl-block hl-block-full"');
    // Both event-highlight-block testids present.
    expect(html.match(/data-testid="event-highlight-block"/g)).toHaveLength(2);
  });

  it("renders photo <img> tags with the /api/assets/…?w=1400 src", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block({ photoAssetIds: ["a1", "a2"] })] })} />,
    );
    expect(html).toContain('src="/api/assets/a1?w=1400"');
    expect(html).toContain('src="/api/assets/a2?w=1400"');
  });

  it("renders caption fields (title, Action Taken, Remarks, Reporter) and omits PRIORITY", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block()] })} />,
    );
    expect(html).toContain("Illegal Fishing Sighted");
    expect(html).toContain("Action Taken:");
    expect(html).toContain("Confiscated illegal gear.");
    expect(html).toContain("Remarks:");
    expect(html).toContain("Vessel warned and released.");
    expect(html).toContain("Reporter:");
    expect(html).toContain("Juan Dela Cruz");
    expect(html).not.toMatch(/PRIORITY/i);
  });

  it("seeds window.__renderPending to the total photo count across blocks", () => {
    const b1 = block({ id: "e1", photoAssetIds: ["a1", "a2"] }); // 2
    const b2 = block({ id: "e2", photoAssetIds: ["b1", "b2", "b3"], layout: "full" }); // 3
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [b1, b2], totalQualifying: 2 })} />,
    );
    expect(html).toContain("window.__renderPending = 5;");
    // The zero-photo fallback script (`window.__renderReady = true;` as the
    // ENTIRE script body) must not be the one emitted — only the counter
    // variant, where __renderReady is set conditionally inside __hlPhotoLoaded.
    expect(html).not.toContain("<script>window.__renderReady = true;</script>");
  });

  it("flips window.__renderReady directly and shows the empty state when blocks is empty", () => {
    const html = renderToStaticMarkup(<EventHighlightsReport data={buildData({ blocks: [], totalQualifying: 0 })} />);
    expect(html).toContain("window.__renderReady = true;");
    expect(html).not.toContain("__renderPending");
    expect(html).toContain("No event highlights in the selected scope.");
  });

  it('renders the "Showing N of M qualifying events" footer text', () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block()], totalQualifying: 5 })} />,
    );
    expect(html).toContain("Showing 1 of 5 qualifying events");
  });
});
