# Area Boundary Map Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Leaflet map preview dialog to the Patrol Areas table so admins can sanity-check any AreaBoundary's shape over Esri satellite tiles without parsing raw GeoJSON.

**Architecture:** Two new components + one pure helper + two edits to existing files. Dialog wrapper stays SSR-safe (testable in jsdom); the Leaflet island is dynamic-imported with `ssr: false`. Helper converts GeoJSON `[lng,lat]` → Leaflet `[lat,lng]` and shape-validates. No new tRPC call — `AreaBoundaryRow` already carries `geometryGeojson`.

**Tech Stack:** Next.js 15 App Router · React 19 · react-leaflet 5 · Leaflet 1.9 · shadcn/ui (Dialog, Badge, Button) · vitest jsdom + node · TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-05-24-area-boundary-map-preview-design.md` (commit `44e8597`)

**Tier:** 2 — moderate. ~6 files, ~17 new vitest cases. Estimated ~25K token execution budget. Fits in one main-session OR can be dispatched as 2 Sonnet sub-tasks (Task 1 alone + Tasks 2-6 grouped).

---

## Pre-flight (one-time before Task 1)

- [ ] **Verify clean main**: `git status` shows no staged/unstaged work; `git log --oneline -1` is `44e8597`.
- [ ] **Create feature branch**: `git checkout -b feat/area-boundary-map-preview`
- [ ] **Confirm Leaflet deps already present**: `grep -E "leaflet|react-leaflet" apps/web/package.json` shows `leaflet ^1.9.4`, `react-leaflet ^5.0.0`, `@types/leaflet ^1.9.21`. No `pnpm install` needed.
- [ ] **Confirm baseline vitest count**: `pnpm --filter @marine-guardian/web test 2>&1 | tail -5` reports 518 passing across 56 files. After Task 6, expected: 535 passing across 58 files (+8 helper + 8 dialog + 1 table edit = +17; +2 files for the two new test files).

---

## File Structure

New files:

- `apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts` — pure helper
- `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts` — vitest node, 8 cases
- `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx` — Leaflet island, no test file
- `apps/web/src/app/(dashboard)/patrol-areas/preview-area-boundary-dialog.tsx` — SSR-safe Dialog wrapper
- `apps/web/src/app/(dashboard)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx` — vitest jsdom, 8 cases

Modified files:

- `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx` — add `onPreview` prop + Preview button in Actions column
- `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx` — add `onPreview` to all existing `render(...)` calls + 1 new test case
- `apps/web/src/app/(dashboard)/patrol-areas/page.tsx` — add `previewTarget` state + mount dialog at root level

Final vitest count target: **535 web** (518 baseline + 17). Cross-package (jobs, storage, shared) untouched.

---

## Task 1: Helper `geojson-to-leaflet-positions`

Pure function. Pure TDD. RED → GREEN → commit.

**Files:**
- Create: `apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts`
- Create: `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts`

- [ ] **Step 1: Create directory + write failing test file**

Create `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { geojsonToLeafletPositions } from "../geojson-to-leaflet-positions";

