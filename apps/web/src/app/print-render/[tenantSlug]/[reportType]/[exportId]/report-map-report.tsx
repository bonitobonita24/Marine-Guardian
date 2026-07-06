/**
 * Report Map PDF render — template-driven, 4 chart+map sections + 1 map-only
 * heatmap section, each of the 4 chart+map sections followed by a dedicated
 * full-list portrait page (9 pages total — 2026-07-06 R1-R6 revision).
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for window.__renderReady (set by the last map island to mount).
 *
 * Layout options (driven by template.layout) govern the MAIN (chart+map)
 * pages only — the full-list pages are ALWAYS A4 portrait, independent of
 * this setting (see the "@page list-page" CSS rule):
 *   landscape-one-per-page (default) — ONE chart+map per A4 landscape page
 *   portrait-one-per-page            — ONE chart+map per A4 portrait page
 *   continuous                        — all main sections in one flowing
 *                                        document (full-list pages still each
 *                                        force their own page break)
 *
 * Every page carries:
 *   Header — municipal logo flanking the LEFT edge · centered 4-line title
 *            block ("Marine Guardian Report" big/bold · municipality name ·
 *            per-page report title · date range) · partner logo flanking
 *            the RIGHT edge (2026-07-06 header redesign — see
 *            components/report-header.tsx + REPORT_MAP_SECTION_TITLES below;
 *            supersedes the prior "logos hug the title as one centred
 *            cluster" layout)
 *   Footer — footerNotes · generated-at · page N of 9
 * All values come from the resolved template payload (logos) plus the
 * per-section REPORT_MAP_SECTION_TITLES mapping — nothing hardcoded per call
 * site.
 *
 * Page order (2026-07-06 revision — R6 removed the High Priority pages, R5
 * added the Patrol Tracks Heatmap page):
 *   1.  Law Enforcement       — EventBreakdownChart + event-points map (red)
 *   2.  Monitoring            — EventBreakdownChart + event-points map (cyan)
 *   3.  Patrol List           — per-type (Seaborne/Foot) figures LEFT of the
 *                                patrol-tracks map (colored by type, R1) +
 *                                seaborne/foot time series (2026-07-06)
 *   4.  Patrol Tracks Heatmap — NEW (R5): seaborne (green) / foot (tangerine
 *                                orange) heat layers over the same track points, map-only
 *                                page immediately after Patrol List
 *   5.  Events Over Time      — line chart + overview event-points map (blue)
 *   6.  Law Enforcement list  — per-type event tables (landscape)
 *   7.  Monitoring list       — per-type event tables (landscape)
 *   8.  Patrol List — list    — full patrol table (portrait)
 *   9.  Events Over Time list — per-type event tables (landscape)
 *
 * EVENT full-list pages (owner directive 2026-07-03) render one SEPARATE table
 * per EventType — each type's columns are the union of ER field keys present
 * in that type's events' eventDetailsJson (plus date/location/reporter) — on
 * A4 LANDSCAPE so the wide per-type column sets fit, with a small photo
 * thumbnail per row when the event has an archived image asset (served via
 * the existing /api/assets/[id] proxy; the pdf-renderer's
 * page.setExtraHTTPHeaders propagates the X-PDF-Renderer-Token onto these
 * <img> subresource fetches, which middleware + the route accept).
 *
 * Mixed orientation: every main "report-section" is pinned to the named
 * "@page main-page" (the template's configured size); the patrol full-list
 * "report-section-list" stays pinned to "@page list-page" (A4 portrait) while
 * the three remaining EVENT full-list sections add the "event-list" class,
 * pinning them to "@page event-list-page" (A4 landscape).
 * Chromium's Puppeteer `page.pdf({ preferCSSPageSize: true })` gives these
 * @page rules priority over the page.pdf() `landscape`/`format` JS options
 * (see the CSS block below + docs/DECISIONS_LOG.md "Report Map full-list
 * portrait pages" for the empirical verification).
 *
 * No full-list page contains a map. The __renderPending=5 map-island counter
 * = 3 EventPointsMap (Law Enforcement, Monitoring, Events Over Time — High
 * Priority's map was removed by R6) + 1 PatrolTracksMap + 1 PatrolHeatmapMap
 * (added by R5) — net unchanged from the pre-2026-07-06 count of 5.
 *
 * WCAG 2.2 AA:
 *   - Heading order per section (h1 report title, h2 section title)
 *   - Every map wrapped in <figure> with <figcaption class="sr-only"> whose
 *     table (caption + scope attrs) provides a text alternative
 *   - Logo img elements carry descriptive alt text
 */

