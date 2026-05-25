# Area Boundary Map Drawing Editor — Design Spec

**Date**: 2026-05-26
**Author**: Claude Code (Opus 4.7 main-session) via superpowers:brainstorming
**Status**: DRAFT — awaiting user review before writing-plans handoff
**Tracks**: DEFERRED bucket item 2 of 3 from Locked Task Queue 2026-05-23 (the largest UX lift)
**Replaces**: raw-GeoJSON `<textarea>` + Polygon/LineString `<select>` in Create + Edit dialogs

## Context

The Area Boundary Management UI shipped in three milestones:

1. **A.1** (commit `3e10f97`) — Patrol Areas page table, role-gated row actions (Edit/Delete), Rebuild button.
2. **A.2** (commit `a814e17`) — Create + Edit dialogs with raw-GeoJSON `<textarea>` input + client-side JSON shape validation via `validateGeoJsonCoordinates`.
3. **Map Preview** (commit `a36bef7`, this is the FIRST of three originally-DEFERRED items, shipped 2026-05-25) — read-only Leaflet dialog from Preview button. Esri World Imagery satellite tiles. SSR-safe via `next/dynamic` + `ssr:false` on the Leaflet island.

The remaining gap: admins must hand-author GeoJSON to define a boundary in Create or paste a GeoJSON blob from external GIS tools. This is hostile UX for the actual user (site admin, not GIS analyst). This spec replaces the textarea with a visual click-to-draw editor over the same Esri satellite tiles, using `leaflet-geoman-free`.

## Goals

- Admin can draw a Polygon or LineString geometry visually on a satellite map for both Create and Edit.
- Existing geometry loaded in Edit mode is editable in place (vertex drag, whole-shape drag, remove-and-redraw of same type).
- Geometry type is locked on Edit (cannot convert Polygon → LineString or vice versa mid-edit — destructive).
- Submit path, tRPC contract, DB shape, validation guarantees all unchanged.
- Pattern continuity with the just-shipped Map Preview dialog (same dynamic-import boundary, same Esri tile source, same malformed-fallback copy style).

## Non-goals

- No coexistence mode (no toggle between visual editor and raw-GeoJSON paste). Users who need to import from external GIS tools lose that path — accepted tradeoff. (See "Future work" if it becomes a real complaint.)
- No self-intersection check, no min/max area sanity warnings, no topological cleanup. Validation stays minimal — Polygon ≥3 vertices, LineString ≥2 vertices, shape exists.
- No standalone routes (`/patrol-areas/new`, `/patrol-areas/:id/edit`). Keeps the established dialog-based admin pattern.
- No `<AreaBoundaryFormDialog>` unified component. Existing Create + Edit dialog files keep their current shapes — only the geometry input swaps.
- No dirty-state confirmation prompt on dialog close. Matches current Create/Edit ergonomics.
- No layer switcher (OSM streets / satellite). Esri satellite only, matching Preview.

## Locked decisions

| # | Decision | Reason |
|---|---|---|
| 1 | Replace `<textarea>` entirely — no coexistence mode | Site admins are not GIS analysts; simpler UI wins over preserving paste-from-GIS workflow. |
| 2 | `@geoman-io/leaflet-geoman-free` (MIT, ~140KB) for drawing | Production-grade UX out of the box; actively maintained; supports Polygon + LineString natively. |
| 3 | Tool implies type; type locked on Edit | Changing geometry type mid-edit destroys ring-closure semantics. Safer to require delete-and-recreate for type changes. |
| 4 | Minimal validation only: Polygon ≥3, LineString ≥2, shape exists | Matches current textarea validation. Lowest UX friction. Defense-in-depth via existing `validateGeoJsonCoordinates` on submit. |
| 5 | Esri World Imagery satellite (same as Preview); on Create, always center on PH centroid `[12.8, 121.7]` at zoom 6 | Consistency with Preview. Marine-Guardian deploys in the Philippines — PH centroid is the highest-probability initial view. Region-inference deferred (see Future work). |
| 6 | Save button live-disabled until valid geometry exists AND other required fields filled | Matches A.2 dialog pattern. Clearest UX, no error surprises. |
| 7 | Architecture A: editor island + thin dialog swaps | Minimum blast radius; pattern continuity with Map Preview; existing dialog skeletons untouched except for the input swap. |

## Architecture

### New files

| File | Purpose |
|---|---|
| `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-editor.tsx` | Leaflet+geoman island. `"use client"`. Imports `window` at module load → must be dynamically imported with `ssr:false` by parent dialogs. |
| `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-editor.test.tsx` | jsdom vitest. Geoman mocked at module level — tests prove wiring, not draw behavior. |
| `apps/web/src/app/(dashboard)/patrol-areas/lib/leaflet-positions-to-geojson.ts` | Pure helper: inverse of existing `geojsonToLeafletPositions`. Takes a geoman shape's Leaflet `LatLng[]` (or `LatLng[][]` for polygon rings) → returns `{ type: "Polygon" \| "LineString", coordinates: ... }` GeoJSON with `[lng, lat]` ordering. No Leaflet runtime dependency (accepts plain `{ lat, lng }` objects). |
| `apps/web/src/app/(dashboard)/patrol-areas/lib/__tests__/leaflet-positions-to-geojson.test.ts` | Pure unit, 8 cases. |
| `apps/web/src/app/(dashboard)/patrol-areas/lib/esri-tile-config.ts` | Shared Esri World Imagery tile URL + attribution constant. Used by both `area-boundary-map.tsx` (Preview) and `area-boundary-editor.tsx` (this spec). Small refactor satisfies V31 "no repeated logic ≥2 occurrences" rule. |

