/**
 * "Total Patrols" summary table — Report Map PDF, Patrol List section.
 *
 * Owner mockup 2026-07-13 ("Patrol Review" template): the section's patrol
 * figures are presented as ONE clean three-column table —
 *
 *   Total Patrols
 *                       No. of Patrols   Time         Distance (Kms)
 *     Foot Patrol       62               276.5 Hrs    474.1 Kms
 *     Seaborne Patrol   329              1,974.0 Hrs  2,477.8 Kms
 *     Total             391              2,250.4 Hrs  2,952.0 Kms
 *
 * — replacing the earlier `PatrolTotalsFigure` grand-total stat block +
 * `PatrolTypeBarChart` per-type labeled-stat lists (R2/R3/R8, 2026-07-06),
 * which are removed. The `Total` row is the sum of the Foot + Seaborne rows,
 * so the table is internally consistent (Total = Foot + Seaborne).
 *
 * COLOR CONVENTION (deliberate deviation from the mock): the owner mockup
 * tinted the Foot row green and the Seaborne row orange, but the SAME mockup's
 * map legends — and this entire report (patrol-tracks map legend, heatmap
 * legend, "Patrols Over Time by Type" chart) — use Seaborne = green (#16A34A)
 * / Foot = orange (#F97316). A report whose summary table contradicts its own
 * map/chart legends would be a defect, so the table follows the report-wide
 * convention: Seaborne green, Foot orange. The `Total` row is navy (#1E3A8A)
 * bold — a neutral "both types combined" accent, matching the mock's Total.
 *
 * Print-friendly: a plain server component (no "use client", no chart island)
 * — same rationale as the other print-render charts (this sub-tree has no
 * Tailwind CSS layers): no client hydration, so the section never depends on a
 * chart library mounting before Puppeteer's page.pdf() fires. Structural /
 * typographic styling lives in report-map-report.tsx's own <style> block
 * (`.total-patrols*` rules — same pattern as `.report-table`); per-row colors
 * are inline since they are semantic (type-tinted).
 *
 * WCAG 2.2 AA: a real <table> with a <caption> (sr-only) and <th scope="col">
 * headers — the data is fully accessible as native table semantics (no
 * separate sr-only alt table needed, unlike the former bar-chart figure).
 */

import type { PatrolTypeTotal } from "@/server/report-map-report/get-report-map-report-data";

/** Seaborne = green-600 — matches patrol-tracks-map, heatmap, and the
 *  "Patrols Over Time by Type" chart legends across this report. */
export const SEABORNE_COLOR = "#16A34A";
/** Foot = orange-500 — same report-wide convention. */
export const FOOT_COLOR = "#F97316";
/** Total row — navy (blue-900), a neutral "both types combined" accent. */
const TOTAL_COLOR = "#1E3A8A";

function fmtCount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDecimal(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

interface PatrolTotalsTableProps {
  seaborne: PatrolTypeTotal;
  foot: PatrolTypeTotal;
}

/**
 * The "Total Patrols" three-column summary table. `Total` is computed as the
 * sum of the Foot + Seaborne rows so the footer always reconciles with the
 * two type rows above it.
 */
export function PatrolTotalsTable({ seaborne, foot }: PatrolTotalsTableProps) {
  const total = {
    count: seaborne.count + foot.count,
    hours: seaborne.hours + foot.hours,
    km: seaborne.km + foot.km,
  };

  const typeRows: {
    key: "foot" | "seaborne";
    label: string;
    color: string;
    totals: PatrolTypeTotal;
  }[] = [
    { key: "foot", label: "Foot Patrol", color: FOOT_COLOR, totals: foot },
    {
      key: "seaborne",
      label: "Seaborne Patrol",
      color: SEABORNE_COLOR,
      totals: seaborne,
    },
  ];

  return (
    <div className="total-patrols" data-testid="total-patrols-table">
      <div className="total-patrols-title">Total Patrols</div>
      <table className="total-patrols-table">
        <caption className="sr-only">
          Total patrols by type — number of patrols, time in hours, and
          distance in kilometers.
        </caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">No. of Patrols</th>
            <th scope="col">Time</th>
            <th scope="col">Distance (Kms)</th>
          </tr>
        </thead>
        <tbody>
          {typeRows.map((r) => (
            <tr
              key={r.key}
              style={{ color: r.color }}
              data-testid={`total-patrols-row-${r.key}`}
            >
              <th scope="row">{r.label}</th>
              <td>{fmtCount(r.totals.count)}</td>
              <td>{fmtDecimal(r.totals.hours)} Hrs</td>
              <td>{fmtDecimal(r.totals.km)} Kms</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ color: TOTAL_COLOR }} data-testid="total-patrols-row-total">
            <th scope="row">Total</th>
            <td>{fmtCount(total.count)}</td>
            <td>{fmtDecimal(total.hours)} Hrs</td>
            <td>{fmtDecimal(total.km)} Kms</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
