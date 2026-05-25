// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewAreaBoundaryDialog } from "../preview-area-boundary-dialog";
import type { AreaBoundaryRow } from "../area-boundary-table";

// Stub out the Leaflet island so vitest jsdom doesn't try to render canvas.
vi.mock("../area-boundary-map", () => ({
  AreaBoundaryMap: ({
    geometryType,
  }: {
    geometryGeojson: unknown;
    geometryType: string;
  }) => (
    <div data-testid="area-boundary-map-mock" data-geometry-type={geometryType} />
  ),
}));

const VALID_POLYGON_GEOJSON = {
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

function makeBoundary(overrides: Partial<AreaBoundaryRow> = {}): AreaBoundaryRow {
  return {
    id: "ab_test_1",
    name: "Verde Island Passage",
    aliases: ["VIP", "Verde Passage"],
    region: "MIMAROPA",
    source: "official",
    geometryType: "Polygon",
    isEnabled: true,
    overrideOfficial: false,
    arcgisReferenceId: "BFAR-12345",
    geometryGeojson: VALID_POLYGON_GEOJSON,
    createdByUserId: "u_1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    creator: { id: "u_1", fullName: "Test Admin" },
    ...overrides,
  };
}

describe("PreviewAreaBoundaryDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders DialogTitle containing boundary.name", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Apo Reef" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Apo Reef")).toBeTruthy();
  });

  it("renders region, source, and geometryType badges with correct text", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({
          region: "MIMAROPA",
          source: "custom",
          geometryType: "LineString",
        })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("MIMAROPA")).toBeTruthy();
    expect(screen.getByText("custom")).toBeTruthy();
    expect(screen.getByText("LineString")).toBeTruthy();
  });

  it("mounts the AreaBoundaryMap mock and passes geometryType through", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ geometryType: "Polygon" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    const mock = screen.getByTestId("area-boundary-map-mock");
    expect(mock).toBeTruthy();
    expect(mock.getAttribute("data-geometry-type")).toBe("Polygon");
  });

  it("mounts the map mock regardless of geometry validity (validation lives in the map component)", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ geometryGeojson: {} })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("area-boundary-map-mock")).toBeTruthy();
  });

  it("includes a screen-reader-only DialogDescription mentioning the boundary name", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Tubbataha Reefs" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Read-only map preview of Tubbataha Reefs/i)).toBeTruthy();
  });

  it("Close button calls onOpenChange(false) when clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary()}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );
    const closeButton = screen.getByTestId("preview-close");
    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render DialogContent when open is false", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Hidden Reef" })}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Hidden Reef")).toBeNull();
  });

  it("updates title + badges when boundary prop changes", () => {
    const { rerender } = render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Boundary A", region: "REGION-1" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Boundary A")).toBeTruthy();
    expect(screen.getByText("REGION-1")).toBeTruthy();

    rerender(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Boundary B", region: "REGION-2" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Boundary B")).toBeTruthy();
    expect(screen.getByText("REGION-2")).toBeTruthy();
  });
});
