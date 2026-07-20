// Default report-template selection for the "Generate Printable" dialog.
//
// WHY THIS EXISTS (2026-07-20 defect): the template dropdown used to default
// blindly to the tenant's isDefault template. Because that tenant's default is
// a SCOPE-SPECIFIC template ("Apo Reef Park"), an all-municipalities report
// rendered as "LGU All Municipalities" while carrying the Apo Reef Park logo.
// The template is BRANDING ONLY — it never scopes the report — so a mismatched
// default silently mis-brands an otherwise correct report.
//
// ReportTemplate has no scope FK (no municipalityId / protectedZoneId columns —
// see schema.prisma), so the association between a template and a scope can
// only be inferred from its NAME. That inference is deliberately conservative
// and is the whole reason this logic is a pure, unit-tested function rather
// than inline component code.
//
// THIS ONLY CHANGES THE DEFAULT. The user can always override the selection in
// the dropdown; nothing here constrains that choice.

/** Minimal shape of a ReportTemplate needed to pick a default. */
export interface TemplateOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * The report's ACTIVE scope, in narrowing order. The first non-null field wins
 * — a zone-scoped report is more specific than the municipality containing it.
 */
export interface ReportScopeNames {
  /** Name of the scoped protected zone (MPA), or null. */
  zoneName: string | null;
  /** Name of the scoped municipality, or null. */
  municipalityName: string | null;
  /** Name of the scoped province rollup, or null. */
  provinceName: string | null;
}

/** Lower-cased, punctuation-stripped, whitespace-collapsed form of a name. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Words that carry no identifying signal in a template or place name. Stripped
 * before comparison so "Apo Reef Park" still matches the zone "Apo Reef Natural
 * Park", and so a genuinely generic template ("LGU All Municipalities") reduces
 * to NO significant tokens and therefore matches no place at all.
 */
const STOPWORDS = new Set([
  "all",
  "area",
  "city",
  "lgu",
  "marine",
  "municipal",
  "municipality",
  "municipalities",
  "national",
  "natural",
  "park",
  "protected",
  "province",
  "provincial",
  "report",
  "reserve",
  "sanctuary",
  "town",
  "zone",
]);

const MIN_TOKEN_LENGTH = 3;

function significantTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

/**
 * Do two place/template names refer to the same thing?
 *
 * Templates are named loosely by humans — "Apo Reef Park" for the zone "Apo
 * Reef Natural Park", "Calapan Municipal" for the municipality "Calapan". Plain
 * substring containment does NOT survive that ("Apo Reef Park" is not a
 * substring of "Apo Reef Natural Park"), so names are compared by their
 * SIGNIFICANT TOKENS: a match means the smaller token set is a subset of the
 * larger, and neither set is empty.
 *
 * {apo, reef} ⊆ {apo, reef} → match. {calapan} ⊆ {calapan} → match.
 * {} (from "LGU All Municipalities") → never matches: the template is generic.
 * {calapan} vs {baco} → no match.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [smaller, larger] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const largerSet = new Set(larger);
  return smaller.every((t) => largerSet.has(t));
}

/**
 * Pick the template id that should be SELECTED BY DEFAULT for the given scope.
 *
 * 1. A scoped report (zone > municipality > province) defaults to a template
 *    whose name matches that scope, when one exists.
 * 2. Otherwise — an unscoped ("all municipalities") report, or a scope with no
 *    matching template — prefer a GENERIC template: one whose name does not
 *    look like any known place. Among generics the tenant's isDefault wins.
 *    This is what stops an all-scope report defaulting to "Apo Reef Park".
 * 3. If every template is place-specific, fall back to the tenant's isDefault
 *    (then the first template) rather than selecting nothing — the user still
 *    sees a working default and can override it.
 *
 * @param templates       Templates available to the tenant, in display order.
 * @param scope           The report's active scope.
 * @param knownPlaceNames Every municipality / zone / province name the tenant
 *                        has. Used ONLY to classify a template as
 *                        place-specific vs generic.
 * @returns The id to select, or null when there are no templates at all.
 */
export function pickDefaultTemplateId(
  templates: readonly TemplateOption[],
  scope: ReportScopeNames,
  knownPlaceNames: readonly string[],
): string | null {
  if (templates.length === 0) return null;

  const activeScopeName =
    scope.zoneName ?? scope.municipalityName ?? scope.provinceName;

  if (activeScopeName !== null && activeScopeName !== "") {
    const scopeMatch = templates.find((t) => namesMatch(t.name, activeScopeName));
    if (scopeMatch !== undefined) return scopeMatch.id;
  }

  const generic = templates.filter(
    (t) => !knownPlaceNames.some((place) => namesMatch(t.name, place)),
  );
  const pool = generic.length > 0 ? generic : templates;
  const chosen = pool.find((t) => t.isDefault) ?? pool[0];
  return chosen === undefined ? null : chosen.id;
}
