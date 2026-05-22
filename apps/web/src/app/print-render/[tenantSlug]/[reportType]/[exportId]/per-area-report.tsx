/**
 * Per Area Report PDF render — funder-grade template.
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for networkidle0 on the print-renderer pipeline (Batch 5 Item 3),
 * so all content must be in the initial HTML — no client-side data fetching.
 *
 *   Page 1 — Event Breakdown + Patrol Summary (this sub-batch, 6.2a)
 *   Page 2 — Event Heatmap + Patrol Track Heatmap (6.2b)
 *   Page 3 — Fuel Consumption (6.2c)
 *
 * Spec: docs/PRODUCT.md §130-139 "Reports — Per Area".
 *
 * Page 1 (6.2a) covers: header band with tenant name + report title + area +
 * date range, two dynamic event-type bar charts (law enforcement + monitoring),
 * and three patrol summary cards (foot / seaborne / total).
 */

import type { PerAreaReportData } from "@/server/per-area-report/get-per-area-report-data";
import { Page1EventAndPatrolSummary } from "./page-1-event-and-patrol-summary";

interface PerAreaReportProps {
  data: PerAreaReportData;
}

const PAPER_SIZE_CSS: Record<PerAreaReportData["paperSize"], string> = {
  A4: "A4 landscape",
  Letter: "Letter landscape",
  Legal: "Legal landscape",
};

function offsetMinutesFromTimezone(timezone: string): number {
  if (timezone === "UTC") return 0;
  return 480; // v2 launch tenants — see get-coverage-report-data.ts JSDoc.
}

function formatTenantLocal(d: Date, offsetMinutes: number): string {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${String(year)}-${month}-${day} ${hour}:${minute}`;
}

export function PerAreaReport({ data }: PerAreaReportProps) {
  const offsetMinutes = offsetMinutesFromTimezone(data.tenant.timezone);
  const paperCss = PAPER_SIZE_CSS[data.paperSize];

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {data.tenant.name} — Per Area Report — {data.area.name} —{" "}
          {data.dateRange.label}
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
        `}</style>
      </head>
      <body>
        <header className="report-header">
          <div>
            <div className="brand">Marine Guardian Command Center</div>
            <h1>{data.tenant.name}</h1>
            <h2>
              Per Area Report — {data.area.name} — {data.dateRange.label}
            </h2>
          </div>
          <div className="meta">
            <div>
              <strong>Area:</strong> {data.area.name}{" "}
              <span style={{ color: "#9ca3af" }}>·</span> {data.area.region}
            </div>
            <div>
              <strong>Date Range:</strong> {data.dateRange.label}
              {data.dateRange.isDefault && (
                <span
                  style={{
                    marginLeft: "4px",
                    padding: "1px 4px",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: "#0f766e",
                    background: "#ecfeff",
                    border: "1px solid #a5f3fc",
                    borderRadius: "2px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                  data-testid="default-range-badge"
                  title="Date range fell back to the current calendar month"
                >
                  default
                </span>
              )}
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

        <Page1EventAndPatrolSummary
          area={data.area}
          dateRange={data.dateRange}
          lawEnforcementBreakdown={data.lawEnforcementBreakdown}
          monitoringBreakdown={data.monitoringBreakdown}
          patrolSummary={data.patrolSummary}
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
