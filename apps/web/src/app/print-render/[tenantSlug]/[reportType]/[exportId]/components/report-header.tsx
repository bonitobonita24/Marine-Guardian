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
  /** Big, bold, dominant title line. Defaults to the fixed brand title. */
  mainTitle?: string;
  /** Municipality name line — omitted entirely when null/undefined so a
   *  template with no municipality concept doesn't render an empty line. */
  municipalityName?: string | null;
  /** Per-page / per-section report title (smaller, third line). */
  reportTitle: string;
  /** Date range of coverage (smallest, muted, fourth line). */
  dateRange: string;
  municipalLogoUrl?: string | null;
  partnerLogoUrl?: string | null;
}

export function ReportHeader({
  mainTitle,
  municipalityName,
  reportTitle,
  dateRange,
  municipalLogoUrl,
  partnerLogoUrl,
}: ReportHeaderProps) {
  const hasMunicipality =
    municipalityName !== null && municipalityName !== undefined && municipalityName.length > 0;
  // Owner mockup 2026-07-06: big line 1 = "LGU <municipality name>", line 2 =
  // "Blue Alliance Monitoring". For a report with no single municipality
  // (regional / all-municipality), fall back to the brand line as the title.
  const line1 = hasMunicipality ? `LGU ${municipalityName}` : (mainTitle ?? "Blue Alliance Monitoring");
  return (
    <header className="pr-header" role="banner">
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
      <div className="pr-header-text">
        <h1 className="pr-header-main-title">{line1}</h1>
        {hasMunicipality ? <p className="pr-header-brand">Blue Alliance Monitoring</p> : null}
        <p className="pr-header-report-title">{reportTitle}</p>
        <p className="pr-header-date-range">{dateRange}</p>
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
    .pr-header-logos { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; }
    .pr-header-logo { max-height: 60px; max-width: 90px; object-fit: contain; }
    .pr-header-logo-placeholder {
      width: 60px; height: 60px; flex: 0 0 auto; border-radius: 50%;
      background: #1d5b78;
    }
    .pr-header-text { flex: 1 1 auto; min-width: 0; text-align: left; }
    h1.pr-header-main-title {
      font-size: 26px; font-weight: 800; margin: 0 0 1px; color: #111;
      line-height: 1.15; letter-spacing: -0.01em;
    }
    p.pr-header-brand { font-size: 20px; font-weight: 700; margin: 0 0 3px; color: #111; line-height: 1.15; }
    p.pr-header-report-title { font-size: 11px; font-weight: 500; margin: 0 0 2px; color: #374151; }
    p.pr-header-date-range { font-size: 9px; color: #6b7280; margin: 0; }
`;
