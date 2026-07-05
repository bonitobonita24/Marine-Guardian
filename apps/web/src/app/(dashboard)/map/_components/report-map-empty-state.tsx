"use client";

import { CalendarOff } from "lucide-react";

/**
 * Interactive Report Map — analytics-band empty state (2026-06-29; patrol-aware
 * gate 2026-07-05).
 *
 * When a SPECIFIC municipality is selected and it genuinely has NOTHING to show
 * for the active date window — zero events AND zero patrols — the analytics
 * band would otherwise render a row of bare "0" cards + a flatlined EVENTS OVER
 * TIME chart — correct data that reads like a malfunction to the Mayor /
 * investors. This surface replaces that with an explicit, neutral message
 * naming the municipality and the range.
 *
 * A municipality can have patrols with zero events in-window (foot patrols are
 * tracked independently of events) — that is NOT "nothing to show": the map
 * still renders patrol tracks and the Patrols card still has rows, so the
 * blanket empty state must not hide them. The gate only fires when BOTH
 * signals are empty; each card still carries its own localized "no data"
 * message (PatrolListByRangeCard: "No patrols in this range.",
 * EventsOverTimeChart: "No events in range") for the signal that IS empty.
 *
 * Only shown for a specific municipality: a zero across "all municipalities" is
 * a different (and rare) situation, so the band is left as-is there.
 */

/**
 * Decide whether the empty-state message should replace the analytics band.
 * Pure + side-effect-free so the condition is unit-testable in isolation.
 *
 * Returns true ONLY when:
 *  - a specific municipality is selected (municipalityId !== null), AND
 *  - the queries are no longer loading (avoid flashing the message mid-fetch), AND
 *  - the total event count for the range is exactly zero, AND
 *  - the total patrol count for the range is exactly zero (patrols carry their
 *    own signal — e.g. foot-patrol tracks — independent of events), AND
 *  - the municipality name is known (so the message can always name the place).
 */
export function shouldShowReportMapEmptyState(args: {
  municipalityId: string | null;
  totalEvents: number;
  totalPatrols: number;
  isLoading: boolean;
  municipalityName: string | null;
}): boolean {
  return (
    args.municipalityId !== null &&
    !args.isLoading &&
    args.totalEvents === 0 &&
    args.totalPatrols === 0 &&
    args.municipalityName !== null
  );
}

export function ReportMapEmptyState({
  municipalityName,
  rangeLabel,
}: {
  /** Display name of the selected municipality (e.g. "Calapan City"). */
  municipalityName: string;
  /** Pre-formatted, year-bearing range (e.g. "Jun 22 – Jun 29, 2026"). */
  rangeLabel: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="report-map-empty-state"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[hsl(var(--panel-border))] bg-card px-6 py-10 text-center"
    >
      <CalendarOff className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        No events recorded for {municipalityName} between {rangeLabel}.
      </p>
      <p className="text-xs text-muted-foreground">
        Try a wider date range or a different municipality.
      </p>
    </div>
  );
}
