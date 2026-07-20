// event-highlights-report.test.tsx
//
// Light RSC-style render test (renderToStaticMarkup) — same pattern as
// report-map-report-export-mode.test.tsx / coverage-report.test.tsx. No
// mocking needed: EventHighlightsReport has no client-island children, it's
// a pure server-rendered static document.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { expectNoDocumentScaffold } from "./assert-no-document-scaffold";

import { EventHighlightsReport, PHOTO_REQUEST_WIDTH } from "../event-highlights-report";
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
    photosShown: 2,
    photosAvailable: 2,
    photoBudgetReached: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("EventHighlightsReport", () => {
  // React #418 regression guard (2026-07-20) — browser QA confirmed this page
  // threw a hydration mismatch. Cause: the component emitted its own
  // <html><head><body> nested inside the app root layout's document, which the
  // HTML parser discards. See components/print-document-shell.tsx.
  it("emits NO nested <html>/<head>/<body> document scaffold (React #418)", () => {
    expectNoDocumentScaffold(
      renderToStaticMarkup(<EventHighlightsReport data={buildData()} />),
    );
  });

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

    // Class names per the component source: `hl-block hl-block-${layout}`,
    // plus `hl-block-first` on the leading block only (see the first-page
    // break tests below). The layout→class mapping is the invariant here.
    expect(html).toContain('class="hl-block hl-block-half hl-block-first"');
    expect(html).toContain('class="hl-block hl-block-full"');
    // Both event-highlight-block testids present.
    expect(html.match(/data-testid="event-highlight-block"/g)).toHaveLength(2);
  });

  it("renders photo <img> tags with the /api/assets/…?w= src at PHOTO_REQUEST_WIDTH", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block({ photoAssetIds: ["a1", "a2"] })] })} />,
    );
    expect(html).toContain(`src="/api/assets/a1?w=${String(PHOTO_REQUEST_WIDTH)}"`);
    expect(html).toContain(`src="/api/assets/a2?w=${String(PHOTO_REQUEST_WIDTH)}"`);
    // No photo may still request the old, heavily-oversampled width.
    expect(html).not.toContain("?w=1400");
  });

  it("requests 900px photos — sized to the printed tile, not the source frame", () => {
    // A4 portrait, 12mm margin → 186mm content; "full" layout is 3 columns
    // with a 6px gap → 60.9mm × 72mm tiles. object-fit: cover on a 1.783
    // aspect source covers 72mm × 1.783 = 128.4mm = 5.05in of image width.
    //   900 / 5.05in = 178 DPI  (above the 150 DPI print floor)
    //  1400 / 5.05in = 277 DPI  (the oversampling that drove the 22 MB PDF)
    expect(PHOTO_REQUEST_WIDTH).toBe(900);
    // /api/assets clamps to [16, 1600] and SKIPS resizing entirely when the
    // width falls outside it — serving the ~1.2 MB original. Staying in range
    // is a correctness requirement, not a nicety.
    expect(PHOTO_REQUEST_WIDTH).toBeGreaterThanOrEqual(16);
    expect(PHOTO_REQUEST_WIDTH).toBeLessThanOrEqual(1600);
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

  // ─── Total-photo-budget footer note ─────────────────────────────────────

  it("adds the photo-budget truncation note to the footer when the budget was reached", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport
        data={buildData({
          blocks: [block()],
          totalQualifying: 30,
          photosShown: 120,
          photosAvailable: 187,
          photoBudgetReached: true,
        })}
      />,
    );
    expect(html).toContain("Showing 120 of 187 photos — photo budget reached");
    // The pre-existing qualifying-events note is preserved alongside it.
    expect(html).toContain("Showing 1 of 30 qualifying events");
  });

  it("omits the photo-budget note entirely when the budget was not reached", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ photoBudgetReached: false })} />,
    );
    expect(html).not.toContain("photo budget reached");
  });

  it("still renders a block's caption text when the budget left it zero photos", () => {
    const starved = block({ id: "e_starved", photoAssetIds: [], photoCount: 6, layout: "full" });
    const html = renderToStaticMarkup(
      <EventHighlightsReport
        data={buildData({
          blocks: [starved],
          photosShown: 0,
          photosAvailable: 6,
          photoBudgetReached: true,
        })}
      />,
    );
    // Block itself survives, with its narrative intact...
    expect(html).toContain('data-testid="event-highlight-block"');
    expect(html).toContain("Confiscated illegal gear.");
    expect(html).toContain("Vessel warned and released.");
    // ...but contributes no <img> and therefore nothing to the sentinel.
    expect(html).not.toContain('class="hl-photo"');
    expect(html).toContain("window.__renderReady = true;");
  });

  // ─── First-page break (near-empty cover page) ───────────────────────────
  //
  // Reported defect: page 1 rendered with only the header (64 chars, 4 logo
  // images) and all content pushed to page 2+. Cause: `.hl-block-full` sets
  // `break-before: page`, and the guard `.hl-block:first-child.hl-block-full`
  // never matched because <ReportHeader> is the first child of
  // .hl-report-body — the first block is the SECOND child.

  it("marks the first block hl-block-first so it cannot force a leading page break", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport
        data={buildData({
          blocks: [
            block({ id: "e1", photoAssetIds: ["a1", "a2", "a3"], photoCount: 3, layout: "full" }),
            block({ id: "e2", photoAssetIds: ["b1", "b2", "b3"], photoCount: 3, layout: "full" }),
          ],
        })}
      />,
    );
    const classes = [...html.matchAll(/class="(hl-block[^"]*)"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(2);
    // First block carries the suppressor; the second keeps its page break.
    expect(classes[0]).toContain("hl-block-first");
    expect(classes[1]).not.toContain("hl-block-first");
    // Both still carry the "full" layout class — the fix must not change layout.
    expect(classes[0]).toContain("hl-block-full");
    expect(classes[1]).toContain("hl-block-full");
  });

  it("applies hl-block-first regardless of the first block's layout", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block({ layout: "half" })] })} />,
    );
    expect(html).toContain("hl-block hl-block-half hl-block-first");
  });

  it("defines .hl-block-first AFTER .hl-block-full so it wins on equal specificity", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block({ layout: "full" })] })} />,
    );
    // Both selectors are (0,1,0); source order is the only tiebreak, so a
    // reorder would silently restore the empty cover page.
    const fullIdx = html.indexOf(".hl-block-full {");
    const firstIdx = html.indexOf(".hl-block-first {");
    expect(fullIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeGreaterThan(fullIdx);
    expect(html).toContain(
      ".hl-block-first { break-before: auto; page-break-before: auto; min-height: 0; }",
    );
    // The dead :first-child guard must not come back.
    expect(html).not.toContain(".hl-block:first-child");
  });

  it("gives the first content block no page-break-before", () => {
    const html = renderToStaticMarkup(
      <EventHighlightsReport
        data={buildData({
          blocks: [
            block({ id: "e1", photoAssetIds: ["a1", "a2", "a3"], photoCount: 3, layout: "full" }),
          ],
        })}
      />,
    );
    // Resolve the cascade the way the print engine does: collect every rule
    // that matches the first block, in source order, and take the LAST
    // declaration of each break property. All selectors here are (0,1,0), so
    // source order is the tiebreak.
    const firstBlockClasses = [...html.matchAll(/class="(hl-block[^"]*)"/g)]
      .map((m) => m[1])
      .at(0);
    expect(firstBlockClasses).toBe("hl-block hl-block-full hl-block-first");

    const rules = [...html.matchAll(/\.(hl-block[\w-]*)\s*\{([^}]*)\}/g)].filter((m) =>
      (firstBlockClasses ?? "").split(" ").includes(m[1] ?? ""),
    );
    const resolve = (prop: string): string | undefined => {
      let value: string | undefined;
      for (const rule of rules) {
        const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule[2] ?? "");
        if (decl !== null) value = (decl[1] ?? "").trim();
      }
      return value;
    };
    // The defect: a leading "full" block kept `break-before: page` (or was
    // evicted by a 250mm min-height it could not satisfy under the header) and
    // page 1 rendered as an empty cover.
    expect(resolve("break-before")).toBe("auto");
    expect(resolve("page-break-before")).toBe("auto");
    // …and the 250mm floor must not push it off page 1 either: only ~248mm of
    // the 273mm A4 content box survives the ~23mm header + 2mm body padding,
    // and `break-inside: avoid` makes an over-tall block indivisible.
    expect(resolve("min-height")).toBe("0");
    expect(resolve("break-inside")).toBe("avoid");
  });

  // ─── Hydration safety (React #418) ──────────────────────────────────────

  it("emits <title> as a single text node (multi-child <title> breaks hydration)", () => {
    const html = renderToStaticMarkup(<EventHighlightsReport data={buildData()} />);
    // React inserts `<!-- -->` separators between adjacent text children. A
    // <title> cannot carry them (browsers parse its content as raw text), so
    // any separator inside <title> means the children were an array.
    const title = /<title>(.*?)<\/title>/s.exec(html)?.[1];
    expect(title).toBe("Mindoro MPA — Event Highlights — May 1, 2026 – Jun 1, 2026");
    expect(title).not.toContain("<!-- -->");
  });

  it("emits void <img> markup that round-trips through the HTML parser unchanged", () => {
    // The photo grid is injected via dangerouslySetInnerHTML. React hydration
    // compares that raw string against the DOM's re-serialized innerHTML, so
    // a self-closing ` />` (which the parser strips from void elements) would
    // mismatch on every grid — the React #418 root cause.
    const html = renderToStaticMarkup(
      <EventHighlightsReport data={buildData({ blocks: [block({ photoAssetIds: ["a1"] })] })} />,
    );
    expect(html).toContain('onerror="window.__hlPhotoLoaded()">');
    expect(html).not.toContain("window.__hlPhotoLoaded()\" />");
  });
});
