/**
 * Per Area Report — Page 3 (Fuel Consumption).
 *
 * RSC composer for v2 PRODUCT.md L138. Layout:
 *
 *   [Section header — Page 3 — Fuel Consumption — {area} — {dateRange}]
 *   [3-KPI card row — Total Liters / Total Cost / Avg L/km]
 *   [Per-month breakdown table — rendered ONLY when dateRange spans 2 or
 *    more calendar months — derived from perMonthBreakdown length]
 *   [Methodology footer — L/km formula + per-area caveat per L128 + L268]
 *
 * Pure RSC. No chart, no Client island. Per the locked design decision
 * (STATE.md 2026-05-22), the fuel page intentionally shows KPIs + an
 * optional table only — the trend chart from PRODUCT.md L126 belongs to
 * the Fuel Logging analytics page, not the funder-deliverable PDF.
 *
 * Empty state: when fuelConsumption is null (no fuel entries AND no
 * seaborne km in the report period), the section renders a single
 * "No fuel entries recorded for {area} during {dateRange}" message.
 *
 * Design lock — fuel is area-keyed, not patrol-keyed: FuelEntry on the
 * Prisma schema is keyed by (tenantId, areaBoundaryId, dateReceived) with
 * no patrolId field. Fuel is allocated per area per PRODUCT.md L128
 * ("Fuel is shared across all boats in an area — not tracked per
 * individual boat"). All L/km values on this page are aggregate ratios
 * across the area + period window — never per-patrol.
 */

import type {
  PerAreaReportArea,
  PerAreaReportDateRange,
  PerAreaReportFuelConsumption,
} from "@/server/per-area-report/get-per-area-report-data";
import { ReportHeader } from "./components/report-header";

interface Page3FuelConsumptionProps {
  area: PerAreaReportArea;
  dateRange: PerAreaReportDateRange;
  fuelConsumption: PerAreaReportFuelConsumption | null;
}

function formatNumber(n: number, fractionDigits: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Currency formatter. Falls back to the bare currency code + number when
 * Intl.NumberFormat rejects the supplied currency string (defensive — the
 * loader sets a "PHP" fallback but tenants may bring custom codes later).
 */
function formatCurrency(n: number, currency: string): string {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${formatNumber(n, 2)}`;
  }
}

/**
 * Converts a YYYY-MM label to a display label like "May 2026". Falls back
 * to the raw label when the input doesn't match the expected shape — keeps
 * the table renderable even if upstream serialisation drifts.
 */
function formatMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (m === null) return month;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = monthNames[monthIdx];
  if (name === undefined || !Number.isFinite(year)) return month;
  return `${name} ${String(year)}`;
}

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  testId: string;
}

function KpiCard({ label, value, caption, testId }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        padding: "10px 12px",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: "#0f766e",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {caption !== undefined && (
        <div style={{ fontSize: "9px", color: "#6b7280" }}>{caption}</div>
      )}
    </div>
  );
}

export function Page3FuelConsumption({
  area,
  dateRange,
  fuelConsumption,
}: Page3FuelConsumptionProps) {
  const showPerMonthTable =
    fuelConsumption !== null && fuelConsumption.perMonthBreakdown.length >= 2;

  return (
    <section
      className="page-3-fuel-consumption"
      data-testid="page-3-fuel-consumption"
      style={{ pageBreakBefore: "always", paddingTop: "8px" }}
    >
      <ReportHeader
        municipalityName={area.name}
        reportTitle="Fuel Consumption"
        dateRange={dateRange.label}
      />

      {fuelConsumption === null ? (
        <div
          data-testid="fuel-empty-state"
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: "4px",
            padding: "20px 16px",
            textAlign: "center",
            fontStyle: "italic",
            color: "#6b7280",
            fontSize: "11px",
            background: "#fafafa",
          }}
        >
          No fuel entries recorded for {area.name} during {dateRange.label}.
        </div>
      ) : (
        <>
          <div
            className="fuel-kpi-row"
            data-testid="fuel-kpi-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <KpiCard
              testId="fuel-kpi-total-liters"
              label="Total Liters Received"
              value={formatNumber(fuelConsumption.totalLiters, 1)}
              caption={`${String(fuelConsumption.entryCount)} fuel ${
                fuelConsumption.entryCount === 1 ? "entry" : "entries"
              }`}
            />
            <KpiCard
              testId="fuel-kpi-total-cost"
              label="Total Cost"
              value={formatCurrency(
                fuelConsumption.totalCost,
                fuelConsumption.currency,
              )}
            />
            <KpiCard
              testId="fuel-kpi-avg-l-per-km"
              label="Average L / km"
              value={
                fuelConsumption.averageLitersPerKm === null
                  ? "N/A"
                  : formatNumber(fuelConsumption.averageLitersPerKm, 3)
              }
              caption={`across ${formatNumber(
                fuelConsumption.totalSeabornePatrolKm,
                1,
              )} km seaborne patrol`}
            />
          </div>

          {showPerMonthTable && (
            <div
              data-testid="fuel-per-month-table-wrapper"
              style={{ marginBottom: "10px" }}
            >
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#374151",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "4px",
                }}
              >
                Per-month breakdown
              </div>
              <table
                data-testid="fuel-per-month-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "10px",
                }}
              >
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      Month
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      Liters
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      Cost
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      Seaborne km
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        borderBottom: "1px solid #d1d5db",
                      }}
                    >
                      L / km
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fuelConsumption.perMonthBreakdown.map((row) => (
                    <tr key={row.month}>
                      <td
                        style={{
                          padding: "5px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        {formatMonthLabel(row.month)}
                      </td>
                      <td
                        style={{
                          padding: "5px 8px",
                          borderBottom: "1px solid #e5e7eb",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatNumber(row.liters, 1)}
                      </td>
                      <td
                        style={{
                          padding: "5px 8px",
                          borderBottom: "1px solid #e5e7eb",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatCurrency(row.cost, fuelConsumption.currency)}
                      </td>
                      <td
                        style={{
                          padding: "5px 8px",
                          borderBottom: "1px solid #e5e7eb",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatNumber(row.seabornePatrolKm, 1)}
                      </td>
                      <td
                        style={{
                          padding: "5px 8px",
                          borderBottom: "1px solid #e5e7eb",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.litersPerKm === null
                          ? "N/A"
                          : formatNumber(row.litersPerKm, 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div
        data-testid="fuel-methodology"
        style={{
          fontSize: "9px",
          color: "#6b7280",
          lineHeight: 1.4,
          padding: "6px 8px",
          background: "#f9fafb",
          border: "1px dashed #d1d5db",
          borderRadius: "3px",
        }}
      >
        <strong style={{ color: "#374151" }}>How L/km is calculated:</strong>{" "}
        L/km equals the sum of all fuel liters received in the area during the
        report period divided by the sum of all seaborne patrol distance
        recorded in that same window. Fuel is allocated at the per-area level —
        not tracked per individual boat — so L/km is always an aggregate ratio
        across all seaborne patrols sharing the area&apos;s fuel allocation.
      </div>
    </section>
  );
}
