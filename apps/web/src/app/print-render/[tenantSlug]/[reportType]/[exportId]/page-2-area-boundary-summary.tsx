/**
 * Coverage Report — Page 2 (Area Boundary Summary).
 *
 * RSC composer for v2 PRODUCT.md L771. Layout:
 *
 *   [Section header — Area Boundary Summary]
 *   [Map: full width, ~95mm tall]
 *   [Two columns:
 *       LEFT  — enabled-boundary table (Area / Patrol count)
 *       RIGHT — patrol-area bar chart
 *   ]
 *   [Variance Info callout — methodology footer]
 *
 * Map + bar chart are client islands. Table + section frame + callout
 * are RSC. CSS `page-break-before: always` on the wrapping section
 * forces Page 2 to start on a new physical page.
 */

import type {
  CoverageReportArea,
  CoverageReportAttribution,
  CoverageReportPatrolRow,
} from "@/server/coverage-report/get-coverage-report-data";
import type { AreaPatrolCount } from "@marine-guardian/shared/lib/area-attribution";
import { AreaCoverageMap } from "./components/area-coverage-map";
import { PatrolAreaBarChart } from "./components/patrol-area-bar-chart";
import { VarianceInfoCallout } from "./components/variance-info-callout";

interface Page2Props {
  enabledAreas: CoverageReportArea[];
  patrols: CoverageReportPatrolRow[];
  attributions: CoverageReportAttribution[];
  patrolCountsByArea: AreaPatrolCount[];
  unattributedPatrolCount: number;
}

interface RankedRow {
  areaBoundaryId: string;
  areaName: string;
  patrolCount: number;
  matchedViaNearestCount: number;
  matchedViaFeatureCount: number;
}

function rankRowsByPatrolsDesc(
  counts: AreaPatrolCount[],
  attributions: CoverageReportAttribution[],
): RankedRow[] {
  const matchSourceByArea = new Map<
    string,
    { nearest: number; feature: number }
  >();
  for (const a of attributions) {
    if (a.areaBoundaryId === null) continue;
    const bucket = matchSourceByArea.get(a.areaBoundaryId) ?? {
      nearest: 0,
      feature: 0,
    };
    if (a.matchedVia === "nearest") bucket.nearest += 1;
    else if (a.matchedVia === "feature-name") bucket.feature += 1;
    matchSourceByArea.set(a.areaBoundaryId, bucket);
  }
  const ranked = counts.map((c) => {
    const sources = matchSourceByArea.get(c.areaBoundaryId);
    return {
      areaBoundaryId: c.areaBoundaryId,
      areaName: c.areaName,
      patrolCount: c.patrolCount,
      matchedViaNearestCount: sources?.nearest ?? 0,
      matchedViaFeatureCount: sources?.feature ?? 0,
    };
  });
  ranked.sort((a, b) => {
    if (b.patrolCount !== a.patrolCount) return b.patrolCount - a.patrolCount;
    return a.areaName.localeCompare(b.areaName);
  });
  return ranked;
}

export function Page2AreaBoundarySummary({
  enabledAreas,
  patrols,
  attributions,
  patrolCountsByArea,
  unattributedPatrolCount,
}: Page2Props) {
  const ranked = rankRowsByPatrolsDesc(patrolCountsByArea, attributions);
  const totalPatrolsAttributed = ranked.reduce(
    (sum, r) => sum + r.patrolCount,
    0,
  );

  return (
    <section
      className="page-2-area-summary"
      data-testid="page-2-area-boundary-summary"
      style={{ pageBreakBefore: "always", paddingTop: "8px" }}
    >
      <header className="page-header" style={{ marginBottom: "8px" }}>
        <h3
          style={{
            fontSize: "13px",
            margin: 0,
            color: "#0f766e",
            borderBottom: "1px solid #d1d5db",
            paddingBottom: "4px",
          }}
        >
          Page 2 — Area Boundary Summary
        </h3>
      </header>

      <div
        className="map-container"
        data-testid="map-container"
        style={{
          width: "100%",
          height: "95mm",
          border: "1px solid #e5e7eb",
          background: "#dbeafe",
          marginBottom: "12px",
          overflow: "hidden",
        }}
      >
        {enabledAreas.length === 0 && patrols.length === 0 ? (
          <div
            data-testid="map-empty"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontStyle: "italic",
              color: "#6b7280",
              fontSize: "11px",
            }}
          >
            No boundaries or tracks to display.
          </div>
        ) : (
          <AreaCoverageMap areas={enabledAreas} patrols={patrols} />
        )}
      </div>

      <div
        className="page-2-grid"
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
            Enabled Boundaries ({ranked.length})
          </h4>
          {ranked.length === 0 ? (
            <div
              data-testid="boundary-table-empty"
              style={{
                padding: "10px",
                textAlign: "center",
                color: "#6b7280",
                fontStyle: "italic",
                fontSize: "10px",
                border: "1px dashed #d1d5db",
                borderRadius: "4px",
              }}
            >
              No enabled boundaries configured for this tenant.
            </div>
          ) : (
            <table
              className="report-table"
              data-testid="boundary-table"
              style={{ width: "100%" }}
            >
              <thead>
                <tr>
                  <th>Area Boundary</th>
                  <th className="num">Patrols</th>
                  <th className="num">By Track</th>
                  <th className="num">By Name</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.areaBoundaryId}>
                    <td>{r.areaName}</td>
                    <td className="num">{r.patrolCount}</td>
                    <td className="num">{r.matchedViaNearestCount}</td>
                    <td className="num">{r.matchedViaFeatureCount}</td>
                  </tr>
                ))}
                <tr data-testid="outside-row">
                  <td>
                    <em>Outside enabled boundaries</em>
                  </td>
                  <td className="num">{unattributedPatrolCount}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">
                    {totalPatrolsAttributed + unattributedPatrolCount}
                  </td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div
          className="chart-column"
          data-testid="chart-column"
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
            Patrols per Boundary
          </h4>
          <PatrolAreaBarChart
            rows={patrolCountsByArea}
            unattributedCount={unattributedPatrolCount}
          />
        </div>
      </div>

      <VarianceInfoCallout />
    </section>
  );
}
