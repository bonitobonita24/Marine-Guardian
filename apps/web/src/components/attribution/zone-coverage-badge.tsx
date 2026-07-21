"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Shared MPA/protected-zone coverage provenance badge — the zone-coverage
 * sibling of `attribution-badge.tsx`'s municipality provenance badge. Same
 * rendering contract, different source enum (`CoveredZoneSource` on
 * `PatrolCoveredZone`/`EventCoveredZone`):
 *
 *   • `geometry`       — the patrol's track (or event's lat/lon) fell inside
 *     the zone's boundary by containment. Trusted default, the overwhelming
 *     majority of rows — renders NO badge, exactly like `containment` in the
 *     municipality badge. "No badge" reads as "derived from geometry".
 *   • `title_hint`     — a one-time historical backfill matched a whitelisted
 *     zone name in the patrol's title/caption. Heuristic, needs review.
 *   • `manual_include` — an officer manually added a zone the system missed.
 *     A distinct, quieter chip — this is a deliberate human act, not a
 *     guess, so (like municipality `manual`) it stays an outline badge.
 *   • `manual_exclude` — a TOMBSTONE. It is never covered, so it must never
 *     reach this component: callers filter `manual_exclude` rows out of the
 *     covered-zone list before rendering (mirrors the exclusion already
 *     enforced in the zone-coverage-override dialog).
 *
 * The provenance is also exposed non-visually via `zoneCoverageTitle` for a
 * `title` tooltip on every row, including `geometry`, so nothing is hidden —
 * it is only de-emphasised (same convention as `attributionTitle`).
 */

/** Sources that may reach this component — `manual_exclude` is filtered upstream. */
export type CoveredZoneBadgeSource = "geometry" | "title_hint" | "manual_include";

const ZONE_SOURCE_LABEL: Record<
  Exclude<CoveredZoneBadgeSource, "geometry">,
  string
> = {
  title_hint: "Included by caption",
  manual_include: "Manually added",
};

/** Full provenance sentence for the `title` tooltip — rendered for EVERY row. */
export function zoneCoverageTitle(source: CoveredZoneBadgeSource): string {
  if (source === "geometry") {
    return "Covered — derived from the patrol's track geometry";
  }
  if (source === "title_hint") {
    return "Covered — matched from the title/caption, needs review";
  }
  return "Covered — manually added by an officer";
}

interface ZoneCoverageBadgeProps {
  source: CoveredZoneBadgeSource;
  /** Protected-zone id — used to build a stable per-row test id. */
  zoneId: string;
}

export function ZoneCoverageBadge({ source, zoneId }: ZoneCoverageBadgeProps) {
  // Containment (geometry) draws nothing — see the rendering contract above.
  if (source === "geometry") return null;

  return (
    <Badge
      // Heuristic (title_hint) gets the louder `secondary` fill, matching
      // `isHeuristicMethod` in attribution-badge.tsx; `manual_include` is an
      // officer's own deliberate act, so it stays a quiet outline — same
      // split as the municipality badge's `nearest`/`title_hint` vs `manual`.
      variant={source === "title_hint" ? "secondary" : "outline"}
      data-testid={`zone-coverage-badge-${zoneId}`}
      className="whitespace-nowrap"
    >
      {ZONE_SOURCE_LABEL[source]}
    </Badge>
  );
}
