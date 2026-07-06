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
 * R8 (2026-07-06): each metric row now carries a small inline bar to the
 * RIGHT of the figure text — a shadcn-style "number + inline bar" stat row
 * (mirrors the WAR ROOM BreakdownBars pattern: a muted track + a
 * category-tinted fill). The per-type bars scale seaborne vs foot AGAINST
 * EACH OTHER per metric (e.g. the "Number of patrols" bar compares seaborne's
 * patrol count to foot's patrol count) — a nice touch that reads at a glance
 * which mode dominates each metric. A companion `PatrolTotalsFigure` (also
 * exported from this file) renders the section's grand totals in the SAME
 * stat-list-with-bar style, replacing the old inline `.total-badge` pills in
 * the section heading (report-map-report.tsx) — its three bars scale each
 * metric proportionally against the max of the three totals (a simple,
 * decorative fill since the three metrics are different units).
 *
 * This chart lives in the report's LEFT `.section-chart` column, stacked
 * beside the patrol-tracks map on the right (see report-map-report.tsx).
 *
 * Print-friendly: a plain server component (no "use client", no Recharts
 * island) — same rationale as the other print-render charts (this sub-tree
 * has no Tailwind CSS layers): no client hydration/interactivity at all, so
 * this section never depends on a chart library mounting before Puppeteer's
 * page.pdf() fires. Colors mirror the existing Seaborne (#16A34A green-600) /
 * Foot (#F97316 orange-500 — swapped 2026-07-06 from the former cyan/teal
 * pair, which read too similarly to each other) palette used by the
 * "Patrols Over Time by Type" chart in this same section (see
 * PrintMultiSeriesChart usage in report-map-report.tsx) and the
 * patrol-tracks-map polyline colors (R1). The Totals block uses the
 * shadcn `--chart-1` token (matches the dashboard's neutral/primary accent)
 * since it aggregates BOTH types rather than representing either alone.
 *
 * WCAG 2.2 AA: a <figcaption class="sr-only"> table (caption + scope attrs),
 * mirroring MapAltTable / the other report charts' sr-only alt tables,
 * carries the full data as text — kept in sync with the new label/unit
 * strings below. The inline bars are aria-hidden (purely decorative — the
 * text already states the exact value).
 */

import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

interface PatrolTypeBarChartProps {
  totals: { seaborne: PatrolTypeTotal; foot: PatrolTypeTotal };
}

const SEABORNE_COLOR = "#16A34A"; // green-600 — matches "Patrols Over Time by Type" (Seaborne) + patrol-tracks-map
const FOOT_COLOR = "#F97316"; // orange-500 — matches "Patrols Over Time by Type" (Foot) + patrol-tracks-map
const TOTAL_COLOR = "hsl(var(--chart-1))"; // shadcn chart-token — aggregates both types

type PatrolTypeKey = "seaborne" | "foot";

/**
 * Small inline "number + bar" stat row decoration (R8) — a muted track with a
 * proportional fill, matching the WAR ROOM BreakdownBars visual language.
 * Purely decorative (aria-hidden); the metric text beside it already states
 * the exact value as text for screen readers.
 */
function InlineStatBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(pct, pct > 0 ? 4 : 0));
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "56px",
        height: "6px",
        flexShrink: 0,
        borderRadius: "3px",
        background: "#e5e7eb",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${clamped.toFixed(1)}%`,
          background: color,
          borderRadius: "3px",
        }}
      />
    </span>
  );
}

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

/** Seaborne's value as a % of the LARGER of the two types for this metric —
 *  the per-type bars compare seaborne vs foot against each other, not
 *  against an unrelated fixed scale. */
function pctOfTypeMax(value: number, other: number): number {
  const max = Math.max(value, other);
  return max > 0 ? (value / max) * 100 : 0;
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
        {metrics.map((m) => {
          const other = typeKey === "seaborne" ? m.foot : m.seaborne;
          const pct = pctOfTypeMax(m[typeKey], other);
          return (
            <li
              key={m.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "6px",
                fontSize: "9px",
                color: "#111",
              }}
            >
              <span>{metricLine(m, typeKey)}</span>
              <InlineStatBar pct={pct} color={color} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface PatrolTotalsFigureProps {
  /** Total patrol count across both types. */
  total: number;
  totalHours: number;
  totalKm: number;
}

/**
 * "Total" stat block — the section's grand totals (both patrol types
 * combined), rendered in the SAME labeled-stat-list-with-bar style as the
 * per-type Seaborne/Foot figures below it (R8, replaces the old
 * `.total-badge` inline pills in the section heading). Renders ABOVE the
 * Seaborne/Foot figures in `PatrolTypeBarChart`.
 */
export function PatrolTotalsFigure({
  total,
  totalHours,
  totalKm,
}: PatrolTotalsFigureProps) {
  const max = Math.max(total, totalHours, totalKm, 1);
  const rows: { key: string; text: string; value: number }[] = [
    { key: "patrols", text: `Number of patrols = ${fmtCount(total)}`, value: total },
    { key: "hours", text: `Number of hours = ${fmtDecimal(totalHours)} Hrs`, value: totalHours },
    { key: "km", text: `Number of Kilometers = ${fmtDecimal(totalKm)} Kms`, value: totalKm },
  ];

  return (
    <div
      data-testid="patrol-totals-figure"
      style={{ borderLeft: `3px solid ${TOTAL_COLOR}`, paddingLeft: "8px", marginBottom: "6px" }}
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
            background: TOTAL_COLOR,
            borderRadius: "1px",
          }}
        />
        <span style={{ fontSize: "9px", fontWeight: 600, color: "#374151" }}>
          Total
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
        {rows.map((r) => (
          <li
            key={r.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
              fontSize: "9px",
              color: "#111",
            }}
          >
            <span>{r.text}</span>
            <InlineStatBar pct={(r.value / max) * 100} color={TOTAL_COLOR} />
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
