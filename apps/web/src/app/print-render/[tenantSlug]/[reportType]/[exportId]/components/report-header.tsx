/**
 * Shared print-render report header (2026-07-06 redesign, owner-provided
 * mockup) — used by EVERY print-render report template so every printed
 * page in the fleet carries the SAME header design:
 *
 *   [municipal logo]   Marine Guardian Report        [partner logo]
 *                       {municipality name}
 *                       {per-page report title}
 *                       {date range}
 *
 * Logos FLANK the page edges (justify-content: space-between on
 * .pr-header) with the 4-line title block centered between them — this
 * supersedes the earlier "logos hug the title as one centered cluster"
 * layout. "Marine Guardian Report" is the big, bold, dominant title line;
 * municipality / report title / date range step down in size below it.
 *
 * Print-safe: plain inline classes + a shared exported CSS string
 * (`reportHeaderStyles`) that each template concatenates into its OWN
 * single `<style>{...}</style>` tag — the print document tree has no
 * Tailwind layers and must stay fully self-contained (no external
 * stylesheet), so a real `<style>` import isn't an option here.
 *
 * Logos: reuse whatever logo data URI a template already resolves
 * (municipalLogoUrl / partnerLogoUrl). Either may be null/undefined — the
 * slot then renders a same-sized placeholder box so the header's flanking
 * layout never shifts based on logo presence. Some templates (Coverage,
 * Per Area) have no logo concept in their data model at all; they simply
 * never pass these props and always render the placeholder pair.
 */

export interface ReportHeaderProps {
  /** Big, bold, dominant title line. Defaults to the fixed brand title.
   *  In `regionMode`, this is the ONLY title source (the region/province
   *  name) — rendered verbatim, with no "LGU " prefix. */
  mainTitle?: string;
  /** Municipality name line — omitted entirely when null/undefined so a
   *  template with no municipality concept doesn't render an empty line.
   *  Ignored when `regionMode` is true. */
  municipalityName?: string | null;
  /**
   * PROTECTED-ZONE SCOPE (2026-07-20): the selected zone's OWN name (e.g.
   * "Apo Reef Natural Park") when the report is scoped to a ProtectedZone.
   * A zone-scoped filter always carries the parent `municipalityId` too, so
   * `municipalityName` would otherwise resolve to the parent LGU and print
   * "LGU Sablayan" for an Apo Reef report. When this is set (and
   * `regionMode` is false) it wins over `municipalityName` and is rendered
   * VERBATIM through the same unprefixed title path region mode uses — no
   * "LGU " prefix and no "Blue Alliance Monitoring" brand subline — while
   * the logo slots stay (a zone still sits inside an LGU). Generic: applies
   * to ANY protected zone, not a named special case.
   */
  protectedZoneName?: string | null;
  /** Per-page / per-section report title (smaller, third line). */
  reportTitle: string;
  /** Date range of coverage (smallest, muted, fourth line). */
  dateRange: string;
  municipalLogoUrl?: string | null;
  partnerLogoUrl?: string | null;
  /**
   * REGION MODE (2026-07-13, owner directive): set when the report is
   * scoped to a whole PROVINCE (Oriental Mindoro / Occidental Mindoro /
   * Palawan) rather than a single municipality. In this mode the header
   * renders ONLY `mainTitle` (the province name, unprefixed) — no
   * "LGU " prefix, no "Blue Alliance Monitoring" brand subline — and
   * suppresses the entire logo slot (no <img>, no placeholder circle
   * boxes). Defaults to false — every other call site is unaffected.
   */
  regionMode?: boolean;
}