### Modified files

| File | Change |
|---|---|
| `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-map.tsx` | Replace inline Esri tile constants with imports from `lib/esri-tile-config.ts`. Behavioral no-op. |
| `apps/web/src/app/(dashboard)/patrol-areas/create-area-boundary-dialog.tsx` | Remove `<select>` for geometryType + `<textarea>` for raw GeoJSON + `validateGeoJsonCoordinates` UI surface (keep the imported function as defense-in-depth on submit). Add `<AreaBoundaryEditor mode="create" onGeometryChange={...} />` via `next/dynamic` with `ssr:false`. State stays as `geometryGeojsonRaw: string` + `geometryType: GeometryType \| null`. Editor `onChange` stringifies + sets both. Save button gains `disabled` on `!geometryGeojsonRaw \|\| !geometryType \|\| ...otherRequiredEmpty`. |
| `apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx` | Same swap. Editor receives `mode="edit"` + `initialGeometry={boundary.geometryGeojson}` + `initialType={boundary.geometryType}`. Editor enables only the tool matching `initialType` (lock per decision 3). |
| `apps/web/src/app/(dashboard)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx` | Mock `./area-boundary-editor` to a stub `({ onGeometryChange }) => <button data-testid="editor-stub-emit" onClick={() => onGeometryChange(stubGeometry, "Polygon")}>emit</button>`. Existing test cases adjust: drop textarea-fill steps, simulate stub-emit instead. Same pattern as `preview-area-boundary-dialog.test.tsx` uses to mock `area-boundary-map.tsx`. |
| `apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx` | Same mock pattern as Create. Add 1 case: initial geometry loaded → editor mounted with `initialGeometry` + `initialType` props. |
| `apps/web/package.json` | Add `@geoman-io/leaflet-geoman-free` to dependencies. |

### Editor component contract

```ts
type AreaBoundaryEditorProps = {
  mode: "create" | "edit";
  /** GeoJSON, edit mode only. If malformed, editor renders inline fallback. */
  initialGeometry?: Record<string, unknown> | null;
  /** Edit mode only — locks the tool to the matching draw button. */
  initialType?: "Polygon" | "LineString" | null;
  /** Fires on pm:create, pm:edit, pm:remove. Always reports current canonical state. */
  onGeometryChange: (
    geometry: Record<string, unknown> | null,
    type: "Polygon" | "LineString" | null,
  ) => void;
};
```

- Internal state holds the geoman layer ref.
- `null` geometry = nothing drawn yet (Create) or shape was deleted mid-edit (either mode).
- Esri World Imagery base layer via shared `lib/esri-tile-config.ts`.
- `pm:create`, `pm:edit`, `pm:remove` geoman events all converge through the same `emit` helper that:
  1. Reads the current layer (if any) from the geoman group.
  2. Calls `leafletPositionsToGeojson` to convert.
  3. Calls `onGeometryChange(geojson, type)` with the result (or `(null, null)` if no layer).

## Data flow

### Create

1. Dialog opens → editor mounts on Esri tiles centered on PH centroid `[12.8, 121.7]` at zoom 6. Admin pans/zooms to the area of interest.
2. Admin clicks Polygon or Line tool in the geoman toolbar → draws.
3. On `pm:create` event → editor converts the geoman layer to GeoJSON via `leafletPositionsToGeojson` → calls `onGeometryChange(geojson, "Polygon" | "LineString")`.
4. Parent dialog stores `JSON.stringify(geojson)` in `geometryGeojsonRaw` + sets `geometryType`. Save button gates on `!!geometryGeojsonRaw && !!geometryType && otherRequiredFieldsFilled`.
5. Admin can drag vertices, drag the whole shape, or click remove to clear and start over (same type only).
6. Submit path unchanged — existing `JSON.parse` + `validateGeoJsonCoordinates` + tRPC `areaBoundary.create` call. Editor produces valid shapes, so the validator never fires on the happy path; kept as defense-in-depth in case of geoman bug or future regression.

### Edit

1. Dialog opens with existing `boundary`. Editor mounts, fits bounds to the initial geometry (same `AutoFitBounds` pattern as Preview).
2. Geoman's edit mode is enabled on the loaded shape. The opposite tool is disabled in the toolbar (decision 3 lock).
3. Admin drags vertices, drags whole shape, or removes-and-redraws (with the same-type tool). Every `pm:edit` / `pm:remove` / `pm:create` event re-emits canonical state via `onGeometryChange`.
4. If admin removes the shape entirely → `onGeometryChange(null, null)` → Save disables. Admin can redraw with the same-type tool to re-enable.
5. Submit path unchanged.

