/**
 * Event Highlights PDF render — A4 portrait photo-collage report.
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for window.__renderReady, set once every rendered photo <img> has
 * loaded (or errored) — mirrors report-map-report.tsx's map-island sentinel
 * pattern, but counts <img> loads instead of Leaflet map-ready signals.
 *
 * One .hl-block per qualifying event (see get-event-highlights-report-data.ts):
 *   - "half" layout (≤2 photos): a fixed min-height so two blocks stack per
 *     A4 portrait page.
 *   - "full" layout (>2 photos): forces a fresh page and fills it.
 *
 * Empty state (data.blocks.length === 0): a single centered "no highlights"
 * page; the sentinel resolves immediately (zero images to wait for).
 */

import type {
  EventHighlightsEventBlock,
  EventHighlightsReportData,
} from "@/server/event-highlights-report/get-event-highlights-report-data";
import { ReportHeader, reportHeaderStyles } from "./components/report-header";
import { PrintDocumentShell } from "./components/print-document-shell";

/**
 * Width (px) requested from /api/assets for every collage photo.
 *
 * Sized to the PRINTED dimensions, not to the source frame. A4 portrait with
 * a 12mm margin gives a 186mm content width; the photo grid uses gap: 6px
 * (≈1.59mm). The binding case is the "full" layout — 3 columns, tiles
 * 60.9mm × 72mm. Source photos are 16:9-ish (measured 4080×2288, aspect
 * 1.783) and are drawn with `object-fit: cover`, so the browser scales the
 * image to cover the tile HEIGHT and crops the width:
 *
 *   covered image width = 72mm × 1.783 = 128.4mm = 5.05in
 *
 * DPI arithmetic at that printed size:
 *   w=1400 → 1400 / 5.05in = 277 DPI   (previous value — heavily oversampled)
 *   w=900  →  900 / 5.05in = 178 DPI   ← chosen
 *   w=800  →  800 / 5.05in = 158 DPI   (at the 150 DPI print floor)
 *
 * The "half" layout is looser — 2 columns, 92.2mm × 55mm tiles, covered width
 * 55mm × 1.783 = 98.1mm = 3.86in → 900 / 3.86in = 233 DPI.
 *
 * 900 lands at 178 DPI on full tiles and 233 DPI on half tiles: inside the
 * 200–300 DPI target on half tiles, above the 150 DPI floor on full tiles,
 * and ~2.2× lighter than w=1400 in bytes (measured mean 104,290 B vs
 * 225,580 B over 14 real ER photos).
 *
 * ⚠ Must stay inside the API's [16, 1600] clamp. /api/assets treats an
 * OUT-OF-RANGE width as "no width" and skips resizing entirely, serving the
 * ~1.2 MB original — so an out-of-range value here silently inflates the PDF
 * rather than clamping.
 */
export const PHOTO_REQUEST_WIDTH = 900;

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmtDate(d: Date | undefined): string {
  if (d === undefined) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function fmtDateRange(
  from: Date | undefined,
  to: Date | undefined,
  timeZone: string,
): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (from === undefined && to === undefined) return "All dates";
  if (from !== undefined && to !== undefined) {
    return `${fmt.format(from)} – ${fmt.format(to)}`;
  }
  if (from !== undefined) return `From ${fmt.format(from)}`;
  return `To ${fmt.format(to)}`;
}

