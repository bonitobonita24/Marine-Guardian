/**
 * Event-type → icon mapping (owner request 2026-06-28).
 *
 * Single source of truth so EVERY surface that shows an event type — map
 * markers (Interactive Report Map / Live Map), the breakdown charts, and the
 * High Priority Events list — renders the same lucide glyph for a given type.
 *
 * Matching is tolerant (case / punctuation / parentheticals) via
 * {@link normalizeTypeLabel}, shared with the canonical-order util. Types with
 * no specific glyph fall back to a per-category icon, then a global pin — so a
 * newly-introduced ER event type still renders a sensible marker.
 *
 * Icons are intentionally easy to swap: change a single entry below and every
 * surface updates at once.
 */
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Binoculars,
  Bomb,
  Building2,
  Fish,
  Gauge,
  HeartHandshake,
  MapPin,
  Microscope,
  Shell,
  ShieldAlert,
  Turtle,
  Waves,
  Wrench,
} from "lucide-react";
import { normalizeTypeLabel } from "./event-type-order";

/** Per-event-type glyphs, keyed by the NORMALIZED display label. */
const ICON_BY_TYPE: Record<string, LucideIcon> = {
  // Law enforcement & apprehensions
  [normalizeTypeLabel("Unregistered Illegal Fishing")]: Fish,
  [normalizeTypeLabel("Fishing in a prohibited area (MPA)")]: Ban,
  [normalizeTypeLabel("Taking of Prohibited Species")]: Shell,
  [normalizeTypeLabel("Use of Prohibited Gears")]: Wrench,
  [normalizeTypeLabel("Compressor Fishing")]: Gauge,
  [normalizeTypeLabel("Destructive Practices")]: Bomb,
  // Monitoring, patrolling & surveillance
  [normalizeTypeLabel("Marine wildlife sightings")]: Turtle,
  [normalizeTypeLabel("Infrastructure and assets")]: Building2,
  [normalizeTypeLabel("Research and Studies")]: Microscope,
  [normalizeTypeLabel("Community Support")]: HeartHandshake,
  [normalizeTypeLabel("Threats on Habitat")]: Waves,
};

/** Per-category fallback glyph (matched as a loose substring of the category). */
function categoryFallbackIcon(category: string | null | undefined): LucideIcon {
  if (category == null) return MapPin;
  const c = category.toLowerCase();
  if (c.includes("law")) return ShieldAlert;
  if (c.includes("monitor")) return Binoculars;
  return MapPin;
}

/**
 * The lucide icon for an event, by its type display (preferred) then category
 * fallback then a global pin. Pass the EarthRanger `eventType.display` and
 * `eventType.category`.
 */
export function eventTypeIcon(
  display: string | null | undefined,
  category?: string | null,
): LucideIcon {
  if (display != null) {
    const hit = ICON_BY_TYPE[normalizeTypeLabel(display)];
    if (hit !== undefined) return hit;
  }
  return categoryFallbackIcon(category);
}
