/**
 * zone-attribution — BACKFILL-ONLY pure logic. Assigns a protected-zone (MPA)
 * membership to a patrol/event whose GPS never entered the zone polygon but
 * whose title/caption references the zone. Never wired into a processor;
 * driven only by scripts/backfill-zone-title-hint.ts.
 *
 * NO try/catch — callers own error handling.
 */

// ── Title-hint matcher ────────────────────────────────────────────────────

/**
 * Whitelist of title tokens that reliably identify a single protected zone
 * (MPA) in historical patrol/event titles. Evaluated in DECLARED ORDER so
 * full phrases are checked before bare short names they could otherwise
 * shadow.
 */
export const ZONE_TITLE_HINT_WHITELIST: ReadonlyArray<{ hint: string; slug: string }> = [
  // Apo Reef Natural Park (parent municipality: Sablayan). Full phrases first,
  // then common OCR/data-entry typos, then the bare short name (per owner:
  // "just 'Apo' is sometimes a short name as well"). In tenant `ph`, bare "apo"
  // reliably means Apo Reef; the backfill additionally guards on parent
  // municipality, so a stray non-Sablayan "apo" is not mis-attributed.
  { hint: "apo reef", slug: "apo-reef-natural-park" },
  { hint: "apo reep", slug: "apo-reef-natural-park" }, // typo variant
  { hint: "apo ref", slug: "apo-reef-natural-park" }, // typo variant (missing e)
  { hint: "apo", slug: "apo-reef-natural-park" },
  // Harka Piloto Fish Sanctuary (parent municipality: Calapan City).
  { hint: "harka piloto", slug: "harka-piloto-mpa" },
  { hint: "harka", slug: "harka-piloto-mpa" },
];

/**
 * Minimum trimmed title length required before attempting a hint match.
 * Rejects bare short fragments and tokenization artifacts — checked BEFORE
 * any matching is attempted.
 */
export const MIN_TITLE_LENGTH = 5;

export interface ZoneTitleHintResult {
  slug: string;
  hint: string;
}

/**
 * Escape a string for safe use inside a RegExp source.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a historical patrol/event title against the whole-token zone hint
 * whitelist.
 *
 * Whole-token matching ONLY: a hint is considered matched only when it is
 * delimited by a non-word character (not a Unicode letter/digit) or a string
 * boundary, using the boundary class `[^\p{L}\p{N}]` (NOT JavaScript's `\b`,
 * which does not break between a letter and a digit — `\b` would wrongly
 * match "PG01" as "pg"; and NOT the ASCII-only `[^a-z0-9]`, which would wrongly
 * treat a non-ASCII letter like "è" as a delimiter and match "st" inside
 * "Tèst"). Case-insensitive.
 *
 * Rules enforced (in order):
 *   1. null/empty title → null.
 *   2. `title.trim().length < MIN_TITLE_LENGTH` → null.
 *   3. Collect every whitelist entry whose hint whole-token-matches, in
 *      DECLARED ORDER. Dedupe the matches by SLUG (not by hint) — e.g. "apo"
 *      and "apo reef" both map to "apo-reef-natural-park"; a title containing
 *      both is ONE distinct zone and is accepted.
 *   4. If the number of DISTINCT SLUGS is not exactly 1 → null (covers both
 *      "no hint matched" and "hints imply >1 zone" ambiguous cases).
 *   5. Otherwise return { slug, hint } where `hint` is the FIRST matching
 *      whitelist entry's hint (declared-order precedence, so full phrases
 *      beat bare short names when both are present for the same slug).
 */
export function matchZoneTitleHint(title: string | null | undefined): ZoneTitleHintResult | null {
  if (title == null) return null;

  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH) return null;

  const lower = trimmed.toLowerCase();

  const matches: ZoneTitleHintResult[] = [];
  for (const entry of ZONE_TITLE_HINT_WHITELIST) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(entry.hint)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (pattern.test(lower)) {
      matches.push({ slug: entry.slug, hint: entry.hint });
    }
  }

  if (matches.length === 0) return null;

  const distinctSlugs = new Set(matches.map((m) => m.slug));
  if (distinctSlugs.size !== 1) return null;

  // matches is already in declared-order — the first entry's hint wins.
  return matches[0] ?? null;
}
