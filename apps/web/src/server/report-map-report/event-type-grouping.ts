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

/**
 * Group events by their type display name. Groups are ordered by descending
 * event count (busiest type first), ties broken alphabetically; events keep
 * their input order within each group.
 */
export function groupEventsByType(
  events: ReportMapEventDetail[],
): EventTypeGroup[] {
  const groups = new Map<string, EventTypeGroup>();
  for (const e of events) {
    let g = groups.get(e.typeDisplay);
    if (g === undefined) {
      g = { type: e.typeDisplay, events: [], detailKeys: [], hasAnyPhoto: false };
      groups.set(e.typeDisplay, g);
    }
    g.events.push(e);
    if (e.photoAssetIds.length > 0) g.hasAnyPhoto = true;
    const details = detailRecord(e.eventDetailsJson);
    if (details !== null) {
      for (const key of Object.keys(details)) {
        if (!g.detailKeys.includes(key)) g.detailKeys.push(key);
      }
    }
  }
  return Array.from(groups.values()).sort(
    (a, b) =>
      b.events.length - a.events.length || a.type.localeCompare(b.type),
  );
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
