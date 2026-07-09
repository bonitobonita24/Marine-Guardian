# Generic Boundaries + Geographic Hierarchy — Design & TODO

> **Status:** APPROVED 2026-07-08 — building Phase 1. Owner locked all PM recommendations: **D1** keep two tables behind one unified "Boundaries" UI · **D2** fixed 3 provinces · **D3** municipal child-include default OFF · **D4** snapshot prior geometry + UI restore · **D5** water geometry allowed on child boundaries.
> **Owner directives:** 2026-07-08 (this session). Supersedes the narrow "municipal land/water upload — Option A" task; that task is now **Phase 1–3** of this larger plan.
> **Deploy discipline:** branch-only. Each phase = its own feature branch → gate → dev Visual QA → commit to branch → STOP → await explicit "push it". Nothing reaches GitHub/staging/prod without the owner's word.

---

## 1. The Vision (owner, 2026-07-08)

The system should stop treating these areas as strictly **"municipal"** and instead treat them as **generic, named Boundaries** whose first-class distinction is **LAND vs WATER**. Municipalities are just the boundaries we happen to have loaded first.

- A boundary has a **free name** ("name it whatever it is") and a **kind**: `municipality | mpa | hotspot | custom`.
- A boundary carries **land** geometry and/or **water** geometry (either can be uploaded/replaced).
- All boundaries appear in one selector — today's **"Municipality"** dropdown is **renamed "Boundaries"** (rename can land later; UI label first).
- Everything is **frontend-manageable** — no more seed-file / CLI-only geometry.

### Geographic hierarchy (3 levels)

```
PROVINCE            Palawan · Occidental Mindoro · Oriental Mindoro   (top aggregation)
  └─ MUNICIPALITY   kind=municipality, picks ONE of the 3 provinces
       └─ CHILD     kind = mpa | hotspot | custom, picks its parent municipality
```

- **Province-wide report** → includes **all** land + water events/patrols of every municipality under that province.
- **Municipal-wide report** → events/patrols of that municipality, with an **option to include or exclude its child boundaries** (MPAs / hotspots / custom).

---

## 2. Current State (ground truth from code, 2026-07-08)

| Concept | Where it lives today | Notes |
|---|---|---|
| **Province** | `Municipality.province: String` (`schema.prisma:1099`); seeded from `apps/web/src/data/coverage/coverage-areas.ts` | 3 values already: Oriental Mindoro, Occidental Mindoro, Palawan. **Free string, not a model.** Used for display grouping in the filter selector. |
| **Municipality** (land+water) | `model Municipality` (`schema.prisma:1094`): `boundaryGeojson` (land, `:1101`), `waterGeojson` (water, nullable, `:1104`) | 16 seeded. Exclusive **Layer-1** assignment via `municipalityId` FK on Event/Patrol. Geometry comes ONLY from seed + `scripts/derive-municipal-waters.ts` — **no frontend path to replace a municipality's own polygon.** |
| **MPA / special-area** | `model ProtectedZone` (`schema.prisma:1122`): `category` (`:1131`), `boundaryGeojson` (land only), `parentMunicipalityId` (`:1133`) | Uploaded via the **shipped** uploader. Overlapping **Layer-2** via `EventCoveredZone`/`PatrolCoveredZone` many-to-many. **No water geometry today.** |
| **Uploader (shipped)** | `add-mpa-from-file-dialog.tsx` → `municipality.createBoundaryFromUpload` (adminProcedure) | Creates **ProtectedZone** rows only (kinds: mpa, special_area). Reuses `parse-kml-file.ts` (browser) + `mpa-geojson.ts` (server validate). **Never touches Municipality geometry.** |
| **Assignment** | `assignMunicipalityToPoint` (`packages/shared/src/lib/municipality-assignment/index.ts:143`) | Uses **land polygon only** + a 15 km distance-to-land ring. **Ignores `waterGeojson`.** Runs as BullMQ `municipality-assign` job (per Event upsert / Patrol track) + `scripts/backfill-municipality-assignment.ts` (CLI). |
| **Foot / seaborne** | `enum PatrolType { foot, seaborne }` — `Patrol.patrolType` | **Self-reported patrol mode**, drives track color + show/hide only (`TrackLegend.tsx`). NOT spatial. Events have no such attribute. |
| **Report filter** | `{ from, to, municipalityId, protectedZoneId }` | No province-level filter, no terrain (land/water) filter today. |

