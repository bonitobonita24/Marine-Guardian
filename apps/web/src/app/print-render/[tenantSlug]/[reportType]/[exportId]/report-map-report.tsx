/**
 * Report Map PDF render — template-driven, 5 chart+map sections, each
 * immediately followed by a dedicated full-list portrait page (10 pages
 * total).
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for window.__renderReady (set by the last map island to mount).
 *
 * Layout options (driven by template.layout) govern the 5 MAIN (chart+map)
 * pages only — the 5 full-list pages are ALWAYS A4 portrait, independent of
 * this setting (see the "@page list-page" CSS rule):
 *   landscape-one-per-page (default) — ONE chart+map per A4 landscape page
 *   portrait-one-per-page            — ONE chart+map per A4 portrait page
 *   continuous                        — all 5 main sections in one flowing
 *                                        document (full-list pages still each
 *                                        force their own page break)
 *
 * Every page carries:
 *   Header — municipal logo LEFT · reportTitle CENTRE · partner logo RIGHT
 *   Footer — footerNotes · generated-at · page N of 10
 * All values come from the resolved template payload — nothing hardcoded.
 *
 * Five main sections (one per chart) + five full-list sections (uncapped,
 * ALL fields, ALL rows):
 *   1.  Law Enforcement       — EventBreakdownChart + event-points map (red)
 *   1b. Law Enforcement list  — full event table (portrait)
 *   2.  Monitoring            — EventBreakdownChart + event-points map (cyan)
 *   2b. Monitoring list       — full event table (portrait)
 *   3.  High Priority         — event-points map (orange)
 *   3b. High Priority list    — full event table (portrait)
 *   4.  Patrol List           — patrol-tracks map + seaborne/foot time series
 *   4b. Patrol List — list    — full patrol table (portrait)
 *   5.  Events Over Time      — line chart + overview event-points map (blue)
 *   5b. Events Over Time list — full event table (portrait)
 *
 * Mixed orientation: every main "report-section" is pinned to the named
 * "@page main-page" (the template's configured size); every full-list
 * "report-section-list" is pinned to "@page list-page" (always A4 portrait).
 * Chromium's Puppeteer `page.pdf({ preferCSSPageSize: true })` gives these
 * @page rules priority over the page.pdf() `landscape`/`format` JS options
 * (see the CSS block below + docs/DECISIONS_LOG.md "Report Map full-list
 * portrait pages" for the empirical verification).
 *
 * No full-list page contains a map — the __renderPending=5 map-island
 * counter (4 EventPointsMap + 1 PatrolTracksMap) is unaffected.
 *
 * WCAG 2.2 AA:
 *   - Heading order per section (h1 report title, h2 section title)
 *   - Every map wrapped in <figure> with <figcaption class="sr-only"> whose
 *     table (caption + scope attrs) provides a text alternative
 *   - Logo img elements carry descriptive alt text
 */

import type { ReportMapEventDetail, ReportMapReportData } from "@/server/report-map-report/get-report-map-report-data";
import { EventBreakdownChart } from "./components/event-breakdown-chart";
// Leaflet islands are loaded dynamically (ssr:false) via the client wrapper to
// prevent window-is-not-defined during Next.js server-side bundle evaluation.
import { EventPointsMap, PatrolTracksMap } from "./components/map-islands-client";
import { PrintTimeSeriesChart } from "./components/print-time-series-chart";

// ─── Layout resolution ────────────────────────────────────────────────────────

type LayoutKey = "landscape" | "portrait" | "continuous";

