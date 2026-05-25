# Area Boundary Map Drawing Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-GeoJSON `<textarea>` in Create + Edit AreaBoundary dialogs with a visual click-to-draw editor over Esri satellite tiles using `leaflet-geoman-free`.

**Architecture:** New Leaflet+geoman island (`area-boundary-editor.tsx`) dynamically imported with `ssr:false` by the existing Create + Edit dialogs. Parent dialogs retain their form state shape (`geometryGeojsonRaw: string` + `geometryType: GeometryType | null`); editor `onGeometryChange` callback stringifies and sets both. Editor enables only the tool matching `initialType` on Edit (locks type). Submit path, tRPC contract, DB shape all unchanged.

**Tech Stack:** Next.js 15 App Router · React 19 · react-leaflet 5 · leaflet-geoman-free (new) · vitest jsdom · shadcn Dialog · tRPC v11

**Spec:** `docs/superpowers/specs/2026-05-26-area-boundary-map-drawing-editor-design.md`

---

## File Structure

### New files
- `apps/web/src/app/(dashboard)/patrol-areas/lib/esri-tile-config.ts` — shared Esri tile URL + attribution constants (used by Preview + Editor)
- `apps/web/src/app/(dashboard)/patrol-areas/lib/leaflet-positions-to-geojson.ts` — pure helper inverting `geojsonToLeafletPositions`
- `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts` — 8 unit cases
- `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-editor.tsx` — Leaflet+geoman island (`"use client"`, ssr:false)
- `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-editor.test.tsx` — 6 jsdom cases, geoman mocked

### Modified files
- `apps/web/package.json` — add `@geoman-io/leaflet-geoman-free` to dependencies
- `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx` — replace inline `ESRI_URL`/`ESRI_ATTRIBUTION` with imports from `lib/esri-tile-config.ts` (behavioral no-op)
- `apps/web/src/app/(dashboard)/patrol-areas/create-area-boundary-dialog.tsx` — remove `<select>` for geometryType + `<textarea>` for raw GeoJSON; add `<AreaBoundaryEditor>` (via `next/dynamic` with `ssr:false`); Save button `disabled` gains `!geometryGeojsonRaw || !geometryType`
- `apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx` — same swap with `mode="edit"` + `initialGeometry` + `initialType`
- `apps/web/src/app/(dashboard)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx` — mock `./area-boundary-editor`; replace textarea-fill steps with editor-stub emit; net 0 cases
- `apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx` — same mock + 1 new case for initial-geometry mount; net +1 case

### Predicted vitest delta
`web 535 → 550` (+15: 8 helper + 6 editor + 0 net Create + 1 net Edit)

---

## Task 1: Install geoman + extract shared Esri tile config

**Files:**
- Modify: `apps/web/package.json` (add dep)
- Create: `apps/web/src/app/(dashboard)/patrol-areas/lib/esri-tile-config.ts`
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx` (replace inline constants with imports)

This task has no new tests (existing Preview tests are the regression check; this is a behavioral no-op refactor).

- [ ] **Step 1: Install leaflet-geoman-free at the web workspace**

```bash
pnpm --filter @marine-guardian/web add @geoman-io/leaflet-geoman-free
```

Expected: installs latest 2.x. Confirm `apps/web/package.json` `dependencies` now contains `@geoman-io/leaflet-geoman-free`.

- [ ] **Step 2: Create the shared Esri tile config**

Write `apps/web/src/app/(dashboard)/patrol-areas/lib/esri-tile-config.ts`:

```ts
// Shared Esri World Imagery tile config used by both the read-only
// area-boundary-map (Preview dialog) and area-boundary-editor (Create/Edit).
// Extracted to satisfy the V31 "no repeated logic ≥2 occurrences" rule.

