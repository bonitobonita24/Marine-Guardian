// page-1-event-and-patrol-summary.test.tsx

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock the Client island so renderToStaticMarkup doesn't trip on Recharts.
vi.mock("../components/event-breakdown-chart", () => ({
  EventBreakdownChart: ({
    rows,
    variant,
  }: {
    rows: Array<{ display: string; count: number }>;
    variant: string;
  }) => (
    <div data-testid={`mock-chart-${variant}`}>
      MockChart variant={variant} bars={rows.length}
    </div>
  ),
}));

import { Page1EventAndPatrolSummary } from "../page-1-event-and-patrol-summary";
import type {
  EventTypeBreakdownRow,
  PatrolTypeSummary,
  PerAreaReportArea,
  PerAreaReportDateRange,
} from "@/server/per-area-report/get-per-area-report-data";

const AREA: PerAreaReportArea = {
  id: "area_a5",
  name: "Area A5",
  region: "Mindoro Strait",
  source: "ARCGIS",
};

const DATE_RANGE: PerAreaReportDateRange = {
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
  label: "May 2026",
  isDefault: true,
};

const LAW: EventTypeBreakdownRow[] = [
  { eventTypeId: "et1", value: "illegal", display: "Illegal Fishing", count: 5 },
  { eventTypeId: "et2", value: "appr", display: "Apprehension", count: 2 },
];

const MON: EventTypeBreakdownRow[] = [
  { eventTypeId: "et3", value: "turtle", display: "Turtle Sighting", count: 3 },
];

const FOOT: PatrolTypeSummary = {
  count: 4,
  totalDistanceKm: 12.5,
  totalHours: 8.0,
};
const SEABORNE: PatrolTypeSummary = {
  count: 6,
  totalDistanceKm: 85.0,
  totalHours: 18.5,
};
const EMPTY_SUMMARY: PatrolTypeSummary = {
  count: 0,
  totalDistanceKm: 0,
  totalHours: 0,
};

describe("Page1EventAndPatrolSummary", () => {
  it("renders the section frame with header, charts grid, and patrol summary row", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    expect(html).toContain(`data-testid="page-1-event-and-patrol-summary"`);
    expect(html).toContain(`data-testid="page-1-charts-grid"`);
    expect(html).toContain(`data-testid="patrol-summary-cards"`);
  });

  it("renders the meta line with area name + date range label", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    expect(html).toContain("Area A5");
    expect(html).toContain("May 2026");
    expect(html).toMatch(/Page 1 .*Event Breakdown.*Patrol Summary/);
  });

  it("mounts both chart variants with the correct row counts in the column headings", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    expect(html).toContain(`data-testid="mock-chart-lawEnforcement"`);
    expect(html).toContain(`data-testid="mock-chart-monitoring"`);
    expect(html).toContain("Law Enforcement Events (2)");
    expect(html).toContain("Monitoring Events (1)");
  });

  it("renders zero-bar charts when both breakdowns are empty", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={[]}
        monitoringBreakdown={[]}
        patrolSummary={{ foot: EMPTY_SUMMARY, seaborne: EMPTY_SUMMARY }}
      />,
    );
    expect(html).toContain("Law Enforcement Events (0)");
    expect(html).toContain("Monitoring Events (0)");
    // Mock chart still mounts — actual empty-state copy is the chart's concern,
    // verified in the chart's own tests (not duplicated here).
    expect(html).toContain(`data-testid="mock-chart-lawEnforcement"`);
  });

  it("renders patrol summary cards with formatted count + km + hours for foot, seaborne, and total", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    // Foot card
    expect(html).toContain(`data-testid="patrol-card-foot-count">4<`);
    expect(html).toContain("12.5 km");
    expect(html).toContain("8.0 hrs");
    // Seaborne card
    expect(html).toContain(`data-testid="patrol-card-seaborne-count">6<`);
    expect(html).toContain("85.0 km");
    expect(html).toContain("18.5 hrs");
    // Total card — count=10, km=97.5, hrs=26.5
    expect(html).toContain(`data-testid="patrol-card-total-count">10<`);
    expect(html).toContain("97.5 km");
    expect(html).toContain("26.5 hrs");
  });

  it("renders zero totals when both patrol types are empty", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: EMPTY_SUMMARY, seaborne: EMPTY_SUMMARY }}
      />,
    );
    expect(html).toContain(`data-testid="patrol-card-foot-count">0<`);
    expect(html).toContain(`data-testid="patrol-card-seaborne-count">0<`);
    expect(html).toContain(`data-testid="patrol-card-total-count">0<`);
    expect(html).toContain("0.0 km");
    expect(html).toContain("0.0 hrs");
  });

  it("preserves the explicit-range date label when not the default month", () => {
    const explicit: PerAreaReportDateRange = {
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-06-01T00:00:00.000Z"),
      label: "2026-05-01 — 2026-05-31",
      isDefault: false,
    };
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={explicit}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    expect(html).toContain("2026-05-01 — 2026-05-31");
  });

  it("includes both chart-column testids and the law/monitoring headers in source order", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    const lawIdx = html.indexOf(`data-testid="law-enforcement-chart-column"`);
    const monIdx = html.indexOf(`data-testid="monitoring-chart-column"`);
    expect(lawIdx).toBeGreaterThan(-1);
    expect(monIdx).toBeGreaterThan(-1);
    expect(lawIdx).toBeLessThan(monIdx);
  });

  it("includes foot card before seaborne card before total card", () => {
    const html = renderToStaticMarkup(
      <Page1EventAndPatrolSummary
        area={AREA}
        dateRange={DATE_RANGE}
        lawEnforcementBreakdown={LAW}
        monitoringBreakdown={MON}
        patrolSummary={{ foot: FOOT, seaborne: SEABORNE }}
      />,
    );
    const footIdx = html.indexOf(`data-testid="patrol-card-foot"`);
    const seaIdx = html.indexOf(`data-testid="patrol-card-seaborne"`);
    const totIdx = html.indexOf(`data-testid="patrol-card-total"`);
    expect(footIdx).toBeGreaterThan(-1);
    expect(footIdx).toBeLessThan(seaIdx);
    expect(seaIdx).toBeLessThan(totIdx);
  });
});