export function ReportHeader({
  mainTitle,
  municipalityName,
  protectedZoneName,
  reportTitle,
  dateRange,
  municipalLogoUrl,
  partnerLogoUrl,
  regionMode = false,
}: ReportHeaderProps) {
  // Zone scope wins over the municipality line (a zone-scoped report also
  // carries its parent municipality — see `protectedZoneName` above).
  const zoneTitle =
    !regionMode &&
    protectedZoneName !== null &&
    protectedZoneName !== undefined &&
    protectedZoneName.length > 0
      ? protectedZoneName
      : null;
  const hasMunicipality =
    !regionMode &&
    zoneTitle === null &&
    municipalityName !== null &&
    municipalityName !== undefined &&
    municipalityName.length > 0;
  // Owner mockup 2026-07-06: big line 1 = "LGU <municipality name>", line 2 =
  // "Blue Alliance Monitoring". For a report with no single municipality
  // (regional / all-municipality), fall back to the brand line as the title.
  // Region mode (2026-07-13): line 1 = the region/province name ALONE, no
  // "LGU " prefix and no brand subline.
  // Zone mode (2026-07-20): line 1 = the protected zone's own name ALONE,
  // reusing region mode's unprefixed title path (logos are kept).
  const line1 = regionMode
    ? (mainTitle ?? "")
    : zoneTitle !== null
      ? zoneTitle
      : hasMunicipality
        ? `LGU ${municipalityName}`
        : (mainTitle ?? "Blue Alliance Monitoring");
  return (
    <header className="pr-header" role="banner">
      {regionMode ? null : (
        <div className="pr-header-logos">
          {municipalLogoUrl !== null && municipalLogoUrl !== undefined && municipalLogoUrl.length > 0 ? (
            <img src={municipalLogoUrl} alt="Municipal logo" className="pr-header-logo" />
          ) : (
            <div className="pr-header-logo-placeholder" aria-hidden="true" />
          )}
          {partnerLogoUrl !== null && partnerLogoUrl !== undefined && partnerLogoUrl.length > 0 ? (
            <img src={partnerLogoUrl} alt="Blue Alliance logo" className="pr-header-logo" />
          ) : (
            <div className="pr-header-logo-placeholder" aria-hidden="true" />
          )}
        </div>
      )}
      <div className="pr-header-text">
        <h1 className="pr-header-main-title">{line1}</h1>
        {hasMunicipality ? <p className="pr-header-brand">Blue Alliance Monitoring</p> : null}
        <p className="pr-header-date-range">Date Range: {dateRange}</p>
        <p className="pr-header-report-title">{reportTitle}</p>
      </div>
    </header>
  );
}

/**
 * Shared CSS — concatenate into each template's own `<style>{...}</style>`
 * template literal (e.g. `` <style>{`${reportHeaderStyles}${restOfCss}`}</style> ``).
 * Kept as a plain string (not a CSS module / stylesheet) so it works inside
 * the print document's fully self-contained, Tailwind-layer-free tree.
 */
export const reportHeaderStyles = `
    .pr-header {
      display: flex; justify-content: flex-start; align-items: center;
      gap: 18px; border-bottom: 2px solid #0f766e; padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .pr-header-logos { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
    /* Logos sized to the (smaller) title block, both aligned to the same height
       so the rounded municipal logo lines up with the Blue Alliance logo. Owner
       2026-07-12: shrink the header a little (title + logos) for the portrait page. */
    .pr-header-logo { height: 66px; width: auto; max-width: 92px; object-fit: contain; }
    .pr-header-logo-placeholder {
      width: 66px; height: 66px; flex: 0 0 auto; border-radius: 50%;
      background: #1d5b78;
    }
    .pr-header-text { flex: 1 1 auto; min-width: 0; text-align: left; }
    h1.pr-header-main-title {
      font-size: 18px; font-weight: 800; margin: 0 0 1px; color: #111;
      line-height: 1.2; letter-spacing: -0.01em;
    }
    p.pr-header-brand { font-size: 15px; font-weight: 700; margin: 0 0 2px; color: #111; line-height: 1.2; }
    p.pr-header-date-range { font-size: 12px; font-weight: 500; color: #374151; margin: 0 0 1px; }
    p.pr-header-report-title { font-size: 12px; font-weight: 500; margin: 0; color: #374151; }
`;