function resolveLayout(raw: string): LayoutKey {
  if (raw === "portrait-one-per-page") return "portrait";
  if (raw === "continuous") return "continuous";
  // "landscape-one-per-page", "two-column" (APP_DEFAULT_TEMPLATE alias), and
  // any unrecognised string all fall through to landscape — the safe default.
  return "landscape";
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDate(d: Date | undefined | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function fmtDateTimeLocal(d: Date): string {
  // +08:00 per v2 launch tenants convention (see get-coverage-report-data.ts).
  const shifted = new Date(d.getTime() + 480 * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const m = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${String(y)}-${mo}-${day} ${h}:${m} +08`;
}

function fmtPeriod(from: Date | undefined, to: Date | undefined): string {
  if (!from && !to) return "All time";
  if (from && to) return `${fmtDate(from)} — ${fmtDate(to)}`;
  if (from) return `From ${fmtDate(from)}`;
  return `To ${fmtDate(to)}`;
}

function fmtPatrolType(t: string): string {
  return t === "foot" ? "Foot" : "Seaborne";
}

function fmtDistKm(d: number | null): string {
  if (d === null || !Number.isFinite(d)) return "—";
  return `${d.toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
}

function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return "—";
  return `${h.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
}

// ─── Page header ──────────────────────────────────────────────────────────────

interface HeaderProps {
  municipalLogoDataUri: string | null;
  reportTitle: string;
  partnerLogoDataUri: string | null;
  tenantName: string;
  period: string;
}

function PageHeader({
  municipalLogoDataUri,
  reportTitle,
  partnerLogoDataUri,
  tenantName,
  period,
}: HeaderProps) {
  return (
    <header className="page-header" role="banner">
      <div className="header-logo-slot">
        {municipalLogoDataUri !== null ? (
          <img
            src={municipalLogoDataUri}
            alt="Municipal logo"
            className="header-logo"
          />
        ) : (
          <div className="header-logo-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="header-center">
        <h1 className="report-title">{reportTitle}</h1>
        <p className="report-subtitle">
          {tenantName} &middot; {period}
        </p>
      </div>
      <div
        className="header-logo-slot"
        style={{ justifyContent: "flex-end" }}
      >
        {partnerLogoDataUri !== null ? (
          <img
            src={partnerLogoDataUri}
            alt="Blue Alliance logo"
            className="header-logo"
          />
        ) : (
          <div className="header-logo-placeholder" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

// ─── Page footer ──────────────────────────────────────────────────────────────

interface FooterProps {
  footerNotes: string | null;
  generatedAt: string;
  pageNum: number;
  totalPages: number;
}

function PageFooter({
  footerNotes,
  generatedAt,
  pageNum,
  totalPages,
}: FooterProps) {
  return (
    <footer className="page-footer" role="contentinfo">
      <div className="footer-notes">{footerNotes ?? ""}</div>
      <div className="footer-meta">
        Page {pageNum} of {totalPages} &bull; Generated {generatedAt}
      </div>
    </footer>
  );
}

// ─── Full-list event/patrol tables (dedicated portrait pages) ─────────────────
//
// Formerly `EventListTable` capped its rows to PRINT_EVENT_LIST_ROW_CAP (6) and
// squeezed the preview into a fixed-height slot beside the chart+map on the
// LANDSCAPE page, because the print page had NO room to grow: Puppeteer's
// `page.pdf()` used a single fixed `@page` size with no scroll container, so
// an uncapped table would overflow onto extra (tile-heavy) landscape pages and
// blow up render time/output size (root cause of the printable-report-map
// regression — see docs/CHANGELOG_AI.md).
//
// The fix: full lists now render on DEDICATED PORTRAIT pages (named `@page
// list-page` — see the `.report-section-list` CSS rule below), completely
// decoupled from the chart+map landscape page. No cap, no truncation note.
// `<thead>` repeats per printed page (`display: table-header-group`); every
// `<tr>` carries `break-inside: avoid` so a row is never split across a page
// boundary. These pages carry zero maps — the __renderPending map-island
// counter (5 = 4 EventPointsMap + 1 PatrolTracksMap) is untouched.

function fmtLatLon(v: number | null): string {
  return v === null ? "—" : v.toFixed(5);
}

interface FullEventTableProps {
  events: ReportMapEventDetail[];
  caption: string;
}

function FullEventTable({ events, caption }: FullEventTableProps) {
  if (events.length === 0)
    return <p className="empty-note">No event details available.</p>;
  return (
    <table className="report-table full-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Event Type</th>
          <th scope="col">Title</th>
          <th scope="col">Priority</th>
          <th scope="col">Reported At</th>
          <th scope="col">Municipality</th>
          <th scope="col">Barangay / Area</th>
          <th scope="col">Reporter</th>
          <th scope="col">Latitude</th>
          <th scope="col">Longitude</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td>{e.typeDisplay}</td>
            <td>{e.title ?? "—"}</td>
            <td>{e.priority}</td>
            <td>{fmtDateTimeLocal2(e.reportedAt)}</td>
            <td>{e.municipalityName ?? "—"}</td>
            <td>{e.areaName ?? "—"}</td>
            <td>{e.reportedByName ?? "—"}</td>
            <td>{fmtLatLon(e.lat)}</td>
            <td>{fmtLatLon(e.lon)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface FullPatrolTableProps {
  patrols: ReportMapReportData["charts"]["patrolList"]["breakdown"];
  caption: string;
}

function FullPatrolTable({ patrols, caption }: FullPatrolTableProps) {
  if (patrols.length === 0)
    return <p className="empty-note">No patrols in this period.</p>;
  return (
    <table className="report-table full-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Serial / Ref</th>
          <th scope="col">Type</th>
          <th scope="col">Boat Name</th>
          <th scope="col">Start Time</th>
          <th scope="col">End Time</th>
          <th scope="col">Distance</th>
          <th scope="col">Hours</th>
          <th scope="col">Leader(s)</th>
          <th scope="col">Start Location</th>
        </tr>
      </thead>
      <tbody>
        {patrols.map((p) => (
          <tr key={p.patrolId}>
            <td>{p.serialNumber ?? p.label}</td>
            <td>{fmtPatrolType(p.patrolType)}</td>
            <td>{p.boatName ?? "—"}</td>
            <td>{p.startTime ? fmtDateTimeLocal2(p.startTime) : "—"}</td>
            <td>{p.endTime ? fmtDateTimeLocal2(p.endTime) : "—"}</td>
            <td>{fmtDistKm(p.distanceKm)}</td>
            <td>{p.hours !== null ? fmtHours(p.hours) : "—"}</td>
            <td>{p.leaderNames.length > 0 ? p.leaderNames.join(", ") : "—"}</td>
            <td>
              {p.startLocationLat !== null && p.startLocationLon !== null
                ? `${fmtLatLon(p.startLocationLat)}, ${fmtLatLon(p.startLocationLon)}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// fmtDateTimeLocal expects a non-null Date; full-table rows may be null.
function fmtDateTimeLocal2(d: Date | null): string {
  return d === null ? "—" : fmtDateTimeLocal(d);
}

// ─── WCAG map text-alternative (table with caption + scope) ───────────────────

interface MapAltTableProps {
  caption: string;
  points: Array<{ id: string; title: string | null; lat: number; lon: number }>;
}

function MapAltTable({ caption, points }: MapAltTableProps) {
  if (points.length === 0) return <p>{caption}: no located items.</p>;
  const rows = points.slice(0, 50);
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Latitude</th>
          <th scope="col">Longitude</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>{p.title ?? "—"}</td>
            <td>{p.lat.toFixed(5)}</td>
            <td>{p.lon.toFixed(5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReportMapReportProps {
  data: ReportMapReportData;
}

// 5 main chart+map sections + 5 dedicated full-list pages (one per section) —
// see the ".report-section-list" CSS rule + FullEventTable/FullPatrolTable.
const TOTAL_PAGES = 10;

export function ReportMapReport({ data }: ReportMapReportProps) {
  const layout = resolveLayout(data.template.layout);
  const pageCss = layout === "portrait" ? "A4 portrait" : "A4 landscape";
  const isOnePer = layout === "landscape" || layout === "portrait";
  const mapHeightPx = layout === "portrait" ? "260px" : "370px";

  const period = fmtPeriod(data.filter.from, data.filter.to);
  const generatedAt = fmtDateTimeLocal(data.generatedAt);

  const headerProps: HeaderProps = {
    municipalLogoDataUri: data.template.municipalLogoDataUri,
    reportTitle: data.template.reportTitle,
    partnerLogoDataUri: data.template.partnerLogoDataUri,
    tenantName: data.tenant.name,
    period,
  };

  const footerBase = {
    footerNotes: data.template.footerNotes,
    generatedAt,
    totalPages: TOTAL_PAGES,
  };

  // Adapt ReportMapEventBreakdownRow → EventTypeBreakdownRow for EventBreakdownChart.
  // eventTypeId is unused by the chart renderer; value mirrors type for canonical ordering.
  const lawRows = data.charts.lawEnforcement.breakdown.map((r) => ({
    eventTypeId: "",
    value: r.type,
    display: r.type,
    count: r.count,
  }));
  const monRows = data.charts.monitoring.breakdown.map((r) => ({
    eventTypeId: "",
    value: r.type,
    display: r.type,
    count: r.count,
  }));
  const lawPoints = data.charts.lawEnforcement.breakdown.flatMap((r) => r.points);
  const monPoints = data.charts.monitoring.breakdown.flatMap((r) => r.points);

  // Section content flex direction per layout.
  const contentFlex =
    layout === "landscape" ? "row" : "column";

  const css = `
    /* ── Mixed page orientation via CSS Paged Media named pages ──────────────
       Chromium's page.pdf({ preferCSSPageSize: true }) gives any CSS @page
       size/orientation priority over the JS-level width/height/format/
       landscape options (Puppeteer docs: PDFOptions.preferCSSPageSize).
       Named pages (the "page" property + a matching "@page <name>" rule) let
       ONE PDF document mix orientations: every .report-section (chart+map,
       unchanged content/layout) stays on "main-page" at the template's
       configured size; every .report-section-list (new, full-data tables)
       is pinned to "list-page" — always A4 portrait, regardless of the
       template's main layout — so a long list never has to share the
       landscape chart+map's cramped height budget. Verified empirically
       against a real rendered PDF (see docs/CHANGELOG_AI.md /
       DECISIONS_LOG.md "Report Map full-list portrait pages"). */
    @page { size: ${pageCss}; margin: 12mm; }
    @page main-page { size: ${pageCss}; margin: 12mm; }
    @page list-page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #111 !important;
      background: #fff !important;
      margin: 0; padding: 0; font-size: 11px; line-height: 1.4;
    }
    .report-section { padding: 8px 14px 4px; page: main-page; }
    .report-section-list { padding: 8px 14px 4px; page: list-page; break-before: page; page-break-before: always; }
    ${isOnePer
      ? ".report-section + .report-section { page-break-before: always; break-before: page; }"
      : ".report-section + .report-section { margin-top: 28px; border-top: 2px solid #e5e7eb; padding-top: 14px; }"}
    /* A main section immediately following a full-list page must always
       start fresh (orientation is switching back from portrait to the main
       layout size) — independent of the isOnePer/continuous template mode. */
    .report-section-list + .report-section { page-break-before: always; break-before: page; }
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 10px; gap: 8px;
    }
    .header-logo-slot { flex: 0 0 80px; display: flex; align-items: center; }
    .header-logo { max-height: 40px; max-width: 80px; object-fit: contain; }
    .header-logo-placeholder { width: 80px; height: 40px; }
    .header-center { flex: 1 1 auto; text-align: center; }
    h1.report-title { font-size: 14px; font-weight: 700; margin: 0 0 2px; color: #0f766e; }
    p.report-subtitle { font-size: 9px; color: #6b7280; margin: 0; }
    h2.section-heading { font-size: 12px; font-weight: 600; color: #374151; margin: 0 0 6px; }
    .total-badge {
      display: inline-block; font-size: 11px; font-weight: 700;
      color: #111; background: #f3f4f6; border: 1px solid #e5e7eb;
      border-radius: 4px; padding: 1px 6px; margin-left: 8px; vertical-align: middle;
    }
    .section-content { display: flex; flex-direction: ${contentFlex}; gap: 10px; }
    .section-chart {
      ${layout === "landscape" ? "flex: 0 0 40%; min-width: 0;" : "width: 100%;"}
      /* Explicit height matching .section-map (not just min-height) so a
         ResponsiveContainer-based chart (Recharts) always has a determinate
         ancestor height to measure against. Without this, ResponsiveContainer
         can runaway-grow across many print pages when its parent's height is
         otherwise undefined — root cause of the historical printable-
         report-map pagination-blowup regression (see the FullEventTable /
         FullPatrolTable comment above: the fix now keeps every list off this
         page entirely, on a dedicated portrait page). overflow: hidden is
         defense-in-depth: even if a future chart addition ignores this
         budget, the section can no longer push the printed page taller than
         one page. display:flex column keeps the fixed .chart-breakdown-slot
         from being squeezed by percentage-height children (a plain block
         layout would let EventBreakdownChart's height:100% claim the whole
         column). */
      height: ${mapHeightPx};
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Fixed sub-budget for EventBreakdownChart inside .section-chart (LE /
       Monitoring sections only) — the chart column no longer shares its
       height with any list table (full lists moved to dedicated portrait
       pages), but the fixed slot is kept so the Recharts
       ResponsiveContainer always has a determinate ancestor height. */
    .chart-breakdown-slot { height: 200px; flex-shrink: 0; overflow: hidden; }
    p.section-list-hint { font-size: 10px; color: #6b7280; margin: 4px 0 0; }
    .section-map {
      ${layout === "landscape" ? "flex: 0 0 60%; min-width: 0;" : "width: 100%;"}
      height: ${mapHeightPx};
    }
    figure { margin: 0; padding: 0; width: 100%; height: 100%; display: block; }
    .page-footer {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 8px;
      font-size: 9px; color: #6b7280;
    }
    .footer-notes { max-width: 70%; }
    table.report-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.report-table th, table.report-table td {
      border: 1px solid #e5e7eb; padding: 3px 5px;
      text-align: left; color: #111 !important; background: #fff !important; vertical-align: top;
    }
    table.report-table thead th { background: #f3f4f6 !important; font-weight: 600; color: #374151 !important; }
    table.report-table tbody tr:nth-child(even) td { background: #f9fafb !important; }
    /* Full-list tables (dedicated portrait pages) — uncapped, potentially
       1000+ rows for a busy tenant/category. The header repeats on every
       printed page and a row is never split across a page boundary. */
    table.report-table.full-table thead { display: table-header-group; }
    table.report-table.full-table tbody tr {
      break-inside: avoid; page-break-inside: avoid;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0;
      margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }
    p.empty-note { font-size: 10px; color: #6b7280; font-style: italic; }
    .patrol-charts-row { display: flex; gap: 10px; margin-top: 8px; }
    .patrol-chart-col { flex: 1 1 0; min-width: 0; }
  `;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {data.tenant.name} — {data.template.reportTitle} — {period}
        </title>
        <style>{css}</style>
        {/* Initialise the multi-map render-ready counter before any island
            mounts. 5 = one EventPointsMap per chart section (×4) + one
            PatrolTracksMap. Each MapReadySignal decrements the counter;
            window.__renderReady is only set once all five reach zero.
            Backward-compat: single-map documents never set __renderPending
            so their MapReadySignal falls through to the direct-flip path. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__renderPending = 5;",
          }}
        />
      </head>
      <body>

        {/* ── Section 1: Law Enforcement ────────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-law-enforcement"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Law Enforcement Events
            <span className="total-badge">
              {data.charts.lawEnforcement.total.toLocaleString()}
            </span>
          </h2>
          <div className="section-content">
            <div className="section-chart">
              <div className="chart-breakdown-slot">
                <EventBreakdownChart
                  rows={lawRows}
                  variant="lawEnforcement"
                  topN={12}
                />
              </div>
              <p className="section-list-hint">Full event list on the next page.</p>
            </div>
            <div className="section-map">
              <figure aria-label="Law enforcement event locations">
                <figcaption className="sr-only">
                  <MapAltTable
                    caption="Law enforcement event locations"
                    points={lawPoints}
                  />
                </figcaption>
                <EventPointsMap
                  points={lawPoints}
                  markerColor="#dc2626"
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={1} />
        </section>

        {/* ── Section 1b: Law Enforcement — full list (portrait) ──────────── */}
        <section
          className="report-section-list"
          data-testid="section-law-enforcement-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Law Enforcement Events — Full List
            <span className="total-badge">
              {data.charts.lawEnforcement.total.toLocaleString()}
            </span>
          </h2>
          <FullEventTable
            events={data.charts.lawEnforcement.breakdown.flatMap((r) => r.events)}
            caption="Law enforcement full event list"
          />
          <PageFooter {...footerBase} pageNum={2} />
        </section>

        {/* ── Section 2: Monitoring ─────────────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-monitoring"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Monitoring Events
            <span className="total-badge">
              {data.charts.monitoring.total.toLocaleString()}
            </span>
          </h2>
          <div className="section-content">
            <div className="section-chart">
              <div className="chart-breakdown-slot">
                <EventBreakdownChart
                  rows={monRows}
                  variant="monitoring"
                  topN={12}
                />
              </div>
              <p className="section-list-hint">Full event list on the next page.</p>
            </div>
            <div className="section-map">
              <figure aria-label="Monitoring event locations">
                <figcaption className="sr-only">
                  <MapAltTable
                    caption="Monitoring event locations"
                    points={monPoints}
                  />
                </figcaption>
                <EventPointsMap
                  points={monPoints}
                  markerColor="#0891b2"
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={3} />
        </section>

        {/* ── Section 2b: Monitoring — full list (portrait) ───────────────── */}
        <section
          className="report-section-list"
          data-testid="section-monitoring-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Monitoring Events — Full List
            <span className="total-badge">
              {data.charts.monitoring.total.toLocaleString()}
            </span>
          </h2>
          <FullEventTable
            events={data.charts.monitoring.breakdown.flatMap((r) => r.events)}
            caption="Monitoring full event list"
          />
          <PageFooter {...footerBase} pageNum={4} />
        </section>

        {/* ── Section 3: High Priority ──────────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-high-priority"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            High Priority Events
            <span className="total-badge">
              {data.charts.highPriority.total.toLocaleString()}
            </span>
          </h2>
          <div className="section-content">
            <div className="section-chart">
              {data.charts.highPriority.total === 0 ? (
                <p className="empty-note">
                  No high priority events in this period.
                </p>
              ) : (
                <p className="section-list-hint">Full event list on the next page.</p>
              )}
            </div>
            <div className="section-map">
              <figure aria-label="High priority event locations">
                <figcaption className="sr-only">
                  <MapAltTable
                    caption="High priority event locations"
                    points={data.charts.highPriority.points}
                  />
                </figcaption>
                <EventPointsMap
                  points={data.charts.highPriority.points}
                  markerColor="#ea580c"
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={5} />
        </section>

        {/* ── Section 3b: High Priority — full list (portrait) ────────────── */}
        <section
          className="report-section-list"
          data-testid="section-high-priority-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            High Priority Events — Full List
            <span className="total-badge">
              {data.charts.highPriority.total.toLocaleString()}
            </span>
          </h2>
          <FullEventTable
            events={data.charts.highPriority.events}
            caption="High priority full event list"
          />
          <PageFooter {...footerBase} pageNum={6} />
        </section>

        {/* ── Section 4: Patrol List ────────────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-patrol-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Patrols
            <span className="total-badge">
              {data.charts.patrolList.total.toLocaleString()}
            </span>
            <span className="total-badge">
              {fmtHours(data.charts.patrolList.patrolTotals.totalHours)}
            </span>
            <span className="total-badge">
              {fmtDistKm(data.charts.patrolList.patrolTotals.totalKm)}
            </span>
          </h2>
          <div className="section-content">
            <div className="section-chart">
              {data.charts.patrolList.breakdown.length === 0 ? (
                <p className="empty-note">No patrols in this period.</p>
              ) : (
                <p className="section-list-hint">Full patrol list on the next page.</p>
              )}
            </div>
            <div className="section-map">
              <figure aria-label="Patrol tracks">
                <figcaption className="sr-only">
                  <table>
                    <caption>Patrol tracks</caption>
                    <thead>
                      <tr>
                        <th scope="col">Patrol</th>
                        <th scope="col">Track Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.charts.patrolList.tracks.slice(0, 30).map((t) => (
                        <tr key={t.patrolId}>
                          <td>{t.label}</td>
                          <td>{t.path.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </figcaption>
                <PatrolTracksMap tracks={data.charts.patrolList.tracks} />
              </figure>
            </div>
          </div>
          <div
            className="patrol-charts-row"
            role="group"
            aria-label="Patrol counts over time by type"
          >
            <div className="patrol-chart-col">
              <PrintTimeSeriesChart
                series={data.charts.patrolList.patrolCountByTypeOverTime.seaborne}
                title="Seaborne Patrols Over Time"
                color="#0891b2"
                valueLabel="Patrols"
              />
            </div>
            <div className="patrol-chart-col">
              <PrintTimeSeriesChart
                series={data.charts.patrolList.patrolCountByTypeOverTime.foot}
                title="Foot Patrols Over Time"
                color="#0f766e"
                valueLabel="Patrols"
              />
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={7} />
        </section>

        {/* ── Section 4b: Patrol List — full list (portrait) ──────────────── */}
        <section
          className="report-section-list"
          data-testid="section-patrol-list-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Patrols — Full List
            <span className="total-badge">
              {data.charts.patrolList.total.toLocaleString()}
            </span>
          </h2>
          <FullPatrolTable
            patrols={data.charts.patrolList.breakdown}
            caption="Full patrol list"
          />
          <PageFooter {...footerBase} pageNum={8} />
        </section>

        {/* ── Section 5: Events Over Time ───────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-events-over-time"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Events Over Time
            <span className="total-badge">
              {data.charts.eventsOverTime.total.toLocaleString()}
            </span>
          </h2>
          <div className="section-content">
            <div className="section-chart">
              <PrintTimeSeriesChart
                series={data.charts.eventsOverTime.series}
                color="#0891b2"
                valueLabel="Events"
              />
            </div>
            <div className="section-map">
              <figure aria-label="All events overview map">
                <figcaption className="sr-only">
                  <MapAltTable
                    caption="All events overview locations"
                    points={data.charts.eventsOverTime.overviewPoints}
                  />
                </figcaption>
                <EventPointsMap
                  points={data.charts.eventsOverTime.overviewPoints}
                  markerColor="#2563eb"
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={9} />
        </section>

        {/* ── Section 5b: Events Over Time — full list (portrait) ─────────── */}
        <section
          className="report-section-list"
          data-testid="section-events-over-time-list"
        >
          <PageHeader {...headerProps} />
          <h2 className="section-heading">
            Events Over Time — Full List
            <span className="total-badge">
              {data.charts.eventsOverTime.total.toLocaleString()}
            </span>
          </h2>
          <FullEventTable
            events={data.charts.eventsOverTime.events}
            caption="Events over time — full event list"
          />
          <PageFooter {...footerBase} pageNum={10} />
        </section>

        {/* Puppeteer networkidle0 anchor. */}
        <img
          alt=""
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ position: "absolute", width: 1, height: 1, left: -9999 }}
        />
      </body>
    </html>
  );
}