import type { ReportMapEventDetail, ReportMapReportData } from "@/server/report-map-report/get-report-map-report-data";
import {
  detailCell,
  type EventColumn,
  groupEventsByType,
  splitEventColumns,
} from "@/server/report-map-report/event-type-grouping";
import { EventBreakdownChart } from "./components/event-breakdown-chart";
import { ReportHeader, reportHeaderStyles } from "./components/report-header";
import { RowHeightSync } from "./components/row-height-sync";
// Leaflet islands are loaded dynamically (ssr:false) via the client wrapper to
// prevent window-is-not-defined during Next.js server-side bundle evaluation.
import {
  EventPointsMap,
  PatrolHeatmapMap,
  PatrolTracksMap,
} from "./components/map-islands-client";
import {
  PatrolTotalsFigure,
  PatrolTypeBarChart,
} from "./components/patrol-type-bar-chart";
import { PrintMultiSeriesChart } from "./components/print-multi-series-chart";
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
  // +08:00 (Asia/Manila) — same convention as fmtDateTimeLocal below. A range
  // boundary picked as local midnight is stored as the prior day at 16:00 UTC,
  // so a raw toISOString() printed the day BEFORE the one the user selected
  // (e.g. "May 1" → "2026-04-30"). Shift into Manila time before slicing the
  // calendar date so the printed range matches what was selected on the map.
  const shifted = new Date(d.getTime() + 480 * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${String(y)}-${mo}-${day}`;
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
// Per-page report title mapping (owner mockup, 2026-07-06 header redesign) —
// a single centralized object so a future section rename/addition only
// touches this one place. Keys mirror the data-testid section names below.

const REPORT_MAP_SECTION_TITLES = {
  lawEnforcement: "Law Enforcement Events",
  monitoring: "Monitoring Events",
  patrolList: "Patrol Tracks",
  patrolHeatmap: "Patrol Tracks Heatmap",
  eventsOverTime: "Events Over Time",
} as const;

interface HeaderProps {
  municipalLogoDataUri: string | null;
  partnerLogoDataUri: string | null;
  municipalityName: string | null;
  period: string;
}

/** Wraps the shared <ReportHeader> — every report-map-report page passes
 *  its own per-section `reportTitle` (see REPORT_MAP_SECTION_TITLES above)
 *  alongside the shared municipal/partner logo + municipality + date-range
 *  props threaded from the top-level component. */
function PageHeader({
  municipalLogoDataUri,
  partnerLogoDataUri,
  municipalityName,
  period,
  reportTitle,
}: HeaderProps & { reportTitle: string }) {
  return (
    <ReportHeader
      municipalLogoUrl={municipalLogoDataUri}
      partnerLogoUrl={partnerLogoDataUri}
      municipalityName={municipalityName}
      reportTitle={reportTitle}
      dateRange={period}
    />
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

// ─── Full-list event/patrol tables (dedicated pages) ──────────────────────────
// Event lists: LANDSCAPE per-type tables (EventTypeTables). Patrol list:
// PORTRAIT single table (FullPatrolTable).
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

interface EventTypeTablesProps {
  events: ReportMapEventDetail[];
  captionPrefix: string;
  /** Per-type GLOBAL (all-time) column set — owner Option A, see
   *  `groupEventsByType`'s `typeColumns` parameter. */
  eventTypeColumns: Record<string, string[]>;
}

/**
 * One SEPARATE table per EventType (owner directive 2026-07-03): each table's
 * dynamic columns are the union of eventDetailsJson keys present across that
 * type's events — the type's own ER field set — after the common
 * date/title/location/reporter columns. A Photo column (small thumbnail via
 * the /api/assets/[id] proxy) appears only when the group has at least one
 * archived image. Rendered on the LANDSCAPE "event-list-page" so wide per-type
 * column sets fit.
 */
function EventPhotoCell({
  event,
  groupType,
}: {
  event: ReportMapEventDetail;
  groupType: string;
}) {
  const photoId = event.photoAssetIds[0];
  return (
    <td className="photo-cell">
      {photoId !== undefined ? (
        // Broken/unavailable photos (asset 404/502) degrade to the alt
        // text — the render itself is unaffected.
        <img
          className="event-thumb"
          // Request a small resized thumbnail (w=160) instead of the
          // full camera-resolution original — the cell renders at ~48px,
          // so embedding the source image bloats the PDF by 10-100x for
          // no visual gain (owner directive 2026-07-04: keep event images
          // small in BYTES, not just on screen; also keeps each export
          // under Telegram's 20MB getFile cap so it can land in Telegram
          // instead of falling back to MinIO).
          src={`/api/assets/${photoId}?w=160`}
          alt={`Photo: ${event.title ?? groupType}`}
        />
      ) : (
        "—"
      )}
    </td>
  );
}

/**
 * One column's <td> for one event row. A single switch covers every
 * `EventColumn.kind` so both split halves (and any future non-split caller)
 * render identically from the shared column model in event-type-grouping.ts.
 */
function EventColumnCell({
  column,
  event,
  groupType,
}: {
  column: EventColumn;
  event: ReportMapEventDetail;
  groupType: string;
}) {
  switch (column.kind) {
    case "reportedAt":
      return <td>{fmtDateTimeLocal2(event.reportedAt)}</td>;
    case "title":
      return <td>{event.title ?? "—"}</td>;
    case "municipality":
      return <td>{event.municipalityName ?? "—"}</td>;
    case "area":
      return <td>{event.areaName ?? "—"}</td>;
    case "reporter":
      return <td>{event.reportedByName ?? "—"}</td>;
    case "detail":
      return <td>{detailCell(event, column.key ?? "")}</td>;
    case "photo":
      return <EventPhotoCell event={event} groupType={groupType} />;
  }
}

function columnKey(column: EventColumn): string {
  return column.kind === "detail" ? `detail:${column.key ?? ""}` : column.kind;
}

interface EventTypeTableProps {
  columns: EventColumn[];
  events: ReportMapEventDetail[];
  groupType: string;
  captionPrefix: string;
  pageLabel: string | null;
}

/** One landscape table for one column half — shared by both split pages. */
function EventTypeTable({
  columns,
  events,
  groupType,
  captionPrefix,
  pageLabel,
}: EventTypeTableProps) {
  return (
    <table className="report-table full-table">
      <caption className="sr-only">
        {captionPrefix} — {groupType}
        {pageLabel !== null ? ` — ${pageLabel}` : ""}
      </caption>
      <thead>
        <tr>
          {columns.map((col) => (
            <th scope="col" key={columnKey(col)}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            {columns.map((col) => (
              <EventColumnCell
                key={columnKey(col)}
                column={col}
                event={e}
                groupType={groupType}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventTypeTables({
  events,
  captionPrefix,
  eventTypeColumns,
}: EventTypeTablesProps) {
  if (events.length === 0)
    return <p className="empty-note">No event details available.</p>;
  return (
    <>
      {groupEventsByType(events, eventTypeColumns).map((g) => {
        const split = splitEventColumns(g);
        const hasSecondPage = split.page2.length > 0;
        return (
          <div className="event-type-block" key={g.type}>
            <h3 className="event-type-heading">
              {g.type}
              <span className="total-badge">
                {g.events.length.toLocaleString()}
              </span>
              {hasSecondPage ? (
                <span className="cont-note"> (columns 1 of 2)</span>
              ) : null}
            </h3>
            <EventTypeTable
              columns={split.page1}
              events={g.events}
              groupType={g.type}
              captionPrefix={captionPrefix}
              pageLabel={hasSecondPage ? "page 1 of 2" : null}
            />
            {hasSecondPage ? (
              // Forces the second column half onto its OWN landscape page
              // (owner complaint (a) 2026-07-05) instead of squeezing every
              // column onto one crowded page. Identity columns (Reported At,
              // Title) repeat as leaders so a row can be correlated across
              // both pages.
              <div className="event-type-column-page-break">
                <h3 className="event-type-heading">
                  {g.type}
                  <span className="cont-note"> (continued — columns 2 of 2)</span>
                </h3>
                <EventTypeTable
                  columns={split.page2}
                  events={g.events}
                  groupType={g.type}
                  captionPrefix={captionPrefix}
                  pageLabel="page 2 of 2"
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
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

// 4 main chart+map sections + 1 map-only heatmap section + 4 dedicated
// full-list pages (one per chart+map section) — see the
// ".report-section-list" CSS rule + FullEventTable/FullPatrolTable. Revised
// 2026-07-06: R6 removed the 2 High Priority pages, R5 added the Patrol
// Tracks Heatmap page (10 - 2 + 1 = 9).
const TOTAL_PAGES = 9;

export function ReportMapReport({ data }: ReportMapReportProps) {
  const layout = resolveLayout(data.template.layout);
  const pageCss = layout === "portrait" ? "A4 portrait" : "A4 landscape";
  const isOnePer = layout === "landscape" || layout === "portrait";
  const mapHeightPx = layout === "portrait" ? "260px" : "370px";
  // Patrol section (3) alone also carries a below-the-fold
  // "Seaborne/Foot Patrols Over Time" row (.patrol-charts-row) that the
  // other main sections don't have. Previously this row's map/chart height
  // was capped SHORTER than the event maps (220/300) to force the whole
  // section onto one printed page. Owner directive 2026-07-06 (R4): raise
  // the patrol map to the SAME height as the event maps (260/370) for
  // visual consistency — the section may now overflow onto a second
  // physical page (the .patrol-charts-row simply reflows there; nothing
  // clips, since neither the section nor the row has a fixed/overflow:
  // hidden height) — correctness over one-page fit, per the owner.
  const patrolMapHeightPx = mapHeightPx;

  const period = fmtPeriod(data.filter.from, data.filter.to);
  const generatedAt = fmtDateTimeLocal(data.generatedAt);

  const headerProps: HeaderProps = {
    municipalLogoDataUri: data.template.municipalLogoDataUri,
    partnerLogoDataUri: data.template.partnerLogoDataUri,
    municipalityName: data.municipalityName,
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
    /* Shadcn chart-token palette (R9, 2026-07-06) — mirrors the live dashboard's
       --chart-1..5 custom properties (globals.css base :root L28-32, tactical
       .command-center override L120-121 for chart-1/chart-2 — the values the
       WAR ROOM dashboard's shadcn charts actually render, per
       MunicipalityCoverageChart / BreakdownBars / EventsOverTimeChart). Plain
       CSS custom properties resolve fine in the print document tree even
       though it has NO Tailwind layers — var()/custom-property support is a
       native CSS feature, not a Tailwind one. Every restyled Recharts chart
       below references hsl(var(--chart-N)) so the printed report matches the
       on-screen shadcn charts exactly. chart-1/chart-2 use the bolder
       tactical override (blue/green); chart-3..5 have no override, so the
       base values are used verbatim. */
    :root {
      --chart-1: 221 83% 48%;
      --chart-2: 150 62% 36%;
      --chart-3: 30 80% 55%;
      --chart-4: 280 65% 60%;
      --chart-5: 340 75% 55%;
    }
    @page { size: ${pageCss}; margin: 12mm; }
    @page main-page { size: ${pageCss}; margin: 12mm; }
    @page list-page { size: A4 portrait; margin: 12mm; }
    /* EVENT full-list pages are ALWAYS A4 landscape (owner directive
       2026-07-03): per-type tables carry each type's full ER field set as
       columns, which does not fit a portrait width. The patrol full-list page
       keeps the portrait list-page. */
    @page event-list-page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    /* html AND body must be white: the app's global dark theme sets a dark
       background on <html>, which Chromium paints into the @page MARGIN area
       (the 12mm paper inset) when printBackground is on — producing a solid
       BLACK frame around every page (owner report 2026-07-05). Forcing both to
       #fff makes the whole print canvas — content AND margins — white. */
    html { background: #fff !important; }
    body {
      font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #111 !important;
      background: #fff !important;
      margin: 0; padding: 0; font-size: 11px; line-height: 1.4;
    }
    /* Print-friendly L/R body margin (owner directive 2026-07-05): 24px
       horizontal padding on every section keeps chart/map/table content off
       the physical page edge, independent of the @page 12mm paper margin
       above (that margin is Chromium's print-area inset; this is the
       visual breathing room WITHIN that print area). Symmetric left/right
       so nothing reads as accidentally off-centre. */
    .report-section { padding: 8px 24px 4px; page: main-page; }
    .report-section-list { padding: 8px 24px 4px; page: list-page; break-before: page; page-break-before: always; }
    .report-section-list.event-list { page: event-list-page; }
    ${isOnePer
      ? ".report-section + .report-section { page-break-before: always; break-before: page; }"
      : ".report-section + .report-section { margin-top: 28px; border-top: 2px solid #e5e7eb; padding-top: 14px; }"}
    /* A main section immediately following a full-list page must always
       start fresh (orientation is switching back from portrait to the main
       layout size) — independent of the isOnePer/continuous template mode. */
    .report-section-list + .report-section { page-break-before: always; break-before: page; }
    /* Shared print-render header (owner mockup, 2026-07-06 redesign):
       municipal logo FLANKS the left edge, partner (Blue Alliance) logo
       FLANKS the right edge, with a centered 4-line title block between
       them (big bold "Marine Guardian Report" · municipality · per-page
       report title · date range) — see components/report-header.tsx. This
       SUPERSEDES the prior "logos hug the title as one centred cluster"
       layout (2026-07-05). Shared across every print-render template. */
    ${reportHeaderStyles}
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
    /* Patrol section (4) override — shorter map/chart row (see
       patrolMapHeightPx above) so the section's extra below-the-fold
       "Patrols Over Time" row still fits on one printed page. Two classes on
       the ancestor (.patrol-section-content) beats the single-class
       .section-chart/.section-map height rule above on specificity. */
    .patrol-section-content .section-chart,
    .patrol-section-content .section-map {
      height: ${patrolMapHeightPx};
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
    /* Per-event-type tables (landscape event-list pages). Long ER detail
       values wrap inside their cell by WHOLE WORD instead of widening the
       table off-page. owner complaint (b) 2026-07-05: "word-break: break-word"
       breaks mid-word ("Illegal" → "Illeg/al") because it is treated the same
       as break-all by Chromium's table layout. "word-break: normal" +
       "overflow-wrap: break-word" wraps at whitespace first and only breaks
       an unbreakable single long token (URL/hash) as a last resort. */
    table.report-table.full-table td {
      white-space: normal; overflow-wrap: break-word; word-break: normal;
    }
    h3.event-type-heading {
      font-size: 11px; font-weight: 600; color: #374151;
      margin: 10px 0 4px; break-after: avoid; page-break-after: avoid;
    }
    /* Each NEW event type starts on a FRESH page (owner directive
       2026-07-05): previously a new type began in whatever space was left at
       the bottom of the prior type's page (e.g. "Unregistered Illegal Fishing"
       squeezed under a full "Others" table). break-before: page on every type
       after the first-in-section pushes each type to the top of its own page.
       The first type in a section has no preceding .event-type-block sibling
       (the <h2 section-heading> sits between sections), so it stays with its
       section heading. */
    .event-type-block + .event-type-block {
      break-before: page; page-break-before: always;
    }
    /* 2-page column split (owner complaint (a) 2026-07-05): a busy EventType's
       second column half always starts on its OWN landscape page instead of
       squeezing every column onto one crowded page — see
       splitEventColumns()/EventTypeTables. */
    .event-type-column-page-break {
      break-before: page; page-break-before: always;
    }
    .cont-note { font-size: 9px; font-weight: 400; font-style: italic; color: #6b7280; }
    td.photo-cell { width: 96px; }
    img.event-thumb {
      display: block; max-height: 56px; max-width: 90px; width: auto;
      object-fit: contain; border-radius: 4px;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0;
      margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }
    p.empty-note { font-size: 10px; color: #6b7280; font-style: italic; }
    /* Tightened (owner directive 2026-07-06 — one-page fit): the over-time
       row's own height now comes from PrintTimeSeriesChart's explicit
       height={90} prop (see the Section 3 "Patrol List" JSX below);
       margin-top trimmed
       from 8px to 6px to shave a little more off the section's total. */
    .patrol-charts-row { display: flex; gap: 10px; margin-top: 6px; }
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
            mounts. 5 = 3 EventPointsMap (Law Enforcement, Monitoring, Events
            Over Time) + 1 PatrolTracksMap + 1 PatrolHeatmapMap. Recomputed
            2026-07-06 (R5/R6): removing the High Priority section's
            EventPointsMap (-1) and adding the new Patrol Tracks Heatmap
            section's PatrolHeatmapMap (+1) nets to the SAME total of 5 map
            islands actually rendered below — verified by counting every
            <EventPointsMap>/<PatrolTracksMap>/<PatrolHeatmapMap> JSX usage
            in this file. Each MapReadySignal decrements the counter;
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
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.lawEnforcement}
          />
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
              <p className="section-list-hint">Full event list in the Full Lists section.</p>
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
                  municipalityBounds={data.municipalityBounds}
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
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.monitoring}
          />
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
              <p className="section-list-hint">Full event list in the Full Lists section.</p>
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
                  municipalityBounds={data.municipalityBounds}
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={2} />
        </section>

        {/* ── Section 3: Patrol List ───────────────────────────────────────
            (R6, 2026-07-06: the former High Priority section that used to
            sit here was removed — see the removed .removeHighPriority note
            in the Master file history; High Priority's underlying chart
            data is intentionally left intact in get-report-map-report-data.ts,
            only its two rendered pages were removed.) */}
        <section
          className="report-section"
          data-testid="section-patrol-list"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.patrolList}
          />
          <h2 className="section-heading">Patrols</h2>
          <div className="section-content patrol-section-content">
            <div className="section-chart">
              {/* R8 (2026-07-06): the former inline `.total-badge` pills
                  ("12", "34.6 h", "210.2 km") in the section heading above
                  are replaced by this labeled stat block — same visual
                  family as the Seaborne/Foot figures below it, each metric
                  now paired with a small proportional bar. */}
              <PatrolTotalsFigure
                total={data.charts.patrolList.total}
                totalHours={data.charts.patrolList.patrolTotals.totalHours}
                totalKm={data.charts.patrolList.patrolTotals.totalKm}
              />
              <PatrolTypeBarChart totals={data.charts.patrolTypeTotals} />
              {data.charts.patrolList.breakdown.length === 0 ? (
                <p className="empty-note">No patrols in this period.</p>
              ) : (
                <p className="section-list-hint">Full patrol list in the Full Lists section.</p>
              )}
            </div>
            <div className="section-map">
              <figure aria-label="Patrol tracks" style={{ position: "relative" }}>
                <figcaption className="sr-only">
                  <table>
                    <caption>Patrol tracks</caption>
                    <thead>
                      <tr>
                        <th scope="col">Patrol</th>
                        <th scope="col">Type</th>
                        <th scope="col">Track Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.charts.patrolList.tracks.slice(0, 30).map((t) => (
                        <tr key={t.patrolId}>
                          <td>{t.label}</td>
                          <td>{fmtPatrolType(t.patrolType)}</td>
                          <td>{t.path.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </figcaption>
                <PatrolTracksMap
                  tracks={data.charts.patrolList.tracks}
                  municipalityBounds={data.municipalityBounds}
                />
                {/* Visible seaborne/foot color legend (R1, 2026-07-06) — the
                    polyline colors above are otherwise unexplained on the
                    printed page. aria-hidden: the sr-only table above
                    already carries the per-track type as accessible text. */}
                <div
                  className="patrol-map-legend"
                  aria-hidden="true"
                  data-testid="patrol-map-legend"
                  style={{
                    position: "absolute",
                    bottom: "4px",
                    left: "4px",
                    zIndex: 1000,
                    display: "flex",
                    gap: "8px",
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "3px",
                    padding: "3px 6px",
                    fontSize: "8px",
                    color: "#111",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        background: "#16A34A",
                        borderRadius: "1px",
                      }}
                    />
                    Seaborne
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        background: "#F97316",
                        borderRadius: "1px",
                      }}
                    />
                    Foot
                  </span>
                </div>
              </figure>
            </div>
          </div>
          {/* R7 (2026-07-06): the two separate Seaborne/Foot over-time
              charts are combined into ONE chart plotting both series on
              shared axes with a legend — the two-column patrol-charts-row
              collapses to a single full-width chart. */}
          <div
            className="patrol-charts-row"
            role="group"
            aria-label="Patrol counts over time by type"
          >
            <div className="patrol-chart-col">
              <PrintMultiSeriesChart
                title="Patrols Over Time by Type"
                height={90}
                series={[
                  {
                    label: "Seaborne",
                    color: "#16A34A",
                    points: data.charts.patrolList.patrolCountByTypeOverTime.seaborne,
                  },
                  {
                    label: "Foot",
                    color: "#F97316",
                    points: data.charts.patrolList.patrolCountByTypeOverTime.foot,
                  },
                ]}
              />
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={3} />
        </section>

        {/* ── Section 4: Patrol Tracks Heatmap ─────────────────────────────
            NEW (R5, 2026-07-06) — map-only page immediately after Patrol
            List. Two heat layers (seaborne green / foot tangerine orange) over the SAME
            track path points the Patrol List polyline map uses (no
            re-densification — see buildPatrolHeatPoints). */}
        <section
          className="report-section"
          data-testid="section-patrol-heatmap"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.patrolHeatmap}
          />
          <h2 className="section-heading">Patrol Tracks Heatmap</h2>
          <div
            className="patrol-heatmap-legend"
            data-testid="patrol-heatmap-legend"
            style={{
              display: "flex",
              gap: "14px",
              marginBottom: "6px",
              fontSize: "9px",
              color: "#374151",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "9px",
                  height: "9px",
                  background: "#16A34A",
                  borderRadius: "2px",
                }}
              />
              Seaborne
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "9px",
                  height: "9px",
                  background: "#F97316",
                  borderRadius: "2px",
                }}
              />
              Foot
            </span>
          </div>
          <div className="section-map" style={{ width: "100%" }}>
            <figure aria-label="Patrol tracks heatmap — seaborne vs foot density">
              <figcaption className="sr-only">
                <table>
                  <caption>Patrol tracks heatmap point counts by type</caption>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Heat Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Seaborne</td>
                      <td>{data.charts.patrolList.patrolHeatPoints.seaborne.length}</td>
                    </tr>
                    <tr>
                      <td>Foot</td>
                      <td>{data.charts.patrolList.patrolHeatPoints.foot.length}</td>
                    </tr>
                  </tbody>
                </table>
              </figcaption>
              <PatrolHeatmapMap
                seaborne={data.charts.patrolList.patrolHeatPoints.seaborne}
                foot={data.charts.patrolList.patrolHeatPoints.foot}
                municipalityBounds={data.municipalityBounds}
              />
            </figure>
          </div>
          <PageFooter {...footerBase} pageNum={4} />
        </section>

        {/* ── Section 5: Events Over Time ───────────────────────────────── */}
        <section
          className="report-section"
          data-testid="section-events-over-time"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.eventsOverTime}
          />
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
                color="hsl(var(--chart-1))"
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
                  municipalityBounds={data.municipalityBounds}
                />
              </figure>
            </div>
          </div>
          <PageFooter {...footerBase} pageNum={5} />
        </section>

        {/* ── Section 1b: Law Enforcement — per-type tables (landscape) ───── */}
        <section
          className="report-section-list event-list"
          data-testid="section-law-enforcement-list"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.lawEnforcement}
          />
          <h2 className="section-heading">
            Law Enforcement Events — Full List
            <span className="total-badge">
              {data.charts.lawEnforcement.total.toLocaleString()}
            </span>
          </h2>
          <EventTypeTables
            events={data.charts.lawEnforcement.breakdown.flatMap((r) => r.events)}
            captionPrefix="Law enforcement full event list"
            eventTypeColumns={data.eventTypeColumns}
          />
          <PageFooter {...footerBase} pageNum={6} />
        </section>

        {/* ── Section 2b: Monitoring — per-type tables (landscape) ────────── */}
        <section
          className="report-section-list event-list"
          data-testid="section-monitoring-list"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.monitoring}
          />
          <h2 className="section-heading">
            Monitoring Events — Full List
            <span className="total-badge">
              {data.charts.monitoring.total.toLocaleString()}
            </span>
          </h2>
          <EventTypeTables
            events={data.charts.monitoring.breakdown.flatMap((r) => r.events)}
            captionPrefix="Monitoring full event list"
            eventTypeColumns={data.eventTypeColumns}
          />
          <PageFooter {...footerBase} pageNum={7} />
        </section>

        {/* ── Section 4b: Patrol List — full list (portrait) ──────────────── */}
        <section
          className="report-section-list"
          data-testid="section-patrol-list-list"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.patrolList}
          />
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

        {/* ── Section 5b: Events Over Time — per-type tables (landscape) ──── */}
        <section
          className="report-section-list event-list"
          data-testid="section-events-over-time-list"
        >
          <PageHeader
            {...headerProps}
            reportTitle={REPORT_MAP_SECTION_TITLES.eventsOverTime}
          />
          <h2 className="section-heading">
            Events Over Time — Full List
            <span className="total-badge">
              {data.charts.eventsOverTime.total.toLocaleString()}
            </span>
          </h2>
          <EventTypeTables
            events={data.charts.eventsOverTime.events}
            captionPrefix="Events over time — full event list"
            eventTypeColumns={data.eventTypeColumns}
          />
          <PageFooter {...footerBase} pageNum={9} />
        </section>

        {/* Puppeteer networkidle0 anchor. */}
        <img
          alt=""
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ position: "absolute", width: 1, height: 1, left: -9999 }}
        />
        {/* Equalizes split event-type table row heights across both column
            pages so rows line up (owner report 2026-07-06). Client island;
            runs after layout, before the map islands flip __renderReady. */}
        <RowHeightSync />
      </body>
    </html>
  );
}