describe("geojsonToLeafletPositions", () => {
  it("flips [lng,lat] → [lat,lng] for a valid Polygon with one outer ring", () => {
    // Square around Mindoro coordinates — GeoJSON requires first === last
    const geojson = {
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
    const result = geojsonToLeafletPositions(geojson, "Polygon");
    expect(result).toEqual({
      kind: "Polygon",
      positions: [
        [
          [13.0, 121.0],
          [13.0, 121.5],
          [13.5, 121.5],
          [13.5, 121.0],
          [13.0, 121.0],
        ],
      ],
    });
  });

  it("flips [lng,lat] → [lat,lng] for a valid LineString", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
        [122.0, 14.0],
      ],
    };
    const result = geojsonToLeafletPositions(geojson, "LineString");
    expect(result).toEqual({
      kind: "LineString",
      positions: [
        [13.0, 121.0],
        [13.5, 121.5],
        [14.0, 122.0],
      ],
    });
  });

  it("returns null when expectedType does not match geojson.type", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when LineString has fewer than 2 points", () => {
    const geojson = {
      type: "LineString",
      coordinates: [[121.0, 13.0]],
    };
    expect(geojsonToLeafletPositions(geojson, "LineString")).toBeNull();
  });

  it("returns null when Polygon outer ring has fewer than 4 points", () => {
    const geojson = {
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.5],
          [121.0, 13.0],
        ],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when coordinates field is missing", () => {
    const geojson = { type: "Polygon" };
    expect(geojsonToLeafletPositions(geojson, "Polygon")).toBeNull();
  });

  it("returns null when a coordinate pair contains non-finite numbers", () => {
    const geojson = {
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [Number.NaN, 13.5],
      ],
    };
    expect(geojsonToLeafletPositions(geojson, "LineString")).toBeNull();
  });

  it("returns null for non-object input (null / string / undefined)", () => {
    expect(geojsonToLeafletPositions(null, "Polygon")).toBeNull();
    expect(geojsonToLeafletPositions("not an object", "Polygon")).toBeNull();
    expect(geojsonToLeafletPositions(undefined, "Polygon")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts`

Expected: FAIL — `Cannot find module '../geojson-to-leaflet-positions'` (or 8 cases failing for the same reason).

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts`:

```ts
// Converts a GeoJSON Polygon or LineString to Leaflet positions, flipping
// [lng,lat] → [lat,lng]. Returns null on any structural failure — callers
// render a fallback UI when null comes back.

export type LeafletPositions =
  | { kind: "Polygon"; positions: [number, number][][] }
  | { kind: "LineString"; positions: [number, number][] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function flipPair(pair: [number, number]): [number, number] {
  // GeoJSON: [lng, lat]; Leaflet: [lat, lng]
  return [pair[1], pair[0]];
}

export function geojsonToLeafletPositions(
  geometryGeojson: unknown,
  expectedType: "Polygon" | "LineString",
): LeafletPositions | null {
  if (
    geometryGeojson === null ||
    typeof geometryGeojson !== "object" ||
    Array.isArray(geometryGeojson)
  ) {
    return null;
  }

  const obj = geometryGeojson as Record<string, unknown>;
  if (obj.type !== expectedType) return null;
  if (!Array.isArray(obj.coordinates)) return null;

  if (expectedType === "LineString") {
    const coords = obj.coordinates;
    if (coords.length < 2) return null;
    if (!coords.every(isCoordinatePair)) return null;
    return {
      kind: "LineString",
      positions: coords.map(flipPair),
    };
  }

  // Polygon: array of rings; each ring is array of pairs; outer ring must have ≥4 points
  const rings = obj.coordinates;
  if (rings.length === 0) return null;
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null;
    if (!ring.every(isCoordinatePair)) return null;
  }
  const outerRing = rings[0] as [number, number][];
  if (outerRing.length < 4) return null;

  return {
    kind: "Polygon",
    positions: (rings as [number, number][][]).map((ring) => ring.map(flipPair)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts`

Expected: PASS — 8/8.

- [ ] **Step 5: Run typecheck + lint on the new files**

Run: `pnpm --filter @marine-guardian/web typecheck && pnpm --filter @marine-guardian/web lint`

Expected: both clean.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/lib/
git commit -m "$(cat <<'EOF'
feat(area-boundaries): geojsonToLeafletPositions helper (preview prep)

Pure function. Converts GeoJSON Polygon/LineString geometries (as stored
in the Prisma Json column) into Leaflet [lat,lng] positions, with full
shape validation that returns null on any malformed input.

+8 vitest cases covering: Polygon flip, LineString flip, type mismatch,
short LineString, short Polygon ring, missing coordinates, non-finite
numbers, non-object input.

Sets up the read-only map preview dialog (next task).
EOF
)"
```

---

## Task 2: AreaBoundaryMap (Leaflet island)

No test file — vitest jsdom can't render Leaflet's canvas. The helper from Task 1 + the dialog wrapper from Task 3 are the test surfaces. This task is straight implementation.

**Files:**
- Create: `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx`

- [ ] **Step 1: Create the Leaflet island component**

Create `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx`:

```tsx
"use client";

// Leaflet island for the Area Boundary Preview dialog. Mirrors the
// MapContainer + TileLayer + Polygon/Polyline + AutoFitBounds pattern from
// apps/web/src/app/print-render/.../components/area-coverage-map.tsx but
// scoped to a single boundary with Esri World Imagery tiles.
//
// Imported by preview-area-boundary-dialog.tsx via
//   const AreaBoundaryMap = dynamic(() => import("./area-boundary-map")
//     .then((m) => m.AreaBoundaryMap), { ssr: false });
// so Leaflet (~50KB) stays out of the dashboard bundle until first preview.

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import { MapContainer, Polygon, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import {
  geojsonToLeafletPositions,
  type LeafletPositions,
} from "./lib/geojson-to-leaflet-positions";

const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const STROKE = "#2563eb"; // blue-600
const FILL = "#3b82f6";   // blue-500

interface Props {
  geometryGeojson: unknown;
  geometryType: "Polygon" | "LineString";
}

export function AreaBoundaryMap({ geometryGeojson, geometryType }: Props) {
  const parsed = useMemo(
    () => geojsonToLeafletPositions(geometryGeojson, geometryType),
    [geometryGeojson, geometryType],
  );

  if (parsed === null) {
    return (
      <div
        data-testid="area-boundary-map-fallback"
        className="flex h-[480px] items-center justify-center bg-muted text-sm text-muted-foreground"
      >
        Geometry could not be rendered. Check the raw GeoJSON in the Edit dialog.
      </div>
    );
  }

  return (
    <MapContainer
      center={[13.0, 121.0]} // Mindoro fallback — AutoFitBounds overrides on mount
      zoom={9}
      scrollWheelZoom={true}
      zoomControl={true}
      style={{ width: "100%", height: "480px", background: "#dbeafe" }}
      data-testid="area-boundary-map"
    >
      <TileLayer url={ESRI_URL} attribution={ESRI_ATTRIBUTION} maxZoom={18} />
      {parsed.kind === "Polygon" && (
        <Polygon
          positions={parsed.positions}
          pathOptions={{
            color: STROKE,
            fillColor: FILL,
            fillOpacity: 0.25,
            weight: 2,
          }}
        />
      )}
      {parsed.kind === "LineString" && (
        <Polyline
          positions={parsed.positions}
          pathOptions={{ color: STROKE, weight: 2 }}
        />
      )}
      <AutoFitBounds parsed={parsed} />
    </MapContainer>
  );
}

function AutoFitBounds({ parsed }: { parsed: LeafletPositions }) {
  const map = useMap();
  useEffect(() => {
    const flat: [number, number][] =
      parsed.kind === "Polygon" ? parsed.positions.flat() : parsed.positions;
    if (flat.length < 2) return;
    map.fitBounds(flat as LatLngBoundsExpression, { padding: [20, 20] });
  }, [map, parsed]);
  return null;
}
```

- [ ] **Step 2: Run typecheck on the new file**

Run: `pnpm --filter @marine-guardian/web typecheck`

Expected: clean.

If typecheck fails because `react-leaflet`'s `Polygon` `positions` prop type doesn't accept `[number, number][][]`: cast at the call site as `parsed.positions as [number, number][][]` or import `LatLngExpression`. (react-leaflet 5 accepts these — but flag immediately if not.)

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @marine-guardian/web lint`

Expected: clean. Note: this file references no unused imports — the type-only import of `LatLngBoundsExpression` is required for the cast.

- [ ] **Step 4: Commit Task 2**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/area-boundary-map.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): AreaBoundaryMap Leaflet island (preview prep)

react-leaflet MapContainer with Esri World Imagery tiles, single
Polygon or Polyline render path, and a focused AutoFitBounds child
that flatfits the boundary on mount. Imports leaflet/dist/leaflet.css
inline (same convention as print-render area-coverage-map.tsx).

No unit test — vitest jsdom cannot render Leaflet's canvas. Helper
(Task 1) and dialog wrapper (next task) cover the test surface.

Wired into the preview dialog via next/dynamic({ ssr: false }) in
the following task.
EOF
)"
```

---

## Task 3: PreviewAreaBoundaryDialog

SSR-safe wrapper. TDD with mocked map (vitest jsdom).

**Files:**
- Create: `apps/web/src/app/(dashboard)/patrol-areas/preview-area-boundary-dialog.tsx`
- Create: `apps/web/src/app/(dashboard)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(dashboard)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("renders DialogTitle containing boundary.name", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Apo Reef" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Apo Reef")).toBeInTheDocument();
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
    expect(screen.getByText("MIMAROPA")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("LineString")).toBeInTheDocument();
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
    expect(mock).toBeInTheDocument();
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
    expect(screen.getByTestId("area-boundary-map-mock")).toBeInTheDocument();
  });

  it("includes a screen-reader-only DialogDescription mentioning the boundary name", () => {
    render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Tubbataha Reefs" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Read-only map preview of Tubbataha Reefs/i)).toBeInTheDocument();
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
    expect(screen.queryByText("Hidden Reef")).not.toBeInTheDocument();
  });

  it("updates title + badges when boundary prop changes", () => {
    const { rerender } = render(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Boundary A", region: "REGION-1" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Boundary A")).toBeInTheDocument();
    expect(screen.getByText("REGION-1")).toBeInTheDocument();

    rerender(
      <PreviewAreaBoundaryDialog
        boundary={makeBoundary({ name: "Boundary B", region: "REGION-2" })}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Boundary B")).toBeInTheDocument();
    expect(screen.getByText("REGION-2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx`

Expected: FAIL — `Cannot find module '../preview-area-boundary-dialog'` (or 8 cases failing for the same reason).

- [ ] **Step 3: Implement the dialog wrapper**

Create `apps/web/src/app/(dashboard)/patrol-areas/preview-area-boundary-dialog.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AreaBoundaryRow } from "./area-boundary-table";

// Lazy-load the Leaflet island so Leaflet (~50KB) stays out of the dashboard
// initial bundle. SSR is disabled because Leaflet touches `window`.
const AreaBoundaryMap = dynamic(
  () => import("./area-boundary-map").then((m) => m.AreaBoundaryMap),
  { ssr: false },
);

interface Props {
  boundary: AreaBoundaryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreviewAreaBoundaryDialog({
  boundary,
  open,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>{boundary.name}</span>
            <span className="flex gap-2 text-sm font-normal">
              <Badge variant="secondary">{boundary.region}</Badge>
              <Badge variant="secondary">{boundary.source}</Badge>
              <Badge variant="secondary">{boundary.geometryType}</Badge>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Read-only map preview of {boundary.name}
          </DialogDescription>
        </DialogHeader>
        <AreaBoundaryMap
          geometryGeojson={boundary.geometryGeojson}
          geometryType={boundary.geometryType}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            data-testid="preview-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx`

Expected: PASS — 8/8.

If any test fails because of shadcn Dialog "multiple elements with text 'Close'" (the shadcn Dialog renders a built-in close X with sr-only "Close" text — same issue A.1 hit with the Delete dialog): use `data-testid="preview-close"` as already specified (`getByTestId` avoids ambiguity).

- [ ] **Step 5: Run typecheck + lint**

Run: `pnpm --filter @marine-guardian/web typecheck && pnpm --filter @marine-guardian/web lint`

Expected: both clean.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/preview-area-boundary-dialog.tsx apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): PreviewAreaBoundaryDialog wrapper (preview prep)

SSR-safe shadcn Dialog wrapping the dynamic-imported AreaBoundaryMap
(next/dynamic ssr:false). Header strip shows name + region + source +
geometryType badges; map fills the body; Close button uses
data-testid="preview-close" to disambiguate from shadcn Dialog's
built-in close X (same pattern as DeleteAreaBoundaryDialog).

+8 vitest jsdom cases covering: title render, badge render, map mock
mount + geometryType pass-through, mock mounted regardless of
geometry validity, sr-only DialogDescription, Close button mutation,
open=false hidden, prop change updates title/badges.

Not yet wired into the table/page — next task adds the Preview
button and following task wires the state.
EOF
)"
```

---

## Task 4: Wire AreaBoundaryTable

Add `onPreview` prop + a "Preview" button in the Actions column. Update existing table tests (all `render(...)` calls need the new prop) and add 1 new test case.

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx`
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx`

- [ ] **Step 1: Update existing table tests to expect the new prop + add the new case (RED)**

Reference pattern from the existing test file (lines 98-99, 200-211):
- Top-of-file mock decls: `const onDelete = vi.fn<(b: AreaBoundaryRow) => void>();` (line 98), `const onEdit = vi.fn<(b: AreaBoundaryRow) => void>();` (line 99)
- Mock reset block (lines 106-107): `onDelete.mockReset(); onEdit.mockReset();`
- Edit button uses `data-testid="row-action-edit"` (test reads `getAllByTestId("row-action-edit")`)
- First fixture row has `id: "b-1"` (test asserts `mock.calls[0]?.[0]?.id === "b-1"`)

In `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx`:

**1a. Add the onPreview mock + reset (mirror lines 98-99 + 106-107)**

After `const onEdit = vi.fn<(b: AreaBoundaryRow) => void>();` add:

```ts
const onPreview = vi.fn<(b: AreaBoundaryRow) => void>();
```

After `onEdit.mockReset();` add:

```ts
onPreview.mockReset();
```

**1b. Add `onPreview={onPreview}` to every existing `<AreaBoundaryTable ... />` render**

There are 25 such renders. Each currently looks like:
```tsx
<AreaBoundaryTable isAdmin={...} onDelete={onDelete} onEdit={onEdit} />
```
After the edit:
```tsx
<AreaBoundaryTable isAdmin={...} onDelete={onDelete} onEdit={onEdit} onPreview={onPreview} />
```

Use a single find-replace across the file: replace `onEdit={onEdit} />` with `onEdit={onEdit} onPreview={onPreview} />` (verify count after — should be 25 substitutions).

**1c. Update the "renders Actions column with clickable Edit + Delete buttons when isAdmin=true" test (line 175)**

Change the test title to: `"renders Actions column with clickable Preview + Edit + Delete buttons when isAdmin=true"` and add an assertion that Preview buttons exist:

```tsx
const previews = getAllByTestId("row-action-preview");
expect(previews.length).toBeGreaterThan(0);
const firstPreview = previews[0];
if (firstPreview === undefined) throw new Error("No preview button rendered");
expect(firstPreview.tagName).toBe("BUTTON");
expect((firstPreview as HTMLButtonElement).disabled).toBe(false);
```

Add this assertion next to the existing edit/delete assertions in that test.

**1d. Add the new test case immediately after the "calls onEdit ..." test (after line 211)**

```tsx
it("calls onPreview with the row's boundary when Preview is clicked", () => {
  const { getAllByTestId } = render(
    <AreaBoundaryTable isAdmin={true} onDelete={onDelete} onEdit={onEdit} onPreview={onPreview} />,
  );
  const previews = getAllByTestId("row-action-preview");
  const first = previews[0];
  if (first === undefined) throw new Error("No preview button rendered");
  fireEvent.click(first);
  expect(onPreview).toHaveBeenCalledTimes(1);
  expect(onPreview.mock.calls[0]?.[0]?.id).toBe("b-1");
});
```

This exactly mirrors the existing "calls onEdit ..." test (lines 200-211), substituting `row-action-edit` → `row-action-preview` and `onEdit` → `onPreview`.

- [ ] **Step 2: Run the table test file to verify it fails**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/area-boundary-table.test.tsx`

Expected: FAIL — TypeScript error or runtime failure that `onPreview` is missing from `Props`, plus the new test case fails because the Preview button doesn't exist yet. (Existing tests may also fail typecheck because of the new prop.)

- [ ] **Step 3: Modify the table component to accept onPreview + render the Preview button**

In `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx`:

1. Update the `Props` interface (around line 50-52):

```ts
interface Props {
  isAdmin: boolean;
  onDelete: (boundary: AreaBoundaryRow) => void;
  onEdit: (boundary: AreaBoundaryRow) => void;
  onPreview: (boundary: AreaBoundaryRow) => void;
}
```

2. Update the function signature:

```ts
export function AreaBoundaryTable({ isAdmin, onDelete, onEdit, onPreview }: Props) {
```

3. In the Actions cell (the `{isAdmin && (...)}` block that currently renders Edit + Delete around lines 234-258), add a Preview button BEFORE the existing Edit button. Mirror the existing Edit button's exact JSX, but use the `row-action-preview` test id (the existing Edit button uses `data-testid="row-action-edit"` per the test fixture pattern in `__tests__/area-boundary-table.test.tsx` line 204):

```tsx
<Button
  variant="outline"
  size="sm"
  data-testid="row-action-preview"
  onClick={() => {
    onPreview(b);
  }}
>
  Preview
</Button>
```

Final column order: Preview | Edit | Delete.

- [ ] **Step 4: Run the table test file to verify it passes**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/area-boundary-table.test.tsx`

Expected: PASS — all existing cases plus the new one.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @marine-guardian/web typecheck`

Expected: clean. Note: the page.tsx will now fail typecheck because it doesn't pass `onPreview` yet — this is expected and gets fixed in Task 5. If you want a clean typecheck before commit, do Task 5 first and bundle the commits, OR temporarily stub `onPreview={() => {}}` in page.tsx as part of this commit. Recommended: stub it now, fully wire in Task 5.

Apply the temporary stub in page.tsx: find the `<AreaBoundaryTable ... />` mount and add `onPreview={() => {}}`. This keeps typecheck clean per commit.

- [ ] **Step 6: Re-run typecheck after the stub**

Run: `pnpm --filter @marine-guardian/web typecheck`

Expected: clean.

- [ ] **Step 7: Run lint**

Run: `pnpm --filter @marine-guardian/web lint`

Expected: clean.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/area-boundary-table.tsx apps/web/src/app/\(dashboard\)/patrol-areas/__tests__/area-boundary-table.test.tsx apps/web/src/app/\(dashboard\)/patrol-areas/page.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): wire Preview button into AreaBoundaryTable

+1 onPreview prop. New Preview button in Actions column, placed
before Edit + Delete. Role-gated by the same isAdmin flag as the
other row actions.

Tests: +1 case for onPreview wiring; all 16 existing render() calls
updated to include onPreview={vi.fn()}.

page.tsx onPreview is temporarily stubbed as () => {} to keep
typecheck clean; the next task wires the previewTarget state and
mounts the dialog.
EOF
)"
```

---

## Task 5: Wire page.tsx state + mount dialog

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patrol-areas/page.tsx`

