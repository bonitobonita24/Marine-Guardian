/**
 * Shared event display-label helpers (T2 follow-up, 2026-07-06).
 *
 * Skylight AOI entry-alert events sync from EarthRanger with a raw, generic
 * `title` (e.g. "Marine Entry") but resolve to an EventType catalog row whose
 * `display` is the meaningful label ("Skylight Entry Alert", category
 * `analyzer_event`). Every surface that headlines an event (the Events list
 * row + the Event Detail modal heading) must lead with that resolved type
 * label for Skylight/analyzer events instead of the raw ER title — this
 * module is the single place that decision is made so the list and modal
 * never drift out of sync.
 *
 * Mirrors the Skylight predicate already used elsewhere:
 *  - client map filtering: `isSkylightDisplay` in
 *    apps/web/src/components/map/eventMarkerStyle.ts (display~skylight only)
 *  - server ingest classifier: `resolveEventType` in
 *    packages/jobs/src/lib/resolve-event-type.ts (display~skylight OR
 *    category === "analyzer_event")
 * `packages/jobs` is not importable from `apps/web`, so the tiny predicate is
 * replicated here rather than shared as a module import.
 */

export type EventLabelEventType = {
  display?: string | null;
  category?: string | null;
} | null;

export type EventLabelInput = {
  title?: string | null;
  eventType?: EventLabelEventType;
};

/** Humanize a raw snake_case/kebab code into Title Case. */
function humanizeCode(code: string): string {
  return code
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Readable label for an event type. EarthRanger stores `display` as the raw
 * code (e.g. "poacher_in_mpa") for custom types that have no friendly name —
 * humanize those so the UI never shows a raw code. Returns null when there is
 * no usable label so callers can choose their own fallback.
 */
export function eventTypeLabel(display: string | null | undefined): string | null {
  if (display === null || display === undefined || display === "") return null;
  return /^[a-z0-9]+([_-][a-z0-9]+)+$/i.test(display)
    ? humanizeCode(display)
    : display;
}

/**
 * True when an event's resolved type marks it as a Skylight/analyzer-derived
 * automated detection — `display` contains "skylight" (case-insensitive) OR
 * `category` is "analyzer_event". Matches `resolveEventType`'s `isSkylight`
 * (packages/jobs/src/lib/resolve-event-type.ts).
 */
export function isSkylightOrAnalyzerEvent(eventType?: EventLabelEventType): boolean {
  if (eventType == null) return false;
  return (
    (eventType.display != null && /skylight/i.test(eventType.display)) ||
    eventType.category === "analyzer_event"
  );
}

/**
 * The label to show as an event's PRIMARY (bold) heading — the events-list
 * row title and the Event Detail modal heading.
 *
 * Skylight/analyzer events ALWAYS lead with their resolved type label (e.g.
 * "Skylight Entry Alert"), ignoring the raw ER `title` ("Marine Entry") even
 * when a title is present. Every other event keeps the prior precedence:
 * `title` first, then the type label, then "Untitled".
 *
 * Note: this only changes what is DISPLAYED. It never mutates `event.title`
 * — the Event Detail modal's editable Title input stays bound to the raw
 * `event.title` field.
 */
export function eventPrimaryLabel(event: EventLabelInput): string {
  const eventType = event.eventType ?? null;
  if (isSkylightOrAnalyzerEvent(eventType)) {
    const typeLabel = eventTypeLabel(eventType?.display);
    if (typeLabel !== null) return typeLabel;
  }
  return event.title ?? eventTypeLabel(eventType?.display) ?? "Untitled";
}
