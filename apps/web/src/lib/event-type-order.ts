/**
 * Canonical event-type display order (owner spec 2026-06-28).
 *
 * Single source of truth so EVERY surface that lists event types — the
 * Command Center / Interactive Report Map breakdown charts AND the per-area
 * report PDF breakdown charts — reads the types in the same fixed sequence
 * regardless of count.
 *
 * Previously this order lived inside the dashboard `breakdown-bars` component;
 * it was lifted here (2026-06-28) so the PDF report charts can share it without
 * importing a dashboard client component.
 */
export type EventTypeVariant = "law_enforcement" | "monitoring";

/**
 * Fixed sequence per category. Types not listed here (e.g. an "Others" bucket
 * or a newly-introduced ER event type) are NOT given a canonical slot — callers
 * append them afterwards using their own tiebreak (typically count descending).
 * Matching is normalized via {@link normalizeTypeLabel} so minor display-string
 * variations (parentheticals like "(MPA)", capitalisation, punctuation) align.
 */
export const EVENT_TYPE_ORDER: Record<EventTypeVariant, string[]> = {
  law_enforcement: [
    "Unregistered Illegal Fishing",
    "Fishing in a prohibited area (MPA)",
    "Taking of Prohibited Species",
    "Use of Prohibited Gears",
    "Compressor Fishing",
    "Destructive Practices",
  ],
  monitoring: [
    "Marine wildlife sightings",
    "Infrastructure and assets",
    "Research and Studies",
    "Community Support",
    "Threats on Habitat",
  ],
};

/**
 * Normalize an event-type label for tolerant matching: lower-cased, with
 * parentheticals dropped (e.g. "(MPA)") and all non-alphanumerics collapsed to
 * single spaces. So "Fishing in a prohibited area (MPA)" and
 * "fishing in a prohibited area" compare equal.
 */
export function normalizeTypeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop parentheticals e.g. "(MPA)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Index of `label` within the canonical order for `variant`, or -1 if the type
 * is not part of the fixed sequence. Use as the primary sort key: listed types
 * sort by ascending index; unlisted types (index -1) sort after, by the
 * caller's own tiebreak.
 */
export function canonicalIndex(label: string, variant: EventTypeVariant): number {
  const order = EVENT_TYPE_ORDER[variant];
  const n = normalizeTypeLabel(label);
  return order.findIndex((o) => normalizeTypeLabel(o) === n);
}
