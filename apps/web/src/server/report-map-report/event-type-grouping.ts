/**
 * Per-event-type grouping for the printable Report Map event tables.
 *
 * The exported event report renders a SEPARATE table per EventType (owner
 * directive 2026-07-03): each ER event type carries its own dynamic field set
 * in Event.eventDetailsJson, so a single shared column header cannot surface
 * every field. This module derives, per type, the union of detail keys present
 * across that type's events — the type's own column set — plus display-ready
 * key/value formatting. Pure functions (no React, no Prisma) so the grouping
 * contract is unit-testable independent of the print template.
 */

import type { ReportMapEventDetail } from "./get-report-map-report-data";

export interface EventTypeGroup {
  /** EventType display name (group heading). */
  type: string;
  events: ReportMapEventDetail[];
  /**
   * Union of eventDetailsJson keys present across this type's events, in
   * first-seen order — the per-type table's dynamic column set.
   */
  detailKeys: string[];
  /** True when at least one event in the group has an archived photo. */
  hasAnyPhoto: boolean;
}

/** eventDetailsJson is only column-expandable when it is a plain object. */
function detailRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

// ─── Machine-JSON column filter (owner complaint (c) 2026-07-05) ──────────────
//
// Some ER detail keys carry machine audit/activity-log data rather than human
// input — e.g. an "updates" key whose value is a serialized log entry
// (`{"text":"","time":"...","type":"add_eventdetails","user":{...}}`). Printed
// verbatim this renders as raw JSON in the PDF — unreadable noise for a human
// reviewer, not a genuine ER field. `isHumanReadableColumn` drops a detail
// column when it is EITHER a known machine-audit key OR its sampled values
// are predominantly JSON-object/array shaped after formatting.
// `formatDetailValue` already unwraps genuine ER choice payloads
// (`{name, value}`) down to a plain string, so a column that STILL stringifies
// to `{...}`/`[...]` is real structured/audit data, not a human-entered field.

const MACHINE_KEY_FRAGMENTS = ["updates", "eventdetails", "auditlog", "activitylog", "history"];

