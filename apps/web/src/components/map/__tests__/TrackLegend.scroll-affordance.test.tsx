// @vitest-environment jsdom

// Guards the MAP CONTROLS scroll affordances (owner request 2026-07-20): the
// card's scroll area carries the hover/focus/while-scrolling scrollbar class,
// and a bottom fade appears ONLY while there is unseen content below.
//
// Note on what jsdom can and cannot prove here: jsdom has no layout engine, so
// scrollHeight/clientHeight are 0 unless stubbed — these tests stub them to
// drive the component's own arithmetic. The rendered *appearance* of the
// scrollbar (a ::-webkit-scrollbar pseudo-element) is not observable from
// jsdom at all; that part is covered by the class contract below plus the CSS
// in globals.css.

import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { TrackLegend } from "../TrackLegend";
import { DEFAULT_TRACK_VISIBILITY } from "../patrolTrackStyle";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      value: ResizeObserverStub,
      writable: true,
    });
  }
});

function renderControls() {
  return render(
    <TrackLegend
      orientation="vertical"
      collapsible
      title="Map controls"
      showTracks
      onShowTracksChange={vi.fn()}
      visibility={DEFAULT_TRACK_VISIBILITY}
      onTypeVisibilityChange={vi.fn()}
      eventLayers={{ lawEnforcement: true, monitoring: true }}
      onEventLayerChange={vi.fn()}
      showBoundaries={false}
      onShowBoundariesChange={vi.fn()}
      showSkylight={false}
      onShowSkylightChange={vi.fn()}
      showThumbnails={false}
      onShowThumbnailsChange={vi.fn()}
    />,
  );
}

/** jsdom reports 0 for every layout metric; stub the three the component reads
 *  so the fade/end-of-scroll arithmetic can be exercised honestly. */
function stubScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void {
  Object.defineProperty(el, "scrollHeight", {
    value: metrics.scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: metrics.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, "scrollTop", {
    value: metrics.scrollTop,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MAP CONTROLS — scroll affordances", () => {
  it("puts the hover-revealed scrollbar class on the element that actually scrolls", () => {
    renderControls();
    const scroller = screen.getByTestId("map-controls-scroll-area");
    // Same element owns the overflow and the scrollbar styling — if these ever
    // separate, the scrollbar would be styled on a non-scrolling box.
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("mg-hover-scrollbar");
  });

  it("shows no fade when the content fits (nothing more to reveal)", () => {
    renderControls();
    const scroller = screen.getByTestId("map-controls-scroll-area");
    stubScrollMetrics(scroller, {
      scrollHeight: 200,
      clientHeight: 200,
      scrollTop: 0,
    });
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId("map-controls-scroll-fade")).toBeNull();
  });

  it("shows the fade while content remains below, and removes it at the end of the scroll", () => {
    renderControls();
    const scroller = screen.getByTestId("map-controls-scroll-area");

    stubScrollMetrics(scroller, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 0,
    });
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId("map-controls-scroll-fade")).not.toBeNull();

    // Scrolled to the very bottom → the "there is more" cue must disappear.
    scroller.scrollTop = 400;
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId("map-controls-scroll-fade")).toBeNull();
  });

  it("flags the scroll area while scrolling and clears the flag once scrolling stops", () => {
    vi.useFakeTimers();
    renderControls();
    const scroller = screen.getByTestId("map-controls-scroll-area");
    stubScrollMetrics(scroller, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 0,
    });

    expect(scroller.getAttribute("data-scrolling")).toBe("false");
    fireEvent.scroll(scroller);
    // The CSS reveals the bar while this is "true" — the keyboard/touch path
    // that hover alone cannot serve.
    expect(scroller.getAttribute("data-scrolling")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(scroller.getAttribute("data-scrolling")).toBe("false");
  });

  it("drops the fade when the card is collapsed", () => {
    renderControls();
    const scroller = screen.getByTestId("map-controls-scroll-area");
    stubScrollMetrics(scroller, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 0,
    });
    fireEvent.scroll(scroller);
    expect(screen.queryByTestId("map-controls-scroll-fade")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Collapse map controls"));
    expect(screen.queryByTestId("map-controls-scroll-area")).toBeNull();
    expect(screen.queryByTestId("map-controls-scroll-fade")).toBeNull();
  });
});
