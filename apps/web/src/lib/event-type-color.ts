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

/**
 * Per-event-type accent, keyed by the NORMALIZED display label. Chosen for
 * MAXIMUM mutual distinctness (owner 2026-07-12: "make each really different,
 * not just relative"): distinct hues spread across the wheel, medium saturation
 * so they read on both the white PDF chart background and the light/dark map
 * tiles. A loose warm-lean for Law-Enforcement / cool-lean for Monitoring keeps
 * the two categories legible at a glance.
 */
const COLOR_BY_TYPE: Record<string, string> = {
  // Law enforcement & apprehensions
  [normalizeTypeLabel("Unregistered Illegal Fishing")]: "#dc2626", // red
  [normalizeTypeLabel("Fishing in a prohibited area (MPA)")]: "#f97316", // orange
  [normalizeTypeLabel("Taking of Prohibited Species")]: "#ca8a04", // gold
  [normalizeTypeLabel("Use of Prohibited Gears")]: "#9333ea", // purple
  [normalizeTypeLabel("Compressor Fishing")]: "#db2777", // pink
  [normalizeTypeLabel("Destructive Practices")]: "#78350f", // brown
  // Monitoring, patrolling & surveillance
  [normalizeTypeLabel("Marine wildlife sightings")]: "#0f766e", // dark teal
  [normalizeTypeLabel("Infrastructure and assets")]: "#2563eb", // blue
  [normalizeTypeLabel("Research and Studies")]: "#06b6d4", // bright cyan
  [normalizeTypeLabel("Community Support")]: "#16a34a", // green
  [normalizeTypeLabel("Threats on Habitat")]: "#84cc16", // lime
};

/**
 * Neutral slate for the catch-all "Others" bucket and any not-yet-mapped event
 * type. Deliberately NOT a category colour — a category fallback (e.g. red for
 * Law Enforcement) duplicated the first canonical type's accent, which is what
 * made "Others" and "Unregistered Illegal Fishing" both render red.
 */
const NEUTRAL_COLOR = "#64748b"; // slate-500

/**
 * Accent color for an event by its type display. A mapped canonical sub-type
 * gets its distinct accent; everything else (the "Others" aggregate, or a new
 * ER type not yet in the map) gets a neutral slate so it never collides with a
 * real type's colour. `category` is accepted for call-site stability but no
 * longer drives a fallback colour (see NEUTRAL_COLOR).
 */
export function colorForEventType(
  display: string | null | undefined,
  _category?: string | null,
): string {
  if (display != null) {
    const hit = COLOR_BY_TYPE[normalizeTypeLabel(display)];
    if (hit !== undefined) return hit;
  }
  return NEUTRAL_COLOR;
}
