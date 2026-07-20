// Filename scheme for generated report exports (2026-07-20 report-type
// checklist). Covers the PURE layer only — `resolveScopeName` /
// `buildReportExportFilename` hit Prisma and are exercised by the route tests.

import { describe, it, expect } from "vitest";

import {
  slugifyScopeName,
  reportTypeToken,
  readReportExportParams,
  buildFilenameFromParts,
  DEFAULT_SCOPE_SLUG,
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
