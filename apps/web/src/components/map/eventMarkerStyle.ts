/**
 * Event-marker visual encoding for the operational map.
 *
 * Markers are colored by EarthRanger eventType.category (matching the TrackLegend
 * swatches: law-enforcement = --chart-1, monitoring = --chart-2) and SIZED by
 * Event.priority (raw ER integer 0/100/200/300 = low/med/high/crit). Colouring by
 * category — not priority — keeps the map legend honest: previously every
 * low-priority event of BOTH categories rendered sky-blue, contradicting the
 * green/blue legend swatches.
 */

export const EVENT_CATEGORY = {
  lawEnforcement: "law-enforcement-and-apprehensions",
  monitoring: "monitoring_patrolling_and_surveillance",
} as const;

/** Category fill for an event marker. Mirrors TrackLegend's chart-token swatches. */
export function eventCategoryColor(category: string | null | undefined): string {
  if (category === EVENT_CATEGORY.lawEnforcement) return "hsl(var(--chart-1))";
  if (category === EVENT_CATEGORY.monitoring) return "hsl(var(--chart-2))";
  return "hsl(var(--muted-foreground))";
}

/**
 * Concrete HSL triple for a category's heatmap ramp. MapLibre paint cannot read
 * CSS custom properties at runtime, so the heatmap layer needs literal values —
 * these mirror the --chart-1 / --chart-2 theme tokens (globals.css) so the
 * heatmap colours match the dot markers + legend swatches exactly.
 */
export function eventCategoryHeatHsl(
  category: string | null | undefined,
): { h: number; s: number; l: number } {
  if (category === EVENT_CATEGORY.lawEnforcement) return { h: 220, s: 70, l: 50 };
  if (category === EVENT_CATEGORY.monitoring) return { h: 160, s: 60, l: 45 };
  return { h: 220, s: 10, l: 50 };
}

/** Marker edge length in px, scaled by priority tier. Small by default so a dense
 *  range doesn't blanket the map; critical events read larger. */
export function eventPrioritySizePx(priority: number): number {
  if (priority >= 300) return 13;
  if (priority >= 200) return 11;
  if (priority >= 100) return 9;
  return 7;
}

/** Human-readable priority tier for tooltips. */
export function eventPriorityLabel(priority: number): string {
  if (priority >= 300) return "Critical";
  if (priority >= 200) return "High";
  if (priority >= 100) return "Medium";
  return "Low";
}

/**
 * Serious-incident event types (matched as case-insensitive substrings of the
 * EarthRanger eventType.display). These get a distinct, attention-drawing marker
 * on the map so high-stakes events stand out from routine ones:
 *   Compressor Fishing · Taking of Prohibited Species · Use of Prohibited Gears ·
 *   Marine Wildlife Sightings · Threats on Habitat.
 */
export const SERIOUS_EVENT_PATTERNS = [
  "compressor",
  "prohibited species",
  "prohibited gear",
  "wildlife sighting",
  "habitat",
] as const;

/** True when an event's type display marks it as a serious incident. */
export function isSeriousEvent(display: string | null | undefined): boolean {
  if (display == null) return false;
  const d = display.toLowerCase();
  return SERIOUS_EVENT_PATTERNS.some((p) => d.includes(p));
}

// ── Hierarchical event-marker filtering (L1 category → L2 type → L3 value) ────
// The map controls toggle three nested tiers. A marker is visible only when ALL
// three pass: its category layer is ON, its specific event type (L2) is enabled,
// and its "Type" sub-value (L3) is enabled. Pure + exported so the dot-marker and
// heatmap layers share one consistent predicate and it can be unit-tested.

/** Composite key namespacing an L3 value under its event-type id (so identical
 *  value labels like "Others" under different types never collide). An event
 *  with no resolved L3 value buckets under "(Unspecified)". */
export function eventTypeValueKey(
  typeId: string | null | undefined,
  value: string | null | undefined,
): string {
  return `${typeId ?? ""}::${value ?? "(Unspecified)"}`;
}

export type EventFilterState = {
  /** L1 — category master toggles. */
  eventLayers: { lawEnforcement: boolean; monitoring: boolean };
  /** L2 — opt-OUT set of event-type ids. */
  disabledTypeIds: ReadonlySet<string>;
  /** L3 — opt-OUT set of `${typeId}::${value}` keys. */
  disabledTypeValues: ReadonlySet<string>;
};

export type FilterableEvent = {
  eventType?: { id?: string | null; category?: string | null } | null;
  eventTypeValue?: string | null;
};

/** Whether an event passes the L1+L2+L3 marker/heatmap filter. */
export function isEventVisible(
  event: FilterableEvent,
  filter: EventFilterState,
): boolean {
  const typeId = event.eventType?.id ?? null;
  // L2 — type opted out.
  if (typeId !== null && filter.disabledTypeIds.has(typeId)) return false;
  // L3 — value opted out.
  if (filter.disabledTypeValues.has(eventTypeValueKey(typeId, event.eventTypeValue)))
    return false;
  // L1 — category master toggle.
  const category = event.eventType?.category;
  if (category === EVENT_CATEGORY.lawEnforcement)
    return filter.eventLayers.lawEnforcement;
  if (category === EVENT_CATEGORY.monitoring)
    return filter.eventLayers.monitoring;
  return false;
}