function normalizeKeyForMatch(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isKnownMachineKey(key: string): boolean {
  const normalized = normalizeKeyForMatch(key);
  return MACHINE_KEY_FRAGMENTS.some((f) => normalized.includes(f));
}

function looksLikeJson(formatted: string): boolean {
  const t = formatted.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

/**
 * True when a detail column should be shown to a human reviewer. `values` are
 * the raw (pre-format) eventDetailsJson values sampled for this key across a
 * type's events.
 */
export function isHumanReadableColumn(key: string, values: unknown[]): boolean {
  if (isKnownMachineKey(key)) return false;
  const nonEmpty = values.filter(
    (v) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === ""),
  );
  if (nonEmpty.length === 0) return true; // nothing to judge by yet — keep it
  const jsonLikeCount = nonEmpty.filter((v) => looksLikeJson(formatDetailValue(v))).length;
  return jsonLikeCount / nonEmpty.length < 0.5;
}

/**
 * Group events by their type display name. Groups are ordered by descending
 * event count (busiest type first), ties broken alphabetically; events keep
 * their input order within each group.
 *
 * `typeColumns`, when provided (owner Option A, 2026-07-06 — full column-set
 * consistency across reports), is a per-type GLOBAL (all-time, tenant-wide)
 * ordered detail-key list computed by the caller (see
 * `buildGlobalEventTypeColumns` + `get-report-map-report-data.ts`). When a
 * group's `type` has an entry, that entry is used VERBATIM as `detailKeys` —
 * it is already ordered and `isHumanReadableColumn`-filtered server-side, so
 * it is NOT re-filtered or intersected with this call's (possibly sparse)
 * event subset. This guarantees every report renders the SAME standard
 * column set for a given event type, regardless of how many of that type's
 * fields happen to be populated in the filtered subset — missing values
 * still resolve to "—" via `detailCell`.
 *
 * When `typeColumns` is omitted, or has no entry for a group's type, that
 * group falls back to the ORIGINAL behavior: the union of detail keys
 * present in this call's own event subset, filtered by
 * `isHumanReadableColumn` using this subset's own sampled values.
 */
export function groupEventsByType(
  events: ReportMapEventDetail[],
  typeColumns?: Record<string, string[]>,
): EventTypeGroup[] {
  interface WorkingGroup extends EventTypeGroup {
    detailValues: Map<string, unknown[]>;
  }
  const groups = new Map<string, WorkingGroup>();
  for (const e of events) {
    let g = groups.get(e.typeDisplay);
    if (g === undefined) {
      g = {
        type: e.typeDisplay,
        events: [],
        detailKeys: [],
        hasAnyPhoto: false,
        detailValues: new Map(),
      };
      groups.set(e.typeDisplay, g);
    }
    g.events.push(e);
    if (e.photoAssetIds.length > 0) g.hasAnyPhoto = true;
    const details = detailRecord(e.eventDetailsJson);
    if (details !== null) {
      for (const key of Object.keys(details)) {
        if (!g.detailKeys.includes(key)) g.detailKeys.push(key);
        let values = g.detailValues.get(key);
        if (values === undefined) {
          values = [];
          g.detailValues.set(key, values);
        }
        values.push(details[key]);
      }
    }
  }
  return Array.from(groups.values())
    .map((g) => {
      const globalColumns = typeColumns?.[g.type];
      return {
        type: g.type,
        events: g.events,
        hasAnyPhoto: g.hasAnyPhoto,
        detailKeys:
          globalColumns !== undefined
            ? globalColumns
            : g.detailKeys.filter((k) =>
                isHumanReadableColumn(k, g.detailValues.get(k) ?? []),
              ),
      };
    })
    .sort((a, b) => b.events.length - a.events.length || a.type.localeCompare(b.type));
}

// ─── Global (all-time, tenant-wide) per-event-type column set ────────────────
//
// Owner Option A (2026-07-06): every printable report table for a given
// event type must render the SAME standard column set, regardless of how
// sparsely that report's filtered event subset happens to be filled in.
// EventType.schemaJson is empty for every ER type, so the column source is
// instead the GLOBAL union of eventDetailsJson keys across ALL of the
// tenant's events of that type (all-time) — a rich, representative sample.
// This helper is pure/Prisma-free (takes a plain array of sources) so it is
// unit-testable independent of the data loader's query.

export interface EventTypeColumnSource {
  typeDisplay: string;
  eventDetailsJson: unknown;
}

/**
 * Build the per-type-display ordered (first-seen), `isHumanReadableColumn`-
 * filtered union of detail keys from an arbitrary list of
 * `{typeDisplay, eventDetailsJson}` records. Intended input: ALL of a
 * tenant's events (all-time) whose event type appears somewhere in a report,
 * not just the events in that report's filtered subset — see
 * `get-report-map-report-data.ts`.
 */
export function buildGlobalEventTypeColumns(
  sources: EventTypeColumnSource[],
): Record<string, string[]> {
  const keysByType = new Map<string, string[]>();
  const valuesByType = new Map<string, Map<string, unknown[]>>();

  for (const s of sources) {
    const details = detailRecord(s.eventDetailsJson);
    if (details === null) continue;

    let keys = keysByType.get(s.typeDisplay);
    if (keys === undefined) {
      keys = [];
      keysByType.set(s.typeDisplay, keys);
    }
    let values = valuesByType.get(s.typeDisplay);
    if (values === undefined) {
      values = new Map();
      valuesByType.set(s.typeDisplay, values);
    }

    for (const key of Object.keys(details)) {
      if (!keys.includes(key)) keys.push(key);
      let vs = values.get(key);
      if (vs === undefined) {
        vs = [];
        values.set(key, vs);
      }
      vs.push(details[key]);
    }
  }

  const out: Record<string, string[]> = {};
  for (const [type, keys] of keysByType) {
    const values = valuesByType.get(type) ?? new Map<string, unknown[]>();
    out[type] = keys.filter((k) => isHumanReadableColumn(k, values.get(k) ?? []));
  }
  return out;
}

/**
 * Humanize an ER detail key for a column header:
 * "boat_registration" / "boatRegistration" → "Boat Registration".
 */
export function humanizeDetailKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Strip a redundant leading event-type-name prefix from a humanized column
 * label (owner complaint 2026-07-05): ER detail keys are namespaced with the
 * event type, so the "Others" table shows "Others Actiontaken" and the
 * "Unregistered Illegal Fishing" table shows "Unregisteredillegalfishing
 * Unregistered Address" — the type name is already the table heading, so the
 * prefix is noise. Consumes leading words whose normalized concatenation equals
 * the normalized type name, handling BOTH the spaced ("Others …") and the
 * concatenated-into-one-word ("Unregisteredillegalfishing …") forms. Returns
 * the label unchanged when no such prefix exists or when stripping would empty
 * it (so a column literally named the same as the type keeps its label). Never
 * over-strips a real field that merely starts with the same word (e.g.
 * "Unregistered Address" under type "Unregistered Illegal Fishing" stays).
 */
export function stripEventTypePrefix(label: string, type: string): string {
  const target = normalizeKeyForMatch(type);
  if (target === "") return label;
  const words = label.split(/\s+/).filter((w) => w.length > 0);
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === undefined) break;
    acc += normalizeKeyForMatch(word);
    if (acc === target) {
      const rest = words.slice(i + 1).join(" ").trim();
      return rest === "" ? label : rest;
    }
    if (!target.startsWith(acc)) break; // prefix can no longer match
  }
  return label;
}

