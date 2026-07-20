// Filename scheme for generated report exports (2026-07-20 report-type
// checklist). Covers the PURE layer only — `resolveScopeName` /
// `buildReportExportFilename` hit Prisma and are exercised by the route tests.

import { describe, it, expect } from "vitest";

import {
  slugifyScopeName,
  reportTypeToken,
  readReportExportParams,
  buildFilenameFromParts,
  formatYmd,
  DEFAULT_SCOPE_SLUG,
  REPORT_DISPLAY_UTC_OFFSET_MINUTES,
} from "../report-export-filename";

describe("slugifyScopeName", () => {
  it("lowercases and hyphenates a multi-word scope name", () => {
    expect(slugifyScopeName("Apo Reef Natural Park")).toBe(
      "apo-reef-natural-park",
    );
  });

  it("strips punctuation and collapses runs of separators", () => {
    expect(slugifyScopeName("San Jose (Occ. Mindoro)")).toBe(
      "san-jose-occ-mindoro",
    );
    expect(slugifyScopeName("  Baco   —  Bay  ")).toBe("baco-bay");
  });

  it("strips diacritics rather than dropping the letter", () => {
    expect(slugifyScopeName("Peñablanca")).toBe("penablanca");
  });

  it("returns an empty string when nothing survives (caller falls back)", () => {
    expect(slugifyScopeName("***")).toBe("");
  });
});

describe("reportTypeToken", () => {
  it("maps the three checklist choices to their filename tokens", () => {
    expect(reportTypeToken("report_map", "charts")).toBe("summary");
    expect(reportTypeToken("report_map", "lists")).toBe("detailed");
    expect(reportTypeToken("event_highlights", null)).toBe("event-highlights");
  });

  it("keeps a sane token for historical combined/unknown-mode rows", () => {
    expect(reportTypeToken("report_map", "combined")).toBe("report");
    expect(reportTypeToken("report_map", null)).toBe("report");
  });
});

describe("readReportExportParams", () => {
  it("extracts the filename-relevant fields", () => {
    expect(
      readReportExportParams({
        exportMode: "lists",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-07-20T00:00:00.000Z",
        protectedZoneId: "z1",
        templateId: "tpl-1",
      }),
    ).toEqual({
      exportMode: "lists",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-07-20T00:00:00.000Z",
      municipalityId: null,
      protectedZoneId: "z1",
      province: null,
    });
  });

  it("degrades to all-null on a malformed paramsJson rather than throwing", () => {
    expect(readReportExportParams(null).from).toBeNull();
    expect(readReportExportParams("nonsense").exportMode).toBeNull();
    expect(readReportExportParams({ from: 42 }).from).toBeNull();
  });
});

// ─── UTC+8 calendar-day boundary ─────────────────────────────────────────────
// Regression cover for the 2026-07-20 "filenames are one day early" defect.
//
// The range picker builds each bound in LOCAL time and ships `toISOString()`.
// At UTC+8 that means the strings below are EXACTLY what a user selecting
// 2026-01-01 → 2026-07-20 puts in paramsJson. Asserting on those literal
// instants (rather than on a mocked TZ) keeps the test honest under any
// machine timezone, including the UTC containers CI runs in.
const MANILA_MIDNIGHT_2026_01_01 = "2025-12-31T16:00:00.000Z"; // local 00:00:00.000
const MANILA_ENDOFDAY_2026_07_20 = "2026-07-20T15:59:59.999Z"; // local 23:59:59.999

describe("formatYmd", () => {
  it("uses the +08 display offset by default", () => {
    expect(REPORT_DISPLAY_UTC_OFFSET_MINUTES).toBe(480);
  });

  it("names the day the user picked, not the UTC day, at local midnight", () => {
    // The whole defect in one assertion: this instant's UTC day is 2025-12-31.
    expect(formatYmd(new Date(MANILA_MIDNIGHT_2026_01_01))).toBe("2026-01-01");
  });

  it("does not roll a local end-of-day forward into the next day", () => {
    expect(formatYmd(new Date(MANILA_ENDOFDAY_2026_07_20))).toBe("2026-07-20");
  });

  it("holds at both edges of the local day for a date-only (midnight) pick", () => {
    // A pure date-only selection has no DST to confound it — PH has observed
    // none since 1978 — so the +08 offset is constant year-round and the
    // first and last millisecond of a local day must share one calendar date.
    expect(formatYmd(new Date("2026-06-14T16:00:00.000Z"))).toBe("2026-06-15");
    expect(formatYmd(new Date("2026-06-15T15:59:59.999Z"))).toBe("2026-06-15");
    // One millisecond earlier is genuinely the previous local day.
    expect(formatYmd(new Date("2026-06-14T15:59:59.999Z"))).toBe("2026-06-14");
  });

  it("crosses a year boundary in the display timezone, not in UTC", () => {
    expect(formatYmd(new Date("2025-12-31T16:00:00.000Z"))).toBe("2026-01-01");
  });

  it("honours an explicit offset so a future tenant timezone is one argument", () => {
    const instant = new Date(MANILA_MIDNIGHT_2026_01_01);
    expect(formatYmd(instant, 0)).toBe("2025-12-31");
    expect(formatYmd(instant, 480)).toBe("2026-01-01");
  });
});

