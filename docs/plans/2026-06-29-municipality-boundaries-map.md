# Plan — Municipality boundaries + ordered selector + focus-on-select + MPA filter

> **Status: IN PROGRESS (started 2026-06-29). Local dev only — deploy HARD HOLD stands.**
> Owner request (2026-06-29): show per-municipality boundary outlines (thin lines, **land + water**)
> on **both** the Command Center map and the Interactive Report Map; order the municipality
> selector by the owner's province-grouped list; focus/fit the map to a municipality's full
> extent when selected; and allow scoping events/patrols to just an MPA zone.
> Builds on the existing design doc `docs/superpowers/plans/2026-06-23-municipality-coverage-stats.md`
> (geoBoundaries source, 15 km water-derivation algorithm). This plan is the execution layer.

## Owner-locked decisions (2026-06-29)
1. **Water boundary fidelity:** Land boundary + derived **~15 km municipal-water** ring (the legal PH
   municipal-waters zone). Approximate ("imaginary line"), matches the codebase's stated design.
2. **MPAs (Apo Reef, Harka Piloto):** drawn as **overlay outlines inside their parent municipality**
   (NOT separate dropdown entries). Selecting the parent (Calapan / Sablayan) shows ALL its
   events/patrols incl. the MPA area. PLUS a **filter option** to scope events/patrols to ONLY a
   given MPA zone (uses existing `EventCoveredZone` / `PatrolCoveredZone` join tables).

## Owner's canonical coverage list (selector order)
**Oriental Mindoro:** Calapan City *(+ Harka Piloto MPA overlay)*, Baco, San Teodoro, Puerto Galera
**Occidental Mindoro:** Abra de Ilog, Mamburao, Santa Cruz, Sablayan *(+ Apo Reef Park overlay)*, Calintaan
**Palawan:** Araceli, Roxas, Dumaran, El Nido, Taytay, Aborlan, Narra
(17 municipalities + 2 MPA overlays.)

## Current state (verified 2026-06-29)
- Registry `apps/web/src/data/coverage/coverage-areas.ts` = single source of truth, **already in this
  province order**. Has 12 municipalities + Apo Reef (PROTECTED_ZONES). Land-only polygons
  (geoBoundaries ADM3, MultiPolygon).
- **Missing geometry/registry:** Mamburao, Santa Cruz, Calintaan, El Nido, Narra (5 munis) + Harka Piloto MPA.
- No water polygons yet. `@turf/buffer|union|difference` NOT installed (other turf pkgs are).
- DB: `Municipality{slug,name,province,psgcCode,boundaryGeojson}` + `ProtectedZone{...,parentMunicipalityId}`
  + join tables `PatrolCoveredZone` / `EventCoveredZone` (MPA-filter data model READY).
  No `sortOrder` column — derive order from registry array index.
- Map: ONE shared `apps/web/src/components/map/InteractiveMap.tsx` used by BOTH
  `app/(dashboard)/dashboard/page.tsx` (Command Center) and `app/(dashboard)/map/_components/report-map-view.tsx`
  (Interactive Report Map). Already has `municipalityId`, `fitBounds`-to-data, and a `flyTo` focus hook.
  Does NOT yet render coverage boundaries.
- Selector source: `municipality.list` tRPC → `prisma.municipality.findMany(orderBy:{name:"asc"})` (alphabetical).
- Network to geoBoundaries confirmed (HTTP 200). geoBoundaries raw URL pinned in the design doc.
- Web pkg: `@marine-guardian/web`. Pre-merge gate (Rule 19): `pnpm --filter @marine-guardian/web build`.

## Execution phases (each task ≤500 lines, dispatched to Sonnet per V32)

### Phase A — Data foundation (blocks rendering)
- **A1** Source 5 missing municipality land polygons (Mamburao, Santa Cruz, Calintaan, El Nido, Narra)
  from geoBoundaries PHL-ADM3 (pinned URL in design doc), simplify (mapshaper-equivalent ~3%),
  write 5 `*.geojson`, add 5 registry entries in correct province slots.
- **A2** Source Harka Piloto MPA boundary (WDPA/OSM — mirror `scripts/fetch-apo-reef-wdpa.ts`),
  write geojson + PROTECTED_ZONES entry (parent = calapan-city).
- **A3** `scripts/derive-municipal-waters.ts` — per design doc §3a: turf.buffer(land,15km) → clip to
  remove land + resolve adjacent overlaps → produce **water ring** polygon per municipality.
  Add `@turf/buffer|union|difference`. Additive migration: `Municipality.waterGeojson Json?`.
