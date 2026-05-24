# Area Boundary Map Preview — Design Spec

**Date**: 2026-05-24
**Status**: Approved (pending implementation plan)
**Owner**: CLAUDE_CODE (Opus 4.7 main-session brainstorm)
**Source**: STATE.md DEFERRED bucket from Locked Task Queue 2026-05-23, item 1 ("Map preview (read-only Leaflet) — own session")
**Follow-on**: Map drawing editor (`leaflet-draw` / `Leaflet.Editable`) lands in a later session and replaces the raw-GeoJSON `<textarea>` in the Create/Edit dialogs

## Goal

Give site admins a one-click read-only map view of any AreaBoundary row so they can sanity-check "is this the right shape in the right place?" without leaving the Patrol Areas page or parsing raw GeoJSON.

## Non-goals

- Editing geometry (deferred to map drawing editor session)
- Multi-boundary overlay (already exists in Coverage Report Page 2 print-render)
- Deep-linkable per-boundary URL (no `/patrol-areas/[id]` route)
- Mobile-optimized layout (admin operator surface — desktop assumed)
- Custom marine-aware tile layers beyond Esri World Imagery (decided)

## Decisions locked during brainstorm

| Decision | Value | Why |
|---|---|---|
| Placement | shadcn Dialog opened via "Preview" button in Actions column | Matches existing Create/Edit/Delete dialog pattern; cheapest consistent ship |
| Base tile layer | Esri World Imagery (satellite) | Marine conservation context — admins see coastline/reefs/harbors; free, no API key |
| Dialog content | Map + compact header strip (name + region/source/type badges) | Focuses on shape; metadata sidebar would be redundant with Edit dialog |
| Geometry helper | Duplicate `polygonToLatLngs` from print-render, extend for LineString | One other consumer ≠ premature abstraction (CLAUDE.md) |
| SSR | `next/dynamic` with `ssr: false` on the inner map component | Leaflet touches `window`; dashboard page is server-rendered |
| Tests for Leaflet itself | None | vitest jsdom can't render canvas; test the helper + dialog wrapper instead |

## Architecture

Two new files + two edits to existing files.

```
apps/web/src/app/(dashboard)/patrol-areas/
  preview-area-boundary-dialog.tsx   NEW  Client component. shadcn Dialog wrapper.
                                          Renders header strip + dynamic-imported map.
                                          SSR-safe; testable in jsdom.

  area-boundary-map.tsx              NEW  Client component. Actual react-leaflet:
                                          MapContainer + TileLayer (Esri) + Polygon
                                          /Polyline + AutoFitBounds. Imported by the
                                          dialog via next/dynamic({ ssr: false }).
                                          Not directly tested.

  area-boundary-table.tsx            EDIT  +1 prop: onPreview: (b: AreaBoundaryRow) => void.
                                          New "Preview" button in Actions column,
                                          alongside Edit and Delete. Role-gated by the
                                          same logic as Edit/Delete (super_admin /
                                          site_admin).

  page.tsx                           EDIT  +1 state: previewTarget: AreaBoundaryRow | null.
                                          Mirror the deleteTarget / editTarget pattern
                                          from A.1+A.2. Mount PreviewAreaBoundaryDialog
                                          at root level when previewTarget !== null.

  lib/
    geojson-to-leaflet-positions.ts             NEW  pure helper (see contract below)
    __tests__/
      geojson-to-leaflet-positions.test.ts      NEW  vitest node (~8 cases — colocated with helper)

  __tests__/
    preview-area-boundary-dialog.test.tsx   NEW  vitest jsdom (~8 cases)
    area-boundary-table.test.tsx            EDIT  +1 case: onPreview wiring
```

### Reference templates

- **`apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/components/area-coverage-map.tsx`** — exact `MapContainer + TileLayer + Polygon + Polyline + AutoFitBounds` skeleton. Our `area-boundary-map.tsx` mirrors its structure but with Esri tiles + single-boundary scope.
- **`apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/__tests__/page-2-area-boundary-summary.test.tsx`** — mock pattern (`AreaCoverageMap: () => null`) reused for `area-boundary-map`.
- **`apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx`** (A.2) — Dialog wrapper conventions: `data-testid` for sr-only Close disambiguation, role gating via session, mutation/utils hoisted-stub pattern.