- [ ] **Step 1: Read page.tsx and locate the existing deleteTarget/editTarget pattern**

Run: `cat apps/web/src/app/\(dashboard\)/patrol-areas/page.tsx`

Find the `useState<AreaBoundaryRow | null>(null)` calls for `deleteTarget` and `editTarget`, and find where `DeleteAreaBoundaryDialog` and `EditAreaBoundaryDialog` are mounted at the root level of the JSX.

- [ ] **Step 2: Add previewTarget state**

After the existing `editTarget` useState line, add:

```tsx
const [previewTarget, setPreviewTarget] = useState<AreaBoundaryRow | null>(null);
```

- [ ] **Step 3: Replace the temporary stub from Task 4**

Find the `<AreaBoundaryTable ... onPreview={() => {}} ... />` line and replace `() => {}` with `setPreviewTarget`:

```tsx
<AreaBoundaryTable
  isAdmin={isAdmin}
  onDelete={setDeleteTarget}
  onEdit={setEditTarget}
  onPreview={setPreviewTarget}
/>
```

- [ ] **Step 4: Import the new dialog**

Add to the imports at the top of page.tsx:

```tsx
import { PreviewAreaBoundaryDialog } from "./preview-area-boundary-dialog";
```

- [ ] **Step 5: Mount the dialog at root level**

