// Shared "who leads an open patrol" resolver — used by BOTH the Command Center
// Ranger Roster (dashboard.rangerRoster) and the "Rangers on Duty" KPI
// (dashboard.kpis). Kept in one place so the two can never drift: the KPI
// undercounting to 0 while the roster showed many "on patrol" (2026-07-12 owner
// report) was exactly a drift bug — the roster counted segment leaders, the KPI
// only counted AccompanyingRanger rows.
//
// A patrol's "main ranger" (the one it came in under from EarthRanger) is
// recorded on its patrol_segments as leaderErId (stable ER subject id) and/or
// leaderName. This maps those leaders to KnownRanger ids: preferentially by
// erSubjectId === leaderErId, falling back to a trimmed, case-insensitive name
// match when leaderErId is absent or unmatched.

interface SegmentLeader {
  leaderName: string | null;
  leaderErId: string | null;
}

interface KnownRangerRef {
  id: string;
  name: string;
  erSubjectId: string | null;
}

export function knownRangerIdsLeadingSegments(
  segmentLeaders: SegmentLeader[],
  knownRangers: KnownRangerRef[],
): Set<string> {
  const byErId = new Map(
    knownRangers
      .filter((r) => r.erSubjectId != null)
      .map((r) => [r.erSubjectId as string, r.id]),
  );
  const idsByNormalizedName = new Map<string, string[]>();
  for (const r of knownRangers) {
    const key = r.name.trim().toLowerCase();
    const list = idsByNormalizedName.get(key) ?? [];
    list.push(r.id);
    idsByNormalizedName.set(key, list);
  }

  const out = new Set<string>();
  for (const segment of segmentLeaders) {
    let matchedId: string | undefined;
    if (segment.leaderErId != null) {
      matchedId = byErId.get(segment.leaderErId);
    }
    if (matchedId == null && segment.leaderName != null) {
      const key = segment.leaderName.trim().toLowerCase();
      for (const id of idsByNormalizedName.get(key) ?? []) {
        out.add(id);
      }
      continue;
    }
    if (matchedId != null) out.add(matchedId);
  }
  return out;
}
