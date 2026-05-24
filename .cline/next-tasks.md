# Next Tasks — Locked Queue: Area Boundary Management UI (created 2026-05-23)

**RULE FOR NEXT SESSION:** Load this file FIRST. Work tasks in order. Do not suggest, propose, or start any task outside this list until both sub-batches are DONE. Mark each task `[x]` with timestamp when complete.

## Context (carried from 2026-05-23 session)
Closes two genuinely-deferred items from Batch 5:
- 5.1e admin rebuild button lives as a stub on `/patrol-areas` placeholder because the full management page doesn't exist yet
- 5.1d Area A (sync inline re-derive on `areaName` change) was deferred for lack of a UI surface to ingest `area_name` through

Plumbing all exists: `areaBoundary.list / getById / create / update / delete / rebuild` tRPC procedures live in `apps/web/src/server/trpc/routers/areaBoundary.ts`. Schemas live in `packages/shared/src/schemas/area-boundary.ts` (`createAreaBoundarySchema` + `updateAreaBoundarySchema`). Enums: `boundarySourceSchema` ∈ {official, custom}, `geometryTypeSchema` ∈ {Polygon, LineString}. CUD mutations fan out to area-rederive queue via `fanOutAreaRederive`. `rebuild` mutation writes `PLATFORM:AREA_REBUILD` AuditLog when super_admin crosses tenants.

## Design decisions (locked at end of 2026-05-23 session before saving this queue)
1. **Expand `/patrol-areas` rather than create separate `/admin/area-boundaries`.** Same sidebar entry, conditional admin actions per role. The 5.1e comment anticipated separate admin page but cleaner UX is one surface — operators see read-only table, admins see create/edit/delete row actions + create button + rebuild button in header.
2. **Raw GeoJSON textarea for create/edit.** Map preview (read-only Leaflet) and map drawing (polygon editor) are deferred — future sessions. Admin pastes GeoJSON from ArcGIS export or external source. Validation: parse JSON → confirm it matches the declared `geometryType` (Polygon → has `coordinates: [[[lng,lat],...]]`, LineString → has `coordinates: [[lng,lat],...]`).
3. **Ship as 2 commits within next session.** A.1 first (foundation — list + delete + rebuild button relocation), then A.2 (create + edit dialogs). If session token budget gets tight at A.1 finish, stop and let user re-trigger A.2 in a fresh session.

## Sub-batch A.1 — List + Delete + relocate rebuild button ✅ COMPLETE 2026-05-24

**Scope:** Operators see read-only table of all enabled area boundaries for their tenant. Admins see same table plus edit/delete row actions + a "Create Area" button (disabled stub until A.2) + rebuild button moved to page header. Filter chips: region (text input), isEnabled (all/enabled/disabled), source (all/official/custom).

**Subtasks:**
- [x] 2026-05-24 — `apps/web/src/app/(dashboard)/patrol-areas/page.tsx` rewritten: client component, useSession-gated isAdmin, header with disabled Create stub (admin-only, `title="Available in A.2"`) + RebuildAreaBoundariesButton, body = AreaBoundaryTable, root-level DeleteAreaBoundaryDialog on deleteTarget state.
- [x] 2026-05-24 — `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx` NEW — cursor pagination matching users-page pattern, 3-filter row (region debounced + isEnabled tri-state + source tri-state), 7 columns + role-gated Actions column with Edit-stub (disabled, same A.2 tooltip) + Delete buttons.
- [x] 2026-05-24 — `apps/web/src/app/(dashboard)/patrol-areas/delete-area-boundary-dialog.tsx` NEW — fan-out warning copy with boundary name in <strong>, invalidates list query on success, dedicated `data-testid="delete-success-close"` to avoid shadcn Dialog sr-only Close collision.
- [x] 2026-05-24 — `apps/web/src/app/(dashboard)/patrol-areas/__tests__/area-boundary-table.test.tsx` NEW — 14 cases covering rendering, role gating, filter pass-through, debounce, empty/loading/Load-more states.
- [x] 2026-05-24 — `apps/web/src/app/(dashboard)/patrol-areas/__tests__/delete-area-boundary-dialog.test.tsx` NEW — 11 cases covering confirm/cancel, mutation payload, success singular/plural copy + invalidate, error render, pending-state disables.
- [x] 2026-05-24 — In-scope router addition (not in original queue text): `apps/web/src/server/trpc/routers/areaBoundary.ts` +2 lines: source filter added to list input + where clause, mirrors existing isEnabled.
- [x] 2026-05-24 — pnpm typecheck (web) + pnpm lint (web) + pnpm vitest run (web): clean, 488/488 (was 463 → +25 new) — matches queue prediction.
- [x] 2026-05-24 — Commit message: `feat(area-boundaries): Patrol Areas page table + delete + header rebuild button (A.1)`.
- [x] 2026-05-24 — Governance: 🟢 change entry prepended to lessons.md; STATE.md rewritten with PHASE updated and A.2 reminder.

