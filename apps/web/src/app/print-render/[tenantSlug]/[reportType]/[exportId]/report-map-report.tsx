/**
 * Report Map PDF render — template-driven, 5 chart+map sections.
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for window.__renderReady (set by the last map island to mount).
 *
 * Layout options (driven by template.layout):
 *   landscape-one-per-page (default) — ONE chart+map per A4 landscape page
 *   portrait-one-per-page            — ONE chart+map per A4 portrait page
 *   continuous                        — all 5 sections in one flowing document
 *
 * Every page carries:
 *   Header — municipal logo LEFT · reportTitle CENTRE · partner logo RIGHT
 *   Footer — footerNotes · generated-at · page N of 5
 * All values come from the resolved template payload — nothing hardcoded.
 *
 * Five sections (one per chart):
 *   1. Law Enforcement — EventBreakdownChart + event-points map (red)
 *   2. Monitoring       — EventBreakdownChart + event-points map (cyan)
 *   3. High Priority    — event table + event-points map (orange)
 *   4. Patrol List      — patrol table + patrol-tracks map
 *   5. Events Over Time — line chart + overview event-points map (blue)
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

// ─── Event list table (LE / Monitoring sections) ──────────────────────────────

interface EventListTableProps {
  events: ReportMapEventDetail[];
  caption: string;
}

// Row cap for the print-render table. Bounded independently of the SSR
// query/breakdown cap (which can return up to 30 rows per data.ts) because
// the print page has a FIXED height budget: `.section-chart` shares its
// column with an EventBreakdownChart (min-height 180px) and must fit
// alongside a `.section-map` sized to `mapHeightPx` (370px landscape /
// 260px portrait). Puppeteer's `page.pdf()` uses `preferCSSPageSize: true`
// with a fixed `@page` size and NO scroll container for `.report-section` —
// if `EventListTable` grows taller than the remaining budget, the browser's
// print engine paginates the OVERFLOW onto extra pages, and each extra page
// re-renders the (tile-image-heavy) sibling Leaflet map. Measured on the
// swarm/printable-report-map branch: growing this table from 0 → 14 real
// rows took PDF output from ~1.4MB to 100+MB and blew past Puppeteer's 30s
// `page.pdf()` protocol timeout (root cause of the printable-report-map
// regression — see docs/CHANGELOG_AI.md). A small cap (6) + the
// `max-height`/`overflow: hidden` guard below is defense-in-depth: even if
// a future change raises this constant, the table can no longer overflow
// the page (portrait's 260px map budget is the tighter constraint of the
// two layouts, so the height budget below is sized to fit portrait too).
const PRINT_EVENT_LIST_ROW_CAP = 6;
// Leaves headroom under EventBreakdownChart's `minHeight: "180px"` even in
// portrait layout (260px total map-column budget): ~24px caption/header +
// ~18px per data row at 9px font + 3px vertical padding — 6 rows + header
// fits well inside 100px, keeping the section comfortably under budget in
// both landscape (370px) and portrait (260px) layouts.
const PRINT_EVENT_LIST_MAX_HEIGHT_PX = 100;

function EventListTable({ events, caption }: EventListTableProps) {
  const capped = events.slice(0, PRINT_EVENT_LIST_ROW_CAP);
  if (capped.length === 0)
    return <p className="empty-note">No event details available.</p>;
  const hiddenCount = events.length - capped.length;
  return (
    <>
      <div
        style={{
          marginTop: "6px",
          maxHeight: `${String(PRINT_EVENT_LIST_MAX_HEIGHT_PX)}px`,
          overflow: "hidden",
        }}
      >
        <table className="report-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Event Type</th>
              <th scope="col">Date</th>
              <th scope="col">Location</th>
              <th scope="col">Reporter</th>
            </tr>
          </thead>
          <tbody>
            {capped.map((e) => (
              <tr key={e.id}>
                <td>{e.typeDisplay}</td>
                <td>{fmtDate(e.reportedAt)}</td>
                <td>{e.locationName ?? "—"}</td>
                <td>{e.reportedByName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <p className="empty-note" style={{ marginTop: "2px" }}>
          +{hiddenCount.toLocaleString()} more not shown
        </p>
      )}
    </>
  );
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

const TOTAL_PAGES = 5;

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
    @page { size: ${pageCss}; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #111 !important;
      background: #fff !important;
      margin: 0; padding: 0; font-size: 11px; line-height: 1.4;
    }
    .report-section { padding: 8px 14px 4px; }
    ${isOnePer
      ? ".report-section + .report-section { page-break-before: always; }"
      : ".report-section + .report-section { margin-top: 28px; border-top: 2px solid #e5e7eb; padding-top: 14px; }"}
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
         otherwise undefined — root cause of the printable-report-map
         pagination-blowup regression (see PRINT_EVENT_LIST_ROW_CAP comment
         below). overflow: hidden is defense-in-depth: even if a future chart
         addition ignores this budget, the section can no longer push the
         printed page taller than one page. display:flex column so the fixed
         .chart-breakdown-slot above the event-list table doesn't get
         squeezed by percentage-height children (a plain block layout would
         let EventBreakdownChart's height:100% claim the whole column). */
      height: ${mapHeightPx};
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Fixed sub-budget for EventBreakdownChart inside .section-chart (LE /
       Monitoring sections only), leaving deterministic remaining room under
       .section-chart's height for EventListTable below it. Without this,
       EventBreakdownChart's own height:"100%" would consume the ENTIRE
       .section-chart budget (100% of a now-determinate 370px/260px parent),
       clipping the event-list table out of view entirely. */
    .chart-breakdown-slot { height: 200px; flex-shrink: 0; overflow: hidden; }
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
              <EventListTable
                events={data.charts.lawEnforcement.breakdown.flatMap(
                  (r) => r.events,
                )}
                caption="Law enforcement event list"
              />
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
              <EventListTable
                events={data.charts.monitoring.breakdown.flatMap(
                  (r) => r.events,
                )}
                caption="Monitoring event list"
              />
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
          <PageFooter {...footerBase} pageNum={2} />
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
              {data.charts.highPriority.points.length === 0 ? (
                <p className="empty-note">
                  No high priority events in this period.
                </p>
              ) : (
                <table className="report-table">
                  <caption className="sr-only">
                    High priority event list
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Lat</th>
                      <th scope="col">Lon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.charts.highPriority.points
                      .slice(0, 25)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>{p.title ?? "—"}</td>
                          <td>{p.lat.toFixed(4)}</td>
                          <td>{p.lon.toFixed(4)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
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
          <PageFooter {...footerBase} pageNum={3} />
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
                <table className="report-table">
                  <caption className="sr-only">Patrol list</caption>
                  <thead>
                    <tr>
                      <th scope="col">Serial</th>
                      <th scope="col">Type</th>
                      <th scope="col">Distance</th>
                      <th scope="col">Leader</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.charts.patrolList.breakdown
                      .slice(0, 30)
                      .map((p) => (
                        <tr key={p.patrolId}>
                          <td>{p.serialNumber ?? p.label}</td>
                          <td>{fmtPatrolType(p.patrolType)}</td>
                          <td>{fmtDistKm(p.distanceKm)}</td>
                          <td>{p.leaderName ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
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
          <PageFooter {...footerBase} pageNum={4} />
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
          <PageFooter {...footerBase} pageNum={5} />
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
