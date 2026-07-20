"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

/**
 * Floating chart panels overlaid on the Interactive Report Map (owner request
 * 2026-07-20). The two trend charts — "Events vs Patrols Over Time" and
 * "Region Coverage" — used to occupy a 5th summary tile (commit b2cf14a);
 * they now live here as map overlays so the summary row is back to its
 * original four tiles.
 *
 * Behaviour contract (all owner-specified):
 *  - Both panels are HIDDEN BY DEFAULT so they never block the map on load.
 *  - The toggle row is ALWAYS VISIBLE (it renders whether or not any panel is
 *    open, and independently of the Map controls card's own collapse state),
 *    so the hidden charts stay discoverable without expanding anything.
 *  - Each chart toggles independently — either, both, or neither.
 *
 * Width is NOT set here: this component is rendered inside InteractiveMap's
 * floating controls column (`w-60`), so every panel inherits exactly the Map
 * controls card's width by construction rather than by a duplicated literal.
 *
 * The chart nodes are passed through untouched (same data, same props) — this
 * component only supplies the overlay chrome and the show/hide state.
 */

export type MapChartOverlayItem = {
  /** Stable key — also used to build the panel's DOM id. */
  key: string;
  /** Short label on the always-visible toggle button. */
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

  const toggle = (key: string) => {
    setVisibleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <div
      className="flex min-h-0 flex-col gap-2 overflow-y-auto"
      data-testid="map-chart-overlay"
    >
      {/* Always-visible toggle row — sits directly beneath the Map controls
          card so the hidden charts are discoverable at a glance. */}
      <div className="flex shrink-0 flex-col gap-1 rounded-md border bg-background/95 px-2.5 py-1.5 shadow-md backdrop-blur">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Charts
        </span>
        {items.map((item) => {
          const shown = visibleKeys.includes(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                toggle(item.key);
              }}
              aria-expanded={shown}
              {...(shown ? { "aria-controls": panelId(item.key) } : {})}
              data-testid={`map-chart-toggle-${item.key}`}
              className="flex min-h-7 items-center justify-between gap-2 rounded-sm px-1 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <span className="truncate">{item.toggleLabel}</span>
              {shown ? (
                <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
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
                toggle(item.key);
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
