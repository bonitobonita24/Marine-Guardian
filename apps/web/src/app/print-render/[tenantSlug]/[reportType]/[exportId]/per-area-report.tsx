/**
 * Per Area Report PDF render — funder-grade template.
 *
 * Pure RSC: server-renders a fully self-contained HTML document. Puppeteer
 * waits for networkidle0 on the print-renderer pipeline (Batch 5 Item 3),
 * so all content must be in the initial HTML — no client-side data fetching.
 *
 *   Page 1 — Event Breakdown + Patrol Summary (6.2a)
 *   Page 2 — Event Heatmap + Patrol Track Heatmap (6.2b)
 *   Page 3 — Fuel Consumption (6.2c — this sub-batch)
 *
 * Spec: docs/PRODUCT.md §130-139 "Reports — Per Area".
 *
 * Page 1 covers: header band with tenant name + report title + area + date
 * range, two dynamic event-type bar charts (law enforcement + monitoring),
 * and three patrol summary cards (foot / seaborne / total).
 *
 * Page 2 covers: dual-layer Leaflet heatmap (events + patrol tracks) with a
 * server-rendered legend + methodology footer.
 *
 * Page 3 covers: 3-KPI card row (total liters / total cost / aggregate
 * L/km) + conditional per-month breakdown table (renders only when the
 * report date range spans 2 or more calendar months) + methodology footer
 * explaining the per-area fuel allocation caveat (PRODUCT.md §128).
 */

import type { PerAreaReportData } from "@/server/per-area-report/get-per-area-report-data";
import { Page1EventAndPatrolSummary } from "./page-1-event-and-patrol-summary";
import { Page2Heatmaps } from "./page-2-heatmaps";
import { Page3FuelConsumption } from "./page-3-fuel-consumption";
import { ReportHeader, reportHeaderStyles } from "./components/report-header";
import { PrintDocumentShell } from "./components/print-document-shell";

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
    /* No <html>/<head>/<body> here — this page renders inside the app root
       layout's document. Emitting a nested document was the React #418
       hydration-mismatch root cause; see components/print-document-shell.tsx. */
    <PrintDocumentShell
      title={`${data.tenant.name} — Per Area Report — ${data.area.name} — ${data.dateRange.label}`}
      css={`
          /* Shadcn chart-token palette (R9, 2026-07-06) — same injection as
             report-map-report.tsx / coverage-report.tsx: EventBreakdownChart
             (Page 1) references hsl(var(--chart-1))/hsl(var(--chart-2)) so
             this report's bar colours match the shadcn dashboard palette
             too. Plain CSS custom properties resolve without Tailwind
             layers. */
          :root {
            --chart-1: 221 83% 48%;
            --chart-2: 150 62% 36%;
            --chart-3: 30 80% 55%;
            --chart-4: 280 65% 60%;
            --chart-5: 340 75% 55%;
          }
          @page { size: ${paperCss}; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; padding: 16px 20px; font-size: 11px; line-height: 1.4; }
          /* Shared print-render header (2026-07-06 redesign) — see
             components/report-header.tsx. Replaces the former bespoke
             .report-header (tenant name + brand text + right-aligned meta). */
          ${reportHeaderStyles}
          .report-meta { text-align: center; font-size: 10px; color: #6b7280; margin: -4px 0 16px; }
          .report-meta .default-range-badge {
            margin-left: 4px; padding: 1px 4px; font-size: 8px; font-weight: 600;
            color: #0f766e; background: #ecfeff; border: 1px solid #a5f3fc;
            border-radius: 2px; text-transform: uppercase; letter-spacing: 0.04em;
          }
        `}
    >
        <ReportHeader
          municipalityName={data.area.name}
          reportTitle="Area Coverage"
          dateRange={data.dateRange.label}
        />
        <div className="report-meta">
          <strong>Area:</strong> {data.area.name}{" "}
          <span style={{ color: "#9ca3af" }}>·</span> {data.area.region}{" "}
          <span style={{ color: "#9ca3af" }}>·</span>{" "}
          <strong>Date Range:</strong> {data.dateRange.label}
          {data.dateRange.isDefault && (
            <span
              className="default-range-badge"
              data-testid="default-range-badge"
              title="Date range fell back to the current calendar month"
            >
              default
            </span>
          )}{" "}
          <span style={{ color: "#9ca3af" }}>·</span>{" "}
          <strong>Generated:</strong>{" "}
          {formatTenantLocal(data.generatedAt, offsetMinutes)} (
          {data.tenant.timezone}) <span style={{ color: "#9ca3af" }}>·</span>{" "}
          <strong>Paper:</strong> {data.paperSize}
        </div>

        <Page1EventAndPatrolSummary
          area={data.area}
          dateRange={data.dateRange}
          lawEnforcementBreakdown={data.lawEnforcementBreakdown}
          monitoringBreakdown={data.monitoringBreakdown}
          patrolSummary={data.patrolSummary}
        />

        <Page2Heatmaps
          area={data.area}
          dateRange={data.dateRange}
          lawEnforcementEventLocations={data.lawEnforcementEventLocations}
          monitoringEventLocations={data.monitoringEventLocations}
          patrolTracks={data.patrolTracks}
        />

        <Page3FuelConsumption
          area={data.area}
          dateRange={data.dateRange}
          fuelConsumption={data.fuelConsumption}
        />

        {/* Puppeteer networkidle0 anchor. */}
        <img
          alt=""
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ position: "absolute", width: 1, height: 1, left: -9999 }}
        />
    </PrintDocumentShell>
  );
}