After the existing `{deleteTarget && (...)}` and `{editTarget && (...)}` dialog mounts, add:

```tsx
{previewTarget && (
  <PreviewAreaBoundaryDialog
    boundary={previewTarget}
    open={true}
    onOpenChange={(open) => {
      if (!open) setPreviewTarget(null);
    }}
  />
)}
```

- [ ] **Step 6: Run typecheck + lint**

Run: `pnpm --filter @marine-guardian/web typecheck && pnpm --filter @marine-guardian/web lint`

Expected: both clean.

- [ ] **Step 7: Run the full patrol-areas test suite to verify no regression**

Run: `pnpm --filter @marine-guardian/web test apps/web/src/app/\(dashboard\)/patrol-areas/`

Expected: all tests pass — page.tsx has no test of its own (it's small wiring), but neighboring tests (table, create dialog, edit dialog, delete dialog, preview dialog) should all still pass.

- [ ] **Step 8: Commit Task 5**

```bash
git add apps/web/src/app/\(dashboard\)/patrol-areas/page.tsx
git commit -m "$(cat <<'EOF'
feat(area-boundaries): mount PreviewAreaBoundaryDialog in patrol-areas page

+1 previewTarget useState mirroring deleteTarget/editTarget pattern.
Replaces the onPreview={() => {}} stub from the previous commit with
setPreviewTarget. Dialog mounts at root level when previewTarget !== null,
closes via setPreviewTarget(null).

Read-only map preview is now reachable end-to-end:
  Patrol Areas table → Preview button → satellite-tile dialog with
  boundary geometry, fit-to-bounds on open.
EOF
)"
```

---

## Task 6: Full validation + governance + ship

**Files:**
- Modify: `.cline/STATE.md`
- Modify: `.cline/memory/lessons.md`
- Modify: `docs/CHANGELOG_AI.md`

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter @marine-guardian/web test 2>&1 | tail -10`

Expected: **535 passing across 58 files** (baseline 518 + 17 new cases; +2 files: helper test + dialog test).

If count does not match exactly: investigate before proceeding. A discrepancy of ±2 may be from the table test edit counting differently.

- [ ] **Step 2: Run cross-package tests to verify zero regression**

Run: `pnpm --filter @marine-guardian/jobs test && pnpm --filter @marine-guardian/storage test && pnpm --filter @marine-guardian/shared test`

Expected:
- jobs: 122/122
- storage: 15/15
- shared: 154/154

If any package shows new failures: STOP and investigate. The preview feature should not affect cross-package code.

- [ ] **Step 3: Run web typecheck + lint as a final gate**

Run: `pnpm --filter @marine-guardian/web typecheck && pnpm --filter @marine-guardian/web lint`

Expected: both clean.

- [ ] **Step 4: Manual visual QA (recommended — not blocking)**

Start dev server (if not running): `bash deploy/compose/start.sh dev up -d` then `pnpm --filter @marine-guardian/web dev`. Open browser to dashboard → Patrol Areas → click Preview on a known-good boundary. Verify:

- Satellite tiles load
- Boundary polygon (or polyline) renders in blue
- Map auto-fits to the boundary
- Scroll-wheel zoom works
- Close button closes the dialog
- Open a known-malformed boundary (if any exist in dev DB) → fallback message renders

If no malformed boundaries exist in dev: skip the malformed-case check; the unit test covers it.

- [ ] **Step 5: Prepend lessons.md entry**

Add at the top of `.cline/memory/lessons.md` (above the most recent entry):

```markdown
## 2026-05-24 — 🟢 Area Boundary Map Preview shipped
- Type:       🟢 change
- Phase:      Phase 7 Feature Update — Area Boundary Management UI follow-on (DEFERRED bucket item 1)
- Files:      apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts (NEW),
              apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts (NEW),
              apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx (NEW),
              apps/web/src/app/(dashboard)/patrol-areas/preview-area-boundary-dialog.tsx (NEW),
              apps/web/src/app/(dashboard)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx (NEW),
              apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx (EDIT),
              apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx (EDIT),
              apps/web/src/app/(dashboard)/patrol-areas/page.tsx (EDIT)
- Concepts:   leaflet, react-leaflet, esri, next/dynamic, ssr:false, geojson, shape-validation, [lng,lat]→[lat,lng]
- Narrative:  Read-only Leaflet preview dialog reachable from the Patrol Areas table Actions
              column via a new Preview button. Esri World Imagery satellite tiles selected for
              marine conservation context (admins can see coastline/reefs/harbors as visual
              context for the boundary). Dialog wrapper is SSR-safe and unit-tested in jsdom;
              the Leaflet island is dynamic-imported with ssr:false and not unit-tested
              (vitest jsdom can't render canvas). Pure helper geojsonToLeafletPositions handles
              the [lng,lat]→[lat,lng] flip + shape validation; null return triggers a fallback
              message. Helper duplicates the polygonToLatLngs pattern from print-render
              area-coverage-map.tsx rather than extracting to packages/shared — one other
              consumer is not enough to justify shared abstraction (CLAUDE.md anti-premature-
              abstraction). +17 vitest cases (web 518 → 535). Closes "Map preview (read-only
              Leaflet)" from the Locked Task Queue 2026-05-23 DEFERRED bucket.
```

- [ ] **Step 6: Rewrite STATE.md**

Update `.cline/STATE.md` to reflect the new state. Key fields:
- PHASE: "Map Preview shipped — Area Boundary Management UI follow-on (DEFERRED bucket item 1 of 3 cleared)"
- LAST_DONE: One sentence summarizing the preview ship + vitest delta
- NEXT: "User picks next work item. Two DEFERRED items remain: map drawing editor (own session, larger lift) + 5.1d Area A (still blocked on ER sync)."
- GIT_BRANCH: "feat/area-boundary-map-preview (commits ready to squash-merge to main)"

Read the existing STATE.md first and follow its exact format conventions (the A.2 STATE.md is the reference template).

- [ ] **Step 7: Append to CHANGELOG_AI.md**

Add a new entry at the top of `docs/CHANGELOG_AI.md` following Rule 15 format:

```markdown
## 2026-05-24 — Area Boundary Map Preview (Feature Update)
- Agent:               CLAUDE_CODE
- Why:                 Cleared "Map preview (read-only Leaflet)" from the Locked Task Queue 2026-05-23 DEFERRED bucket. Admins needed a one-click way to sanity-check AreaBoundary shapes without parsing raw GeoJSON.
- Files added:         apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts
                       apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/geojson-to-leaflet-positions.test.ts
                       apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx
                       apps/web/src/app/(dashboard)/patrol-areas/preview-area-boundary-dialog.tsx
                       apps/web/src/app/(dashboard)/patrol-areas/__tests__/preview-area-boundary-dialog.test.tsx
                       docs/superpowers/specs/2026-05-24-area-boundary-map-preview-design.md
                       docs/superpowers/plans/2026-05-24-area-boundary-map-preview.md
- Files modified:      apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx
                       apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx
                       apps/web/src/app/(dashboard)/patrol-areas/page.tsx
                       .cline/STATE.md
                       .cline/memory/lessons.md
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  none (TDD path was clean)
- Errors resolved:     n/a
```

- [ ] **Step 8: Commit governance updates**

```bash
git add .cline/STATE.md .cline/memory/lessons.md docs/CHANGELOG_AI.md
git commit -m "$(cat <<'EOF'
chore(state): close map preview ship — Area Boundary follow-on (1 of 3 DEFERRED items done)

STATE.md rewrite, lessons.md 🟢 change entry, CHANGELOG_AI.md Rule 15
entry. Two DEFERRED items remain from Locked Task Queue 2026-05-23:
map drawing editor (larger lift, own session) and 5.1d Area A (still
blocked on ER sync emitting area_name).
EOF
)"
```

- [ ] **Step 9: Squash-merge to main**

```bash
git checkout main
git merge --squash feat/area-boundary-map-preview
git commit -m "$(cat <<'EOF'
feat(area-boundaries): read-only Leaflet map preview dialog

