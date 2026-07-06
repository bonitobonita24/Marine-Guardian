/**
 * Coverage Report — Page 3 (Area Covered).
 *
 * RSC composer for v2 PRODUCT.md L771 — closes the 3-page funder template
 * with per-boundary coverage_km and pro-rated coverage_hrs.
 *
 * Layout:
 *
 *   [Section header — Area Covered]
 *   [Two columns:
 *       LEFT  — coverage table (Boundary / Patrols / KMS / HRS + Est badge)
 *       RIGHT — area-covered bar chart (Client island)
 *   ]
 *   [Footer notes — methodology + missingTracks callout]
 *
 * No map on Page 3 — the map already lives on Page 2 and the funder cares
 * about the *numbers* on this page, not the geography again.
 *
 * The Est badge on a row signals that coverage_hrs was pro-rated by km
 * fraction (totalHours × clippedKm / trackTotalKm) rather than measured
 * from per-point timestamps. The current PatrolTrack schema has no
 * per-point timestamps, so every non-zero row is currently pro-rated.
 * Once per-point timestamps land on PatrolTrack, the badge will mark only
 * the legacy backfill rows.
 */

import type { BoundaryCoverage } from "@marine-guardian/shared/lib/coverage-clip";
import { AreaCoveredChart } from "./components/area-covered-chart";
import { ReportHeader } from "./components/report-header";

interface Page3Props {
  /** Coverage Report has no municipality/logo concept — tenant name stands
   *  in for the shared header's municipality line (2026-07-06 redesign). */
  tenantName: string;
  dateRange: string;
  areaCoverage: BoundaryCoverage[];
  missingTracksCount: number;
}

function formatKm(km: number): string {
  return km.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatHours(hrs: number): string {
  return hrs.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function Page3AreaCovered({
  tenantName,
  dateRange,
  areaCoverage,
  missingTracksCount,
}: Page3Props) {
  const totals = areaCoverage.reduce(
    (acc, r) => {
      acc.patrols += r.patrolsCount;
      acc.km += r.coverageKm;
      acc.hrs += r.coverageHrs;
      return acc;
    },
    { patrols: 0, km: 0, hrs: 0 },
  );
  const anyEstimated = areaCoverage.some((r) => r.hrsEstimatedCount > 0);
  // The aggregator already sorts; defensive re-sort keeps the page
  // independent of upstream contract changes.
  const sorted = [...areaCoverage].sort((a, b) => {
    if (b.coverageKm !== a.coverageKm) return b.coverageKm - a.coverageKm;
    return a.areaName.localeCompare(b.areaName);
  });

  return (
    <section
      className="page-3-area-covered"
      data-testid="page-3-area-covered"
      style={{ pageBreakBefore: "always", paddingTop: "8px" }}
    >
      <ReportHeader
        municipalityName={tenantName}
        reportTitle="Area Covered"
        dateRange={dateRange}
      />

      {sorted.length === 0 ? (
        <div
          data-testid="page-3-empty"
          style={{
            padding: "24px",
            textAlign: "center",
            color: "#6b7280",
            fontStyle: "italic",
            border: "1px dashed #d1d5db",
            borderRadius: "4px",
            fontSize: "11px",
          }}
        >
          No coverage in monitored boundaries for this period.
        </div>
      ) : (
        <div
          className="page-3-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "5fr 4fr",
            gap: "12px",
            alignItems: "stretch",
          }}
        >
          <div className="table-column">
            <h4
              style={{
                fontSize: "11px",
                margin: "0 0 6px",
                color: "#0f766e",
              }}
            >
              Coverage by Boundary ({sorted.length})
            </h4>
            <table
              className="report-table"
              data-testid="coverage-table"
              style={{ width: "100%" }}
            >
              <thead>
                <tr>
                  <th>Boundary Name</th>
                  <th className="num">Coverage Patrols</th>
                  <th className="num">Coverage KMS</th>
                  <th className="num">Coverage HRS</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const isEstimated = r.hrsEstimatedCount > 0;
                  return (
                    <tr
                      key={r.areaBoundaryId}
                      data-testid={`coverage-row-${r.areaBoundaryId}`}
                    >
                      <td>{r.areaName}</td>
                      <td className="num">{r.patrolsCount}</td>
                      <td className="num">{formatKm(r.coverageKm)}</td>
                      <td className="num">
                        {formatHours(r.coverageHrs)}
                        {isEstimated && (
                          <span
                            data-testid={`est-badge-${r.areaBoundaryId}`}
                            style={{
                              marginLeft: "4px",
                              padding: "1px 4px",
                              fontSize: "8px",
                              fontWeight: 600,
                              color: "#a16207",
                              background: "#fef3c7",
                              border: "1px solid #fde68a",
                              borderRadius: "2px",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              verticalAlign: "middle",
                            }}
                            title="coverage_hrs pro-rated by km fraction"
                          >
                            Est.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{totals.patrols}</td>
                  <td className="num">{formatKm(totals.km)}</td>
                  <td className="num">{formatHours(totals.hrs)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div
            className="chart-column"
            data-testid="page-3-chart-column"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "4px",
              padding: "8px",
              background: "#fafafa",
              minHeight: "180px",
            }}
          >
            <h4
              style={{
                fontSize: "11px",
                margin: "0 0 6px",
                color: "#0f766e",
              }}
            >
              Coverage KMS by Boundary
            </h4>
            <AreaCoveredChart rows={sorted} />
          </div>
        </div>
      )}

      <div
        data-testid="page-3-footer-notes"
        style={{
          marginTop: "10px",
          padding: "8px 10px",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "4px",
          fontSize: "9px",
          color: "#374151",
          lineHeight: 1.45,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "3px", color: "#0f766e" }}>
          Notes on coverage figures
        </div>
        <ul
          style={{
            margin: "2px 0",
            paddingLeft: "14px",
            listStylePosition: "outside",
          }}
        >
          <li>
            Coverage KMS = clipped length of each patrol track inside the boundary
            polygon, summed across all patrols in the period.
          </li>
          <li>
            Coverage HRS = patrol duration pro-rated by km fraction
            (total_hours × clipped_km / track_total_km). Rows with{" "}
            {anyEstimated ? (
              <strong
                data-testid="est-footer-callout"
                style={{ color: "#a16207" }}
              >
                Est.
              </strong>
            ) : (
              <strong>Est.</strong>
            )}{" "}
            indicate per-point timestamps were unavailable; per-point timing
            replaces this estimate when the schema upgrade lands.
          </li>
          {missingTracksCount > 0 && (
            <li data-testid="missing-tracks-note">
              <strong>{missingTracksCount}</strong>{" "}
              {missingTracksCount === 1 ? "patrol has" : "patrols have"}{" "}
              recorded hours but no track polyline — those hours are not
              included in any boundary&apos;s Coverage HRS above. Real coverage
              may exceed what is reported here.
            </li>
          )}
          <li>
            Coastline (LineString) boundaries are excluded from this table —
            clipping is only meaningful against Polygon boundaries.
          </li>
        </ul>
      </div>
    </section>
  );
}
