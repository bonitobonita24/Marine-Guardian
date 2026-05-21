// accumulate-coverage-by-boundary.ts — aggregator over (patrols × boundaries).
//
// Builds one BoundaryCoverage row per Polygon boundary, summing coverage_km
// and coverage_hrs across all patrols. Also counts patrols that have a
// totalHours value but no trackLineString — these can't be clipped so they
// contribute zero, and Page 3 surfaces them as "N patrols missing tracks".
//
// LineString boundaries (coastlines) are skipped — clipping is meaningless.
// The Page 3 table only displays Polygon boundaries; LineString boundaries
// already appear on Page 2 as dashed reference outlines.
//
// Sort: coverageKm DESC, then areaName ASC for stable tiebreak.

import { clipTrackToBoundary } from "./clip-track-to-boundary";
import { computeCoverageHours } from "./compute-coverage-hours";
import type {
  AccumulatedCoverage,
  AreaBoundaryForDerivation,
  BoundaryCoverage,
  PatrolForCoverage,
} from "./types";

export function accumulateCoverageByBoundary(
  patrols: PatrolForCoverage[],
  boundaries: AreaBoundaryForDerivation[],
): AccumulatedCoverage {
  const polygonBoundaries = boundaries.filter(
    (b) => b.geometryType === "Polygon",
  );

  const rowByBoundaryId = new Map<string, BoundaryCoverage>();
  for (const b of polygonBoundaries) {
    rowByBoundaryId.set(b.id, {
      areaBoundaryId: b.id,
      areaName: b.name,
      patrolsCount: 0,
      coverageKm: 0,
      coverageHrs: 0,
      hrsEstimatedCount: 0,
    });
  }

  let missingTracksCount = 0;

  for (const patrol of patrols) {
    if (patrol.trackLineString === null) {
      // Only flag patrols with hours — a patrol with no track AND no hours
      // is most likely a draft/scheduled row that never started.
      if (patrol.totalHours !== null && patrol.totalHours > 0) {
        missingTracksCount += 1;
      }
      continue;
    }

    for (const boundary of polygonBoundaries) {
      const clip = clipTrackToBoundary(patrol.trackLineString, boundary);
      if (clip.totalKm <= 0) continue;

      const row = rowByBoundaryId.get(boundary.id);
      if (row === undefined) continue;

      const hrs = computeCoverageHours(
        patrol.totalHours,
        clip.totalKm,
        clip.trackTotalKm,
      );

      row.patrolsCount += 1;
      row.coverageKm += clip.totalKm;
      row.coverageHrs += hrs.coverageHrs;
      if (hrs.estimated) row.hrsEstimatedCount += 1;
    }
  }

  const rows = [...rowByBoundaryId.values()].sort((a, b) => {
    if (b.coverageKm !== a.coverageKm) return b.coverageKm - a.coverageKm;
    return a.areaName.localeCompare(b.areaName);
  });

  return { rows, missingTracksCount };
}