New Preview button in the Patrol Areas table Actions column opens a
shadcn Dialog with the boundary rendered over Esri World Imagery
satellite tiles. Auto-fits to the boundary on open; scroll-wheel zoom
enabled. Handles malformed geometry gracefully with an inline fallback.

Architecture:
- preview-area-boundary-dialog.tsx — SSR-safe Dialog wrapper, jsdom-testable
- area-boundary-map.tsx — Leaflet island, dynamic-imported with ssr:false
- lib/geojson-to-leaflet-positions.ts — pure helper, [lng,lat] → [lat,lng] flip + shape validation
- area-boundary-table.tsx — +1 Preview button (before Edit + Delete), role-gated by isAdmin
- page.tsx — +1 previewTarget state, mirrors deleteTarget/editTarget

Tests: +17 vitest cases (web 518 → 535). +2 test files. No cross-package
impact. Helper has its own pure-function test file colocated under
lib/__tests__/; dialog wrapper is jsdom-tested with the map mocked.
The Leaflet island itself is not unit-tested (vitest jsdom cannot
render canvas) — covered by manual visual QA + Leaflet's own contract.

Closes "Map preview (read-only Leaflet)" from the Locked Task Queue
2026-05-23 DEFERRED bucket (1 of 3 deferred items shipped).