- **A4** Reseed Municipality (all 17) + ProtectedZone (Apo Reef + Harka Piloto) with land + water
  geometry. Update `municipality.list` to return **canonical registry order** (sort by slug→index map).

### Phase B — Map rendering (shared InteractiveMap → both surfaces)
- **B1** Add thin-line boundary layer to InteractiveMap: land outline + water-ring outline for all
  municipalities; distinct style for protected zones. New tRPC `municipality.boundaries` (geojson).
  Toggle in map controls (default on). Applies to Command Center + Report Map automatically.
- **B2** Focus-on-select: when `municipalityId` set, `fitBounds` to that municipality's full extent
  (land∪water bbox). Wire from the selector on both surfaces.

### Phase C — Selector order + MPA filter
- **C1** Reorder selector to canonical province-grouped order (with province group headings) on both
  surfaces; show all 17 even at 0 events.
- **C2** MPA scope filter: control to scope events/patrols to a single MPA zone. Backfill
  `EventCoveredZone`/`PatrolCoveredZone` via point-in-polygon if empty; add filter param to reportMap
  router + InteractiveMap.

## Verification per task
- `pnpm --filter @marine-guardian/web build` + `pnpm typecheck` + `pnpm test` green before each merge.
- Visual QA (Playwright) on both maps after Phase B and Phase C (rebuild dev_app FIRST — no bind-mount).
- Each phase = its own commit on `feat/municipality-boundaries-map`; squash-merge to main after gate.

## REVISED ARCHITECTURE — 2026-06-29 (owner: boundaries managed in Patrol Areas as "Official")

Owner clarified: do NOT hardcode boundaries for display — they must be **saved + managed in the
frontend (Patrol Areas) as "Official" records**, sourced from EarthRanger / trusted sources.
Decision (owner): **"One source feeds both"** — official boundaries live + are managed as
`AreaBoundary` records (source=official); the SAME trusted import keeps the analytics tables
(`Municipality`/`ProtectedZone`) in sync. Single managed source; existing coverage charts/selector
keep running untouched.

KEY: the system ALREADY supports this — `AreaBoundary` has `source BoundarySource(official|custom)`,
`overrideOfficial`, `arcgisReferenceId`, full Patrol Areas CRUD (create/edit/delete/preview +
map-draw editor, admin-gated), and InteractiveMap ALREADY renders area polygons (line ~455-462,
`area.polygonGeojson` + `area.colorHex`). Events/Patrols already FK to AreaBoundary.

Revised remaining work (supersedes B/C below where they conflict):
- **IMPORT**: shared `importOfficialBoundaries(prisma, tenantId, userId)` + admin tRPC
  `areaBoundary.importOfficial` mutation + a Patrol Areas "Import Official Boundaries" button.
  Creates `source: official` AreaBoundary records — mirror ER's own model: separate LAND + WATER
  records per municipality (ER itself has "Calapan - Municipal Land" / "Calapan - Municipal Water"),
  plus one per MPA. ~16 land + 16 water + 2 MPA = ~34 official records.
  Provenance via `arcgisReferenceId` stable key, e.g. `official:<slug>:land|water`, `official:mpa:<slug>`;
  idempotent upsert by (tenantId, arcgisReferenceId) — find-first-then-create/update if no unique.
  Geometry source = the trusted coverage files already gathered (land geoBoundaries, water derived,
  MPAs ER/OSM). Same payload also seeds Municipality/ProtectedZone (A4 already does) → one source.
- **MAP**: confirm official AreaBoundary records render as thin land+water lines on both maps
  (existing area path); style official vs custom; distinct MPA style.
- **B2 fitBounds**: still wanted — zoom to selected municipality extent.
- **C1 selector order**: done via municipality.list (A4). Verify dropdown UI renders the order/grouping.
- **C2 MPA filter**: scope events/patrols to an MPA zone (EventCoveredZone/PatrolCoveredZone OR
  via the MPA's AreaBoundary FK).
- The coverage registry (coverage-areas.ts) + geojson files remain as the TRUSTED IMPORT SOURCE
  (provenance/seed data), NOT hardcoded UI display data.

## Risks / notes
- Water-ring overlaps between close municipalities: design doc §3a heuristic (assign contested strip to
  nearer land centroid) — accept approximate per owner decision #1.
- Harka Piloto MPA boundary may not be in WDPA; fallback = official Calapan MPA ordinance coords or a
  documented approximation (log in registry `source`).
- Keep geojson simplified (repo leanness) — match existing ~1e-4° precision.
