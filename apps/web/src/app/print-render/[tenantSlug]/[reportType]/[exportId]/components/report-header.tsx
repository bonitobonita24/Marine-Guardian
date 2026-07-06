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
  mainTitle = "Marine Guardian Report",
  municipalityName,
  reportTitle,
  dateRange,
  municipalLogoUrl,
  partnerLogoUrl,
}: ReportHeaderProps) {
  return (
    <header className="pr-header" role="banner">
      <div className="pr-header-logo-slot">
        {municipalLogoUrl !== null && municipalLogoUrl !== undefined && municipalLogoUrl.length > 0 ? (
          <img
            src={municipalLogoUrl}
            alt="Municipal logo"
            className="pr-header-logo"
          />
        ) : (
          <div className="pr-header-logo-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="pr-header-center">
        <h1 className="pr-header-main-title">{mainTitle}</h1>
        {municipalityName !== null && municipalityName !== undefined && municipalityName.length > 0 ? (
          <p className="pr-header-municipality">{municipalityName}</p>
        ) : null}
        <p className="pr-header-report-title">{reportTitle}</p>
        <p className="pr-header-date-range">{dateRange}</p>
      </div>
      <div className="pr-header-logo-slot">
        {partnerLogoUrl !== null && partnerLogoUrl !== undefined && partnerLogoUrl.length > 0 ? (
          <img
            src={partnerLogoUrl}
            alt="Blue Alliance logo"
            className="pr-header-logo"
          />
        ) : (
          <div className="pr-header-logo-placeholder" aria-hidden="true" />
        )}
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
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; border-bottom: 2px solid #0f766e; padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .pr-header-logo-slot { flex: 0 0 auto; display: flex; align-items: center; }
    .pr-header-logo { max-height: 44px; max-width: 90px; object-fit: contain; }
    .pr-header-logo-placeholder { width: 90px; height: 44px; flex: 0 0 auto; }
    .pr-header-center { flex: 1 1 auto; min-width: 0; text-align: center; }
    h1.pr-header-main-title {
      font-size: 30px; font-weight: 800; margin: 0 0 3px; color: #0f766e;
      line-height: 1.15; letter-spacing: -0.01em;
    }
    p.pr-header-municipality { font-size: 13px; font-weight: 600; margin: 0 0 2px; color: #111; }
    p.pr-header-report-title { font-size: 11px; font-weight: 500; margin: 0 0 2px; color: #374151; }
    p.pr-header-date-range { font-size: 9px; color: #6b7280; margin: 0; }
`;
