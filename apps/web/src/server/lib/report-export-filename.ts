// Download filenames for generated ReportExport files.
//
// 2026-07-20 — the "Generate Printable Report" dialog became a CHECKLIST of
// report types (Summary / Detailed / Event Highlights), so a single Generate
// click can now drop two or three PDFs into the user's Downloads folder at
// once. The previous name (`report_map-2026-07-03.pdf`, built inline in the
// download Route Handler) collided between them and said nothing about what
// was inside. The name now carries SCOPE + TYPE + DATE RANGE:
//
//   apo-reef-natural-park_summary_2026-01-01_2026-07-20.pdf
//   apo-reef-natural-park_detailed_2026-01-01_2026-07-20.pdf
//   apo-reef-natural-park_event-highlights_2026-01-01_2026-07-20.pdf
//
// This module is the ONE place a report-export download name is produced —
// both the PDF route and the PPTX route call `buildReportExportFilename`, so
// the two can never drift. The pure parts (slug, type token, assembly) are
// exported separately so they are unit-testable without a database.

import { prisma } from "@marine-guardian/db";

/** yyyy-mm-dd in UTC. */
export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Filesystem-safe slug for a scope name.
 *
 * Lowercase, spaces/punctuation collapsed to single hyphens, diacritics
 * stripped, no leading/trailing hyphen. Returns "" for a name that slugs to
 * nothing (e.g. "***") so the caller can fall back rather than emit a
 * filename starting with "_".
 */
export function slugifyScopeName(name: string): string {
  return name
    .normalize("NFD")
    // Combining marks — strip accents so "Compostela Ñ" → "compostela-n".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The scope-name fallback when a report is not scoped to any one place. */
export const DEFAULT_SCOPE_SLUG = "all-municipalities";

/**
 * reportType (+ exportMode for report_map) → the filename's TYPE token.
 *
 * Mirrors the dialog's three checkboxes:
 *   report_map + exportMode "charts" → "summary"   (Summary of Events/Activities)
 *   report_map + exportMode "lists"  → "detailed"  (Detailed Report)
 *   event_highlights                 → "event-highlights"
 *
 * "combined" (and an absent/unknown exportMode) still maps to "report": the
 * checklist never produces a combined export any more, but historical rows
 * and any non-dialog caller must still get a sane name.
 */
export function reportTypeToken(
  reportType: string,
  exportMode: string | null,
): string {
  if (reportType === "event_highlights") return "event-highlights";
  if (reportType === "report_map") {
    if (exportMode === "charts") return "summary";
    if (exportMode === "lists") return "detailed";
    return "report";
  }
  // Unknown/other report types keep their enum name, hyphenated.
  return slugifyScopeName(reportType) || "report";
}

export interface ReportExportFilenameParts {
  /** Human scope name; falsy/blank falls back to DEFAULT_SCOPE_SLUG. */
  scopeName: string | null;
  reportType: string;
  exportMode: string | null;
  /** ISO strings straight off paramsJson; null when the row carries none. */
  from: string | null;
  to: string | null;
  /** Used for the date segment when from/to are absent. */
  fallbackDate: Date;
  extension: "pdf" | "pptx";
}

/**
 * Assemble the download filename. Pure — every input is already resolved.
 *
 * Date segment is `<from>_<to>` when the row carries a range (the normal
 * case: the dialog always sends both), and a single `<completedAt>` stamp
 * otherwise, so a name is never left with a dangling separator.
 */
export function buildFilenameFromParts(
  parts: ReportExportFilenameParts,
): string {
  const scopeSlug =
    parts.scopeName !== null && slugifyScopeName(parts.scopeName) !== ""
      ? slugifyScopeName(parts.scopeName)
      : DEFAULT_SCOPE_SLUG;

  const type = reportTypeToken(parts.reportType, parts.exportMode);

  const fromDate = toValidDate(parts.from);
  const toDate = toValidDate(parts.to);
  const dates =
    fromDate !== null && toDate !== null
      ? `${formatYmd(fromDate)}_${formatYmd(toDate)}`
      : formatYmd(parts.fallbackDate);

  return `${scopeSlug}_${type}_${dates}.${parts.extension}`;
}

function toValidDate(iso: string | null): Date | null {
  if (iso === null || iso === "") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The subset of `ReportExport.paramsJson` this module reads. */
export interface ReportExportParams {
  exportMode: string | null;
  from: string | null;
  to: string | null;
  municipalityId: string | null;
  protectedZoneId: string | null;
  province: string | null;
}

/**
 * Narrow an untyped `paramsJson` (Prisma `Json`) into the fields needed for a
 * filename. Every field is optional by design — a malformed or historical row
 * degrades to the fallbacks rather than throwing on a download.
 */
export function readReportExportParams(paramsJson: unknown): ReportExportParams {
  const p =
    typeof paramsJson === "object" && paramsJson !== null
      ? (paramsJson as Record<string, unknown>)
      : {};
  const str = (key: string): string | null => {
    const value = p[key];
    return typeof value === "string" && value !== "" ? value : null;
  };

  return {
    exportMode: str("exportMode"),
    from: str("from"),
    to: str("to"),
    municipalityId: str("municipalityId"),
    protectedZoneId: str("protectedZoneId"),
    province: str("province"),
  };
}

/**
 * Resolve the human scope NAME for a row's params.
 *
 * Precedence mirrors how the report itself titles its scope (see
 * get-report-map-report-data.ts): a scoped protected zone wins over a
 * municipality, which wins over a province-wide ("region") report; an
 * unscoped report has no place name at all and the caller falls back to
 * DEFAULT_SCOPE_SLUG.
 *
 * Both lookups are tenant-scoped — a filename must never be able to reveal
 * the name of another tenant's boundary.
 */
export async function resolveScopeName(
  tenantId: string,
  params: ReportExportParams,
): Promise<string | null> {
  if (params.protectedZoneId !== null) {
    const zone = await prisma.protectedZone.findFirst({
      where: { id: params.protectedZoneId, tenantId },
      select: { name: true },
    });
    if (zone !== null) return zone.name;
  }
  if (params.municipalityId !== null) {
    const municipality = await prisma.municipality.findFirst({
      where: { id: params.municipalityId, tenantId },
      select: { name: true },
    });
    if (municipality !== null) return municipality.name;
  }
  return params.province;
}

/**
 * The one entry point the Route Handlers use: row + extension → filename.
 */
export async function buildReportExportFilename(row: {
  tenantId: string;
  reportType: string;
  paramsJson: unknown;
  completedAt: Date | null;
}, extension: "pdf" | "pptx"): Promise<string> {
  const params = readReportExportParams(row.paramsJson);
  const scopeName = await resolveScopeName(row.tenantId, params);

  return buildFilenameFromParts({
    scopeName,
    reportType: row.reportType,
    exportMode: params.exportMode,
    from: params.from,
    to: params.to,
    fallbackDate: row.completedAt ?? new Date(),
    extension,
  });
}