**Two-layer model is deliberate:** Layer-1 (exclusive, single FK) for space-tiling areas that don't overlap (municipalities); Layer-2 (overlapping, many-to-many) for areas that sit *inside* others (MPAs/hotspots). This constraint drives the design below.

---

## 3. Target Model

### 3.1 Boundary kinds → layer mapping

| Kind | Layer | Assignment | Parent | Geometry |
|---|---|---|---|---|
| `municipality` | **L1 exclusive** (`municipalityId` FK) | point-in-land-polygon, then **point-in-water-polygon (NEW)**, then 15 km ring fallback | **Province** (1 of 3) | land + water |
| `mpa` / `hotspot` / `custom` | **L2 overlapping** (covered-zones) | point-in-(land ∪ water) → covered | **Municipality** | land and/or water |

Kind implies the default layer, so no separate manual "layer" toggle is needed for v1.

### 3.2 Assignment algorithm change (owner-approved this session)

`assignMunicipalityToPoint` gains a water-containment stage:

```
1. inside a municipality LAND polygon      → that municipality
2. inside a municipality WATER polygon      → that municipality        ← NEW (uses waterGeojson)
3. else within 15 km of nearest land        → nearest municipality      ← existing fallback
```

### 3.3 Province

- Kept as a **fixed selection of 3** for now (Oriental Mindoro, Occidental Mindoro, Palawan), selectable when uploading a `municipality`-kind boundary. Making provinces user-manageable is a later, optional extension.

### 3.4 Reporting rollups

- **Province filter** (new): selecting a province rolls up all municipalities (and their land+water events/patrols) under it.
- **Municipal report → "Include child boundaries" toggle** (new): default **OFF** (municipal figures stay clean); when ON, folds in events/patrols of child MPAs/hotspots/custom under that municipality.

### 3.5 Terrain (Land / Water) filter — the "foot/seaborne" purpose

- New **spatial** classification derived from the boundary polygons: a point/track inside land geometry = **Land**, inside water geometry = **Water**. Surfaced as a filter `Terrain: [ All | Land | Water ]` on the report map + command center.
- **Orthogonal** to the existing `Patrol.patrolType` (foot/seaborne) track-color toggle — the two do not merge (a foot patrol can physically be over water). Naming will make the distinction clear (Terrain = spatial; foot/seaborne = self-reported mode).

---

## 4. Open Decisions (lock before the relevant phase)

- **D1 — Table strategy (before Phase 1).** Keep `Municipality` + `ProtectedZone` as two tables behind ONE unified "Boundaries" UI (RECOMMENDED — lowest risk, no mass `municipalityId` FK rename across ~35k events + reports + dashboard), **or** merge into a single `Boundary` table now (cleaner, much bigger/riskier migration). _PM recommendation: keep two, unify the UI; rename the column "later" as you said._
- **D2 — Province management (before Phase 4).** Fixed 3-option list now (RECOMMENDED), or make provinces user-creatable too?
- **D3 — Municipal "include children" default (before Phase 4).** Default OFF (RECOMMENDED) vs ON.
- **D4 — Restore semantics (before Phase 1).** On destructive replace of a boundary's geometry, snapshot the prior geometry so "Restore to official/previous" works from the UI (RECOMMENDED) vs rely on re-running seed/derive scripts (CLI).
- **D5 — Child boundary water geometry.** MPAs/hotspots currently have land only. Allow water geometry on child boundaries too (RECOMMENDED — matches "land/water priority") vs land-only for children.

---

## 5. Phased Build Plan (branch-per-phase, gated, nothing pushed without approval)

Each phase: `feat/<slug>` branch → implement (Opus plans, Sonnet executes per V32) → HARD GATE (`check-product-sync · typecheck · turbo lint · vitest · web build` + `pnpm audit`) → dev container rebuild + Playwright Visual QA → commit to branch → **STOP** → await "push it".

