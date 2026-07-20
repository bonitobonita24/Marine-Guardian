// @vitest-environment jsdom

// Floating chart overlay panels on the Interactive Report Map (owner request
// 2026-07-20). Guards the behaviour contract: both charts hidden on load so
// they never block the map, always-visible toggles for discoverability, and
// fully independent show/hide per chart.
//
// Follow-up 2026-07-20: the chevron/aria-expanded expanders were replaced with
// shadcn/ui <Switch> on/off controls, so these assertions now target
// role="switch" + aria-checked and the chart label as the switch's accessible
// name (associated via <Label htmlFor>, not merely adjacent).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import {
  MapChartOverlayPanels,
  type MapChartOverlayItem,
} from "../map-chart-overlay-panels";

/**
 * Controllable window.matchMedia — jsdom ships none. `matches` is read fresh on
 * every matchMedia() call, so flipping it and firing the listeners drives the
 * component's useSyncExternalStore exactly like a real viewport resize.
 */
function stubMatchMedia(initialMatches: boolean): (next: boolean) => void {
  const listeners = new Set<() => void>();
  let matches = initialMatches;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, cb: () => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_type: string, cb: () => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return (next: boolean) => {
    matches = next;
    act(() => {
      for (const cb of listeners) cb();
    });
  };
}

const items: MapChartOverlayItem[] = [
  {
    key: "events-over-time",
    toggleLabel: "Events vs Patrols",
    title: "Events vs Patrols Over Time",
    content: <div data-testid="chart-events">events chart</div>,
  },
  {
    key: "region-coverage",
    toggleLabel: "Region Coverage",
    title: "Region Coverage",
    content: <div data-testid="chart-coverage">coverage chart</div>,
  },
];

function renderPanels() {
  return render(<MapChartOverlayPanels items={items} />);
}

/** The on/off switch for a chart, found by its accessible name. */
function switchFor(name: string): HTMLElement {
  return screen.getByRole("switch", { name });
}

