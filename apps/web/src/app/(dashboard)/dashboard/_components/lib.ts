// WAR ROOM command-center shared helpers.
// Conforms to docs/v2/mpa-command-center-v6.jsx (priority dots, micro-cap labels,
// "Xs ago" sync status). Pure functions — unit-tested in __tests__/lib.test.ts.

/**
 * Map a numeric event/alert priority to a semantic level.
 * Aligns with the rest of the app (alert-history/InteractiveMap use the same
 * 100/200/300 thresholds).
 */
export type PriorityLevel = "critical" | "high" | "medium" | "low";

export function priorityLevel(priority: number): PriorityLevel {
  if (priority >= 300) return "critical";
  if (priority >= 200) return "high";
  if (priority >= 100) return "medium";
  return "low";
}

export function priorityLabel(priority: number): string {
  switch (priorityLevel(priority)) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

/**
 * Tailwind background-color class for a priority dot. Color is paired with a
 * text label everywhere it is used (never color-alone) for WCAG 2.2 AA.
 */
export function priorityDotClass(priority: number): string {
  switch (priorityLevel(priority)) {
    case "critical":
      return "bg-destructive";
    case "high":
      return "bg-[hsl(var(--warning))]";
    case "medium":
      return "bg-[hsl(var(--caution))]";
    default:
      return "bg-[hsl(var(--success))]";
  }
}

/** Patrol-type glyph + accessible label. */
export function patrolTypeMeta(patrolType: string): { glyph: string; label: string } {
  if (patrolType === "seaborne") return { glyph: "🚤", label: "Seaborne" };
  if (patrolType === "foot") return { glyph: "🚶", label: "Foot" };
  return { glyph: "•", label: patrolType };
}

/** Compact "2m" / "3h" / "4d" relative-time string for a past timestamp. */
export function relativeShort(
  from: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (from === null || from === undefined) return "—";
  const then = typeof from === "string" ? new Date(from) : from;
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms)) return "—";
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${String(sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${String(min)}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${String(hr)}h`;
  const day = Math.floor(hr / 24);
  return `${String(day)}d`;
}

/** "4h23m" elapsed string from start time to now (for active patrols). */
export function elapsedHm(
  start: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (start === null || start === undefined) return "—";
  const then = typeof start === "string" ? new Date(start) : start;
  const ms = now.getTime() - then.getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return `${String(hr)}h${String(min).padStart(2, "0")}m`;
}

/** Format a distance in km to one decimal, or "—" when unknown. */
export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return "—";
  return km.toFixed(1);
}
