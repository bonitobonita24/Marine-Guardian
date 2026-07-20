// @vitest-environment jsdom

// The map's shared upper-RIGHT floating column (owner request 2026-07-20).
// The chart panel moved from the left column to the right, where the transient
// EventTypeEventsPanel / SelectedPatrolMapPanel already lived — this guards the
// collision resolution: ONE right-anchored stacking column, pinned content
// first, transient content BELOW it, neither replacing nor overlapping the
// other, and neither clipped off-screen.
//
// ---------------------------------------------------------------------------
// TOMBSTONE: `map-bottom-right-clearance.test.ts` (deleted 2026-07-20)
// ---------------------------------------------------------------------------
// A sibling suite used to live beside this one asserting that THIS column's
// right inset stayed >= the inward reach of the map's bottom-right zoom /
// doodle control cluster (hence `right-11`, 44px, clearing a 42px reach).
//
// That cluster no longer sits in the map's bottom-right corner. On the
// Interactive Report Map it now renders beside the upper-LEFT "MAP CONTROLS"
// card (CONTROL_CLUSTER_BESIDE_MAP_CONTROLS in InteractiveMap.tsx), so the
// collision it guarded cannot occur and the inset reverted to `right-3`.
//
// The suite was DELETED rather than adjusted: every assertion in it encoded a
// horizontal-clearance constraint that is now dead, and a test that pins a
// removed workaround only blocks the correct layout. Do NOT resurrect it — if
// the controls are ever moved BACK into the map's bottom-right corner, write a
// fresh guard against the geometry that exists at that time.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MapTopRightColumn } from "../MapTopRightColumn";