### Why split into two files (and not collapse the map into the dialog)

The dialog wrapper stays SSR-safe and unit-testable in jsdom. Only `area-boundary-map.tsx` touches `window` (via Leaflet), so isolating it gives us a clean `next/dynamic({ ssr: false })` boundary. This is the same pattern as print-render's split between `page-2-area-boundary-summary.tsx` (the page section) and `area-coverage-map.tsx` (the Leaflet island).

## Data flow

```
AreaBoundaryRow (already in scope inside area-boundary-table.tsx)
  ↓ Preview button click → setPreviewTarget(boundary)
PreviewAreaBoundaryDialog (open={previewTarget !== null})
  ↓ pass boundary as prop
  ├─ header strip: boundary.name + region/source/geometryType badges
  └─ <AreaBoundaryMap /> (loaded via next/dynamic({ ssr: false }))
       ↓ runs geojsonToLeafletPositions(boundary.geometryGeojson, boundary.geometryType)
       │   in useMemo
       ├─ returns null  → renders fallback <div>Geometry could not be rendered</div>
       └─ returns { kind, positions }
            ↓
            <MapContainer>
              <TileLayer url="...Esri World Imagery..." />
              {kind === "Polygon"  && <Polygon  positions={positions} />}
              {kind === "LineString" && <Polyline positions={positions} />}
              <AutoFitBounds positions={positions} />
            </MapContainer>
```

No new tRPC call — the row is already in scope and has every field the dialog needs.

## Helper contract: `geojsonToLeafletPositions`

Lives in `apps/web/src/app/(dashboard)/patrol-areas/lib/geojson-to-leaflet-positions.ts` (new). Pure function. Pure test target.

```ts
// GeoJSON uses [lng, lat]; Leaflet uses [lat, lng]. This helper does the flip.
// Returns null on any structural failure — caller renders the fallback message.

type LeafletPositions =
  | { kind: "Polygon"; positions: [number, number][][] }   // array of rings
  | { kind: "LineString"; positions: [number, number][] };

export function geojsonToLeafletPositions(
  geometryGeojson: unknown,
  expectedType: "Polygon" | "LineString",
): LeafletPositions | null;
```

Returns null when:
- `geometryGeojson` is not a plain object
- `geometryGeojson.type !== expectedType`
- `coordinates` is missing or wrong shape
- Polygon outer ring has fewer than 4 points (GeoJSON spec: first and last must match, so 4 = degenerate triangle minimum)
- LineString has fewer than 2 points
- Any coordinate pair is not `[number, number]` with finite numbers

Otherwise returns `[lat, lng]`-flipped positions ready for react-leaflet.

**Why this lives in `(dashboard)/patrol-areas/lib/` and not `packages/shared`**: only one consumer today (the new dialog). Print-render has its own private `polygonToLatLngs` with a different signature (no LineString, single-ring). If print-render and dashboard ever need to share, extract to `packages/shared/lib/geometry-to-leaflet.ts` then.

## Component sketches

### `area-boundary-map.tsx` (the Leaflet island)

```tsx
"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { LatLngBoundsExpression } from "leaflet";
import { geojsonToLeafletPositions } from "./lib/geojson-to-leaflet-positions";

const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const STROKE = "#2563eb";     // blue-600 — matches BOUNDARY_STROKE in area-coverage-map
const FILL   = "#3b82f6";     // blue-500

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
      center={[13.0, 121.0]}      // Mindoro fallback — overridden by AutoFitBounds
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
          pathOptions={{ color: STROKE, fillColor: FILL, fillOpacity: 0.25, weight: 2 }}
        />
      )}
      {parsed.kind === "LineString" && (
        <Polyline positions={parsed.positions} pathOptions={{ color: STROKE, weight: 2 }} />
      )}
      <AutoFitBounds parsed={parsed} />
    </MapContainer>
  );
}

function AutoFitBounds({ parsed }: { parsed: NonNullable<ReturnType<typeof geojsonToLeafletPositions>> }) {
  const map = useMap();
  useEffect(() => {
    const flat: [number, number][] =
      parsed.kind === "Polygon"
        ? parsed.positions.flat()
        : parsed.positions;
    if (flat.length < 2) return;
    map.fitBounds(flat as LatLngBoundsExpression, { padding: [20, 20] });
  }, [map, parsed]);
  return null;
}
```

