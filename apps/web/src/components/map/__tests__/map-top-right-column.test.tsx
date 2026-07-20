// @vitest-environment jsdom

// The map's shared upper-RIGHT floating column (owner request 2026-07-20).
// The chart panel moved from the left column to the right, where the transient
// EventTypeEventsPanel / SelectedPatrolMapPanel already lived — this guards the
// collision resolution: ONE right-anchored stacking column, pinned content
// first, transient content BELOW it, neither replacing nor overlapping the
// other, and neither clipped off-screen.

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
    // Mirrors the left controls column's `left-3 top-3` at `right-3 top-3`.
    expect(column.className).toContain("right-3");
    expect(column.className).toContain("top-3");
    // Right-anchored, so the w-60 pinned panel and w-72 transient panel share a
    // flush right edge (intended).
    expect(column.className).toContain("items-end");
    // Clamped to the map height with its own scroller; clamped on narrow
    // viewports so it never covers the whole map.
    expect(column.className).toContain("max-h-[calc(100%-1.5rem)]");
    expect(column.className).toContain("overflow-y-auto");
    expect(column.className).toContain("max-w-[calc(100%-1.5rem)]");
  });

  it("pins the charts to the Map-controls width and the transient panel to w-72", () => {
    render(<MapTopRightColumn pinned={<div />} transient={<div />} />);

    expect(screen.getByTestId("map-top-right-pinned").className).toContain(
      "w-60",
    );
    expect(screen.getByTestId("map-top-right-transient").className).toContain(
      "w-72",
    );
  });
});
