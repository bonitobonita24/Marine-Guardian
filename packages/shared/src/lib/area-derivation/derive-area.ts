// derive-area.ts
//
// Composite area derivation per v2 spec L531-L561:
//   1. Exact name match (preferred): match areaName against
//      AreaBoundary.name OR aliases[], case-insensitive + trimmed,
//      enabled boundaries only.
//   2. Fall back to geographic nearest-boundary if row has coordinates
//      and nearest edge ≤ 5 km (default threshold).
//   3. Otherwise return null (caller preserves area_name verbatim).
//
// Caller (5.1b persistence helper) writes back the result + sets
// row.area_derived_at = now() + emits AuditLog entry with matchedVia.

import type { AreaBoundaryForDerivation, LatLon } from "./types";
import { matchByName } from "./match-by-name";
import { findNearestBoundary } from "./find-nearest-boundary";

export type MatchSource = "name" | "nearest";

export interface DeriveAreaInput {
  areaName?: string | null;
  point?: LatLon | null;
}

export interface DeriveAreaResult {
  areaBoundaryId: string | null;
  matchedVia: MatchSource | null;
}

export function deriveArea(
  input: DeriveAreaInput,
  boundaries: AreaBoundaryForDerivation[],
): DeriveAreaResult {
  // Step 1: name match (preferred).
  if (input.areaName !== null && input.areaName !== undefined) {
    const byName = matchByName(input.areaName, boundaries);
    if (byName !== null) {
      return { areaBoundaryId: byName.id, matchedVia: "name" };
    }
  }

  // Step 2: nearest-boundary fallback.
  if (input.point !== null && input.point !== undefined) {
    const nearest = findNearestBoundary(input.point, boundaries);
    if (nearest !== null) {
      return { areaBoundaryId: nearest.id, matchedVia: "nearest" };
    }
  }

  // Step 3: no match.
  return { areaBoundaryId: null, matchedVia: null };
}