function fmtEventDate(d: Date | null, timeZone: string): string {
  if (d === null) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtLatLon(v: number): string {
  return v.toFixed(5);
}

/** Minimal HTML-attribute escaper for the raw `dangerouslySetInnerHTML`
 *  photo markup below (asset ids are Prisma cuids; titles are free text). */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Event highlight block (one qualifying event) ──────────────────────────

interface EventHighlightBlockProps {
  block: EventHighlightsEventBlock;
  timeZone: string;
  /** True for the first block in the document — suppresses the "full" layout's
   *  forced page break so content starts on page 1 (see .hl-block-first). */
  isFirst: boolean;
}

function EventHighlightBlock({ block, timeZone, isFirst }: EventHighlightBlockProps) {
  const metaParts: string[] = [];
  if (block.typeDisplay.length > 0) metaParts.push(block.typeDisplay);
  const formattedDate = fmtEventDate(block.reportedAt, timeZone);
  if (formattedDate.length > 0) metaParts.push(formattedDate);

  const locationParts: string[] = [];
  if (block.municipalityName !== null) locationParts.push(block.municipalityName);
  if (block.areaName !== null) locationParts.push(block.areaName);
  let locationLine = locationParts.join(" — ");
  if (block.lat !== null && block.lon !== null) {
    const coords = `(${fmtLatLon(block.lat)}, ${fmtLatLon(block.lon)})`;
    locationLine = locationLine.length > 0 ? `${locationLine} ${coords}` : coords;
  }

  const photoGridClass =
    block.layout === "half" ? "hl-photo-grid hl-photo-grid-half" : "hl-photo-grid hl-photo-grid-full";

  // Raw HTML (not JSX onLoad/onError props): this file is a Server Component
  // with no client-side hydration boundary, so a JS event-handler prop can't
  // be passed to a native <img> here. Plain HTML `onload`/`onerror`
  // attributes work fine in the Puppeteer-rendered static page — same
  // mechanism as the top-level sentinel <script> tag below.
  const photosHtml = block.photoAssetIds
    .map((assetId) => {
      const src = `/api/assets/${escapeHtmlAttr(assetId)}?w=${String(PHOTO_REQUEST_WIDTH)}`;
      const alt = escapeHtmlAttr(`Photo: ${block.title}`);
      // NOTE: ends with `>` — NOT the XHTML-style ` />`. `<img>` is a void
      // element, so the HTML parser drops the self-closing slash; the DOM
      // then re-serializes this node WITHOUT it. React hydration compares
      // `dangerouslySetInnerHTML.__html` against the live `element.innerHTML`,
      // so a trailing ` />` here never round-trips and mismatches on every
      // single photo grid (React #418). Keeping the markup byte-identical to
      // what the parser produces makes hydration a no-op.
      return `<img class="hl-photo" src="${src}" alt="${alt}" loading="eager" onload="window.__hlPhotoLoaded()" onerror="window.__hlPhotoLoaded()">`;
    })
    .join("");

  return (
    <div
      className={`hl-block hl-block-${block.layout}${isFirst ? " hl-block-first" : ""}`}
      data-testid="event-highlight-block"
    >
      <div className={photoGridClass} dangerouslySetInnerHTML={{ __html: photosHtml }} />
      <div className="hl-caption">
        <h2 className="hl-title">{block.title}</h2>
        {metaParts.length > 0 ? <p className="hl-meta">{metaParts.join(" · ")}</p> : null}
        {locationLine.length > 0 ? <p className="hl-location">{locationLine}</p> : null}
        {block.actionTaken !== null ? (
          <p className="hl-field">
            <span className="hl-field-label">Action Taken:</span> {block.actionTaken}
          </p>
        ) : null}
        {block.remarks !== null ? (
          <p className="hl-field">
            <span className="hl-field-label">Remarks:</span> {block.remarks}
          </p>
        ) : null}
        {block.reportedByName !== null ? (
          <p className="hl-field">
            <span className="hl-field-label">Reporter:</span> {block.reportedByName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

interface EventHighlightsReportProps {
  data: EventHighlightsReportData;
}

export function EventHighlightsReport({ data }: EventHighlightsReportProps) {
  const dateRange = fmtDateRange(data.filter.from, data.filter.to, data.tenant.timezone);
  const generatedAt = fmtDate(data.generatedAt) || data.generatedAt.toISOString();

  // Every rendered photo <img> across every block — the sentinel counter.
  const totalPhotoImages = data.blocks.reduce(
    (sum, b) => sum + b.photoAssetIds.length,
    0,
  );

  const reportHeaderProps = data.isRegionReport
    ? {
        municipalLogoUrl: null,
        partnerLogoUrl: null,
        municipalityName: null,
        regionMode: true as const,
        reportTitle: "Event Highlights",
        dateRange,
        ...(data.scopeTitle !== null ? { mainTitle: data.scopeTitle } : {}),
      }
    : {
        municipalLogoUrl: data.template.municipalLogoDataUri,
        partnerLogoUrl: data.template.partnerLogoDataUri,
        regionMode: false as const,
        reportTitle: "Event Highlights",
        dateRange,
        mainTitle: data.scopeTitle ?? "All Municipalities",
      };

  const css = `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    /* html AND body must be white — see report-map-report.tsx's identical
       comment: the app's global dark theme otherwise paints into the print
       margin area, producing a solid black frame around every page. */
    html { background: #fff !important; }
    body {
      font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #111 !important;
      background: #fff !important;
      margin: 0; padding: 0; font-size: 11px; line-height: 1.4;
    }
    ${reportHeaderStyles}
    .hl-report-body { padding: 8px 24px 4px; }
    .hl-footer {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 10px;
      font-size: 9px; color: #6b7280;
    }
    .hl-footer-notes { max-width: 70%; }
    /* "half" blocks (≤2 photos): two stack per A4 portrait page. */
    .hl-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
    .hl-block-half { min-height: 120mm; }
    /* "full" blocks (>2 photos): each starts on its own fresh page and
       fills it. */
    .hl-block-full {
      break-before: page; page-break-before: always;
      min-height: 250mm;
    }
    /* The FIRST block must never be pushed off page 1 — otherwise page 1
       renders as a near-empty cover carrying only the report header.

       TWO independent mechanisms could push it, and BOTH must be neutralised:

       (1) break-before. Previously guarded by a :first-child qualifier on the
       block element, which NEVER matched: ReportHeader renders a
       <header class="pr-header"> as the first child of .hl-report-body, so the
       first .hl-block is the SECOND child. Now marked explicitly in JSX
       (hl-block-first) instead of being inferred from DOM position.

       (2) min-height + break-inside: avoid — the REAL residual cause of the
       "content starts on page 2" bug, which survived the (1) fix. A4 portrait
       geometry, at 96 CSS px/in (1px = 0.2646mm):

           page box            297mm − 2×12mm margin   = 273.0mm
           .pr-header          66px logo + 8px pad + 2px border + 10px margin
                               = 86px                  =  22.8mm
           .hl-report-body     8px padding-top         =   2.1mm
           ────────────────────────────────────────────────────────
           space left on page 1                        = 248.1mm

       .hl-block-full asks for min-height: 250mm — 1.9mm MORE than page 1 can
       offer. With break-inside: avoid, the block is indivisible, does not fit,
       and the whole thing is moved to page 2, leaving the empty body the owner
       screenshotted. The 250mm floor exists only to make a "full" block FILL
       its own page; a first block that shares page 1 with the header has no
       page to fill, so the floor is dropped for it. Natural height still fits:
       MAX_PHOTOS_PER_BLOCK is 8 over 3 columns = 3 rows × 72mm + 2 × 6px gap
       + 8px grid margin + caption ≈ 237mm < 248.1mm.

       Same specificity as .hl-block-full (0,1,0) — must stay AFTER it in
       source order to win. */
    .hl-block-first { break-before: auto; page-break-before: auto; min-height: 0; }
    .hl-photo-grid { display: grid; gap: 6px; margin-bottom: 8px; }
    .hl-photo-grid-half { grid-template-columns: repeat(2, 1fr); }
    .hl-photo-grid-full { grid-template-columns: repeat(3, 1fr); }
    img.hl-photo {
      display: block; width: 100%; height: 72mm; object-fit: cover;
      border-radius: 4px; border: 1px solid #e5e7eb;
    }
    .hl-block-half img.hl-photo { height: 55mm; }
    .hl-caption { padding: 0 2px; }
    h2.hl-title { font-size: 14px; font-weight: 700; margin: 0 0 2px; color: #111; }
    p.hl-meta { font-size: 10px; font-weight: 500; color: #374151; margin: 0 0 2px; }
    p.hl-location { font-size: 10px; color: #6b7280; margin: 0 0 4px; }
    p.hl-field { font-size: 10px; color: #111; margin: 0 0 2px; }
    span.hl-field-label { font-weight: 600; color: #374151; }
    .hl-empty-page {
      display: flex; align-items: center; justify-content: center;
      min-height: 220mm; text-align: center; color: #6b7280; font-size: 13px;
      font-style: italic;
    }
  `;

  return (
    /* No <html>/<head>/<body> here — this page renders inside the app root
       layout's document. Emitting a nested document was the React #418
       hydration-mismatch root cause; see components/print-document-shell.tsx.

       Single template-string title child — NOT `{a} — text — {b}`. React
       requires <title> children to collapse to ONE string. */
    <PrintDocumentShell
      title={`${data.tenant.name} — Event Highlights — ${dateRange}`}
      css={css}
      /* Render-ready sentinel: mirrors report-map-report.tsx's map-island
         counter, but counts photo <img> loads (each photo's inline
         onload/onerror HTML attribute — see EventHighlightBlock — invokes
         window.__hlPhotoLoaded()). Zero-photo fallback flips
         window.__renderReady directly (nothing would ever decrement a
         __renderPending counter otherwise). */
      gateScript={
        totalPhotoImages > 0
          ? `window.__renderPending = ${String(totalPhotoImages)}; window.__hlPhotoLoaded = function() { window.__renderPending -= 1; if (window.__renderPending <= 0) { window.__renderReady = true; } };`
          : "window.__renderReady = true;"
      }
    >
      <div className="hl-report-body">
          <ReportHeader {...reportHeaderProps} />
          {data.blocks.length === 0 ? (
            <div className="hl-empty-page">No event highlights in the selected scope.</div>
          ) : (
            data.blocks.map((block, index) => (
              <EventHighlightBlock
                key={block.id}
                block={block}
                timeZone={data.tenant.timezone}
                isFirst={index === 0}
              />
            ))
          )}
          <footer className="hl-footer" role="contentinfo">
            <div className="hl-footer-notes">
              Showing {data.blocks.length} of {data.totalQualifying} qualifying events
              {data.photoBudgetReached
                ? ` · Showing ${String(data.photosShown)} of ${String(data.photosAvailable)} photos — photo budget reached`
                : ""}
              {data.template.footerNotes !== null ? ` · ${data.template.footerNotes}` : ""}
            </div>
            <div className="hl-footer-meta">Generated {generatedAt}</div>
          </footer>
        </div>
    </PrintDocumentShell>
  );
}