/**
 * Format one eventDetailsJson value for a table cell. ER detail values are
 * usually strings/numbers, occasionally booleans, arrays (multi-select), or
 * nested objects (e.g. {name, value} choice payloads) — render each losslessly
 * but compactly; blank/missing renders the report-wide "—" placeholder.
 */
export function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    return Number.isFinite(v) ? v.toLocaleString("en-US") : "—";
  }
  if (typeof v === "string") return v.trim() === "" ? "—" : v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.map((item) => formatDetailValue(item)).join(", ");
  }
  // Nested object — ER choice payloads carry a human label in `name`/`value`.
  const rec = v as Record<string, unknown>;
  if (typeof rec.name === "string" && rec.name.trim() !== "") return rec.name;
  if (typeof rec.value === "string" && rec.value.trim() !== "") return rec.value;
  return JSON.stringify(v);
}

/** Detail cell for one event + key (missing key / non-object details → "—"). */
export function detailCell(e: ReportMapEventDetail, key: string): string {
  const details = detailRecord(e.eventDetailsJson);
  if (details === null || !(key in details)) return "—";
  return formatDetailValue(details[key]);
}

// ─── 2-page landscape column split (owner complaint (a) 2026-07-05) ───────────
//
// A busy EventType can carry ~15 columns (5 fixed + 10 dynamic ER fields),
// which crushed every column to an unreadable ~30px on ONE landscape page.
// Fix: split each type's column set into two halves and render each half as
// its OWN landscape table/page, with the "identity" columns (Reported At +
// Title — enough to correlate a row across the split) repeated as the leading
// columns on BOTH halves.

export type EventColumnKind =
  | "reportedAt"
  | "title"
  | "municipality"
  | "area"
  | "reporter"
  | "detail"
  | "photo";

export interface EventColumn {
  kind: EventColumnKind;
  /** Present only for kind "detail" — the eventDetailsJson key. */
  key?: string;
  label: string;
}

export interface EventColumnSplit {
  /** Always non-empty — the first (or only) landscape page's columns. */
  page1: EventColumn[];
  /**
   * The second landscape page's columns, WITH the identity columns repeated
   * as leaders. Empty when the type's full column set already fits on one
   * page (nothing worth forcing onto a second page for).
   */
  page2: EventColumn[];
}

/** Columns repeated as leaders on every split page — enough to correlate a row. */
const IDENTITY_COLUMNS: EventColumn[] = [
  { kind: "reportedAt", label: "Reported At" },
  { kind: "title", label: "Title" },
];

/** The full ordered column set for one EventType group (before splitting). */
export function buildEventColumns(g: EventTypeGroup): EventColumn[] {
  const columns: EventColumn[] = [
    ...IDENTITY_COLUMNS,
    { kind: "municipality", label: "Municipality" },
    { kind: "area", label: "Barangay / Area" },
    { kind: "reporter", label: "Reporter" },
    ...g.detailKeys.map(
      (key): EventColumn => ({
        kind: "detail",
        key,
        label: stripEventTypePrefix(humanizeDetailKey(key), g.type),
      }),
    ),
  ];
  if (g.hasAnyPhoto) columns.push({ kind: "photo", label: "Photo" });
  return columns;
}

/**
 * Non-identity column count at/under which a single landscape page already
 * gives every column reasonable width — no split needed. Above this, a
 * busy EventType's ~10-15 total columns (owner complaint (a)) get crushed to
 * ~30px each on one page, so we force a second page.
 */
const SPLIT_THRESHOLD = 6;

/**
 * Split one EventType group's columns into two landscape-page-sized halves.
 * The identity columns (Reported At, Title) never count toward either half —
 * they are prepended to both. When the non-identity column count is small
 * enough to not need a split, `page2` is returned empty and callers should
 * render `page1` alone (no forced second page).
 */
export function splitEventColumns(g: EventTypeGroup): EventColumnSplit {
  const all = buildEventColumns(g);
  const rest = all.slice(IDENTITY_COLUMNS.length);
  if (rest.length <= SPLIT_THRESHOLD) {
    return { page1: all, page2: [] };
  }
  const mid = Math.ceil(rest.length / 2);
  const restPage1 = rest.slice(0, mid);
  const restPage2 = rest.slice(mid);
  return {
    page1: [...IDENTITY_COLUMNS, ...restPage1],
    page2: [...IDENTITY_COLUMNS, ...restPage2],
  };
}
