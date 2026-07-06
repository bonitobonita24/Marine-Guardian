/**
 * "Patrols by Type" bar chart — Report Map PDF, Patrol List section.
 *
 * Renders TWO separate per-type mini charts — "Seaborne" and "Foot" (owner
 * request 2026-07-06) — each with three bars: total patrol count, total
 * hours, and total kilometers. The three metrics have very different scales
 * (a count vs hours vs km), so each bar is scaled to that METRIC's max
 * across BOTH types (patrol bars share the patrol-max, hours bars share the
 * hours-max, km bars share the km-max) — this keeps "Seaborne Patrols" and
 * "Foot Patrols" visually comparable (same denominator) while still making
 * the much-smaller hours/km bars legible, instead of dwarfing them under one
 * shared axis with the patrol count.
 *
 * This chart lives in the report's LEFT `.section-chart` column, stacked
 * beside the patrol-tracks map on the right (see report-map-report.tsx) —
 * previously it sat below the map+chart row as a full-width strip; moved
 * left per owner directive 2026-07-06 to fit the whole patrol section on one
 * landscape page.
 *
 * Print-friendly: a plain server component (no "use client", no Recharts
 * island) that emits a self-contained inline SVG — same rationale as the
 * other print-render charts (this sub-tree has no Tailwind CSS layers), but
 * here taken one step further: no client hydration/interactivity at all, so
 * this section never depends on a chart library mounting before Puppeteer's
 * page.pdf() fires. Colors mirror the existing Seaborne (#0891b2) / Foot
 * (#0f766e) palette used by the "Seaborne/Foot Patrols Over Time" charts in
 * this same section (see PrintTimeSeriesChart usages in report-map-report.tsx).
 *
 * WCAG 2.2 AA: the SVG is decorative (aria-hidden); a <figcaption
 * class="sr-only"> table (caption + scope attrs), mirroring MapAltTable /
 * the other report charts' sr-only alt tables, carries the full data as text.
 */

import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

interface PatrolTypeBarChartProps {
  totals: { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal };
}

const SEABORNE_COLOR = "#0891b2"; // cyan-600 — matches "Seaborne Patrols Over Time"
const FOOT_COLOR = "#0f766e"; // teal-700 — matches "Foot Patrols Over Time"

type PatrolTypeKey = "seaborne" | "foot";

interface MetricStat {
  key: string;
  label: string;
  seaborne: number;
  foot: number;
  /** Shared max across BOTH types for this metric — the per-metric scale
   *  denominator so a "Seaborne" bar and a "Foot" bar (on separate mini
   *  charts) remain comparable, and small hours/km values don't collapse to
   *  zero height next to a much larger patrol count. */
  max: number;
  format: (n: number) => string;
}

function fmtCount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDecimal(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function buildMetrics(totals: PatrolTypeBarChartProps["totals"]): MetricStat[] {
  const raw: Array<Omit<MetricStat, "max">> = [
    {
      key: "patrols",
      label: "Patrols",
      seaborne: totals.seaborne.count,
      foot: totals.foot.count,
      format: fmtCount,
    },
    {
      key: "hours",
      label: "Hours (h)",
      seaborne: totals.seaborne.hours,
      foot: totals.foot.hours,
      format: fmtDecimal,
    },
    {
      key: "km",
      label: "Kilometers (km)",
      seaborne: totals.seaborne.km,
      foot: totals.foot.km,
      format: fmtDecimal,
    },
  ];
  return raw.map((r) => ({ ...r, max: Math.max(r.seaborne, r.foot) }));
}

// SVG geometry (viewBox units — scales via width:100% on the root <svg>).
// One column per metric within a single type's mini chart (3 columns: Patrols
// / Hours / Km), sized to fit two of these side by side in the report's
// narrower LEFT column.
const BAR_WIDTH = 24;
const GROUP_WIDTH = 42;
const CHART_HEIGHT = 50;
const BASELINE_Y = 58;
const SVG_HEIGHT = 82;

interface BarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  label: string;
  format: (n: number) => string;
}

