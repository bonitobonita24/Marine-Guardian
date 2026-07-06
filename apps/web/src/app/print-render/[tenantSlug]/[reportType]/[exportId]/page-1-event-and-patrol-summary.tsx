/**
 * Per Area Report — Page 1 (Event Breakdown + Patrol Summary).
 *
 * RSC composer for v2 PRODUCT.md §130-139 "Reports — Per Area". Page 1
 * combines two dynamic event-type bar charts (law enforcement + monitoring,
 * sourced from EventType.category) with two patrol summary cards (foot vs
 * seaborne with count / km / hours).
 *
 * Layout (A4 landscape):
 *
 *   [Section header — Per Area Report · Area · Date Range]
 *   [Two-column grid — Law Enforcement chart left, Monitoring chart right]
 *   [Patrol summary row — Foot card + Seaborne card + Total card]
 *
 * Pages 2 (heatmap) and 3 (fuel) land in 6.2b and 6.2c respectively.
 */

import type {
  EventTypeBreakdownRow,
  PatrolTypeSummary,
  PerAreaReportArea,
  PerAreaReportDateRange,
} from "@/server/per-area-report/get-per-area-report-data";
import { EventBreakdownChart } from "./components/event-breakdown-chart";
import { ReportHeader } from "./components/report-header";

interface Page1Props {
  area: PerAreaReportArea;
  dateRange: PerAreaReportDateRange;
  lawEnforcementBreakdown: EventTypeBreakdownRow[];
  monitoringBreakdown: EventTypeBreakdownRow[];
  patrolSummary: {
    foot: PatrolTypeSummary;
    seaborne: PatrolTypeSummary;
  };
}

function formatNumber(n: number, fractionDigits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function totalSummary(
  foot: PatrolTypeSummary,
  seaborne: PatrolTypeSummary,
): PatrolTypeSummary {
  return {
    count: foot.count + seaborne.count,
    totalDistanceKm: foot.totalDistanceKm + seaborne.totalDistanceKm,
    totalHours: foot.totalHours + seaborne.totalHours,
  };
}

export function Page1EventAndPatrolSummary({
  area,
  dateRange,
  lawEnforcementBreakdown,
  monitoringBreakdown,
  patrolSummary,
}: Page1Props) {
  const total = totalSummary(patrolSummary.foot, patrolSummary.seaborne);

  return (
    <section
      className="page-1-event-and-patrol-summary"
      data-testid="page-1-event-and-patrol-summary"
      style={{ paddingTop: "4px" }}
    >
      <ReportHeader
        municipalityName={area.name}
        reportTitle="Event Breakdown & Patrol Summary"
        dateRange={dateRange.label}
      />

      <div
        className="page-1-charts-grid"
        data-testid="page-1-charts-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div
          className="chart-column"
          data-testid="law-enforcement-chart-column"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            padding: "8px",
            background: "#fafafa",
            minHeight: "200px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h4
            style={{
              fontSize: "11px",
              margin: "0 0 6px",
              color: "#b91c1c",
            }}
          >
            Law Enforcement Events ({lawEnforcementBreakdown.length})
          </h4>
          <div style={{ flex: 1, minHeight: "180px" }}>
            <EventBreakdownChart
              rows={lawEnforcementBreakdown}
              variant="lawEnforcement"
            />
          </div>
        </div>

        <div
          className="chart-column"
          data-testid="monitoring-chart-column"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            padding: "8px",
            background: "#fafafa",
            minHeight: "200px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h4
            style={{
              fontSize: "11px",
              margin: "0 0 6px",
              color: "#0e7490",
            }}
          >
            Monitoring Events ({monitoringBreakdown.length})
          </h4>
          <div style={{ flex: 1, minHeight: "180px" }}>
            <EventBreakdownChart
              rows={monitoringBreakdown}
              variant="monitoring"
            />
          </div>
        </div>
      </div>

      <div
        className="patrol-summary-cards"
        data-testid="patrol-summary-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
        }}
      >
        <div
          className="summary-card"
          data-testid="patrol-card-foot"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            padding: "10px 12px",
            background: "#f9fafb",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
              marginBottom: "4px",
            }}
          >
            Foot Patrols
          </div>
          <div
            style={{ fontSize: "18px", fontWeight: 600, color: "#111" }}
            data-testid="patrol-card-foot-count"
          >
            {patrolSummary.foot.count}
          </div>
          <div
            style={{ fontSize: "10px", color: "#6b7280", marginTop: "4px" }}
            data-testid="patrol-card-foot-detail"
          >
            {formatNumber(patrolSummary.foot.totalDistanceKm, 1)} km ·{" "}
            {formatNumber(patrolSummary.foot.totalHours, 1)} hrs
          </div>
        </div>

        <div
          className="summary-card"
          data-testid="patrol-card-seaborne"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            padding: "10px 12px",
            background: "#f9fafb",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b7280",
              marginBottom: "4px",
            }}
          >
            Seaborne Patrols
          </div>
          <div
            style={{ fontSize: "18px", fontWeight: 600, color: "#111" }}
            data-testid="patrol-card-seaborne-count"
          >
            {patrolSummary.seaborne.count}
          </div>
          <div
            style={{ fontSize: "10px", color: "#6b7280", marginTop: "4px" }}
            data-testid="patrol-card-seaborne-detail"
          >
            {formatNumber(patrolSummary.seaborne.totalDistanceKm, 1)} km ·{" "}
            {formatNumber(patrolSummary.seaborne.totalHours, 1)} hrs
          </div>
        </div>

        <div
          className="summary-card"
          data-testid="patrol-card-total"
          style={{
            border: "1px solid #0f766e",
            borderRadius: "6px",
            padding: "10px 12px",
            background: "#ecfeff",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#0f766e",
              marginBottom: "4px",
            }}
          >
            Total
          </div>
          <div
            style={{ fontSize: "18px", fontWeight: 600, color: "#0f766e" }}
            data-testid="patrol-card-total-count"
          >
            {total.count}
          </div>
          <div
            style={{ fontSize: "10px", color: "#0f766e", marginTop: "4px" }}
            data-testid="patrol-card-total-detail"
          >
            {formatNumber(total.totalDistanceKm, 1)} km ·{" "}
            {formatNumber(total.totalHours, 1)} hrs
          </div>
        </div>
      </div>
    </section>
  );
}