### Phase 1 — Municipal land/water upload + water-containment assignment  *(the original approved task)* — ✅ DONE 2026-07-08 (branch `feat/municipal-land-water-upload`, gated + Visual-QA green, NOT pushed)
- [x] Extend the uploader dialog with a "Boundary type" mode → **Municipal land/water boundary**: municipality picker + **Land/Water** + file + destructive replace warning. Existing MPA/special-area flow untouched. *(Province + creating a NEW municipality from upload deferred to Phase 2 — the generic manager; Phase 1 replaces geometry of an EXISTING municipality only.)*
- [x] New mutation `municipality.replaceBoundaryGeometry` (adminProcedure): **replace** `Municipality.boundaryGeojson` (land) or `waterGeojson` (water) with server-validated geometry; snapshots prior geometry into `MunicipalityBoundarySnapshot` first (D4).
- [x] `assignMunicipalityToPoint` (+ `-OrNearest`): added water-polygon containment stage (§3.2); processor + backfill selects pass `waterGeojson`. Unit tests: land-hit, water-hit, ring-fallback, skip — 207 pass.
- [x] Re-derivation: reuses the exact `fanOutAreaRederive` helper (`areaBoundary.rebuild`) → re-derives all events/patrols/fuel; re-runs `importOfficialBoundaries` so the outline redraws. Returns `enqueuedJobs`.
- [x] AuditLog `MUNICIPALITY_BOUNDARY_REPLACE`.
- **Gate:** check-product-sync ✓ · typecheck 7/7 ✓ · turbo lint 6/6 ✓ · vitest (web 1660 + shared 207) ✓ · web build ✓ · audit (1 moderate only) ✓. **Visual QA:** 0 console errors; new mode renders + submit-gating + warning verified on dev.