function barsForType(metrics: MetricStat[], typeKey: PatrolTypeKey): BarGeometry[] {
  return metrics.map((m, index) => {
    const groupX = index * GROUP_WIDTH;
    const x = groupX + (GROUP_WIDTH - BAR_WIDTH) / 2;
    const value = m[typeKey];
    const height = m.max > 0 ? (value / m.max) * CHART_HEIGHT : 0;
    return {
      x,
      y: BASELINE_Y - height,
      width: BAR_WIDTH,
      height,
      value,
      label: m.label,
      format: m.format,
    };
  });
}

interface PatrolTypeMiniChartProps {
  title: string;
  color: string;
  metrics: MetricStat[];
  typeKey: PatrolTypeKey;
}

function PatrolTypeMiniChart({
  title,
  color,
  metrics,
  typeKey,
}: PatrolTypeMiniChartProps) {
  const bars = barsForType(metrics, typeKey);
  const svgWidth = GROUP_WIDTH * metrics.length;

  return (
    <div
      data-testid={`patrol-type-mini-chart-${typeKey}`}
      style={{ flex: "1 1 0", minWidth: 0 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginBottom: "2px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "7px",
            height: "7px",
            background: color,
            borderRadius: "1px",
          }}
        />
        <span style={{ fontSize: "8px", fontWeight: 600, color: "#374151" }}>
          {title}
        </span>
      </div>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(svgWidth)} ${String(SVG_HEIGHT)}`}
        width="100%"
        height="80px"
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1={1}
          x2={svgWidth - 1}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          stroke="#e5e7eb"
        />
        {bars.map((bar) => (
          <g key={bar.label}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={Math.max(bar.height, 0)}
              fill={color}
              rx={2}
            />
            <text
              x={bar.x + bar.width / 2}
              y={bar.y - 3}
              textAnchor="middle"
              fontSize="7"
              fill="#111"
            >
              {bar.format(bar.value)}
            </text>
            <text
              x={bar.x + bar.width / 2}
              y={BASELINE_Y + 9}
              textAnchor="middle"
              fontSize="7"
              fill="#6b7280"
            >
              {bar.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

interface AltTableRow {
  metric: string;
  seaborne: string;
  foot: string;
}

function altRows(metrics: MetricStat[]): AltTableRow[] {
  return metrics.map((m) => ({
    metric: m.label,
    seaborne: m.format(m.seaborne),
    foot: m.format(m.foot),
  }));
}

export function PatrolTypeBarChart({ totals }: PatrolTypeBarChartProps) {
  const metrics = buildMetrics(totals);
  const allZero = metrics.every((m) => m.seaborne === 0 && m.foot === 0);

  if (allZero) {
    return (
      <div
        data-testid="patrol-type-bar-chart-empty"
        style={{
          padding: "16px",
          color: "#6b7280",
          fontStyle: "italic",
          textAlign: "center",
          fontSize: "10px",
        }}
      >
        No patrol type data for this period.
      </div>
    );
  }

  const rows = altRows(metrics);

  return (
    <figure
      data-testid="patrol-type-bar-chart"
      style={{ margin: 0, padding: 0, width: "100%" }}
      aria-label="Patrols by type"
    >
      <figcaption className="sr-only">
        <table>
          <caption>Patrols by Type</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Seaborne</th>
              <th scope="col">Foot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.metric}>
                <td>{r.metric}</td>
                <td>{r.seaborne}</td>
                <td>{r.foot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#374151",
          marginBottom: "3px",
        }}
      >
        Patrols by Type
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <PatrolTypeMiniChart
          title="Seaborne"
          color={SEABORNE_COLOR}
          metrics={metrics}
          typeKey="seaborne"
        />
        <PatrolTypeMiniChart
          title="Foot"
          color={FOOT_COLOR}
          metrics={metrics}
          typeKey="foot"
        />
      </div>
    </figure>
  );
}
