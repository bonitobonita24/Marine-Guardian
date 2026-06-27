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