export const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
```

- [ ] **Step 3: Update area-boundary-map.tsx to import the shared constants**

In `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx`:

Replace these lines (currently around lines 22-25):

```ts
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
```

With:

```ts
import { ESRI_URL, ESRI_ATTRIBUTION } from "./lib/esri-tile-config";
```

(Add the import to the existing import group at the top of the file.)

- [ ] **Step 4: Run typecheck + lint + Preview tests to verify the refactor is a no-op**

Run:

```bash
pnpm --filter @marine-guardian/web typecheck
pnpm --filter @marine-guardian/web lint
pnpm --filter @marine-guardian/web test -- preview-area-boundary-dialog
```

Expected: all three pass. The Preview test suite is the regression gate for this refactor.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml \
  apps/web/src/app/\(dashboard\)/patrol-areas/lib/esri-tile-config.ts \
  apps/web/src/app/\(dashboard\)/patrol-areas/area-boundary-map.tsx
git commit -m "$(cat <<'EOF'
chore(area-boundaries): add leaflet-geoman dep + extract Esri tile config

Adds @geoman-io/leaflet-geoman-free to apps/web for the upcoming map
drawing editor. Extracts ESRI_URL + ESRI_ATTRIBUTION into a shared
patrol-areas/lib/esri-tile-config.ts so the read-only Preview map and
the upcoming Edit/Create editor share one source. Behavioral no-op.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure helper — `leafletPositionsToGeojson` (RED → GREEN)

**Files:**
- Create: `apps/web/src/app/(dashboard)/patrol-areas/lib/leaflet-positions-to-geojson.ts`
- Test: `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts`

This is the inverse of the existing `geojsonToLeafletPositions` (which lives in the same `lib/` folder). Geoman emits Leaflet-style `{ lat, lng }` objects; we must convert back to `[lng, lat]` GeoJSON for storage. Helper accepts plain `{lat,lng}` objects so it has no Leaflet runtime dependency (testable as pure unit).

- [ ] **Step 1: Write the failing tests**

Write `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { leafletPositionsToGeojson } from "../leaflet-positions-to-geojson";

