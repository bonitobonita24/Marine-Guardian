import { Prisma } from "@marine-guardian/db";
import { z } from "zod";

/**
 * Shared municipality-attribution-review filter — used by BOTH `patrol.list`
 * and `event.list` (and, within event.list, by BOTH its Prisma and raw-SQL
 * implementations) so every surface agrees on what each option means.
 *
 * ── Why this filter exists ────────────────────────────────────────────────
 * The one-time attribution backfill (96f7ff4) wrote a large batch of rows by
 * HEURISTIC: `title_hint` (whitelisted whole-token match on a patrol title,
 * measured 98.4% accurate — so a handful are wrong by construction) and
 * `nearest` (nearest-boundary fallback, near-ties resolved as coin-flips and
 * stamped `municipalityAttributionAmbiguous`).
 *
 * Those rows all have a NON-NULL `municipality_id`, which means the existing
 * `unattributedOnly` filter (`municipality_id IS NULL`) excludes every one of
 * them BY DEFINITION. Without this filter there is no way for an officer to
 * enumerate, review, or correct the heuristic attributions — they are written
 * once and then unreachable. This is the entry point to that review workflow.
 *
 * ── The options ───────────────────────────────────────────────────────────
 *   containment | nearest | manual | title_hint
 *       Exact match on `municipality_attribution_method`.
 *   needs_review
 *       The review work queue: the UNION of the heuristic methods
 *       (`title_hint`, `nearest`) and anything flagged
 *       `municipality_attribution_ambiguous`. `containment` and `manual` are
 *       excluded — geometry is trustworthy and a manual value is an officer's
 *       own deliberate decision, so neither needs a second look.
 *
 * Omitted (undefined) means "no filter", preserving existing behaviour exactly.
 */
export const attributionMethodFilter = z.enum([
  "containment",
  "nearest",
  "manual",
  "title_hint",
  "needs_review",
]);

export type AttributionMethodFilter = z.infer<typeof attributionMethodFilter>;

/** The methods that are heuristic guesses and therefore warrant human review. */
export const HEURISTIC_METHODS = ["title_hint", "nearest"] as const;

/**
 * The where-fragment shape. Patrol and Event carry IDENTICAL provenance
 * columns, so one fragment is assignable into either model's `WhereInput`.
 * Declared structurally (rather than as
 * `Prisma.PatrolWhereInput & Prisma.EventWhereInput`) because intersecting the
 * two generated types produces an unsatisfiable relation-field intersection.
 */
export type AttributionWhereFragment =
  | Record<string, never>
  | { municipalityAttributionMethod: StoredAttributionMethod }
  | {
      OR: (
        | { municipalityAttributionMethod: { in: StoredAttributionMethod[] } }
        | { municipalityAttributionAmbiguous: true }
      )[];
    };

/**
 * The filter values that correspond to a REAL stored enum value. `needs_review`
 * is a query-side alias for a set of them, never a column value — keeping it
 * out of this type is what stops it being handed to Prisma as an enum literal.
 */
export type StoredAttributionMethod = Exclude<
  AttributionMethodFilter,
  "needs_review"
>;

/**
 * Prisma `where` fragment for the filter. Returns an empty object when the
 * filter is unset so it can be spread unconditionally into a where clause.
 *
 * The `needs_review` branch is an OR, so it MUST be nested under `AND` by the
 * caller if the surrounding where clause already uses a top-level `OR` — both
 * current callers spread it into a plain AND-ed object, which is safe.
 */
export function attributionWhere(
  filter: AttributionMethodFilter | undefined,
): AttributionWhereFragment {
  if (filter === undefined) return {};
  if (filter === "needs_review") {
    return {
      OR: [
        { municipalityAttributionMethod: { in: [...HEURISTIC_METHODS] } },
        { municipalityAttributionAmbiguous: true },
      ],
    };
  }
  return { municipalityAttributionMethod: filter };
}

/**
 * Raw-SQL condition for the same filter, for `event.list`'s $queryRaw path.
 * Returns `undefined` when unset so the caller can skip pushing a condition.
 *
 * `alias` is the table alias the events table is bound to in the query (`e`).
 * The enum literals are interpolated as BOUND PARAMETERS (never concatenated),
 * and the set of possible values is closed by the Zod enum above — so this is
 * not SQL-injectable.
 *
 * ⚠ This MUST stay semantically identical to `attributionWhere` above. The two
 * exist only because Prisma's fluent API and raw SQL are different languages;
 * any change to one is a change to the other, and the router tests assert the
 * two agree by running the same filter WITH and WITHOUT a search term.
 */
export function attributionRawCondition(
  filter: AttributionMethodFilter | undefined,
): Prisma.Sql | undefined {
  if (filter === undefined) return undefined;
  if (filter === "needs_review") {
    return Prisma.sql`(
      e.municipality_attribution_method IN (${Prisma.join(
        HEURISTIC_METHODS.map((m) => Prisma.sql`${m}::"MunicipalityAttributionMethod"`),
        ", ",
      )})
      OR e.municipality_attribution_ambiguous = true
    )`;
  }
  return Prisma.sql`e.municipality_attribution_method = ${filter}::"MunicipalityAttributionMethod"`;
}