### Phase 2 — Generic "Boundaries" management surface (Full Manager)
> **Slice 1 ✅ DONE 2026-07-08** (branch `feat/boundaries-manager`, off Phase 1; gated + Visual-QA green, NOT pushed). The Boundaries page already unified municipal land/water + MPAs (via the `AreaBoundary` derived overlay; title already "Boundaries"), so this slice added the missing *management affordances*:
> - [x] Per-row **"More" dropdown** on official municipal land/water rows (MPA rows excluded via `^official:(.+):(land|water)$` ref match + `municipality.list` slug lookup): **Replace geometry** (prefilled municipality+kind → Phase 1 `replaceBoundaryGeometry`) and **History** (snapshot list + rollback).
> - [x] Backend rollback: `municipality.listBoundarySnapshots` + `municipality.revertBoundaryGeometry` (reverts to a chosen snapshot's geometry; itself reversible; `Prisma.JsonNull` for the water-null case; re-derive + overlay + audit `MUNICIPALITY_BOUNDARY_REVERT`). Completes the D4 rollback promise (was write-only before).
> - Gate green (typecheck · turbo lint · vitest 1660 · web build · audit) — fixed an area-boundary-table test whose trpc mock lacked `useUtils`/`municipality.list`. Visual QA 0 console errors.
>
> **Remaining Phase 2 (later slices, deferred):**
- [x] Per-row **geometry thumbnail** in the table — **DONE 2026-07-08** (lightweight inline SVG per row via `boundary-geometry-thumbnail.tsx`, not Leaflet; renders each boundary's actual polygon shape next to the type label). Gate green + Visual QA verified.
- [x] `kind` taxonomy expansion — **land kinds DONE 2026-07-08** (`mpa|special_area` → `+hotspot|custom`). **create-NEW-municipality-from-upload with Province picker — DONE 2026-07-09** (branch `feat/boundaries-phase2-create-municipality`, off `feat/ph-tenant-slug`, LOCAL/unpushed): new adminProcedure `municipality.createMunicipalityFromUpload` (name + geojson + province `z.enum` of the fixed 3; geometry → `boundaryGeojson` land, water added later via Phase-1 `replaceBoundaryGeometry(kind:water)`; slug-uniqueness CONFLICT guard; `importOfficialBoundaries` overlay redraw + `fanOutAreaRederive` full-tenant re-derive + AuditLog `MUNICIPALITY_UPLOAD_CREATE`) + 5 unit tests (happy/dupe/bad-province/bad-geometry/non-admin). Migration NOT needed (province is already a free `String`, enforced in Zod/UI only, D2).
- [x] **D5 — child-boundary land/water — DONE 2026-07-08** (design refined from two-column to classifier): added `ProtectedZone.terrain` (`land|water`, default land) — a *single* geometry tagged land/water, NOT a separate water column (an uploaded MPA/hotspot is one area, either land or water). `createBoundaryFromUpload` gains a `terrain` input; the create dialog gains a Land/Water select. **Zero coverage/import change** (terrain is metadata feeding the Phase 3 filter). Migrations `..210000` (added then) + `..220000` (dropped water_geojson, added terrain). Gate green + Visual QA 0 errors.
- [x] Relabel remaining in-dialog terminology — **DONE 2026-07-09** (dialog description branches per kind; municipality-create success copy; grep confirmed the create dialog is NOT next-intl-wired, so no `messages/*.json` change — hardcoded-string edits only).
- [x] Fold the MPA/special-area create path fully into one unified create surface — **DONE 2026-07-09** (branch `feat/boundaries-phase2-create-municipality`): `add-mpa-from-file-dialog.tsx` create mode now has ONE "Boundary kind" select — `New municipality | MPA | Hotspot | Custom boundary`. Kind=municipality → Province select (fixed 3), no terrain/parent, routes to `createMunicipalityFromUpload`; kind=mpa/hotspot/custom → existing parent-municipality + Terrain, routes to `createBoundaryFromUpload` (`CREATE_KIND_TO_CATEGORY` map). Phase-1 `municipal_boundary` REPLACE mode untouched. Invalidates `municipality.list` + overlay + `areaBoundary.list` on muni-create success. Gate GREEN (check-product-sync · typecheck 7/7 · turbo lint 6/6 · web build · vitest web 1666/shared 221/jobs 250 · audit exit 0 1-moderate) + dev Visual QA 0 console errors (kind→province conditional, gating, 3 provinces all verified live on /ph). **Phase 2 remaining work COMPLETE.** Owner-gated STILL-DEFERRED: push any branch · /ph rollout to staging/demo/prod · Phase 4 (Province rollup + child include/exclude).

### Phase 3 — Terrain (Land / Water) filter
- [ ] Derive land/water classification for events (point) + patrols (dominant track) from boundary geometry; store/compute + backfill.
- [ ] Add `Terrain: [All | Land | Water]` to the report-map + command-center filters (kept distinct from the foot/seaborne track toggle).

### Phase 4 — Hierarchy reporting (Province rollup + child include/exclude)
- [x] Province selector in the report filter → rolls up all municipalities under the province — **DONE 2026-07-09** (branch `feat/boundaries-phase4a-province-rollup`, off Phase 2 branch, DEV-only LOCAL/unpushed). New `province?` on `reportFilterInput` + map.ts `eventsListInput`/`patrolTracksInRangeInput` + PDF `parseReportMapParams`; shared `apps/web/src/server/reporting/municipality-scope.ts` (`resolveMunicipalityScope` — municipalityId wins over province; else province→muni ids — + `municipalityScopeClause`); reportMap DRY-refactored onto it; all reportMap + map aggregations, the report-map view + InteractiveMap markers/tracks, generate-printable, and the PDF data path (province-named regional report) thread it. New Province `<Select>` (context + bar) narrows the municipality select to the province's munis and clears any specific municipality. Gate GREEN (check-product-sync · typecheck 7/7 · turbo lint 6/6 · web build · vitest web 1687/shared 221/jobs 250 · audit exit 0). Dev Visual QA vs SQL ground truth: Palawan events 1086 (LE 104+Mon 982) ✅ / patrols 1586 ✅; Araceli muni-wins-over-province events 517 ✅ / patrols 720 ✅; province options = exactly 3; 0 console errors.
- [ ] Municipal report **"Include child boundaries"** toggle (D3 default) — folds child MPA/hotspot/custom events/patrols into the municipal report; reflected in PDF export + on-screen figures. *(Phase 4B — next milestone.)*
- [ ] Verify province/municipal aggregations across dashboard + PDF report paths. *(Province aggregations verified vs SQL on the report map + PDF path; the Command Center dashboard has no province filter yet, and the `municipalityCoverage` comparison chart is intentionally NOT province-narrowed — minor follow-up.)*

---

## 6. Risks & Safety

- **Destructive replace.** Always snapshot prior geometry before overwrite (D4) so a bad upload is reversible from the UI. Back up staging/prod DB before any such op there.
- **Re-derivation cost.** ~35k events + ~4.6k patrols re-assigned per municipal geometry change → background job only, never synchronous. Surface progress; idempotent job IDs already exist.
- **Overlap ambiguity.** Only `municipality`-kind boundaries drive the exclusive FK; if two municipality polygons overlap, assignment is last-match/nearest — flag on upload, don't silently mis-assign. MPAs/hotspots are always Layer-2 (overlap is expected there).
- **Naming collision.** "Terrain (Land/Water)" spatial filter vs "foot/seaborne" patrol mode — keep labels distinct in UI + code to avoid confusion.
- **Scope creep.** This is a data-model generalization touching assignment, coverage, filters, PDF reports, and the dashboard. Strict phase boundaries + branch-per-phase keep each slice gate-able and reversible.

---

## 7. Not in scope (parked)
- Full `municipalityId` → `boundaryId` column rename across the codebase (do "later" per owner; UI relabel now).
- User-creatable provinces (D2 — later).
- Official Apo Reef coords (needs `PP_TOKEN`) — separate low-pri item.
