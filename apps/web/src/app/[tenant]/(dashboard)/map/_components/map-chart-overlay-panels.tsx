"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Floating chart panels overlaid on the Interactive Report Map (owner request
 * 2026-07-20). The two trend charts — "Events vs Patrols Over Time" and
 * "Region Coverage" — used to occupy a 5th summary tile (commit b2cf14a);
 * they now live here as map overlays so the summary row is back to its
 * original four tiles.
 *
 * Placement (owner follow-up 2026-07-20): this panel renders in the map's
 * upper-RIGHT column (InteractiveMap's `topRightPinnedSlot`), top-aligned with
 * the "Map controls" card on the left. It is the FIRST/topmost item of that
 * column; the transient panels (EventTypeEventsPanel / SelectedPatrolMapPanel)
 * stack BELOW it in the same column rather than overlapping it.
 *
 * Behaviour contract (all owner-specified):
 *  - Both panels are HIDDEN BY DEFAULT so they never block the map on load.
 *  - The toggle row is ALWAYS VISIBLE (it renders whether or not any panel is
 *    open, and independently of the Map controls card's own collapse state),
 *    so the hidden charts stay discoverable without expanding anything.
 *  - Each chart toggles independently — either, both, or neither.
 *  - The control is a shadcn/ui <Switch> (on = shown, off = hidden), matching
 *    the on/off switches the Map controls card already uses. The chart label is
 *    the switch's accessible name (associated via <Label htmlFor>, not merely
 *    adjacent).
 *
 * Width is NOT set here: this component is rendered inside InteractiveMap's
 * right-hand floating column, which pins it to the same `w-60` the Map controls
 * card uses, rather than duplicating that literal.
 *
 * The chart nodes are passed through untouched (same data, same props) — this
 * component only supplies the overlay chrome and the show/hide state.
 *
 * SHORT-VIEWPORT READABILITY (owner decision 2026-07-20)
 * -----------------------------------------------------
 * This column is capped at `max-h-[calc(100%-1.5rem)]` of the MAP PANE, not the
 * window. Measured at 1280x600: map pane 286px -> column 262px, while the two
 * panels were 201px and 185px (scrollHeight 497px) — only one chart visible at
 * a time, its legend clipped, "Region Coverage" entirely below the fold. The
 * owner chose SHRINKING the charts over scrolling, so the fix lives in the
 * charts' own `compact` variant rather than in a new mechanism here: below an
 * 800px-tall viewport the compact charts drop to a 4.5rem body and shed
 * non-essential chrome (see @/components/reporting/compact-chart-density).
 *
 * Honest limit: that makes ONE open chart fully readable at 1280x600 (toggle
 * card ~90px + gap + ~131px panel = ~229px of 262px) — previously even a single
 * open chart was clipped. BOTH open still does not fit; two panels would have
 * to be ~78px each, which is less than a card's own chrome, so shrinking that
 * far would trade a scroll for two illegible charts. Opening the second chart
 * therefore still scrolls, but each panel is complete once scrolled to.
 */

export type MapChartOverlayItem = {
  /** Stable key — also used to build the panel's DOM id. */
  key: string;
  /** Short label on the always-visible toggle row. Also the switch's name. */
  toggleLabel: string;
  /** Accessible name for the revealed panel region + its close button. */
  title: string;
  /** The chart to render. Rendered as-is; it supplies its own card + title. */
  content: ReactNode;
};

export function MapChartOverlayPanels({
  items,
}: {
  items: readonly MapChartOverlayItem[];
}) {
  // Ephemeral, client-only UI state — deliberately NOT persisted, matching the
  // Map controls card's own collapse state (TrackLegend uses a plain
  // useState(false) with no storage).
  const [visibleKeys, setVisibleKeys] = useState<readonly string[]>([]);

  const setShown = (key: string, next: boolean) => {
    setVisibleKeys((prev) =>
      next
        ? prev.includes(key)
          ? prev
          : [...prev, key]
        : prev.filter((k) => k !== key),
    );
  };

  return (
    <div className="flex flex-col gap-2" data-testid="map-chart-overlay">
      {/* Always-visible switch row — top of the map's right-hand column, level
          with the Map controls card on the left, so the hidden charts are
          discoverable at a glance. */}
      <div className="flex shrink-0 flex-col gap-1 rounded-md border bg-background/95 px-2.5 py-1.5 shadow-md backdrop-blur">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Charts
        </span>
        {items.map((item) => {
          const shown = visibleKeys.includes(item.key);
          const switchId = switchIdFor(item.key);
          return (
            <div
              key={item.key}
              data-testid={`map-chart-toggle-row-${item.key}`}
              className="flex min-h-7 items-center justify-between gap-2 px-1"
            >
              <Label
                htmlFor={switchId}
                className="cursor-pointer truncate text-xs font-medium text-foreground"
              >
                {item.toggleLabel}
              </Label>
              <Switch
                id={switchId}
                // Both: <Label htmlFor> makes the visible text a real, clickable
                // association, and aria-label pins the accessible name to the
                // exact chart label regardless of AT label-for handling on a
                // button-based switch (matches the TrackLegend convention).
                aria-label={item.toggleLabel}
                checked={shown}
                onCheckedChange={(next) => {
                  setShown(item.key, next);
                }}
                {...(shown ? { "aria-controls": panelId(item.key) } : {})}
              />
            </div>
          );
        })}
      </div>

      {/* Revealed panels. Hidden panels are NOT rendered at all (rather than
          hidden with CSS) so a closed panel can never intercept pointer events
          over the map. */}
      {items
        .filter((item) => visibleKeys.includes(item.key))
        .map((item) => (
          <div
            key={item.key}
            id={panelId(item.key)}
            role="region"
            aria-label={item.title}
            data-testid={`map-chart-panel-${item.key}`}
            className="relative flex shrink-0 flex-col overflow-hidden rounded-md shadow-md ring-1 ring-border/60"
          >
            <button
              type="button"
              onClick={() => {
                setShown(item.key, false);
              }}
              aria-label={`Hide ${item.title}`}
              className="absolute right-1 top-1 z-10 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            {item.content}
          </div>
        ))}
    </div>
  );
}

function panelId(key: string): string {
  return `map-chart-panel-${key}`;
}

function switchIdFor(key: string): string {
  return `map-chart-switch-${key}`;
}
