"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Shared municipality-attribution provenance badge — used by BOTH the patrols
 * table and the events list so the two surfaces stay visually identical.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * A one-time backfill (commit 96f7ff4) attributed a large batch of records by
 * HEURISTIC rather than by geometry:
 *
 *   • `title_hint` — matched a whitelisted whole-token municipality name in a
 *     patrol's title. Measured gate accuracy 98.4%, so a small number of these
 *     are wrong BY CONSTRUCTION and only a human can tell which.
 *   • `nearest`    — nearest-boundary fallback, with the measured distance
 *     recorded in `municipalityDistanceKm`. A near-tie between two
 *     municipalities was resolved as a coin-flip and stamped
 *     `municipalityAttributionAmbiguous`.
 *
 * Those rows are indistinguishable from trustworthy ones unless the provenance
 * is rendered, so this badge is what makes the review workflow possible: the
 * officer filters to a heuristic method, then reads WHY each row was attributed
 * the way it was before deciding whether to override it.
 *
 * ── Rendering contract ────────────────────────────────────────────────────
 * `containment` deliberately renders NO badge. It is the trusted default and
 * the overwhelming majority of rows; badging it would add a chip to thousands
 * of rows and drown out exactly the signal this component exists to surface.
 * "No badge" therefore reads as "derived from geometry". The method is still
 * exposed non-visually via the wrapper's `title` attribute for every row, so
 * nothing is hidden — it is only de-emphasised.
 */

export type AttributionMethod =
  | "containment"
  | "nearest"
  | "manual"
  | "title_hint";

/** Human-readable label per method — single source of truth for both screens. */
const METHOD_LABEL: Record<AttributionMethod, string> = {
  containment: "Containment",
  nearest: "Nearest",
  manual: "Manual",
  title_hint: "Title hint",
};

/**
 * Full provenance sentence for the `title` tooltip. Rendered for EVERY row
 * (including containment) so the method is always discoverable on hover even
 * when no badge is drawn.
 */
export function attributionTitle(
  method: AttributionMethod | null,
  distanceKm: number | null,
  ambiguous: boolean,
): string {
  if (method === null) return "No municipality attributed";
  const parts: string[] = [`Attributed by: ${METHOD_LABEL[method]}`];
  if (method === "nearest" && distanceKm !== null) {
    parts.push(`nearest boundary ${distanceKm.toFixed(1)} km away`);
  }
  if (method === "title_hint") {
    parts.push("matched from the title — heuristic, needs review");
  }
  if (ambiguous) {
    parts.push("AMBIGUOUS: two municipalities were near-tied");
  }
  return parts.join(" — ");
}

/**
 * The attribution-review filter's UI value. `""` is "no filter" (all rows),
 * matching how the other native <select> filters on both screens encode their
 * unset state. Every other value maps 1:1 onto the router's
 * `attributionMethod` input (server/attribution-filter.ts).
 */
export type AttributionFilterValue =
  | ""
  | "needs_review"
  | AttributionMethod;

/**
 * Shared option list for the filter control — defined ONCE so the patrols
 * table and the events list can never drift into offering different options or
 * different wording for the same query.
 *
 * "Needs review" is listed first (directly under the no-filter default)
 * because it is the reason this filter exists: it is the one option that
 * answers "which attributions might be wrong?" in a single click, without the
 * officer needing to know that `title_hint` and `nearest` are the heuristic
 * methods.
 */
export const ATTRIBUTION_FILTER_OPTIONS: readonly {
  value: AttributionFilterValue;
  label: string;
}[] = [
  { value: "",             label: "All attributions" },
  { value: "needs_review", label: "Needs review" },
  { value: "containment",  label: "Containment" },
  { value: "nearest",      label: "Nearest" },
  { value: "title_hint",   label: "Title hint" },
  { value: "manual",       label: "Manual" },
];

/** True for the heuristic methods a human is expected to review. */
export function isHeuristicMethod(method: AttributionMethod | null): boolean {
  return method === "nearest" || method === "title_hint";
}

interface AttributionBadgeProps {
  method: AttributionMethod | null;
  distanceKm: number | null;
  ambiguous: boolean;
  /** Row id — used to build stable per-row test ids. */
  rowId: string;
}

export function AttributionBadge({
  method,
  distanceKm,
  ambiguous,
  rowId,
}: AttributionBadgeProps) {
  // Containment (and un-attributed) draw nothing — see the rendering contract
  // in the file header. `ambiguous` is still honoured below in the unlikely
  // case a containment row was ever flagged.
  const showMethod = method !== null && method !== "containment";

  if (!showMethod && !ambiguous) return null;

  return (
    <>
      {showMethod && (
        <Badge
          // Heuristic methods get the louder `secondary` fill; `manual` is an
          // officer's own deliberate act, so it stays a quiet outline.
          variant={isHeuristicMethod(method) ? "secondary" : "outline"}
          data-testid={`attribution-method-badge-${rowId}`}
          className="whitespace-nowrap"
        >
          {METHOD_LABEL[method]}
          {method === "nearest" && distanceKm !== null && (
            <span className="ml-1 font-normal opacity-80">
              {distanceKm.toFixed(1)} km
            </span>
          )}
        </Badge>
      )}
      {ambiguous && (
        <Badge
          variant="destructive"
          data-testid={`attribution-ambiguous-badge-${rowId}`}
          className="whitespace-nowrap"
        >
          Ambiguous
        </Badge>
      )}
    </>
  );
}
