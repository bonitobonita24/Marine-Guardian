// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

// @/components/ui/map wraps real maplibre-gl (needs a WebGL canvas jsdom
// doesn't provide). Stub the primitives so this test only asserts
// SingleEventMap wires the right props into them — maplibre-gl itself is
// exercised by the existing map/__tests__ style/logic suites + real browser
// verification, not vitest+jsdom.
vi.mock("@/components/ui/map", () => ({
  Map: ({
    center,
    zoom,
    children,
  }: {
    center: [number, number];
    zoom: number;
    children: ReactNode;
  }) => (
    <div data-testid="map" data-center={JSON.stringify(center)} data-zoom={zoom}>
      {children}
    </div>
  ),
  MapControls: () => <div data-testid="map-controls" />,
  MapMarker: ({
    longitude,
    latitude,
    children,
  }: {
    longitude: number;
    latitude: number;
    children: ReactNode;
  }) => (
    <div
      data-testid="map-marker"
      data-lon={longitude}
      data-lat={latitude}
    >
      {children}
    </div>
  ),
  MarkerContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="marker-content">{children}</div>
  ),
  MarkerTooltip: ({ children }: { children: ReactNode }) => (
    <div data-testid="marker-tooltip">{children}</div>
  ),
}));

import { SingleEventMap } from "../SingleEventMap";

describe("SingleEventMap", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly one marker centered on the given coordinate", () => {
    const { getByTestId, getAllByTestId } = render(
      <SingleEventMap lat={14.5995} lon={120.9842} />,
    );
    expect(getAllByTestId("map-marker")).toHaveLength(1);
    const marker = getByTestId("map-marker");
    expect(marker.getAttribute("data-lon")).toBe("120.9842");
    expect(marker.getAttribute("data-lat")).toBe("14.5995");

    const map = getByTestId("map");
    expect(map.getAttribute("data-center")).toBe(
      JSON.stringify([120.9842, 14.5995]),
    );
  });

  it("renders a tooltip with the given label", () => {
    const { getByTestId } = render(
      <SingleEventMap lat={14.5995} lon={120.9842} label="Illegal Fishing Report" />,
    );
    expect(getByTestId("marker-tooltip").textContent).toBe(
      "Illegal Fishing Report",
    );
  });

  it("omits the tooltip when no label is given", () => {
    const { queryByTestId } = render(
      <SingleEventMap lat={14.5995} lon={120.9842} />,
    );
    expect(queryByTestId("marker-tooltip")).toBeNull();
  });
});