describe("buildFilenameFromParts", () => {
  const range = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-07-20T00:00:00.000Z",
    fallbackDate: new Date("2026-07-21T10:00:00.000Z"),
  };

  it("builds scope_type_from_to.pdf — the owner's stated scheme", () => {
    expect(
      buildFilenameFromParts({
        ...range,
        scopeName: "Apo Reef Natural Park",
        reportType: "report_map",
        exportMode: "charts",
        extension: "pdf",
      }),
    ).toBe("apo-reef-natural-park_summary_2026-01-01_2026-07-20.pdf");
  });

  it("names each of the three report types distinctly for one scope+range", () => {
    const base = {
      ...range,
      scopeName: "Apo Reef Natural Park",
      extension: "pdf" as const,
    };
    expect(
      buildFilenameFromParts({
        ...base,
        reportType: "report_map",
        exportMode: "lists",
      }),
    ).toBe("apo-reef-natural-park_detailed_2026-01-01_2026-07-20.pdf");
    expect(
      buildFilenameFromParts({
        ...base,
        reportType: "event_highlights",
        exportMode: null,
      }),
    ).toBe("apo-reef-natural-park_event-highlights_2026-01-01_2026-07-20.pdf");
  });

  it("falls back to all-municipalities when the report is unscoped", () => {
    expect(
      buildFilenameFromParts({
        ...range,
        scopeName: null,
        reportType: "report_map",
        exportMode: "charts",
        extension: "pdf",
      }),
    ).toBe(`${DEFAULT_SCOPE_SLUG}_summary_2026-01-01_2026-07-20.pdf`);
  });

  it("uses a single completedAt stamp when the row carries no date range", () => {
    expect(
      buildFilenameFromParts({
        scopeName: "Baco",
        reportType: "report_map",
        exportMode: "lists",
        from: null,
        to: null,
        fallbackDate: new Date("2026-07-21T10:00:00.000Z"),
        extension: "pdf",
      }),
    ).toBe("baco_detailed_2026-07-21.pdf");
  });

  it("names the range the user picked, for the exact reported defect", () => {
    // Reported 2026-07-20: a 2026-01-01 → 2026-07-20 report downloaded as
    // apo-reef-natural-park_summary_2025-12-31_2026-07-20.pdf while the PDF's
    // own header correctly read "2026-01-01 — 2026-07-20".
    expect(
      buildFilenameFromParts({
        scopeName: "Apo Reef Natural Park",
        reportType: "report_map",
        exportMode: "charts",
        from: MANILA_MIDNIGHT_2026_01_01,
        to: MANILA_ENDOFDAY_2026_07_20,
        fallbackDate: new Date("2026-07-21T10:00:00.000Z"),
        extension: "pdf",
      }),
    ).toBe("apo-reef-natural-park_summary_2026-01-01_2026-07-20.pdf");
  });

  it("applies the same day resolution to the no-range completedAt stamp", () => {
    // completedAt just before local midnight belongs to the day the user was
    // looking at, not the UTC day that has not started for them yet.
    expect(
      buildFilenameFromParts({
        scopeName: "Baco",
        reportType: "report_map",
        exportMode: "lists",
        from: null,
        to: null,
        fallbackDate: new Date("2026-07-20T16:30:00.000Z"), // local 2026-07-21 00:30
        extension: "pdf",
      }),
    ).toBe("baco_detailed_2026-07-21.pdf");
  });

  it("honours the pptx extension", () => {
    expect(
      buildFilenameFromParts({
        ...range,
        scopeName: "Baco",
        reportType: "report_map",
        exportMode: "charts",
        extension: "pptx",
      }),
    ).toBe("baco_summary_2026-01-01_2026-07-20.pptx");
  });
});