**Estimated tier:** Tier 1-2 (5 files, 1 module).
**Estimated token cost:** ~40-50K main-session tokens.

## Sub-batch A.2 — Create + Edit dialogs ⏳

**Scope:** Admin can create new area boundaries from raw GeoJSON paste, and edit existing ones (name, aliases, region, isEnabled toggle, overrideOfficial toggle). Source + geometryType locked after create (would require re-validating geometry). Each create + each edit fans out area-rederive — already wired server-side.

**Subtasks:**
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/create-area-boundary-dialog.tsx` NEW — Form fields: name (text), region (text), aliases (comma-separated text → array, OR chip input), source (select: official/custom), geometryType (select: Polygon/LineString), geometryGeojson (textarea — paste raw GeoJSON), isEnabled (switch, default true), overrideOfficial (switch, default false), arcgisReferenceId (text, optional). Client-side validation: parse geometryGeojson as JSON; if Polygon, validate `coordinates` is array of arrays of [lng,lat] pairs; if LineString, validate `coordinates` is array of [lng,lat] pairs. Submit via `trpc.areaBoundary.create.useMutation`. Success: show "X jobs enqueued for rederive" + close + invalidate list query.
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx` NEW — Subset of create fields, pre-filled. Lock source + geometryType + geometryGeojson (display only — admin edits via delete + recreate if geometry changes). Allow name, aliases, region, isEnabled, overrideOfficial, arcgisReferenceId to change. Submit via `trpc.areaBoundary.update.useMutation`. Success: show "X jobs enqueued" if any rows updated + close + invalidate list query.
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/area-boundary-table.tsx` — enable Edit button (was stub in A.1), wire to EditAreaBoundaryDialog.
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/page.tsx` — enable Create button (was stub in A.1), wire to CreateAreaBoundaryDialog.
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/__tests__/create-area-boundary-dialog.test.tsx` NEW — vitest jsdom. Covers: form validation rejects invalid GeoJSON, Polygon validation requires nested array, LineString validation requires flat array, source defaults to "custom", isEnabled defaults true, mutate called with correct payload, success closes dialog, error shows message.
- [ ] `apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx` NEW — vitest jsdom. Covers: pre-fills from initialBoundary prop, locked fields are read-only, partial update submits only changed fields, success closes, error shows.
- [ ] Run pnpm typecheck + pnpm lint + pnpm vitest run — all green before commit.
- [ ] Commit message: `feat(area-boundaries): create + edit dialogs with raw GeoJSON validation (A.2)`.
- [ ] Governance: append 🟢 change entry to lessons.md (extend the A.1 entry or write fresh), rewrite STATE.md.

**Estimated tier:** Tier 1-2 (5 files, 1 module).
**Estimated token cost:** ~40-50K main-session tokens.

## Deferred (do NOT include in this queue — future sessions)
- **Map preview (read-only)** — Leaflet/react-leaflet 5.x client island that renders all enabled polygons next to the table. Pattern reference: existing print-render Leaflet usage in `apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/page-3-area-covered.tsx`. SSR-safe via "use client" boundary.
- **Map drawing (polygon editor)** — leaflet-draw / Leaflet.Editable plugin for in-browser polygon creation + editing. Replaces the raw GeoJSON textarea. Larger lift; needs own session.
- **5.1d Area A** (sync inline re-derive on `areaName` change in events/patrols/fuel-entries) — still gated on `area_name` ingestion through the ER sync engine. Not unblocked by A.1 + A.2.

## Completion gate
When both sub-batches marked `[x]`: delete this file, ask user what's next. NOT before.
