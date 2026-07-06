/**
 * "Patrols by Type" bar chart — Report Map PDF, Patrol List section.
 *
 * Shows, per patrol type (seaborne vs foot): total patrol count, total
 * hours, and total kilometers (owner request 2026-07-06). The three metrics
 * have very different scales (a count vs hours vs km), so the chart renders
 * three small grouped-bar clusters — one per metric ("Patrols", "Hours (h)",
 * "Kilometers (km)") — each scaled to its OWN max so both bars stay legible.
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

interface MetricGroup {
  key: string;
  label: string;
  seaborne: number;
  foot: number;
  format: (n: number) => string;
}

function fmtCount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDecimal(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function buildMetricGroups(totals: PatrolTypeBarChartProps["totals"]): MetricGroup[] {
  return [
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
}

// SVG geometry (viewBox units — scales via width:100% on the root <svg>).
const GROUP_WIDTH = 110;
const BAR_WIDTH = 26;
const BAR_GAP = 10;
const CHART_HEIGHT = 74;
const BASELINE_Y = 88;
const SVG_HEIGHT = 116;

interface BarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  value: number;
  format: (n: number) => string;
}

function barsForGroup(group: MetricGroup, groupIndex: number): BarGeometry[] {
  const groupX = groupIndex * GROUP_WIDTH;
  const center = groupX + GROUP_WIDTH / 2;
  const seaborneX = center - BAR_GAP / 2 - BAR_WIDTH;
  const footX = center + BAR_GAP / 2;
  const max = Math.max(group.seaborne, group.foot);

  const heightFor = (value: number): number =>
    max > 0 ? (value / max) * CHART_HEIGHT : 0;

  const seaborneHeight = heightFor(group.seaborne);
  const footHeight = heightFor(group.foot);

  return [
    {
      x: seaborneX,
      y: BASELINE_Y - seaborneHeight,
      width: BAR_WIDTH,
      height: seaborneHeight,
      fill: SEABORNE_COLOR,
      value: group.seaborne,
      format: group.format,
    },
    {
      x: footX,
      y: BASELINE_Y - footHeight,
      width: BAR_WIDTH,
      height: footHeight,
      fill: FOOT_COLOR,
      value: group.foot,
      format: group.format,
    },
  ];
}

interface AltTableRow {
  metric: string;
  seaborne: string;
  foot: string;
}

function altRows(groups: MetricGroup[]): AltTableRow[] {
  return groups.map((g) => ({
    metric: g.label,
    seaborne: g.format(g.seaborne),
    foot: g.format(g.foot),
  }));
}

export function PatrolTypeBarChart({ totals }: PatrolTypeBarChartProps) {
  const groups = buildMetricGroups(totals);
  const allZero = groups.every((g) => g.seaborne === 0 && g.foot === 0);

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

  const svgWidth = GROUP_WIDTH * groups.length;
  const rows = altRows(groups);

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
          marginBottom: "2px",
        }}
      >
        Patrols by Type
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "4px",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: SEABORNE_COLOR,
              borderRadius: "1px",
            }}
          />
          <span style={{ fontSize: "8px", color: "#374151" }}>Seaborne</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: FOOT_COLOR,
              borderRadius: "1px",
            }}
          />
          <span style={{ fontSize: "8px", color: "#374151" }}>Foot</span>
        </span>
      </div>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(svgWidth)} ${String(SVG_HEIGHT)}`}
        width="100%"
        height="110px"
        preserveAspectRatio="xMidYMid meet"
      >
        {groups.map((group, groupIndex) => {
          const groupX = groupIndex * GROUP_WIDTH;
          const bars = barsForGroup(group, groupIndex);
          return (
            <g key={group.key}>
              <line
                x1={groupX + 2}
                x2={groupX + GROUP_WIDTH - 2}
                y1={BASELINE_Y}
                y2={BASELINE_Y}
                stroke="#e5e7eb"
              />
              {bars.map((bar, barIndex) => (
                <g key={`${group.key}-${String(barIndex)}`}>
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={Math.max(bar.height, 0)}
                    fill={bar.fill}
                    rx={2}
                  />
                  <text
                    x={bar.x + bar.width / 2}
                    y={bar.y - 3}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#111"
                  >
                    {bar.format(bar.value)}
                  </text>
                </g>
              ))}
              <text
                x={groupX + GROUP_WIDTH / 2}
                y={BASELINE_Y + 12}
                textAnchor="middle"
                fontSize="8"
                fill="#6b7280"
              >
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