## Error handling

| Failure | Behavior |
|---|---|
| Editor receives malformed `initialGeometry` on Edit (data drift) | Editor renders inline emerald paragraph: `"Existing boundary geometry is malformed and cannot be edited. Delete and re-create."` Save stays disabled. Matches Preview's malformed-fallback copy style. |
| Geoman fails to initialize (unknown runtime issue) | React error boundary in the editor file catches → renders fallback: `"Map editor failed to load. Refresh the page."` Save disabled. `console.error` logged. |
| Network failure on submit | Existing dialog error display unchanged. Editor state preserved. |
| Admin closes dialog mid-edit with drawn-but-unsaved shape | Existing `onOpenChange` behavior preserved. No dirty-state prompt. (YAGNI; defer until requested.) |
| Geoman emits a shape that fails `leafletPositionsToGeojson` (shouldn't happen) | Converter returns `null` → `onGeometryChange(null, null)` → Save disabled. `console.warn` logged. Pure-helper test covers this path. |

## Testing strategy

| Test file | Cases | What it proves |
|---|---|---|
| `lib/__tests__/leaflet-positions-to-geojson.test.ts` | 8 | Polygon flip `{lat,lng}` → `[lng,lat]` rings, LineString flip, ring auto-closure if open (geoman returns open rings; converter closes), invalid coord rejection, missing coords, non-finite values, null input, type mismatch. Pure unit — no jsdom. |
| `__tests__/area-boundary-editor.test.tsx` | 6 | Renders editor container in Create mode with no initial geometry. Renders + fits bounds in Edit mode with valid Polygon. Renders + fits bounds in Edit mode with valid LineString. Renders malformed-fallback when `initialGeometry` is invalid. Locks tool to Polygon when `initialType="Polygon"`. Locks tool to LineString when `initialType="LineString"`. Geoman mocked at module level via `vi.mock("@geoman-io/leaflet-geoman-free")`. |
| `__tests__/create-area-boundary-dialog.test.tsx` (EDITED) | net 0 | Existing cases adapted: textarea-fill steps replaced with editor-stub `onClick → onGeometryChange(stubGeometry, "Polygon")`. Existing assertions (Save disabled until valid, tRPC call shape, success/error states) preserved. |
| `__tests__/edit-area-boundary-dialog.test.tsx` (EDITED) | net +1 | Same mock pattern as Create. Add 1 case: initial geometry loaded → editor mounted with `initialGeometry` + `initialType`. |

Predicted vitest delta: **web 535 → 550** (+15: 8 helper + 6 editor + 0 net Create + 1 net Edit).

## Cross-package and infrastructure impact

- **DB schema**: no change.
- **tRPC contract**: no change. Existing `areaBoundary.create` and `areaBoundary.update` mutations receive identical payload shape.
- **packages/shared**: no change.
- **packages/jobs**: no change.
- **packages/db**: no change.
- **Bundle**: `@geoman-io/leaflet-geoman-free` ~140KB gzipped. Does not tree-shake (geoman registers globally on the `L` namespace). Dynamic import via `next/dynamic` in the parent dialogs keeps it out of the main bundle — only loads when Create or Edit dialog opens.
- **CSS**: geoman ships a small CSS file (`@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css`). Imported once at the top of `area-boundary-editor.tsx` (Next.js handles CSS imports in client components).

## Visual QA after merge

Deferred to human (subagents have no browser):

1. Open `/patrol-areas` as admin → click Create.
2. Verify map mounts on Esri tiles centered on PH centroid at zoom 6.
3. Pan/zoom to area of interest. Click Polygon tool → draw a 4-vertex polygon → confirm Save button enables.
4. Click Save → confirm row appears in table.
5. Click Preview on the new row → confirm the polygon matches what was drawn.
6. Click Edit on the same row → confirm map opens fit-to-bounds → drag a vertex → confirm shape updates → Save.
7. Click Preview again → confirm the dragged vertex moved.
8. Repeat steps 3-7 with LineString tool on a fresh row.
9. Open Edit on a LineString row → confirm Polygon tool is disabled in the toolbar (type lock).
10. Open Edit on a Polygon row → click Remove on the shape → confirm Save disables → re-draw → confirm Save re-enables.

## Future work (out of scope)

- Coexistence mode: toggle between visual editor and raw-GeoJSON paste, for power users importing from external GIS tools.
- Region-inferred initial center: on Create, infer map center from the typed region name by looking up existing AreaBoundary rows in the same region. ~50 lines + ~5 tests. Deferred until admins complain about scrolling.
- Self-intersection validation hook (geoman provides `pm:create:invalid`).
- Layer switcher (OSM streets / Esri satellite).
- Dirty-state confirm prompt on dialog close with unsaved geometry.
- Standalone `/patrol-areas/new` and `/patrol-areas/:id/edit` routes for full-viewport editing of large/complex shapes.
- 5.1d Area A inline re-derive on `areaName` change (DEFERRED bucket item 3 — still blocked on ER sync emitting `area_name`).