describe("MapTopRightColumn", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when both slots are empty (never blocks the map)", () => {
    render(<MapTopRightColumn />);
    expect(screen.queryByTestId("map-top-right-column")).toBeNull();
  });

  it("renders the pinned slot alone when no transient panel is open", () => {
    render(<MapTopRightColumn pinned={<div data-testid="charts" />} />);

    expect(screen.getByTestId("charts")).toBeTruthy();
    expect(screen.queryByTestId("map-top-right-transient")).toBeNull();
  });

  it("keeps an open transient panel and the pinned charts BOTH mounted", () => {
    render(
      <MapTopRightColumn
        pinned={<div data-testid="charts" />}
        transient={<div data-testid="patrol-panel" />}
      />,
    );

    // Neither replaces the other — this is the collision the move created.
    expect(screen.getByTestId("charts")).toBeTruthy();
    expect(screen.getByTestId("patrol-panel")).toBeTruthy();
  });

  it("stacks the transient panel BELOW the pinned charts in one column", () => {
    render(
      <MapTopRightColumn
        pinned={<div data-testid="charts" />}
        transient={<div data-testid="patrol-panel" />}
      />,
    );

    const column = screen.getByTestId("map-top-right-column");
    const pinned = screen.getByTestId("map-top-right-pinned");
    const transient = screen.getByTestId("map-top-right-transient");

    // Same column, and pinned comes first in DOM order (= topmost in a
    // flex-col), so the transient panel opens underneath it.
    expect(column.contains(pinned)).toBe(true);
    expect(column.contains(transient)).toBe(true);
    expect(
      pinned.compareDocumentPosition(transient) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(column.className).toContain("flex-col");
  });

  it("anchors top-right, right-aligned, and scrolls instead of clipping", () => {
    render(<MapTopRightColumn pinned={<div />} transient={<div />} />);

    const column = screen.getByTestId("map-top-right-column");
    // Top-aligned with the left controls column's `left-3 top-3`, and flush at
    // the same 12px gutter on the right (`right-3`). It was briefly `right-11`
    // to clear the map's old bottom-right control cluster; that cluster moved,
    // so the workaround is gone — see the tombstone at the top of this file.
    // `lg:` on the top because below that breakpoint the column is
    // bottom-anchored — see the narrow-viewport suite below.
    expect(column.className).toContain("right-3");
    expect(column.className).not.toContain("right-11");
    expect(column.className).toContain("lg:top-3");
    // Right-anchored, so the w-60 pinned panel and w-72 transient panel share a
    // flush right edge (intended).
    expect(column.className).toContain("items-end");
    // Clamped to the map height with its own scroller; clamped on narrow
    // viewports so it never covers the whole map. FULL height — an early
    // attempt at the (now-removed) control collision reserved a 144px vertical
    // band here and left the chart panels unreadable at 1280x600. Never again.
    expect(column.className).toContain("max-h-[calc(100%-1.5rem)]");
    expect(column.className).toContain("overflow-y-auto");
    expect(column.className).toContain("lg:max-w-[calc(100%-1.5rem)]");
  });

  it("pins the charts to the Map-controls width and the transient panel to w-72", () => {
    render(<MapTopRightColumn pinned={<div />} transient={<div />} />);

    expect(screen.getByTestId("map-top-right-pinned").className).toContain(
      "w-60",
    );
    expect(screen.getByTestId("map-top-right-transient").className).toContain(
      "lg:w-72",
    );
  });

  // ---------------------------------------------------------------------
  // Narrow-viewport regression guard (fix 2026-07-20).
  //
  // Both this column and the left "Map controls" column were hard `w-60`, so
  // they collided from ~730px viewport downward — at 393px they sat on
  // IDENTICAL coordinates and the charts covered the controls card outright.
  //
  // jsdom does not evaluate Tailwind's media queries (no CSS is loaded and
  // there is no layout engine), so these assert the CLASS CONTRACT rather
  // than computed geometry. The wide-viewport classes are asserted to still
  // carry the exact pre-regression values, which is the half that was
  // measured and signed off in a real browser.
  // ---------------------------------------------------------------------
  describe("narrow viewports", () => {
    it("bottom-anchors below lg so it cannot collide with the top-left controls", () => {
      render(<MapTopRightColumn transient={<div />} />);

      const column = screen.getByTestId("map-top-right-column");
      // Base (narrow) anchor is the BOTTOM edge, at the full-height
      // `bottom-3` — no vertical reserve (see the tombstone above)...
      expect(column.className).toContain("bottom-3");
      // ...and it reverts to the approved top alignment from lg upward.
      expect(column.className).toContain("lg:bottom-auto");
      expect(column.className).toContain("lg:top-3");
      // The unprefixed `top-3` must be gone, or the column would be stretched
      // between both edges on a phone.
      expect(column.className).not.toMatch(/(^|\s)top-3(\s|$)/);
    });

    it("caps its width at 70% of the map below lg so the map stays visible", () => {
      render(<MapTopRightColumn transient={<div />} />);

      const column = screen.getByTestId("map-top-right-column");
      expect(column.className).toContain("max-w-[70%]");
      // The old unprefixed full-bleed clamp is gone below lg.
      expect(column.className).not.toMatch(
        /(^|\s)max-w-\[calc\(100%-1\.5rem\)\]/,
      );
    });

    it("hides the pinned charts below lg (they are opt-in and unreadable there)", () => {
      render(<MapTopRightColumn pinned={<div data-testid="charts" />} />);

      const pinned = screen.getByTestId("map-top-right-pinned");
      // display:none below lg — strictly stronger than `invisible`, so it can
      // never intercept map pointer events.
      expect(pinned.className).toContain("hidden");
      expect(pinned.className).toContain("lg:block");
    });

    it("keeps the transient panel available below lg (it answers a map tap)", () => {
      render(<MapTopRightColumn transient={<div data-testid="patrol" />} />);

      // Still mounted and NOT display:none — hiding it would strand the user
      // after tapping a patrol on a phone.
      const transient = screen.getByTestId("map-top-right-transient");
      expect(screen.getByTestId("patrol")).toBeTruthy();
      expect(transient.className).not.toMatch(/(^|\s)hidden(\s|$)/);
      // Narrower base width, approved w-72 restored at lg.
      expect(transient.className).toContain("w-56");
      expect(transient.className).toContain("lg:w-72");
    });

    it("still renders nothing when both slots are empty", () => {
      // The narrow-viewport work must not have introduced an always-on box.
      render(<MapTopRightColumn />);
      expect(screen.queryByTestId("map-top-right-column")).toBeNull();
    });
  });
});
