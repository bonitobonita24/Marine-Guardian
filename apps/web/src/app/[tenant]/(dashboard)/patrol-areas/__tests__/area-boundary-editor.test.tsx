// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Module-level capture of geoman event handlers so tests can invoke them
// directly (jsdom + mocked react-leaflet can't dispatch real Leaflet events).
const __capturedHandlers = new Map<string, (e: unknown) => void>();

// react-leaflet imports window-bound Leaflet at module load. Mock the whole
// surface so jsdom doesn't choke and we can assert on the props passed.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  useMap: () => ({
    pm: {
      addControls: vi.fn(),
      removeControls: vi.fn(),
      disableDraw: vi.fn(),
      Toolbar: { setButtonDisabled: vi.fn() },
    },
    fitBounds: vi.fn(),
    removeLayer: vi.fn(),
    on: (event: string, handler: (e: unknown) => void) => {
      __capturedHandlers.set(event, handler);
    },
    off: (event: string) => {
      __capturedHandlers.delete(event);
    },
  }),
}));

// Geoman registers globally on L; mock it as a no-op import.
vi.mock("@geoman-io/leaflet-geoman-free", () => ({}));

// The leaflet-globals side-effect module assigns window.L = leaflet so geoman
// can register. Stubbing it here keeps the editor's seed effect short-circuited
// (window.L stays undefined) — tests cover wiring, not Leaflet draw behavior.
vi.mock("../lib/leaflet-globals", () => ({}));

// CSS import is a no-op under vitest.
vi.mock("@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css", () => ({}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { AreaBoundaryEditor } from "../area-boundary-editor";

const VALID_POLYGON = {
  type: "Polygon",
  coordinates: [
    [
      [121.0, 13.0],
      [121.5, 13.0],
      [121.5, 13.5],
      [121.0, 13.5],
      [121.0, 13.0],
    ],
  ],
};

const VALID_LINESTRING = {
  type: "LineString",
  coordinates: [
    [121.0, 13.0],
    [121.5, 13.5],
  ],
};

describe("AreaBoundaryEditor", () => {
  beforeEach(() => {
    __capturedHandlers.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the map container in create mode with no initial geometry", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor mode="create" onGeometryChange={onGeometryChange} />,
    );
    expect(c.getByTestId("map-container")).toBeTruthy();
    expect(c.getByTestId("tile-layer")).toBeTruthy();
  });

  it("renders the map in edit mode with a valid initial Polygon", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor
        mode="edit"
        initialGeometry={VALID_POLYGON}
        initialType="Polygon"
        onGeometryChange={onGeometryChange}
      />,
    );
    expect(c.getByTestId("map-container")).toBeTruthy();
    expect(c.queryByTestId("editor-malformed-fallback")).toBeNull();
  });

  it("renders the map in edit mode with a valid initial LineString", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor
        mode="edit"
        initialGeometry={VALID_LINESTRING}
        initialType="LineString"
        onGeometryChange={onGeometryChange}
      />,
    );
    expect(c.getByTestId("map-container")).toBeTruthy();
    expect(c.queryByTestId("editor-malformed-fallback")).toBeNull();
  });

  it("renders the malformed-geometry fallback in edit mode with invalid initial geometry", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor
        mode="edit"
        initialGeometry={{ type: "Polygon", coordinates: "not an array" }}
        initialType="Polygon"
        onGeometryChange={onGeometryChange}
      />,
    );
    expect(c.getByTestId("editor-malformed-fallback")).toBeTruthy();
    expect(c.queryByTestId("map-container")).toBeNull();
  });

  it("exposes data-locked-type='Polygon' when initialType is Polygon (edit mode tool lock)", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor
        mode="edit"
        initialGeometry={VALID_POLYGON}
        initialType="Polygon"
        onGeometryChange={onGeometryChange}
      />,
    );
    const container = c.getByTestId("area-boundary-editor-root");
    expect(container.getAttribute("data-locked-type")).toBe("Polygon");
  });

  it("exposes data-locked-type='LineString' when initialType is LineString (edit mode tool lock)", () => {
    const onGeometryChange = vi.fn();
    const c = render(
      <AreaBoundaryEditor
        mode="edit"
        initialGeometry={VALID_LINESTRING}
        initialType="LineString"
        onGeometryChange={onGeometryChange}
      />,
    );
    const container = c.getByTestId("area-boundary-editor-root");
    expect(container.getAttribute("data-locked-type")).toBe("LineString");
  });

  it("calls onGeometryChange with converted GeoJSON when geoman emits pm:create with a Polygon layer", async () => {
    const onGeometryChange = vi.fn();
    render(
      <AreaBoundaryEditor mode="create" onGeometryChange={onGeometryChange} />,
    );

    // Wait a tick for the effects to flush and the event handler to register.
    // The geoman-init effect calls setReady(true), then the event-wiring effect
    // attaches handlers — both happen across React batches.
    await new Promise((r) => setTimeout(r, 0));

    const onCreate = __capturedHandlers.get("pm:create");
    if (!onCreate) throw new Error("pm:create handler was not registered");

    // Synthesize a geoman pm:create event with a Polygon layer that returns
    // a 4-point open ring of {lat,lng} (the auto-close path is exercised
    // inside leafletPositionsToGeojson — Task 2's helper).
    const fakeLayer = {
      getLatLngs: () => [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
          { lat: 13.5, lng: 121.5 },
          { lat: 13.5, lng: 121.0 },
        ],
      ],
      pm: { enable: vi.fn() },
    };

    onCreate({ layer: fakeLayer as unknown });

    expect(onGeometryChange).toHaveBeenCalledTimes(1);
    expect(onGeometryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Polygon",
        coordinates: [
          [
            [121.0, 13.0],
            [121.5, 13.0],
            [121.5, 13.5],
            [121.0, 13.5],
            [121.0, 13.0], // auto-closed by leafletPositionsToGeojson
          ],
        ],
      }),
      "Polygon",
    );
  });
});
