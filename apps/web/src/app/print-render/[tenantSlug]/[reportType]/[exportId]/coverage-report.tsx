/**
 * Coverage Report PDF render — Page 1 (Patrol Index).
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for networkidle0 on the print-renderer pipeline (5.3a), so all
 * content must be in the initial HTML — no client-side data fetching.
 *
 * Page 2 (Area Boundary Summary) and Page 3 (Area Covered) ship in 6.1b/6.1c.
 *
 * Layout follows v2 PRODUCT.md L215-L217:
 *   - Header: tenant name + report title + date range + generated timestamp
 *   - Summary cards (count + km by type: Foot / Seaborne / Total)
 *   - Type subtotal table
 *   - Full patrol detail table (one row per patrol)
 */

import type {
  CoverageReportData,
  CoverageReportPatrolRow,
} from "@/server/coverage-report/get-coverage-report-data";
import { Page2AreaBoundarySummary } from "./page-2-area-boundary-summary";

interface CoverageReportProps {
  data: CoverageReportData;
}

const PAPER_SIZE_CSS: Record<CoverageReportData["paperSize"], string> = {
  A4: "A4 landscape",
  Letter: "Letter landscape",
  Legal: "Legal landscape",
};

function formatNumber(n: number | null, fractionDigits: number): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCoord(loc: { lat: number; lon: number } | null): string {
  if (loc === null) return "—";
  return `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
}

function formatTenantLocal(d: Date | null, offsetMinutes: number): string {
  if (d === null) return "—";
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${String(year)}-${month}-${day} ${hour}:${minute}`;
}

function formatDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${String(m)}m`;
  return `${String(h)}h ${String(m).padStart(2, "0")}m`;
}

function formatPatrolType(t: CoverageReportPatrolRow["patrolType"]): string {
  return t === "foot" ? "Foot" : "Seaborne";
}

function offsetMinutesFromTimezone(timezone: string): number {
  if (timezone === "UTC") return 0;
  return 480; // v2 launch tenants — see get-coverage-report-data.ts JSDoc.
}

interface TypeSubtotal {
  count: number;
  totalKm: number;
  totalHours: number;
}

function computeSubtotals(patrols: CoverageReportPatrolRow[]): {
  foot: TypeSubtotal;
  seaborne: TypeSubtotal;
  total: TypeSubtotal;
} {
  const init = (): TypeSubtotal => ({ count: 0, totalKm: 0, totalHours: 0 });
  const foot = init();
  const seaborne = init();
  for (const p of patrols) {
    const bucket = p.patrolType === "foot" ? foot : seaborne;
    bucket.count += 1;
    if (p.totalDistanceKm !== null && Number.isFinite(p.totalDistanceKm)) {
      bucket.totalKm += p.totalDistanceKm;
    }
    if (p.totalHours !== null && Number.isFinite(p.totalHours)) {
      bucket.totalHours += p.totalHours;
    }
  }
  const total: TypeSubtotal = {
    count: foot.count + seaborne.count,
    totalKm: foot.totalKm + seaborne.totalKm,
    totalHours: foot.totalHours + seaborne.totalHours,
  };
  return { foot, seaborne, total };
}

export function CoverageReport({ data }: CoverageReportProps) {
  const offsetMinutes = offsetMinutesFromTimezone(data.tenant.timezone);
  const subtotals = computeSubtotals(data.patrols);
  const inclusiveEnd = new Date(data.period.end.getTime() - 1);
  const periodDisplay = `${formatTenantLocal(data.period.start, offsetMinutes)} — ${formatTenantLocal(inclusiveEnd, offsetMinutes)}`;
  const paperCss = PAPER_SIZE_CSS[data.paperSize];

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {data.tenant.name} — Patrol Coverage — {data.period.label}
        </title>
        <style>{`
          @page { size: ${paperCss}; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; padding: 16px 20px; font-size: 11px; line-height: 1.4; }
          header.report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 16px; }
          header.report-header .brand { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
          header.report-header h1 { font-size: 22px; margin: 4px 0 2px; color: #0f766e; }
          header.report-header h2 { font-size: 13px; margin: 0; font-weight: 500; color: #374151; }
          header.report-header .meta { text-align: right; font-size: 10px; color: #6b7280; }
          header.report-header .meta div { margin-bottom: 2px; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
          .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; background: #f9fafb; }
          .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }
          .summary-card .value { font-size: 18px; font-weight: 600; color: #111; }
          .summary-card .sub { font-size: 10px; color: #6b7280; margin-top: 4px; }
          section.subtotals h3, section.patrol-detail h3 { font-size: 13px; margin: 10px 0 8px; color: #0f766e; }
          table.report-table { width: 100%; border-collapse: collapse; font-size: 10px; }
          table.report-table th, table.report-table td { border: 1px solid #e5e7eb; padding: 5px 7px; text-align: left; vertical-align: top; }
          table.report-table thead th { background: #f3f4f6; font-weight: 600; color: #374151; }
          table.report-table tbody tr:nth-child(even) td { background: #fafafa; }
          table.report-table td.num, table.report-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
          table.report-table tfoot td { font-weight: 600; background: #f3f4f6; border-top: 2px solid #d1d5db; }
          .empty-state { text-align: center; padding: 24px; color: #6b7280; font-style: italic; }
        `}</style>
      </head>
      <body>
        <header className="report-header">
          <div>
            <div className="brand">Marine Guardian Command Center</div>
            <h1>{data.tenant.name}</h1>
            <h2>Patrol Coverage Report — {data.period.label}</h2>
          </div>
          <div className="meta">
            <div>
              <strong>Period:</strong> {periodDisplay}
            </div>
            <div>
              <strong>Generated:</strong>{" "}
              {formatTenantLocal(data.generatedAt, offsetMinutes)} (
              {data.tenant.timezone})
            </div>
            <div>
              <strong>Paper:</strong> {data.paperSize}
            </div>
          </div>
        </header>

        <section className="summary-cards" aria-label="Period summary">
          <div className="summary-card" data-testid="card-foot">
            <div className="label">Foot Patrols</div>
            <div className="value">{subtotals.foot.count}</div>
            <div className="sub">
              {formatNumber(subtotals.foot.totalKm, 1)} km ·{" "}
              {formatNumber(subtotals.foot.totalHours, 1)} hrs
            </div>
          </div>
          <div className="summary-card" data-testid="card-seaborne">
            <div className="label">Seaborne Patrols</div>
            <div className="value">{subtotals.seaborne.count}</div>
            <div className="sub">
              {formatNumber(subtotals.seaborne.totalKm, 1)} km ·{" "}
              {formatNumber(subtotals.seaborne.totalHours, 1)} hrs
            </div>
          </div>
          <div className="summary-card" data-testid="card-total">
            <div className="label">Total</div>
            <div className="value">{subtotals.total.count}</div>
            <div className="sub">
              {formatNumber(subtotals.total.totalKm, 1)} km ·{" "}
              {formatNumber(subtotals.total.totalHours, 1)} hrs
            </div>
          </div>
        </section>

        <section className="subtotals">
          <h3>Patrol Type Subtotals</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Count</th>
                <th className="num">Total KM</th>
                <th className="num">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Foot</td>
                <td className="num">{subtotals.foot.count}</td>
                <td className="num">
                  {formatNumber(subtotals.foot.totalKm, 1)}
                </td>
                <td className="num">
                  {formatNumber(subtotals.foot.totalHours, 1)}
                </td>
              </tr>
              <tr>
                <td>Seaborne</td>
                <td className="num">{subtotals.seaborne.count}</td>
                <td className="num">
                  {formatNumber(subtotals.seaborne.totalKm, 1)}
                </td>
                <td className="num">
                  {formatNumber(subtotals.seaborne.totalHours, 1)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{subtotals.total.count}</td>
                <td className="num">
                  {formatNumber(subtotals.total.totalKm, 1)}
                </td>
                <td className="num">
                  {formatNumber(subtotals.total.totalHours, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="patrol-detail">
          <h3>Patrol Detail ({data.patrols.length})</h3>
          {data.patrols.length === 0 ? (
            <div className="empty-state" data-testid="no-patrols">
              No patrols recorded for this period.
            </div>
          ) : (
            <table className="report-table" data-testid="patrol-table">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Title / Objective</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Tracked By</th>
                  <th>Start Location</th>
                  <th>End Location</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th className="num">Duration</th>
                  <th className="num">KMS</th>
                </tr>
              </thead>
              <tbody>
                {data.patrols.map((p) => (
                  <tr key={p.id}>
                    <td>{p.serialNumber ?? "—"}</td>
                    <td>{p.title ?? p.areaName ?? "—"}</td>
                    <td>{formatPatrolType(p.patrolType)}</td>
                    <td>{p.state}</td>
                    <td>{p.leaderName ?? "—"}</td>
                    <td>{formatCoord(p.startLocation)}</td>
                    <td>{formatCoord(p.endLocation)}</td>
                    <td>{formatTenantLocal(p.startTime, offsetMinutes)}</td>
                    <td>{formatTenantLocal(p.endTime, offsetMinutes)}</td>
                    <td className="num">{formatDuration(p.totalHours)}</td>
                    <td className="num">
                      {formatNumber(p.totalDistanceKm, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <Page2AreaBoundarySummary
          enabledAreas={data.enabledAreas}
          patrols={data.patrols}
          attributions={data.attributions}
          patrolCountsByArea={data.patrolCountsByArea}
          unattributedPatrolCount={data.unattributedPatrolCount}
        />

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
