/**
 * Traversing-patrols scope labelling (2026-07-20).
 *
 * The appended "Traversing Patrols" page must name the ACTUAL boundary the
 * report is scoped to. Before this module it hardcoded
 * `data.municipalityName`, so a ZONE-scoped report (e.g. Apo Reef Natural
 * Park) printed its parent municipality — "Patrols Traversing Sablayan" —
 * while the table beneath it correctly measured distance inside the zone,
 * and the body copy claimed the patrols "started in another municipality"
 * even at province scope where that is not the relevant boundary at all.
 *
 * This reuses the SAME resolved scope values the report header already
 * consumes (`scopeTitleOverride` / `isRegionReport` / `municipalityName` —
 * see get-report-map-report-data.ts) rather than inventing a third scope
 * mechanism. Pure + leaflet-free so it is unit-testable under vitest's
 * `environment: "node"`.
 */

/** Which boundary level the report is scoped to. */
export type TraversingScopeKind =
  | "zone"
  | "province"
  | "municipality"
  | "unscoped";

export interface TraversingScopeLabel {
  kind: TraversingScopeKind;
  /** The scope boundary's own name; null when nothing resolved. */
  name: string | null;
  /** Section heading text, e.g. "Patrols Traversing Apo Reef Natural Park". */
  heading: string;
  /** sr-only table caption. */
  caption: string;
  /** Explanatory paragraph printed under the heading. */
  note: string;
}

/**
 * Which crediting mode produced the numbers on the traversing page.
 *
 * Mirrors `ReportMapReportData.traversingMode` minus its "off" member (the
 * page does not render at all when traversing is off). REQUIRED — a caller
 * must not be able to silently inherit the wrong body copy, because the two
 * modes make OPPOSITE claims about whether these patrols are counted here.
 */
export type TraversingScopeMode = "clipped" | "full";

export interface TraversingScopeLabelInput {
  /**
   * "clipped" — legacy INCLUDE TRAVERSING PATROLS: the count stays at the
   * origin boundary and only the inside-boundary portion of distance/time is
   * credited here.
   * "full" — zone-scope-only opt-in: the patrol IS counted here and its FULL
   * distance/time (including transit outside the zone) is credited here.
   */
  mode: TraversingScopeMode;
  /**
   * ProtectedZone's own name when the report is zone-scoped, else null.
   * Same field the header uses for its unprefixed zone title.
   */
  scopeTitleOverride: string | null;
  /** True when scoped to a whole province (province set, no municipality). */
  isRegionReport: boolean;
  /**
   * Municipality name — and, in region mode, the PROVINCE name (the loader
   * carries the province through this same field; see
   * ReportMapReportData.isRegionReport).
   */
  municipalityName: string | null;
}

/** Common noun used in the body copy for each scope level. */
const SCOPE_NOUN: Record<TraversingScopeKind, string> = {
  zone: "zone",
  province: "province",
  municipality: "municipality",
  unscoped: "area",
};

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the traversing page's heading, caption and body copy from the
 * report's already-resolved scope.
 *
 * Precedence mirrors the header's: an explicit protected-zone name wins
 * over the municipality (a zone-scoped filter carries BOTH ids), then
 * region mode, then a plain municipality, then an unscoped fallback.
 */
export function resolveTraversingScopeLabel(
  input: TraversingScopeLabelInput,
): TraversingScopeLabel {
  const zoneName = nonEmpty(input.scopeTitleOverride);
  const muniName = nonEmpty(input.municipalityName);

  let kind: TraversingScopeKind;
  let name: string | null;
  if (zoneName !== null) {
    kind = "zone";
    name = zoneName;
  } else if (input.isRegionReport && muniName !== null) {
    kind = "province";
    name = muniName;
  } else if (muniName !== null) {
    kind = "municipality";
    name = muniName;
  } else {
    kind = "unscoped";
    name = null;
  }

  const noun = SCOPE_NOUN[kind];
  const displayName = name ?? `this ${noun}`;

  // The two modes make OPPOSITE claims about whether these patrols are
  // counted on this report, so the copy MUST follow the mode — printing the
  // clipped wording in full mode would be a factually false statement on a
  // funder-facing page. Clipped wording is unchanged verbatim.
  const note =
    input.mode === "full"
      ? `These patrols started outside ${displayName} but ARE included in ` +
        `this report's patrol count, distance and time. The full patrol ` +
        `distance and time are counted, including transit outside this ` +
        `${noun}; time is estimated (proportional to distance). Because ` +
        `these patrols are also counted in their origin municipality's own ` +
        `report, the two reports must not be added together.`
      : `These patrols started outside ${displayName} and are counted where ` +
        `they started, not here. Distance and time shown are only the portion ` +
        `inside this ${noun}; time is estimated (proportional to distance).`;

  return {
    kind,
    name,
    heading: `Patrols Traversing ${name ?? "This Area"}`,
    caption: `Patrols traversing ${displayName}`,
    note,
  };
}
