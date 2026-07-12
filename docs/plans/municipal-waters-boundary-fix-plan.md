# Municipal Waters Boundary + Attribution Fix — Plan & Root-Cause

**Date:** 2026-07-13 · **Branch:** `feat/report-portrait-colors-maps` (local-only; branch-only policy)
**Trigger:** Owner reported (Interactive Report Map, Jan 2025→now): Calapan City "a lot missing", many
of its events showing under Baco; clicking a "Baco"-labelled Marine wildlife sighting flies the map to
Calapan. Owner: recheck all municipal land/water boundaries vs PH law; apply correct boundary
rulings + filtering to every municipality + Command Center.

## Root Cause (PROVEN — DB forensic + code trace)

1. **Read paths filter by attribute, plot by coordinate.** Report Map (`map.ts`, `reportMap.ts`) and
   Command Center filter events/patrols purely on the stored `Event.municipalityId` column
   (`buildMunicipalityScopeWhere` → equality / `in`). Markers + list→map fly-to use the event's own
   `locationLat/Lon` (`InteractiveMap.tsx`, `event-type-events-panel.tsx`). No spatial check anywhere.
   → Any row whose `municipalityId` disagrees with its point → "labelled Baco, plots in Calapan".

2. **`municipalityId` is mis-assigned at attribution time.** `assignMunicipalityToPoint` /
   `...OrNearest` stage 2 (`containingWaterMunicipality`, `packages/shared/src/lib/municipality-assignment/index.ts:89`)
   returns the **FIRST** municipality in `findMany` order whose `waterGeojson` contains the point.
   No `orderBy` → arbitrary DB order, **not nearest coastline**.

3. **Water polygons overlap massively.** `derive-municipal-waters.ts:79` builds each water polygon as
   `buffer(land, 15km) − union(all land)` — independent buffers, overlap explicitly accepted
   ("imaginary line", owner 2026-06-29). Forensic: **244/257 Baco-assigned events fall inside BOTH
   Baco's and Calapan's water polygons.** The shared-bay point silently goes to whichever muni is
   ordered first (Baco).

4. **Scale (dev DB):** By nearest-coastline (equidistance), **210/257 (82%) of Baco's events belong to
   Calapan** — incl. ALL 15 marine wildlife sightings. Calapan shows only 5 water events (starved);
   San Teodoro 0 water, Puerto Galera 0 water (swallowed by neighbours). Province-wide, not just Baco.

5. **Latent inconsistency:** live ingest processor uses UNCAPPED `assignMunicipalityToPointOrNearest`
   for events; `backfill-municipality-assignment.ts` uses CAPPED `assignMunicipalityToPoint` → same
   coords can differ by path.

## Legal basis
PH municipal waters = 15 km seaward of the coastline (RA 7160 §131; RA 8550 / RA 10654 Fisheries Code).
Between adjacent/opposite municipalities <30 km apart the boundary is the **median (equidistance) line**
(RA 8550 IRR / NAMRIA delineation). Operative rule: **a water point belongs to the NEAREST
municipality whose coast is within 15 km.**

## Fix

### FIX A — Assignment equidistance tie-break (REQUIRED, surgical, TDD) ✅ primary
`containingWaterMunicipality`: among ALL municipalities whose `waterGeojson` contains the point, return
the one whose LAND polygon (`boundaryGeojson`) is NEAREST (`pointToPolygonDistance`). = median-line rule.
Fixes both `assignMunicipalityToPoint` and `...OrNearest` (+ `assignMunicipalityToDominantTrack`,
which calls the former) in one place. Land stage unchanged (land polygons are exclusive).

### FIX A2 — Unify backfill with live (REQUIRED)
Re-attribute events via `reassign-event-municipalities-nearest.ts` (uncapped, matches live processor)
and patrols via `reassign-patrol-municipalities-dominant.ts`. Re-classify terrain.

### FIX B — Non-overlapping water geometry (DEFER-if-not-verifiable) ⚠ owner-review
Regenerate each `waterGeojson` as `buffer(15km) − union(all land) − (regions nearer another muni's
coast)` = median-line partition (zero overlap). Auto-verify: no point inside two water polygons.
Reverses the 2026-06-29 "imaginary line" owner decision → surface for owner sign-off before deploy.
FIX A already makes counts/filtering/labels correct without this; FIX B only cleans the visual overlay.

## Verification
- Unit: TDD test — overlapping water polygons resolve to nearest-coast muni (RED→GREEN).
- Data: re-run pip forensic — Baco ~47 (was 257), Calapan regains ~210, San Teodoro/PG regain water,
  no event assigned to a muni when another muni's coast is strictly nearer.
- Gate: product-sync · typecheck · web vitest · `turbo lint` · `pnpm --filter @marine-guardian/web build`.
- Rebuild dev app+worker so the live processor uses the fixed lib.
- Command Center + Report Map correct automatically (attribute-based on fixed `municipalityId`).

## Guardrails
- LOCAL commits only. NO staging/prod/demo deploy (branch-only policy). Owner-gated.
- Snapshot any regenerated geometry (MunicipalityBoundarySnapshot) before replace.