### `preview-area-boundary-dialog.tsx` (the SSR-safe wrapper)

```tsx
"use client";

import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AreaBoundaryRow } from "./area-boundary-table";

const AreaBoundaryMap = dynamic(
  () => import("./area-boundary-map").then((m) => m.AreaBoundaryMap),
  { ssr: false },
);

interface Props {
  boundary: AreaBoundaryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreviewAreaBoundaryDialog({ boundary, open, onOpenChange }: Props) {
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
          geometryType={boundary.geometryType as "Polygon" | "LineString"}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
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

### `area-boundary-table.tsx` edit

Add `onPreview: (boundary: AreaBoundaryRow) => void` prop. In the Actions column, insert a new "Preview" button between the existing Edit and Delete buttons, role-gated by the same `canMutate` flag (currently used to enable/disable Edit and Delete). Preview shouldn't be role-gated as strictly — viewing is safer than editing — but matching the existing pattern keeps the column consistent. Open question for plan phase: should Preview be available to all authenticated users? Default for now: same gating as Edit/Delete.

### `page.tsx` edit

Add `const [previewTarget, setPreviewTarget] = useState<AreaBoundaryRow | null>(null);` next to the existing `deleteTarget` / `editTarget` state. Pass `onPreview={setPreviewTarget}` to `<AreaBoundaryTable>`. Mount the dialog at root level:

```tsx
{previewTarget !== null && (
  <PreviewAreaBoundaryDialog
    boundary={previewTarget}
    open={true}
    onOpenChange={(open) => { if (!open) setPreviewTarget(null); }}
  />
)}
```

## Error / fallback states

| Condition | Behavior |
|---|---|
| Shape validation fails | Render fallback `<div>` (see `area-boundary-map.tsx` sketch). No console error, no toast — the failure is informational, not actionable here. Admin uses Edit dialog to inspect/fix raw GeoJSON. |
| Geometry has <2 valid points after flipping | Same fallback |
| Dialog opens while dynamic chunk is still loading | `next/dynamic` renders nothing during load. Acceptable for click→dialog UX; chunk is small. No spinner. |
| Network failure loading Esri tiles | Leaflet's default behavior: shows transparent tiles, attribution still renders. The boundary polygon/polyline still draws on top of the blue `background: #dbeafe` fallback. Admin sees the shape; no crash. |
| `boundary.geometryType` is anything other than `"Polygon"` or `"LineString"` | Helper returns null → fallback message renders. (Prisma `GeometryType` enum currently only has these two values, but defensive.) |

No loading spinner, no error toast, no Sentry instrumentation. This is read-only operator UI; quiet fallback is correct.

## Testing

### `geojson-to-leaflet-positions.test.ts` (vitest node, ~8 cases)

Pure function, no React. Easy to test.

1. Valid Polygon with single outer ring → returns `{ kind: "Polygon", positions: [...] }` with lat/lng flipped correctly
2. Valid LineString → returns `{ kind: "LineString", positions: [...] }` with lat/lng flipped
3. Polygon with `type: "LineString"` mismatch → returns null
4. LineString with fewer than 2 points → returns null
5. Polygon with outer ring of fewer than 4 points → returns null
6. Missing `coordinates` field → returns null
7. `coordinates` containing non-numeric values → returns null
8. `geometryGeojson === null` / `geometryGeojson === undefined` / `geometryGeojson === "string"` → returns null

### `preview-area-boundary-dialog.test.tsx` (vitest jsdom, ~8 cases)

Mock the map at the top:
```ts
vi.mock("./area-boundary-map", () => ({
  AreaBoundaryMap: ({ geometryType }: { geometryType: string }) => (
    <div data-testid="map-mock" data-geometry-type={geometryType} />
  ),
}));
```

1. Renders DialogTitle with `boundary.name`
2. Renders region + source + geometryType badges with correct text
3. Mounts `<AreaBoundaryMap />` mock with `geometryType` prop passed through
4. Mounts the map mock regardless of geometry validity (validation lives in the map component, not the dialog)
5. DialogDescription is screen-reader-only and contains "Read-only map preview"
6. Close button (`data-testid="preview-close"`) calls `onOpenChange(false)` when clicked
7. `open={false}` → DialogContent not rendered (shadcn Dialog default behavior)
8. Re-rendering with a different `boundary` prop updates the title + badges

