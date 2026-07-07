/**
 * Shared test stub for `AreaBoundaryEditor`.
 *
 * Vitest jsdom cannot render the real Leaflet-backed editor (it touches
 * `window` and instantiates @geoman-io plugins). Both the Create and Edit
 * dialog test suites mock `../area-boundary-editor` and substitute this
 * stub via `vi.mock`. The stub exposes 5 buttons that simulate the
 * `onGeometryChange` callbacks the real editor would emit:
 *
 *   - editor-stub-emit-polygon                — well-formed Polygon
 *   - editor-stub-emit-linestring             — well-formed LineString
 *   - editor-stub-clear                       — null geometry / null type
 *   - editor-stub-emit-mismatched-polygon     — type=Polygon, flat coords
 *                                               (drives validateGeoJsonShape
 *                                               defense-in-depth path)
 *   - editor-stub-emit-mismatched-linestring  — type=LineString, nested coords
 *                                               (drives validateGeoJsonShape
 *                                               defense-in-depth path)
 *
 * Consumer pattern (inside a test file):
 *
 *     import { AreaBoundaryEditorStub } from "./_helpers/area-boundary-editor-stub";
 *
 *     vi.mock("../area-boundary-editor", () => ({
 *       AreaBoundaryEditor: AreaBoundaryEditorStub,
 *     }));
 *
 * The stub deliberately ignores `mode`, `initialGeometry`, and `initialType`
 * — tests assert on the dialog's response to emitted geometry, not on the
 * editor's own rendering. If a future test needs to assert that a specific
 * prop was forwarded, switch to a `vi.fn()`-based stub at the call site.
 */

export type StubGeometryType = "Polygon" | "LineString";

export interface AreaBoundaryEditorStubProps {
  mode: "create" | "edit";
  initialGeometry?: Record<string, unknown> | null;
  initialType?: StubGeometryType | null;
  onGeometryChange: (
    geometry: Record<string, unknown> | null,
    type: StubGeometryType | null,
  ) => void;
}

export function AreaBoundaryEditorStub({
  onGeometryChange,
}: AreaBoundaryEditorStubProps) {
  return (
    <div data-testid="editor-stub">
      <button
        type="button"
        data-testid="editor-stub-emit-polygon"
        onClick={() => {
          onGeometryChange(
            {
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
            },
            "Polygon",
          );
        }}
      >
        emit polygon
      </button>
      <button
        type="button"
        data-testid="editor-stub-emit-linestring"
        onClick={() => {
          onGeometryChange(
            {
              type: "LineString",
              coordinates: [
                [121.0, 13.0],
                [121.5, 13.5],
              ],
            },
            "LineString",
          );
        }}
      >
        emit linestring
      </button>
      <button
        type="button"
        data-testid="editor-stub-clear"
        onClick={() => {
          onGeometryChange(null, null);
        }}
      >
        clear
      </button>
      <button
        type="button"
        data-testid="editor-stub-emit-mismatched-polygon"
        onClick={() => {
          onGeometryChange(
            // type=Polygon but coordinates are a flat LineString-shape — drives
            // validateGeoJsonShape rejection on submit.
            { type: "Polygon", coordinates: [[121.0, 13.0], [121.5, 13.5]] },
            "Polygon",
          );
        }}
      >
        emit mismatched polygon
      </button>
      <button
        type="button"
        data-testid="editor-stub-emit-mismatched-linestring"
        onClick={() => {
          onGeometryChange(
            // type=LineString but coordinates are nested Polygon rings — drives
            // validateGeoJsonShape rejection on submit.
            {
              type: "LineString",
              coordinates: [
                [
                  [121.0, 13.0],
                  [121.5, 13.5],
                ],
              ],
            },
            "LineString",
          );
        }}
      >
        emit mismatched linestring
      </button>
    </div>
  );
}