describe("MapChartOverlayPanels", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders BOTH charts hidden on initial render", () => {
    renderPanels();
    expect(screen.queryByTestId("chart-events")).toBeNull();
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    expect(screen.queryByTestId("map-chart-panel-events-over-time")).toBeNull();
    expect(screen.queryByTestId("map-chart-panel-region-coverage")).toBeNull();
  });

  it("keeps both switches visible even while every chart is hidden", () => {
    renderPanels();
    expect(switchFor("Events vs Patrols")).toBeTruthy();
    expect(switchFor("Region Coverage")).toBeTruthy();
  });

  it("renders the toggles as switches (not chevron expanders)", () => {
    renderPanels();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    // The old chevron affordance reported state via aria-expanded — gone.
    for (const el of screen.getAllByRole("switch")) {
      expect(el.getAttribute("aria-expanded")).toBeNull();
    }
  });

  it("associates each switch with its visible chart label", () => {
    renderPanels();
    // The <Label htmlFor> targets the switch's own id — a real association,
    // not just visual adjacency.
    const label = screen.getByText("Events vs Patrols");
    expect(label.getAttribute("for")).toBe(
      switchFor("Events vs Patrols").getAttribute("id"),
    );
  });

  it("reports OFF state via aria-checked on load", () => {
    renderPanels();
    for (const name of ["Events vs Patrols", "Region Coverage"]) {
      expect(switchFor(name).getAttribute("aria-checked")).toBe("false");
    }
  });

  it("reveals ONLY the Events vs Patrols chart when its switch is turned on", () => {
    renderPanels();
    fireEvent.click(switchFor("Events vs Patrols"));

    expect(screen.getByTestId("chart-events")).toBeTruthy();
    // The other chart stays hidden — the switches are independent.
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    expect(switchFor("Events vs Patrols").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("reveals ONLY the Region Coverage chart when its switch is turned on", () => {
    renderPanels();
    fireEvent.click(switchFor("Region Coverage"));

    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
    expect(screen.queryByTestId("chart-events")).toBeNull();
  });

  it("shows BOTH charts when both switches are on", () => {
    renderPanels();
    fireEvent.click(switchFor("Events vs Patrols"));
    fireEvent.click(switchFor("Region Coverage"));

    expect(screen.getByTestId("chart-events")).toBeTruthy();
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
  });

  it("hides a shown chart again when its switch is turned back off", () => {
    renderPanels();
    fireEvent.click(switchFor("Events vs Patrols"));
    expect(screen.getByTestId("chart-events")).toBeTruthy();

    fireEvent.click(switchFor("Events vs Patrols"));
    expect(screen.queryByTestId("chart-events")).toBeNull();
    expect(switchFor("Events vs Patrols").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("hides a shown chart via the panel's own close button, syncing the switch off", () => {
    renderPanels();
    fireEvent.click(switchFor("Region Coverage"));
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Hide Region Coverage"));
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    expect(switchFor("Region Coverage").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("gives each revealed panel an accessible region name", () => {
    renderPanels();
    fireEvent.click(switchFor("Events vs Patrols"));

    const panel = screen.getByRole("region", {
      name: "Events vs Patrols Over Time",
    });
    expect(panel).toBeTruthy();
    // aria-controls points at the panel that is actually in the DOM.
    expect(switchFor("Events vs Patrols").getAttribute("aria-controls")).toBe(
      panel.getAttribute("id"),
    );
  });
});

/**
 * Short viewport (< 800px tall) — the map's overlay column is only 262px there,
 * which fits ONE 122px panel but not two (355px). The contract is: never clip a
 * panel to a title strip; show one complete chart instead. See the height budget
 * in map-chart-overlay-panels.tsx / compact-chart-density.ts.
 */
describe("MapChartOverlayPanels — short viewport", () => {
  afterEach(() => {
    cleanup();
    // @ts-expect-error — removing the stub restores bare jsdom (no matchMedia).
    delete window.matchMedia;
  });

  it("renders only ONE panel when both switches are turned on", () => {
    stubMatchMedia(true);
    renderPanels();

    fireEvent.click(switchFor("Events vs Patrols"));
    fireEvent.click(switchFor("Region Coverage"));

    // The second chart replaced the first — the first is GONE from the DOM,
    // not clipped to a bare title strip.
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
    expect(screen.queryByTestId("chart-events")).toBeNull();
    expect(screen.queryByTestId("map-chart-panel-events-over-time")).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("syncs the displaced switch back to OFF so the control never lies", () => {
    stubMatchMedia(true);
    renderPanels();

    fireEvent.click(switchFor("Events vs Patrols"));
    expect(switchFor("Events vs Patrols").getAttribute("aria-checked")).toBe(
      "true",
    );

    fireEvent.click(switchFor("Region Coverage"));
    expect(switchFor("Events vs Patrols").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(switchFor("Region Coverage").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("still allows turning the single open chart off", () => {
    stubMatchMedia(true);
    renderPanels();

    fireEvent.click(switchFor("Region Coverage"));
    fireEvent.click(switchFor("Region Coverage"));
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });

  it("explains the exclusivity, and only when short", () => {
    stubMatchMedia(true);
    renderPanels();
    expect(screen.getByTestId("map-chart-single-panel-hint")).toBeTruthy();

    cleanup();
    stubMatchMedia(false);
    renderPanels();
    expect(screen.queryByTestId("map-chart-single-panel-hint")).toBeNull();
  });

  it("drops to one panel when a TALL window is resized down to short", () => {
    const setShort = stubMatchMedia(false);
    renderPanels();

    // Tall: both open, as verified working — must stay that way.
    fireEvent.click(switchFor("Events vs Patrols"));
    fireEvent.click(switchFor("Region Coverage"));
    expect(screen.getAllByRole("region")).toHaveLength(2);

    setShort(true);

    // Now short: the column would overflow, so it keeps the most recent one.
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
    expect(screen.queryByTestId("chart-events")).toBeNull();
  });

  it("leaves TALL viewports free to open both panels (no regression)", () => {
    stubMatchMedia(false);
    renderPanels();

    fireEvent.click(switchFor("Events vs Patrols"));
    fireEvent.click(switchFor("Region Coverage"));

    expect(screen.getByTestId("chart-events")).toBeTruthy();
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });
});