Spec:  docs/superpowers/specs/2026-05-24-area-boundary-map-preview-design.md
Plan:  docs/superpowers/plans/2026-05-24-area-boundary-map-preview.md
EOF
)"
```

- [ ] **Step 10: Delete the feature branch**

```bash
git branch -d feat/area-boundary-map-preview
```

- [ ] **Step 11: Verify final state**

Run: `git log --oneline -5 && git status`

Expected:
- HEAD on main
- Top commit is the squash-merge with the conventional message above
- Working tree clean
- No `feat/area-boundary-map-preview` branch remaining

---

## Validation contract (must all pass before reporting "done")

- [ ] Web vitest: **535 passing across 58 files** (518 baseline + 17 new)
- [ ] Cross-package vitest: jobs 122/122, storage 15/15, shared 154/154
- [ ] Web typecheck: clean
- [ ] Web lint: clean
- [ ] Manual visual QA: at least one Polygon boundary previewed successfully on staging-localhost
- [ ] STATE.md, lessons.md, CHANGELOG_AI.md all updated
- [ ] Feature branch squash-merged to main and deleted

If any item fails: do not ship. Diagnose, fix, re-run validation, then ship.

---

## Risks & mitigations (carried from spec)

| Risk | Mitigation in this plan |
|---|---|
| Esri tile service rate-limits or goes down | Leaflet renders the boundary on the blue `#dbeafe` background; no crash. Swap URL to OSM later if sustained. |
| Pre-validation-era boundary rows have malformed `geometryGeojson` | `geojsonToLeafletPositions` returns null → fallback `<div>` message renders. Task 1 unit tests cover this; Task 3 dialog test confirms the map mock still mounts even for malformed input. |
| Leaflet CSS not loaded | Task 2 imports `leaflet/dist/leaflet.css` inline (same convention as print-render area-coverage-map.tsx — verified during plan phase). |
| react-leaflet 5 `positions` prop type mismatch | Task 2 Step 2 explicit fallback: cast as `LatLngBoundsExpression` / `LatLngExpression` if typecheck rejects the inferred shape. |
| shadcn Dialog "Close" text ambiguity (built-in close X has sr-only "Close" text) | Task 3 uses `data-testid="preview-close"` and the dialog test uses `getByTestId` — same pattern A.1 DeleteAreaBoundaryDialog used. |

---

## Open question carry-over (from spec)

1. Preview role gating: currently behind `isAdmin` (same as Edit/Delete). If user feedback says "viewers should be able to preview too", change to "any authenticated user" in a follow-up Feature Update — 1-line change in the table component.

(Spec open question 2 about Leaflet CSS import is **resolved**: Task 2 imports it inline.)
(Spec open question 3 about dialog width is **resolved**: locked at `max-w-3xl` in the dialog sketch.)
