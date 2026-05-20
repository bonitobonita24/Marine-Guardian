// match-by-name.ts
//
// v2 spec L531-L561 step 1: exact name match (preferred).
// - Match areaName against boundary.name OR any string in boundary.aliases[]
// - Case-insensitive, trimmed
// - Filter boundaries to isEnabled=true only
// - Name match wins over alias match on tie
//
// Returns the first matching boundary, or null.

import type { AreaBoundaryForDerivation } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchByName(
  areaName: string | null | undefined,
  boundaries: AreaBoundaryForDerivation[],
): AreaBoundaryForDerivation | null {
  if (areaName === null || areaName === undefined) return null;
  const normalized = normalize(areaName);
  if (normalized.length === 0) return null;

  const enabled = boundaries.filter((b) => b.isEnabled);

  // Pass 1: name match wins over alias match. Iterate in list order.
  for (const b of enabled) {
    if (normalize(b.name) === normalized) return b;
  }

  // Pass 2: alias match in list order; among aliases, first array entry wins.
  for (const b of enabled) {
    for (const alias of b.aliases) {
      if (normalize(alias) === normalized) return b;
    }
  }

  return null;
}
