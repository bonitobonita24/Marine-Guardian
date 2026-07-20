"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsShortViewport } from "@/components/reporting/use-short-viewport";

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
 * SHORT-VIEWPORT READABILITY — ONE PANEL AT A TIME (2026-07-20)
 * ------------------------------------------------------------
 * This column is capped at `max-h-[calc(100%-1.5rem)]` of the MAP PANE, not the
 * window, so at 1280x600 it is only 262px tall. Shrinking the charts (the
 * `compact` variant, see @/components/reporting/compact-chart-density) got a
 * single panel down to 122px, which fits — but two do not, and the earlier
 * attempts left "Region Coverage" clipped to a 7px title strip, which reads as
 * a broken component.
 *
 * Measured budget (browser, 1280x600 — reconstructed from the rendered
 * y-coordinates, and it reproduces the observed 355px content height exactly):
 *
 *   available column                       262px
 *   toggle ("Charts") card                  95px
 *   gap-2 between column children            8px
 *   one panel                              122px  (22 header + 72 body + 28 legend)
 *
 *   ONE open:  95 + 8 + 122            = 225px  <= 262px  ✅
 *   TWO open:  95 + 8 + 122 + 8 + 122  = 355px  >  262px  ❌ (93px over)
 *
 * Two panels would each have to be <= 75.5px, i.e. a 25px chart body once the
 * 50px of per-panel chrome is paid — less than the x-axis row alone. There is no
 * legible two-panel layout at this height, so below 800px tall the switches
 * become MUTUALLY EXCLUSIVE: turning one chart on turns the other off, and the
 * off chart is not rendered at all rather than clipped. Above 800px nothing
 * changes — both panels open together exactly as before (`useIsShortViewport`
 * returns false, and the server snapshot is false so SSR is unaffected).
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

  // Below 800px tall there is only room for ONE panel (see the height budget in
  // the file header). Rather than clip the second one to a title strip, the
  // switches go mutually exclusive at that size.
  const isShort = useIsShortViewport();

  // Resizing a tall window down to short can leave two panels open; drop back to
  // the most recently opened one so the column never overflows mid-resize.
  useEffect(() => {
    if (!isShort) return;
    setVisibleKeys((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
  }, [isShort]);

  const setShown = (key: string, next: boolean) => {
    setVisibleKeys((prev) => {
      if (!next) return prev.filter((k) => k !== key);
      if (isShort) return [key]; // exclusive: replaces whatever was open
      return prev.includes(key) ? prev : [...prev, key];
    });
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
        {/* Explains why turning on the second chart turns the first off, so the
            exclusivity reads as deliberate rather than as a lost toggle. Costs
            ~16px of the column's 37px of slack at 1280x600 (225px -> 241px of
            262px), so it never reintroduces the overflow it describes. */}
        {isShort ? (
          <p
            data-testid="map-chart-single-panel-hint"
            className="px-1 text-[10px] leading-tight text-muted-foreground"
          >
            One chart at a time on short screens
          </p>
        ) : null}
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
