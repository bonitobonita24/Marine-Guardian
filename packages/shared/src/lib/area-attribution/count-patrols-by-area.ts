// count-patrols-by-area.ts
//
// Aggregation helper used by Page 2 of the Coverage Report (and the
// `area-coverage-bar-chart` client island). Given a list of patrol
// attributions + the enabled boundary roster, returns one count row per
// boundary in the same order as the input boundaries, plus a separate
// "Outside enabled boundaries" tally when any patrols failed both
// attribution strategies.
//
// Pure. Inputs are typically the output of:
//   patrols.map(p => attributePatrolToArea(p, enabledBoundaries))
//
// Ordering: matches the input boundaries[] order. Page 2 sorts visually
// by patrolCount DESC inside the table — that sort happens in the RSC,
// not here, so the renderer can use stable secondary sort on areaName.

import type {
  AreaBoundaryForDerivation,
  AreaPatrolCount,
  PatrolAttribution,
} from "./types";

export interface CountPatrolsByAreaResult {
  rows: AreaPatrolCount[];
  unattributedCount: number;
}

export function countPatrolsByArea(
  attributions: PatrolAttribution[],
  enabledBoundaries: AreaBoundaryForDerivation[],
): CountPatrolsByAreaResult {
  const counts = new Map<string, number>();
  let unattributed = 0;

  for (const a of attributions) {
    if (a.areaBoundaryId === null) {
      unattributed += 1;
      continue;
    }
    counts.set(a.areaBoundaryId, (counts.get(a.areaBoundaryId) ?? 0) + 1);
  }

  const rows: AreaPatrolCount[] = enabledBoundaries.map((b) => ({
    areaBoundaryId: b.id,
    areaName: b.name,
    patrolCount: counts.get(b.id) ?? 0,
  }));

  return { rows, unattributedCount: unattributed };
}
