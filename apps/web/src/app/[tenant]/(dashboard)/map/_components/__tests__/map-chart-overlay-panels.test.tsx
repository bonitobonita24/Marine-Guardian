// @vitest-environment jsdom

// Floating chart overlay panels on the Interactive Report Map (owner request
// 2026-07-20). Guards the behaviour contract: both charts hidden on load so
// they never block the map, always-visible toggles for discoverability, and
// fully independent show/hide per chart.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  MapChartOverlayPanels,
  type MapChartOverlayItem,
} from "../map-chart-overlay-panels";

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

  it("keeps both toggles visible even while every chart is hidden", () => {
    renderPanels();
    expect(
      screen.getByTestId("map-chart-toggle-events-over-time"),
    ).toBeTruthy();
    expect(screen.getByTestId("map-chart-toggle-region-coverage")).toBeTruthy();
  });

  it("reports collapsed state via aria-expanded on load", () => {
    renderPanels();
    for (const key of ["events-over-time", "region-coverage"]) {
      expect(
        screen.getByTestId(`map-chart-toggle-${key}`).getAttribute("aria-expanded"),
      ).toBe("false");
    }
  });

  it("reveals ONLY the Events vs Patrols chart when its toggle is clicked", () => {
    renderPanels();
    fireEvent.click(screen.getByTestId("map-chart-toggle-events-over-time"));

    expect(screen.getByTestId("chart-events")).toBeTruthy();
    // The other chart stays hidden — the toggles are independent.
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    expect(
      screen
        .getByTestId("map-chart-toggle-events-over-time")
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("reveals ONLY the Region Coverage chart when its toggle is clicked", () => {
    renderPanels();
    fireEvent.click(screen.getByTestId("map-chart-toggle-region-coverage"));

    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
    expect(screen.queryByTestId("chart-events")).toBeNull();
  });

  it("shows BOTH charts when both toggles are clicked", () => {
    renderPanels();
    fireEvent.click(screen.getByTestId("map-chart-toggle-events-over-time"));
    fireEvent.click(screen.getByTestId("map-chart-toggle-region-coverage"));

    expect(screen.getByTestId("chart-events")).toBeTruthy();
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();
  });

  it("hides a shown chart again when its toggle is re-clicked", () => {
    renderPanels();
    const toggle = screen.getByTestId("map-chart-toggle-events-over-time");
    fireEvent.click(toggle);
    expect(screen.getByTestId("chart-events")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByTestId("chart-events")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("hides a shown chart via the panel's own close button", () => {
    renderPanels();
    fireEvent.click(screen.getByTestId("map-chart-toggle-region-coverage"));
    expect(screen.getByTestId("chart-coverage")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Hide Region Coverage"));
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
  });

  it("gives each revealed panel an accessible region name", () => {
    renderPanels();
    fireEvent.click(screen.getByTestId("map-chart-toggle-events-over-time"));

    const panel = screen.getByRole("region", {
      name: "Events vs Patrols Over Time",
    });
    expect(panel).toBeTruthy();
    // aria-controls points at the panel that is actually in the DOM.
    expect(
      screen
        .getByTestId("map-chart-toggle-events-over-time")
        .getAttribute("aria-controls"),
    ).toBe(panel.getAttribute("id"));
  });
});