### `area-boundary-table.test.tsx` edit (+1 case)

Add: "calls onPreview with the row's boundary when Preview button is clicked" — mirrors existing `onDelete` and `onEdit` tests. Update all existing `render(<AreaBoundaryTable ...>)` calls to include the new `onPreview` prop (mock function).

### No test for `area-boundary-map.tsx`

vitest jsdom cannot render Leaflet's canvas / interactive map. We test the helper (pure function) and the dialog wrapper (mocks the map). Leaflet's rendering correctness is its own library's contract; visual QA + manual sanity-check on staging covers the integration.

### Expected vitest delta

+8 (helper) + 8 (dialog) + 1 (table) = **+17 cases**. Web vitest baseline 518 → expected 535.

## Implementation notes for plan phase

- Esri tile URL uses `{z}/{y}/{x}` ordering (ArcGIS convention) — not `{z}/{x}/{y}` like OSM. Verified against existing Leaflet docs / Esri reference.
- `[lat, lng]` vs `[lng, lat]` flip is critical and is the source of most "polygon rendered in the wrong place" bugs. The helper test covers this explicitly (case 1).
- Leaflet CSS (`leaflet/dist/leaflet.css`) must be loaded — `apps/web/src/app/layout.tsx` or the parent `(dashboard)/layout.tsx` likely already imports it for the print-render route to work. If not, add to the dialog wrapper file.
- `next/dynamic({ ssr: false })` is valid inside a Client Component in Next 15. patrol-areas/page.tsx is already `"use client"`. No App Router gotchas.
- The "Preview" button in the Actions column is a third button — column width may need a slight adjustment. Visual QA item.

## Out of scope (explicitly deferred)

- Map drawing (polygon editor) — own session, replaces raw-GeoJSON `<textarea>` in Create/Edit dialogs
- Multi-boundary overlay (already exists in print-render Coverage Report Page 2)
- Boundary measurement tools (area, perimeter)
- Layer toggle (satellite ↔ street map)
- Mobile-optimized layout
- Deep-linkable per-boundary URL
- Heatmap / patrol track overlay on preview (this is the boundary in isolation, not patrol activity)

## Risks

| Risk | Mitigation |
|---|---|
| Esri tile service rate-limits or goes down | Leaflet renders the boundary anyway on the blue background; no crash. If sustained, swap URL to OSM (one-line change). |
| Pre-validation-era boundary rows have malformed `geometryGeojson` | Helper returns null → fallback message. Admin sees the failure mode and can fix via Edit dialog or re-create. |
| Leaflet CSS not loaded | Map renders broken (no tiles visible, wrong sizing). Verify during plan phase that `leaflet/dist/leaflet.css` is imported somewhere globally — print-render route is the canary; if it works, dashboard preview works. |
| Bundle size impact | Leaflet (~50KB gzipped) + react-leaflet (~10KB) is lazy-loaded via `next/dynamic` — zero impact on initial dashboard bundle. Loaded only when admin clicks Preview. |

## Open questions for plan phase

1. Should "Preview" be role-gated the same as Edit/Delete, or available to all authenticated users? **Default**: same gating as Edit/Delete (matches column consistency). Revisit if user pushes back.
2. Does `leaflet/dist/leaflet.css` need to be imported in this branch, or is it already global via print-render? Verify during plan phase. If missing → add `import "leaflet/dist/leaflet.css"` to `area-boundary-map.tsx`.

(Dialog width locked at `max-w-3xl` per the wrapper sketch — adjust only if visual QA on staging surfaces a problem.)

## Governance updates after ship

- `.cline/memory/lessons.md` — prepend 🟢 change entry for the Preview ship
- `STATE.md` — rewrite with new PHASE/LAST_DONE/NEXT, list this work as DONE in the DEFERRED bucket of the prior queue
- `docs/CHANGELOG_AI.md` — append entry (Agent: CLAUDE_CODE) with file list, vitest delta, decisions locked

## Next step

Invoke `superpowers:writing-plans` to turn this design into a discrete implementation plan with TDD sub-tasks and validation checkpoints.
