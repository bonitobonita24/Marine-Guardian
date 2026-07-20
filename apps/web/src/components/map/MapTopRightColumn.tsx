"use client";

import type { ReactNode } from "react";

/**
 * The map's upper-RIGHT floating column (owner request 2026-07-20).
 *
 * Mirrors the upper-LEFT "Map controls" column at `right-3 top-3`, so the two
 * columns' top edges line up across the map.
 *
 * Collision resolution — the right-hand region is shared by TWO kinds of
 * content that previously would have overlapped:
 *   1. `pinned`    — always present (Report Map: the chart panel). Rendered
 *                    FIRST/topmost, at the controls-card width `w-60`.
 *   2. `transient` — the mutually-exclusive EventTypeEventsPanel /
 *                    SelectedPatrolMapPanel, `w-72`, empty until the operator
 *                    selects something.
 * Both live in ONE right-anchored flex column, so an opening transient panel
 * STACKS BELOW the pinned content instead of covering it — no z-index fight,
 * no absolute-offset arithmetic. Right-anchoring (`items-end`) means the two
 * differing widths still share a flush right edge, which is intended.
 *
 * Neither may be clipped off-screen: the column is clamped to the map height
 * with its own scroller (mirroring the left column's
 * `max-h-[calc(100%-1.5rem)]` + flex-col), and `max-w` keeps it from covering
 * a narrow viewport.
 *
 * Renders nothing at all when both slots are empty, so it can never intercept
 * pointer events over the map.
 */
export function MapTopRightColumn({
  pinned,
  transient,
}: {
  pinned?: ReactNode;
  transient?: ReactNode;
}) {
  if (pinned == null && transient == null) return null;
  return (
    <div
      data-testid="map-top-right-column"
      className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 overflow-y-auto"
    >
      {pinned != null && (
        <div data-testid="map-top-right-pinned" className="w-60 max-w-full shrink-0">
          {pinned}
        </div>
      )}
      {transient != null && (
        <div
          data-testid="map-top-right-transient"
          className="w-72 max-w-full shrink-0"
        >
          {transient}
        </div>
      )}
    </div>
  );
}