describe("leafletPositionsToGeojson", () => {
  it("converts a Polygon outer ring of {lat,lng} to GeoJSON [lng,lat] rings", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
          { lat: 13.5, lng: 121.5 },
          { lat: 13.5, lng: 121.0 },
          { lat: 13.0, lng: 121.0 },
        ],
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
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
    });
  });

  it("converts a LineString of {lat,lng} to GeoJSON [lng,lat]", () => {
    const input = {
      kind: "LineString" as const,
      positions: [
        { lat: 13.0, lng: 121.0 },
        { lat: 13.5, lng: 121.5 },
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
      ],
    });
  });

  it("auto-closes an open Polygon outer ring (geoman returns open rings)", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
          { lat: 13.5, lng: 121.5 },
        ],
      ],
    };
    const out = leafletPositionsToGeojson(input);
    expect(out).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.0],
          [121.5, 13.5],
          [121.0, 13.0],
        ],
      ],
    });
  });

  it("returns null for a Polygon with fewer than 3 unique vertices", () => {
    const input = {
      kind: "Polygon" as const,
      positions: [
        [
          { lat: 13.0, lng: 121.0 },
          { lat: 13.0, lng: 121.5 },
        ],
      ],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null for a LineString with fewer than 2 vertices", () => {
    const input = {
      kind: "LineString" as const,
      positions: [{ lat: 13.0, lng: 121.0 }],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null when a vertex has non-finite coordinates", () => {
    const input = {
      kind: "LineString" as const,
      positions: [
        { lat: 13.0, lng: 121.0 },
        { lat: Number.NaN, lng: 121.5 },
      ],
    };
    expect(leafletPositionsToGeojson(input)).toBeNull();
  });

  it("returns null when positions field is missing", () => {
    // @ts-expect-error - intentionally invalid input
    expect(leafletPositionsToGeojson({ kind: "Polygon" })).toBeNull();
  });

  it("returns null for unsupported kind", () => {
    // @ts-expect-error - intentionally invalid input
    expect(leafletPositionsToGeojson({ kind: "Point", positions: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @marine-guardian/web test -- leaflet-positions-to-geojson
```

Expected: FAIL — vitest reports `Cannot find module '../leaflet-positions-to-geojson'`.

- [ ] **Step 3: Write the minimal implementation to make them pass**

Write `apps/web/src/app/(dashboard)/patrol-areas/lib/leaflet-positions-to-geojson.ts`:

```ts
// Pure helper: inverse of geojsonToLeafletPositions.
// Takes a geoman-style shape descriptor ({lat,lng} objects) and returns
// a GeoJSON Polygon or LineString with [lng,lat] ordering for storage.
// Returns null if input is malformed or below minimum vertex thresholds.

type LatLng = { lat: number; lng: number };

export type LeafletShape =
  | { kind: "Polygon"; positions: LatLng[][] }
  | { kind: "LineString"; positions: LatLng[] };

export type GeoJsonShape =
  | { type: "Polygon"; coordinates: [number, number][][] }
  | { type: "LineString"; coordinates: [number, number][] };

function isFiniteLatLng(p: unknown): p is LatLng {
  return (
    typeof p === "object" &&
    p !== null &&
    "lat" in p &&
    "lng" in p &&
    typeof (p as LatLng).lat === "number" &&
    typeof (p as LatLng).lng === "number" &&
    Number.isFinite((p as LatLng).lat) &&
    Number.isFinite((p as LatLng).lng)
  );
}

function flip(p: LatLng): [number, number] {
  return [p.lng, p.lat];
}

export function leafletPositionsToGeojson(
  shape: LeafletShape,
): GeoJsonShape | null {
  if (shape === null || typeof shape !== "object") return null;
  if (!("positions" in shape) || !Array.isArray(shape.positions)) return null;

  if (shape.kind === "LineString") {
    const pts = shape.positions;
    if (pts.length < 2) return null;
    if (!pts.every(isFiniteLatLng)) return null;
    return { type: "LineString", coordinates: pts.map(flip) };
  }

  if (shape.kind === "Polygon") {
    const rings = shape.positions;
    if (rings.length === 0 || !Array.isArray(rings[0])) return null;
    const outer = rings[0];
    if (outer.length < 3) return null;
    if (!outer.every(isFiniteLatLng)) return null;
    const flipped = outer.map(flip);
    // Auto-close: geoman emits open rings; GeoJSON requires first === last.
    const first = flipped[0]!;
    const last = flipped[flipped.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      flipped.push([first[0], first[1]]);
    }
    return { type: "Polygon", coordinates: [flipped] };
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @marine-guardian/web test -- leaflet-positions-to-geojson
```

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run lint + typecheck**

Run:

```bash
pnpm --filter @marine-guardian/web lint
pnpm --filter @marine-guardian/web typecheck
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/lib/leaflet-positions-to-geojson.ts \
  apps/web/src/app/\(dashboard\)/patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts
git commit -m "$(cat <<'EOF'
feat(area-boundaries): pure helper to convert geoman shape → GeoJSON

leafletPositionsToGeojson is the inverse of the existing
geojsonToLeafletPositions helper. It takes a {lat,lng}-style shape from
geoman, validates minimum vertex counts (Polygon ≥3, LineString ≥2) and
finite coordinates, and returns GeoJSON with [lng,lat] ordering ready
for storage. Auto-closes open polygon rings since geoman emits them
open. Returns null on any malformed input.

8 vitest cases: Polygon flip, LineString flip, ring auto-close,
under-min-vertices rejection (both kinds), non-finite coordinate
rejection, missing positions, unsupported kind.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `AreaBoundaryEditor` island (RED → GREEN)

**Files:**
- Create: `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-editor.tsx`
- Test: `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-editor.test.tsx`

The editor is a Leaflet+geoman island. It is dynamically imported with `ssr:false` by the parent dialogs (vitest jsdom cannot render Leaflet canvas, so the tests mock geoman at the module level and prove wiring, not draw behavior).

The component contract per the spec:

```ts
type AreaBoundaryEditorProps = {
  mode: "create" | "edit";
  initialGeometry?: Record<string, unknown> | null;
  initialType?: "Polygon" | "LineString" | null;
  onGeometryChange: (
    geometry: Record<string, unknown> | null,
    type: "Polygon" | "LineString" | null,
  ) => void;
};
```

- [ ] **Step 1: Write the failing tests**

Write `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

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
      disableDraw: vi.fn(),
      Toolbar: { setButtonDisabled: vi.fn() },
    },
    fitBounds: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

// Geoman registers globally on L; mock it as a no-op import.
vi.mock("@geoman-io/leaflet-geoman-free", () => ({}));

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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @marine-guardian/web test -- area-boundary-editor.test
```

Expected: FAIL — `Cannot find module '../area-boundary-editor'`.

- [ ] **Step 3: Write the editor island**

Write `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-editor.tsx`:

```tsx
"use client";

// Leaflet + leaflet-geoman island for the Area Boundary Create/Edit editor.
// Must be imported via next/dynamic with ssr:false by parent dialogs because
// leaflet imports window at module load.
//
// Pattern mirrors area-boundary-map.tsx (Preview): a MapContainer with Esri
// World Imagery tiles, plus inner components that wire geoman draw + edit
// events and convert results back to GeoJSON for the parent form.

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { LatLng, Layer, Map as LeafletMap, PM } from "leaflet";

import { ESRI_URL, ESRI_ATTRIBUTION } from "./lib/esri-tile-config";
import { geojsonToLeafletPositions } from "./lib/geojson-to-leaflet-positions";
import {
  leafletPositionsToGeojson,
  type LeafletShape,
} from "./lib/leaflet-positions-to-geojson";

const PH_CENTROID: [number, number] = [12.8, 121.7];
const PH_DEFAULT_ZOOM = 6;
const FIT_BOUNDS_ZOOM = 10;

export type GeometryType = "Polygon" | "LineString";

export interface AreaBoundaryEditorProps {
  mode: "create" | "edit";
  initialGeometry?: Record<string, unknown> | null;
  initialType?: GeometryType | null;
  onGeometryChange: (
    geometry: Record<string, unknown> | null,
    type: GeometryType | null,
  ) => void;
}

export function AreaBoundaryEditor(props: AreaBoundaryEditorProps) {
  const { mode, initialGeometry, initialType, onGeometryChange } = props;

  // In edit mode, parse initial geometry up front so we can short-circuit to
  // the malformed-fallback before mounting the map.
  const initialParsed = useMemo(() => {
    if (mode !== "edit" || !initialGeometry) return null;
    return geojsonToLeafletPositions(initialGeometry, initialType ?? undefined);
  }, [mode, initialGeometry, initialType]);

  if (mode === "edit" && initialGeometry && initialParsed === null) {
    return (
      <p
        data-testid="editor-malformed-fallback"
        className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700"
      >
        Existing boundary geometry is malformed and cannot be edited. Delete
        and re-create.
      </p>
    );
  }

  return (
    <div
      data-testid="area-boundary-editor-root"
      data-locked-type={initialType ?? ""}
      className="h-[400px] w-full overflow-hidden rounded border"
    >
      <MapContainer
        center={PH_CENTROID}
        zoom={PH_DEFAULT_ZOOM}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={ESRI_URL} attribution={ESRI_ATTRIBUTION} />
        <GeomanWiring
          mode={mode}
          initialParsed={initialParsed}
          initialType={initialType ?? null}
          onGeometryChange={onGeometryChange}
        />
      </MapContainer>
    </div>
  );
}

interface GeomanWiringProps {
  mode: "create" | "edit";
  initialParsed: ReturnType<typeof geojsonToLeafletPositions> | null;
  initialType: GeometryType | null;
  onGeometryChange: AreaBoundaryEditorProps["onGeometryChange"];
}

function GeomanWiring(props: GeomanWiringProps) {
  const { mode, initialParsed, initialType, onGeometryChange } = props;
  const map = useMap() as LeafletMap;
  const currentLayerRef = useRef<Layer | null>(null);
  const [ready, setReady] = useState(false);

  // Initialize geoman toolbar once map is ready.
  useEffect(() => {
    if (!map?.pm) return;

    const allowPolygon = mode === "create" || initialType === "Polygon";
    const allowLine = mode === "create" || initialType === "LineString";

    map.pm.addControls({
      position: "topleft",
      drawPolygon: allowPolygon,
      drawPolyline: allowLine,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawRectangle: false,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    });

    setReady(true);
    // Cleanup on unmount.
    return () => {
      try {
        (map.pm as PM.Map).removeControls();
      } catch {
        /* noop */
      }
    };
  }, [map, mode, initialType]);

  // In edit mode, seed the map with the initial geometry once it's ready.
  useEffect(() => {
    if (!ready || mode !== "edit" || !initialParsed) return;
    const L = (window as unknown as { L: typeof import("leaflet") }).L;
    let layer: Layer | null = null;
    if (initialParsed.kind === "Polygon") {
      layer = L.polygon(initialParsed.positions).addTo(map);
    } else if (initialParsed.kind === "LineString") {
      layer = L.polyline(initialParsed.positions).addTo(map);
    }
    if (layer) {
      currentLayerRef.current = layer;
      // Fit bounds to the initial geometry.
      const bounds = (layer as unknown as { getBounds: () => unknown }).getBounds();
      if (bounds) {
        map.fitBounds(bounds as never, { padding: [16, 16] });
      }
      // Enable editing on the existing layer.
      (layer as Layer & { pm: PM.PMEditLayer }).pm.enable();
    }
  }, [ready, mode, initialParsed, map]);

  // Wire pm:create + pm:edit + pm:remove → onGeometryChange.
  useEffect(() => {
    if (!ready) return;

    const emitFromLayer = (layer: Layer | null) => {
      if (!layer) {
        onGeometryChange(null, null);
        return;
      }
      const shape = layerToLeafletShape(layer);
      if (!shape) {
        onGeometryChange(null, null);
        // eslint-disable-next-line no-console
        console.warn(
          "[AreaBoundaryEditor] geoman layer produced no valid shape descriptor",
        );
        return;
      }
      const geojson = leafletPositionsToGeojson(shape);
      if (!geojson) {
        onGeometryChange(null, null);
        return;
      }
      onGeometryChange(
        geojson as unknown as Record<string, unknown>,
        geojson.type,
      );
    };

    const onCreate = (e: { layer: Layer }) => {
      // Replace any prior layer (geoman keeps both unless we clean up).
      if (currentLayerRef.current && currentLayerRef.current !== e.layer) {
        map.removeLayer(currentLayerRef.current);
      }
      currentLayerRef.current = e.layer;
      // Enable editing on the new layer so the admin can immediately adjust.
      (e.layer as Layer & { pm: PM.PMEditLayer }).pm.enable();
      emitFromLayer(e.layer);
    };
    const onEdit = (e: { layer: Layer }) => emitFromLayer(e.layer);
    const onRemove = () => {
      currentLayerRef.current = null;
      emitFromLayer(null);
    };

    map.on("pm:create", onCreate as never);
    map.on("pm:edit", onEdit as never);
    map.on("pm:remove", onRemove as never);

    return () => {
      map.off("pm:create", onCreate as never);
      map.off("pm:edit", onEdit as never);
      map.off("pm:remove", onRemove as never);
    };
  }, [ready, map, onGeometryChange]);

  return null;
}

function layerToLeafletShape(layer: Layer): LeafletShape | null {
  const asPolygon = layer as unknown as {
    getLatLngs?: () => LatLng[] | LatLng[][];
  };
  if (!asPolygon.getLatLngs) return null;
  const raw = asPolygon.getLatLngs();
  // Leaflet polygons return LatLng[][] (rings); polylines return LatLng[].
  if (Array.isArray(raw[0])) {
    return {
      kind: "Polygon",
      positions: (raw as LatLng[][]).map((ring) =>
        ring.map((p) => ({ lat: p.lat, lng: p.lng })),
      ),
    };
  }
  return {
    kind: "LineString",
    positions: (raw as LatLng[]).map((p) => ({ lat: p.lat, lng: p.lng })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @marine-guardian/web test -- area-boundary-editor.test
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run lint + typecheck**

Run:

```bash
pnpm --filter @marine-guardian/web lint
pnpm --filter @marine-guardian/web typecheck
```

Expected: both clean. If lint rule `@typescript-eslint/no-unsafe-*` fires inside the `layerToLeafletShape` helper or the `as Layer & { pm }` casts, narrow with explicit `LatLng` checks; do NOT broaden the eslint config. If typecheck flags missing `pm` type on `Layer`, the geoman package ships ambient types — verify they are picked up via the `import "@geoman-io/leaflet-geoman-free"` side-effect import.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/area-boundary-editor.tsx \
  apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/area-boundary-editor.test.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): leaflet-geoman editor island for Create/Edit

New AreaBoundaryEditor client component built on react-leaflet 5 +
leaflet-geoman-free. Must be dynamically imported with ssr:false by
parent dialogs (window-bound at module load).

Behavior:
- Create mode: PH-centroid initial view at zoom 6, both Polygon and
  Polyline draw tools enabled in the geoman toolbar.
- Edit mode: seeds the map with the initial geometry, fits bounds, and
  enables only the tool matching initialType (Polygon-only or
  LineString-only) — prevents accidental type changes.
- Wires pm:create / pm:edit / pm:remove geoman events through a single
  emit helper that converts the current geoman layer to canonical
  GeoJSON via leafletPositionsToGeojson and calls onGeometryChange.
- Renders an emerald inline fallback in edit mode when the existing
  geometry cannot be parsed — matches the Preview malformed-copy style.

6 vitest cases (geoman + react-leaflet mocked at module level):
container renders in create mode; renders in edit mode with valid
Polygon and LineString; malformed-fallback path; data-locked-type
attribute reflects initialType for the type lock.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire editor into Create dialog

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/create-area-boundary-dialog.tsx`
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx`

Net test count: **0** (existing assertions preserved; textarea-fill steps swapped for editor-stub emit).

- [ ] **Step 1: Update the Create dialog test to mock the editor**

In `apps/web/src/app/(dashboard)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx`, add this `vi.mock` block at the top of the file (just below the existing imports, before the `import { CreateAreaBoundaryDialog }` line):

```tsx
// Stub out the editor island so vitest jsdom doesn't try to render Leaflet.
// The stub exposes an "emit valid polygon" button so tests can simulate a
// drawn shape without touching geoman.
vi.mock("../area-boundary-editor", () => ({
  AreaBoundaryEditor: ({
    onGeometryChange,
  }: {
    mode: "create" | "edit";
    onGeometryChange: (
      g: Record<string, unknown> | null,
      t: "Polygon" | "LineString" | null,
    ) => void;
  }) => (
    <div data-testid="editor-stub">
      <button
        type="button"
        data-testid="editor-stub-emit-polygon"
        onClick={() =>
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
          )
        }
      >
        emit polygon
      </button>
      <button
        type="button"
        data-testid="editor-stub-emit-linestring"
        onClick={() =>
          onGeometryChange(
            {
              type: "LineString",
              coordinates: [
                [121.0, 13.0],
                [121.5, 13.5],
              ],
            },
            "LineString",
          )
        }
      >
        emit linestring
      </button>
      <button
        type="button"
        data-testid="editor-stub-clear"
        onClick={() => onGeometryChange(null, null)}
      >
        clear
      </button>
    </div>
  ),
}));
```

Then replace any existing test step that did `fireEvent.change(textarea, ...)` for the GeoJSON textarea with `fireEvent.click(c.getByTestId("editor-stub-emit-polygon"))` (or `-linestring` where appropriate). Remove any test step that fills the geometryType `<select>` — type is now driven by the editor emit. The exact lines to change are the ones in the existing test file that reference `getByTestId("create-geojson-textarea")` or the geometryType select.

Specifically search the test file for `create-geojson-textarea` and `geometryType` select interactions and update each one to use the stub-emit pattern instead. Add the "renders all form fields" case adjustment: it should no longer expect the geometryType select OR the geojson textarea; it should expect `editor-stub` to be present.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @marine-guardian/web test -- create-area-boundary-dialog
```

Expected: FAIL — tests that previously asserted the textarea/select now expect the editor stub, but the real dialog still renders the textarea (this is what we'll fix in the next step). Some assertions about Save-disabled behavior may also fail until the dialog adds the new disabled-gate logic.

- [ ] **Step 3: Update the Create dialog component**

In `apps/web/src/app/(dashboard)/patrol-areas/create-area-boundary-dialog.tsx`:

a. **Add the dynamic import at the top of the file** (after the other imports):

```tsx
import dynamic from "next/dynamic";

const AreaBoundaryEditor = dynamic(
  () =>
    import("./area-boundary-editor").then((m) => ({
      default: m.AreaBoundaryEditor,
    })),
  { ssr: false, loading: () => <div className="h-[400px] w-full animate-pulse rounded border bg-muted" /> },
);
```

b. **Change the geometryType state default** from `useState<GeometryType>("Polygon")` to allow null:

```tsx
const [geometryType, setGeometryType] = useState<GeometryType | null>(null);
```

Update the reset call (currently around line 121) `setGeometryType("Polygon")` → `setGeometryType(null)`.

c. **Remove the `<select>` for geometryType (currently around lines 275-289) and the `<textarea>` block (currently around lines 291-310) and replace them with the editor mount:**

```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Boundary Geometry</label>
  <AreaBoundaryEditor
    mode="create"
    onGeometryChange={(g, t) => {
      setGeometryGeojsonRaw(g === null ? "" : JSON.stringify(g));
      setGeometryType(t);
    }}
  />
  <p className="text-xs text-muted-foreground">
    Draw a Polygon or Line on the map. Use the toolbar (top-left) to start drawing, drag vertices to refine, or remove and redraw.
  </p>
</div>
```

d. **Update the Save button `disabled` prop** (currently around line 372):

```tsx
<Button
  onClick={handleSubmit}
  disabled={
    create.isPending ||
    geometryGeojsonRaw === "" ||
    geometryType === null
  }
>
```

e. **Update `handleSubmit`** (around line 154) — since geometryType can now be null, add an early-return guard right after the existing region check:

```tsx
if (geometryType === null) {
  setValidationError("Draw a boundary geometry before saving.");
  return;
}
```

The existing `JSON.parse(geometryGeojsonRaw)` + `validateGeoJsonShape` defenses stay as-is — they cover the bug case where the editor emits something malformed. Editor produces valid shapes on the happy path, so they never fire.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @marine-guardian/web test -- create-area-boundary-dialog
```

Expected: PASS — all existing cases green via the new stub-emit pattern.

- [ ] **Step 5: Run lint + typecheck**

Run:

```bash
pnpm --filter @marine-guardian/web lint
pnpm --filter @marine-guardian/web typecheck
```

Expected: both clean. The removed `<select>` + `<textarea>` may leave unused imports — remove them.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/create-area-boundary-dialog.tsx \
  apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): wire map drawing editor into Create dialog

Replaces the raw-GeoJSON <textarea> + Polygon/LineString <select> in
the Create dialog with the new AreaBoundaryEditor island (dynamically
imported with ssr:false). Geometry type is now inferred from which
geoman tool the admin uses. Save button gates on geometryGeojsonRaw +
geometryType being non-empty in addition to the existing create.isPending
guard.

Existing client-side validateGeoJsonShape stays as defense-in-depth on
submit — editor produces valid shapes on the happy path so it never
fires. Submit path, tRPC contract, and DB shape all unchanged.

Test suite preserves all existing assertions via a module-level mock of
./area-boundary-editor that exposes emit-polygon / emit-linestring /
clear stub buttons. Net test count: 0.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire editor into Edit dialog (+ 1 new test case)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx`
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx`

Net test count: **+1** (initial-geometry mount case).

- [ ] **Step 1: Update the Edit dialog test to mock the editor + add the new case**

In `apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx`, add the same `vi.mock("../area-boundary-editor", ...)` block from Task 4 Step 1 — same stub buttons, same shape (copy-paste is correct here; the mock is per-test-file).

Then update existing test steps that touched the GeoJSON textarea / geometryType select with the editor-stub-emit pattern, identical to Task 4.

Then add ONE new test case at the end of the existing `describe` block:

```tsx
it("mounts the editor with initialGeometry and initialType matching the boundary", () => {
  const boundary = makeBoundary({
    geometryType: "Polygon",
    geometryGeojson: {
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
  });
  const c = render(
    <EditAreaBoundaryDialog
      boundary={boundary}
      open
      onOpenChange={() => {}}
      onSuccess={() => {}}
    />,
  );
  // The mock stub renders an editor-stub container; verify it mounted.
  expect(c.getByTestId("editor-stub")).toBeTruthy();
});
```

(If a `makeBoundary` factory does not already exist in this file, copy the one from `preview-area-boundary-dialog.test.tsx`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @marine-guardian/web test -- edit-area-boundary-dialog
```

Expected: FAIL — same reason as Task 4 Step 2 (real dialog still renders textarea/select).

- [ ] **Step 3: Update the Edit dialog component**

Mirror the Create dialog changes from Task 4 Step 3 with these differences:

a. Dynamic import (same).

b. `geometryType` state should default from the passed boundary, not null:

```tsx
const [geometryType, setGeometryType] = useState<GeometryType | null>(
  boundary.geometryType ?? null,
);
const [geometryGeojsonRaw, setGeometryGeojsonRaw] = useState<string>(
  boundary.geometryGeojson ? JSON.stringify(boundary.geometryGeojson) : "",
);
```

c. Replace the `<select>` + `<textarea>` with:

```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Boundary Geometry</label>
  <AreaBoundaryEditor
    mode="edit"
    initialGeometry={boundary.geometryGeojson}
    initialType={boundary.geometryType}
    onGeometryChange={(g, t) => {
      setGeometryGeojsonRaw(g === null ? "" : JSON.stringify(g));
      setGeometryType(t);
    }}
  />
  <p className="text-xs text-muted-foreground">
    Drag vertices to refine, drag the whole shape to reposition, or use the toolbar (top-left) to remove and redraw. Type cannot be changed on edit.
  </p>
</div>
```

d. Save button `disabled` gains the same gate as Create:

```tsx
disabled={
  update.isPending ||
  geometryGeojsonRaw === "" ||
  geometryType === null
}
```

(Replace `create.isPending` with whatever the existing edit-dialog mutation hook name is — likely `update.isPending`.)

e. `handleSubmit` gains the same null-geometryType guard as Create.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @marine-guardian/web test -- edit-area-boundary-dialog
```

Expected: PASS — all existing cases + the new initial-geometry case.

- [ ] **Step 5: Run lint + typecheck**

Run:

```bash
pnpm --filter @marine-guardian/web lint
pnpm --filter @marine-guardian/web typecheck
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/edit-area-boundary-dialog.tsx \
  apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): wire map drawing editor into Edit dialog

Mirrors the Create dialog change: replaces the raw-GeoJSON <textarea> +
type <select> with the AreaBoundaryEditor island. Editor receives
initialGeometry + initialType from the loaded boundary; type tool is
locked to the original geometry type on edit. Save gates on geometry +
type being present in addition to update.isPending.

Adds one test case: initial-geometry mount verifies editor stub is
mounted when an existing boundary is loaded. Net test count: +1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final validation gate

**Files:** none (validation only).

- [ ] **Step 1: Run the full web test suite and confirm the predicted delta**

Run:

```bash
pnpm --filter @marine-guardian/web test
```

Expected: **550 passing across ~59 files** (baseline 535 → +15). If the count is different, identify which tests are new or missing vs. the predicted delta in this plan and reconcile before proceeding.

- [ ] **Step 2: Cross-package regression check**

Run:

```bash
pnpm --filter @marine-guardian/jobs test
pnpm --filter @marine-guardian/storage test
pnpm --filter @marine-guardian/shared test
```

Expected: jobs 122/122, storage 15/15, shared 154/154 — all green, no count change (this work is web-only).

- [ ] **Step 3: Full lint + typecheck across all packages**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both clean across all packages.

- [ ] **Step 4: Update STATE.md with this session's outcome**

Rewrite `.cline/STATE.md` with:
- `PHASE`: "Area Boundary Map Drawing Editor shipped — DEFERRED bucket item 2 of 3 cleared"
- `LAST_DONE`: brief summary of the 6 commits squashed
- `NEXT`: "5.1d Area A inline re-derive on areaName change (last DEFERRED item — still blocked on ER sync emitting area_name)"
- Source change list summarizing the new + modified files
- Validation results captured

Match the format established by the prior STATE.md updates (Map Preview, A.2, A.1).

- [ ] **Step 5: Squash-merge to main (if work was done on a branch) and push**

If the executor worked on a `feat/area-boundary-map-editor` branch (per project convention Rule 23), squash-merge to main with a single conventional commit:

```bash
git checkout main
git merge --squash feat/area-boundary-map-editor
git commit -m "$(cat <<'EOF'
feat(area-boundaries): map drawing editor — leaflet-geoman replaces raw GeoJSON

Replaces the raw-GeoJSON textarea + Polygon/LineString select in the
Create + Edit dialogs with a visual click-to-draw editor over Esri
satellite tiles via leaflet-geoman-free. Mirrors the Map Preview
architecture (editor island + thin dialog swaps, dynamic import with
ssr:false). DEFERRED bucket item 2 of 3 from Locked Task Queue
2026-05-23.

NEW FILES:
- patrol-areas/lib/esri-tile-config.ts — shared tile URL + attribution
- patrol-areas/lib/leaflet-positions-to-geojson.ts — pure helper
- patrol-areas/area-boundary-editor.tsx — Leaflet+geoman island
- patrol-areas/__tests__/area-boundary-editor.test.tsx — 6 cases
- patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts — 8 cases

MODIFIED:
- apps/web/package.json — adds @geoman-io/leaflet-geoman-free
- patrol-areas/area-boundary-map.tsx — imports shared Esri config
- patrol-areas/create-area-boundary-dialog.tsx — editor swap + gating
- patrol-areas/edit-area-boundary-dialog.tsx — editor swap + initial geometry + type lock
- patrol-areas/__tests__/create-area-boundary-dialog.test.tsx — mock editor
- patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx — mock editor + 1 case

VALIDATION:
- web: 535 → 550 tests passing (+15)
- jobs: 122/122, storage: 15/15, shared: 154/154 (zero regression)
- typecheck + lint: clean across all packages
- Visual QA: DEFERRED to human (subagents have no browser)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git branch -d feat/area-boundary-map-editor
```

If the work was done directly on main (single-session, no branch), skip the merge — the per-task commits are already on main.

- [ ] **Step 6: Push and report visual QA hand-off**

Run:

```bash
git push origin main
```

Then report to the user: implementation complete; predicted vitest delta achieved; cross-package zero regression; visual QA deferred to human per the spec, following the same 10-step checklist (Spec § Visual QA after merge).

---

## Self-review notes (post-write checklist)

- **Spec coverage**: every spec section maps to a task. Esri extract → Task 1. Pure helper → Task 2. Editor island contract + malformed-fallback → Task 3. Create wiring + Save-gating → Task 4. Edit wiring + initial geometry + type lock → Task 5. Validation + visual QA hand-off → Task 6.
- **Placeholder scan**: no TBDs, no "implement appropriate error handling", no "similar to Task N" — full code blocks at every TDD step.
- **Type consistency**: `AreaBoundaryEditorProps` defined in Task 3 matches the consumer call sites in Task 4 (Create) and Task 5 (Edit). `LeafletShape` defined in Task 2 matches the converter usage in Task 3's `layerToLeafletShape` helper. `GeometryType` is the project-existing union type, imported consistently.
- **Test counts**: 8 helper + 6 editor + 0 net Create + 1 net Edit = +15. Matches the predicted `web 535 → 550`.
