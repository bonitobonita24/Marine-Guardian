/**
 * Event-type → accent color mapping (owner request 2026-07-12).
 *
 * Single source of truth so EVERY surface that colors an event type — the PDF
 * report Event Map markers + breakdown-chart legend, the on-screen breakdown
 * bars, and the Interactive Report Map / Live Map markers — uses the SAME
 * distinct accent per sub-event-type. This is what makes the chart legend match
 * the map markers.
 *
 * Companion to {@link ./event-type-icon.tsx} (same normalized key). Colors are
 * concrete hex (not CSS vars) so they render identically in the print subtree
 * (which has no Tailwind/theme layer), on Leaflet markers, and in legends.
 *
 * Distinct-per-type is the priority (the icon already carries category); the
 * palette still leans warm for Law-Enforcement and cool for Monitoring so the
 * two categories stay legible at a glance. Fallback: an unlisted type resolves
 * to its category accent, then a neutral grey.
 */
import { normalizeTypeLabel } from "./event-type-order";

/** Per-event-type accent, keyed by the NORMALIZED display label. */
const COLOR_BY_TYPE: Record<string, string> = {
  // Law enforcement & apprehensions — warm family, maximally separated.
  [normalizeTypeLabel("Unregistered Illegal Fishing")]: "#dc2626", // red
  [normalizeTypeLabel("Fishing in a prohibited area (MPA)")]: "#ea580c", // orange
  [normalizeTypeLabel("Taking of Prohibited Species")]: "#d97706", // amber
  [normalizeTypeLabel("Use of Prohibited Gears")]: "#7c3aed", // violet
  [normalizeTypeLabel("Compressor Fishing")]: "#db2777", // magenta
  [normalizeTypeLabel("Destructive Practices")]: "#92400e", // brown
  // Monitoring, patrolling & surveillance — cool family.
  [normalizeTypeLabel("Marine wildlife sightings")]: "#0d9488", // teal
  [normalizeTypeLabel("Infrastructure and assets")]: "#2563eb", // blue
  [normalizeTypeLabel("Research and Studies")]: "#06b6d4", // cyan
  [normalizeTypeLabel("Community Support")]: "#16a34a", // green
  [normalizeTypeLabel("Threats on Habitat")]: "#4f46e5", // indigo
};

/** EarthRanger category strings (mirror eventMarkerStyle.EVENT_CATEGORY). */
const LAW_ENFORCEMENT_CATEGORY = "law-enforcement-and-apprehensions";
const MONITORING_CATEGORY = "monitoring_patrolling_and_surveillance";

/** Category-level accent fallback (concrete hex counterparts of --chart-1/2). */
const CATEGORY_COLOR: Record<string, string> = {
  [LAW_ENFORCEMENT_CATEGORY]: "#dc2626", // law-enforcement family lead (red)
  [MONITORING_CATEGORY]: "#0d9488", // monitoring family lead (teal)
};

/** Neutral grey for anything outside the two known categories. */
const NEUTRAL_COLOR = "#64748b"; // slate-500

/**
 * Accent color for an event, by its type display (preferred) then category
 * fallback then a neutral grey. Pass the EarthRanger `eventType.display` and
 * `eventType.category`. Always returns a concrete hex string.
 */
export function colorForEventType(
  display: string | null | undefined,
  category?: string | null,
): string {
  if (display != null) {
    const hit = COLOR_BY_TYPE[normalizeTypeLabel(display)];
    if (hit !== undefined) return hit;
  }
  if (category != null) {
    const cat = CATEGORY_COLOR[category];
    if (cat !== undefined) return cat;
  }
  return NEUTRAL_COLOR;
}
