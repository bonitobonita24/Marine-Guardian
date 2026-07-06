/**
 * "Patrols by Type" figures — Report Map PDF, Patrol List section.
 *
 * Renders TWO separate per-type figure blocks — "Seaborne" and "Foot" — each
 * showing its three metrics as a clean, legible LABELED LIST (owner
 * directive 2026-07-06, R2/R3): tiny scaled bars were hard to read at print
 * size, so each type's count/hours/km are now presented as plain stat lines
 * instead:
 *   "Number of patrols = {count}"
 *   "Number of hours = {hours} Hrs"
 *   "Number of Kilometers = {km} Kms"
 * Seaborne renders ABOVE Foot (R2, `flexDirection: "column"`, Seaborne
 * first) — previously the two mini charts sat side-by-side.
 *
 * This chart lives in the report's LEFT `.section-chart` column, stacked
 * beside the patrol-tracks map on the right (see report-map-report.tsx).
 *
 * Print-friendly: a plain server component (no "use client", no Recharts
 * island) — same rationale as the other print-render charts (this sub-tree
 * has no Tailwind CSS layers): no client hydration/interactivity at all, so
 * this section never depends on a chart library mounting before Puppeteer's
 * page.pdf() fires. Colors mirror the existing Seaborne (#0891b2) / Foot
 * (#0f766e) palette used by the "Seaborne/Foot Patrols Over Time" charts in
 * this same section (see PrintTimeSeriesChart usages in report-map-report.tsx)
 * and the patrol-tracks-map polyline colors (R1).
 *
 * WCAG 2.2 AA: a <figcaption class="sr-only"> table (caption + scope attrs),
 * mirroring MapAltTable / the other report charts' sr-only alt tables,
 * carries the full data as text — kept in sync with the new label/unit
 * strings below.
 */

import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

interface PatrolTypeBarChartProps {
  totals: { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal };
}

const SEABORNE_COLOR = "#0891b2"; // cyan-600 — matches "Seaborne Patrols Over Time" + patrol-tracks-map
const FOOT_COLOR = "#0f766e"; // teal-700 — matches "Foot Patrols Over Time" + patrol-tracks-map

type PatrolTypeKey = "seaborne" | "foot";

interface MetricRow {
  key: string;
  /** Exact label text preceding " = {value}{unit}" — see the three required
   *  strings in the file header comment. */
  label: string;
  /** Suffix appended after the formatted value (e.g. " Hrs", " Kms"). */
  unit: string;
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

function buildMetrics(totals: PatrolTypeBarChartProps["totals"]): MetricRow[] {
  return [
    {
      key: "patrols",
      label: "Number of patrols",
      unit: "",
      seaborne: totals.seaborne.count,
      foot: totals.foot.count,
      format: fmtCount,
    },
    {
      key: "hours",
      label: "Number of hours",
      unit: " Hrs",
      seaborne: totals.seaborne.hours,
      foot: totals.foot.hours,
      format: fmtDecimal,
    },
    {
      key: "km",
      label: "Number of Kilometers",
      unit: " Kms",
      seaborne: totals.seaborne.km,
      foot: totals.foot.km,
      format: fmtDecimal,
    },
  ];
}

function metricLine(m: MetricRow, typeKey: PatrolTypeKey): string {
  return `${m.label} = ${m.format(m[typeKey])}${m.unit}`;
}

interface PatrolTypeFigureListProps {
  title: string;
  color: string;
  metrics: MetricRow[];
  typeKey: PatrolTypeKey;
}

function PatrolTypeFigureList({
  title,
  color,
  metrics,
  typeKey,
}: PatrolTypeFigureListProps) {
  return (
    <div
      data-testid={`patrol-type-mini-chart-${typeKey}`}
      style={{
        borderLeft: `3px solid ${color}`,
        paddingLeft: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginBottom: "3px",
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
        <span style={{ fontSize: "9px", fontWeight: 600, color: "#374151" }}>
          {title}
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {metrics.map((m) => (
          <li key={m.key} style={{ fontSize: "9px", color: "#111" }}>
            {metricLine(m, typeKey)}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AltTableRow {
  metric: string;
  seaborne: string;
  foot: string;
}

function altRows(metrics: MetricRow[]): AltTableRow[] {
  return metrics.map((m) => ({
    metric: m.label,
    seaborne: `${m.format(m.seaborne)}${m.unit}`,
    foot: `${m.format(m.foot)}${m.unit}`,
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
      {/* Seaborne ABOVE Foot (R2) — vertical stack, Seaborne first. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <PatrolTypeFigureList
          title="Seaborne"
          color={SEABORNE_COLOR}
          metrics={metrics}
          typeKey="seaborne"
        />
        <PatrolTypeFigureList
          title="Foot"
          color={FOOT_COLOR}
          metrics={metrics}
          typeKey="foot"
        />
      </div>
    </figure>
  );
}
