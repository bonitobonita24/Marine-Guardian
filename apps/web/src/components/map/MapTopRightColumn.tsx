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
 *
 * ---------------------------------------------------------------------------
 * RESPONSIVE BEHAVIOUR (regression fix 2026-07-20)
 * ---------------------------------------------------------------------------
 * The original version pinned BOTH this column and the left "Map controls"
 * column to a hard `w-60` (240px). Two 240px columns need ~500px of map before
 * they stop touching, so as the map narrows they collide: measured in-browser,
 * the gap between them is 870px at a 1600px viewport, 38px at 768px, and
 * NEGATIVE from ~730px down (-143px at 393px, where both panels land on
 * identical coordinates and the charts cover the controls card outright).
 *
 * Mechanism — pure Tailwind responsive variants, keyed on `lg` (1024px), with
 * two independent moves:
 *
 *  1. BELOW `lg` the pinned charts slot is not rendered visibly (`hidden
 *     lg:block`). The charts are a supplementary analysis overlay that already
 *     defaults to OFF; at a ~143px effective width they are unreadable anyway,
 *     so surrendering them below `lg` buys back the entire right half of the
 *     map. This does NOT weaken the "hidden panels stay unmounted" contract:
 *     that rule exists so an invisible overlay can never swallow map pointer
 *     events, and `display:none` is strictly stronger than the `invisible` /
 *     `opacity-0` cases it was written against — a display:none subtree is
 *     removed from hit-testing entirely. The chart panels themselves remain
 *     genuinely unmounted-when-off inside MapChartOverlayPanels; that logic is
 *     untouched.
 *  2. BELOW `lg` the whole column is BOTTOM-anchored (`bottom-3`, restored to
 *     `lg:top-3`). The transient patrol/event panel must stay reachable on a
 *     phone — it is the response to a map tap — so instead of hiding it we move
 *     it out of the top band that the left controls column owns. Top-left
 *     controls and a bottom-right transient panel cannot collide by
 *     construction, at any width, without measuring anything.
 *
 * Why `lg` and not `md`: the collision begins at ~730px viewport, and 768px
 * (`md`) was already measured as unusable (38px gap). `lg` (1024px) is the
 * first stop where the map is wide enough (~800px) for two 240px columns to
 * leave a comfortable ~320px clear channel. Tradeoff accepted: viewports in
 * 768–1023px lose the charts overlay. That band is a small-laptop/tablet
 * minority, the charts are opt-in, and the alternative — keeping them and
 * shrinking both columns — produces two cramped, mutually-crowding panels
 * instead of one usable map.
 *
 * Widths also step down below `lg` (`w-56` vs `w-72`) and the column is capped
 * at 70% of the map rather than `100%-1.5rem`, so the map is never fully
 * covered even when a transient panel is open on the narrowest viewport.
 *
 * `lg:` is Tailwind's min-width breakpoint, so every wide-viewport class here
 * is the pre-regression value verbatim — behaviour at >= 1024px is unchanged.
 *
 * ---------------------------------------------------------------------------
 * BOTTOM-RIGHT CONTROL CLEARANCE (regression fix 2026-07-20, second pass)
 * ---------------------------------------------------------------------------
 * ⚠ DO NOT "simplify" `bottom-36` back to `bottom-3`, and do not relax the
 * `max-h` clamp below. Both numbers are load-bearing — they are the reserved
 * gutter that keeps this column off the map's bottom-right control cluster.
 *
 * The map owns a second overlay stack in its lower-RIGHT corner, at z-10 —
 * BELOW this column's z-20. Raising z-index would therefore NOT fix anything:
 * the controls would stay visible but remain unclickable, because hit-testing
 * follows paint order. The only real fix is to not occupy those pixels at all.
 *
 * Measured in-browser (768x1024, transient panel open, pre-fix): the panel box
 * spanned x 507-731 / y 576.5-727 while the zoom cluster sat at x 701-735 /
 * y 633-699 and the doodle toggle at y 609-643 — a 30px horizontal by 66px
 * vertical overlap, with `elementFromPoint` returning the PANEL at all three
 * button centres. The same collision existed at >= lg whenever the CHARTS
 * panel was toggled on and made the column tall enough to reach down (30x66 at
 * 1024x800; 0 with charts off).
 *
 * The clearance is DERIVED from the cluster's own classes, not guessed:
 *
 *   zoom cluster   `ui/map.tsx` positionClasses["bottom-right"] = `bottom-10`
 *                  (40px) + one ControlGroup of two `size-8` buttons plus the
 *                  group's 1px top/bottom border = 66px tall
 *                  -> its top edge is 40 + 66 = 106px above the map's bottom.
 *   doodle toggle  `InteractiveMap.tsx` `bottom-24` (96px) + one `size-8`
 *                  button + 1px borders = 34px tall
 *                  -> its top edge is 96 + 34 = 130px above the map's bottom.
 *
 * 130px is therefore the topmost pixel the cluster can ever reach (the doodle
 * toggle is conditional on `doodleSurface`; when it is absent the cluster only
 * reaches 106px, so reserving for 130px is the safe worst case). The smallest
 * Tailwind step that clears it is `bottom-36` = 9rem = 144px, leaving a 14px
 * clearance band. Horizontally the cluster is `right-2`+34px wide = 8-42px
 * from the map's right edge and this column is `right-3` = 12px, so the two
 * DO share 30px of horizontal span — which is exactly why the separation has
 * to be vertical.
 *
 * One clamp covers BOTH anchoring modes, because they are mirror images:
 *   `max-h-[calc(100%-9.75rem)]`  = 100% - (top-3 12px + 144px reserve = 156px)
 *     - below lg  (bottom-anchored at `bottom-36`): the column grows UPWARD
 *       from 144px and its top stops 12px below the map's top edge.
 *     - at >= lg  (top-anchored at `lg:top-3`): it grows DOWNWARD from 12px
 *       and its bottom stops 144px above the map's bottom edge — so a
 *       charts-ON column can no longer reach the controls however tall its
 *       content is. `overflow-y-auto` (already present) scrolls the excess.
 * That is why the clamp is unprefixed: the reserved band is the same at every
 * viewport, so the fix is breakpoint-independent by construction.
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
      // `bottom-36` + `max-h-[calc(100%-9.75rem)]` reserve the 144px band the
      // map's z-10 bottom-right zoom/doodle cluster lives in — see the
      // "BOTTOM-RIGHT CONTROL CLEARANCE" block above for the derivation.
      className="absolute bottom-36 right-3 z-20 flex max-h-[calc(100%-9.75rem)] max-w-[70%] flex-col items-end gap-2 overflow-y-auto lg:bottom-auto lg:top-3 lg:max-w-[calc(100%-1.5rem)]"
    >
      {pinned != null && (
        <div
          data-testid="map-top-right-pinned"
          className="hidden w-60 max-w-full shrink-0 lg:block"
        >
          {pinned}
        </div>
      )}
      {transient != null && (
        <div
          data-testid="map-top-right-transient"
          className="w-56 max-w-full shrink-0 lg:w-72"
        >
          {transient}
        </div>
      )}
    </div>
  );
}
