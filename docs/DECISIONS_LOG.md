# Decisions Log — Marine Guardian Command Center
# Format: ## [Decision Title] → Decision: [value] → Rationale: [why] → Locked: yes/no
# NEVER re-ask anything listed here.
# ---

## Dev Environment Mode
Decision: MODE A — WSL2 native (the only supported mode as of V25)
Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
Locked: yes — do not re-ask or scaffold devcontainer files.

## Git Branching Strategy
Decision: Branch-per-feature with squash-merge to main
Branch patterns: feat/{slug}, scaffold/part-{N}, fix/{slug}, chore/{slug}
Commit style: conventional (feat:, fix:, chore:, docs:)
Locked: yes

## Model Routing
Decision:
  planning:   claude-code (Phase 2 — V31 primary)
  execution:  claude-sonnet-4-6 via Claude Code (V31 primary; Cline deprecated)
  governance: gemini-2.5-flash-lite (cheapest, non-critical writes)
Locked: yes

## Navigation Approach
Decision: Hardcoded sidebar navigation — role-based static menu configuration
Rationale: Internal operations tool with fixed role structure. Menu items determined by user role
(super_admin, site_admin, field_coordinator, operator). No DB-driven navigation needed —
role permissions are stable and don't change at runtime.
Locked: yes

## EarthRanger Credential Encryption
Decision: AES-256-GCM with Prisma middleware — per-field column encryption
Rationale: Each tenant stores 5 ER credentials (URL, username, password, DAS token, track token)
encrypted at rest in the database. A single ENCRYPTION_KEY env var provides the master key.
Prisma middleware auto-encrypts on write and decrypts on read for fields marked as encrypted.
AES-256-GCM provides authenticated encryption (integrity + confidentiality) and is the standard
for at-rest column encryption. No separate key management service needed for v1 scale.
Locked: yes

## Git Worktrees for Phase 4
Decision: Enabled — git worktrees used for Phase 4 Part isolation
Rationale: Cleaner isolation per Part prevents incomplete scaffold from Part N breaking Part N+1.
Locked: yes

## Internationalization (i18n) Strategy
Decision: Static JSON translation files via next-intl
Languages: EN (English), ID (Bahasa Indonesia), MS (Bahasa Malaysia)
Rationale: EarthRanger-sourced data displayed as-is (original language from field reports).
UI chrome translated via static JSON files — simple, no runtime overhead, easy for non-devs to edit.
Locked: yes

## File Storage
Decision: Skipped for v1 — packages/storage NOT generated
Rationale: No file upload feature in v1. Files (photos, documents) hosted in EarthRanger.
Command Center references ER file URLs but does not store files itself.
Can be enabled later via Feature Update when needed.
Locked: yes

## Bot Protection (Cloudflare Turnstile)
Decision: Opted out for v1 — turnstile.enabled: false
Rationale: Internal operations tool with no public registration, no public-facing forms.
Only login page is accessible without auth. Rate limiting on auth endpoints provides
sufficient protection for v1. Can be enabled later if public routes are added.
Locked: yes

## Map Library
Decision: mapcn (MapLibre GL) — shadcn-native maps
Rationale: PRODUCT.md declares advanced map features — live tracking, heatmaps, patrol area
polygons, drawing tools, fly-to animations. These require vector tiles and GL rendering,
which exceeds Leaflet.js capabilities. mapcn is MIT, zero API key, auto-themes with shadcn dark mode.
Locked: yes — decision logged per ui-rules.md Rule 6 requirement.

## Dev Port Strategy
Decision: Random base port 45194 with fixed offsets (Rule 22)
Port assignments:
  PostgreSQL: 45194, PgBouncer: 45195, Valkey: 45196,
  MinIO API: 45197, MinIO Console: 45198, MailHog SMTP: 45199,
  MailHog UI: 45200, pgAdmin: 45201, App: 45204, Worker: 45205,
  Prisma Studio: 45214
Rationale: Non-standard ports prevent conflicts with other projects on the same dev machine.
Staging and production use standard ports (5432, 6379, 9000, 3000, etc.).
Locked: yes

## Docker Image Publishing
Decision: Enabled — bonitobonita24/marine-guardian on Docker Hub
Registry: docker.io (Docker Hub)
Repository: bonitobonita24/marine-guardian
Image name: marine-guardian
Tags: latest (main branch), staging-latest (staging auto-update), sha-{short} (every push)
Platforms: linux/amd64, linux/arm64
Trigger: push to main only (Rule 23 squash-merge guarantees clean main)
GitHub Secrets: DOCKERHUB_USERNAME + DOCKERHUB_TOKEN
Locked: yes

## Spec Stress-Test (Phase 2.7)
Decision: Enabled — vibe_test.enabled: true
Result: Passed with 0 gaps on 2026-05-02
Locked: yes

## pnpm CVE Override Strategy (Phase 5)
Decision: Use pnpm.overrides in root package.json to force patched transitive dependency versions
Rationale: bcrypt@5.1.1 → @mapbox/node-pre-gyp@1.0.11 → tar@6.2.1 chain has 6 HIGH CVEs.
tar@6.x cannot be directly upgraded (locked by node-pre-gyp). pnpm overrides force tar ≥ 7.5.11
across the entire monorepo without modifying third-party packages. pnpm audit --fix wrote 10 overrides;
pnpm install (non-frozen) regenerated the lockfile. Re-audit confirmed 0 vulnerabilities.
Additional overrides: esbuild, vite, postcss, next-intl (minor CVEs, same mechanism).
Process: pnpm audit --fix → pnpm install → pnpm install --frozen-lockfile (CI will now pass).
Locked: yes — do not remove overrides; update version bounds when packages publish fixes.

## mapcn Vendor File Lint/TS Suppression (Phase 8 Batch 2 — Interactive Map)
Decision: File-level `/* eslint-disable */` + `// @ts-nocheck` headers on `apps/web/src/components/ui/map.tsx`
Rationale: The mapcn registry primitive (1844 lines, MIT) ships with 64 ESLint errors and 4 TS18048
errors under our strict config. The file is registry-managed — `npx shadcn@latest add @mapcn/map`
regenerates it on every pull, so inline fixes would be clobbered. Mirrors the pattern obs 82 used
for `map.test.ts` in sub-session 1.1.
Scope: Suppression applies ONLY to the vendor file. The thin `InteractiveMap` wrapper
(`apps/web/src/components/map/InteractiveMap.tsx`) and the map page route are clean under strict mode.
Re-validate on every mapcn upgrade — strict-mode compliance may land upstream.
Locked: yes — until mapcn ships strict-compliant or we vendor a maintained fork.

## User Management Dialogs — Strict-Mode Lint Deferral
Decision: Three pre-existing dialog files carry 13 ESLint errors under strict config — deferred
to dedicated `fix/user-dialogs-strict-mode` branch rather than fixed inline on `feat/interactive-map`.
Affected files (all on main, byte-identical to feat/interactive-map HEAD as of 2026-05-11):
  - apps/web/src/app/(dashboard)/users/create-user-dialog.tsx (7 errors)
  - apps/web/src/app/(dashboard)/users/edit-role-dialog.tsx (4 errors)
  - apps/web/src/app/(dashboard)/users/reset-password-dialog.tsx (2 errors)
Error classes: deprecated `FormEvent` import (typescript-eslint/no-deprecated),
no-confusing-void-expression on arrow shorthand handlers, strict-boolean-expressions on nullable strings.
Rationale: Errors are pre-existing tech debt unrelated to the interactive map feature.
Fixing them on the map branch would violate scope discipline (one feature per branch — Rule 23).
~6/13 are auto-fixable with `--fix`; remaining 7 need manual edits. A dedicated branch keeps the
diff readable and the fix attributable.
Impact: 1.2c merge proceeds with these lint errors on main. CI lint gate currently fails on main
for this reason (pre-existing). The `fix/user-dialogs-strict-mode` branch is queued as a separate
work item — owner to claim before next Feature Update touching that module.
Locked: yes — deferral confirmed; do not block 1.2c merge on these errors.

## ReportExport PDF Storage Backend (Phase 8 Batch 5 Item 3)
Decision: MinIO bucket per environment — pattern `marine-guardian-{env}-exports`
Rationale: packages/storage is the locked OSS choice (Rule 14). Local-disk path per v2
PRODUCT.md L777 (`/uploads/exports/{tenant_slug}/{year}/{month}/{export_id}.pdf`) encourages
single-server lock-in and complicates backups (separate tarball per v2 L811). MinIO signed
URLs simplify download auth and align with the existing STORAGE_* env infrastructure (already
provisioned but `packages/storage` source not yet built). Storage surface (uploadPdf,
getReadStream, delete) builds in Sub-batch 5.3c. Per-tenant prefix inside the bucket:
`{tenantSlug}/{year}/{month}/{exportId}.pdf` — matches v2's path semantics without the disk
mount. 30-day retention enforced by extending the existing maintenance worker (deferred).
Locked: yes — packages/storage MinIO adapter is the only PDF persistence path. Disk fallback
flag rejected (option 3 from decision matrix) — adds adapter complexity without a self-host
business need at v1 scale.

## PDF Renderer Service Auth (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: Custom `X-PDF-Renderer-Token` header + 48-char shared secret + constant-time compare
Rationale: The marine-guardian-pdf-renderer Docker service exposes `/render` only over the
internal Docker network (no host port). The web app's `/print-render/*` print target also
guards on the same header so the renderer can prove its identity when navigating back. JWT
or mTLS would be over-engineered for a fixed pair of trusted internal services on the same
Docker network. Service-token pattern matches the v2 PRODUCT.md L774-775 spec ("service-token
auth header"). Token rotates via CREDENTIALS.md + .env.{env} + container restart. Constant-time
compare implemented manually (no node:crypto.timingSafeEqual) because the middleware runs in
Next.js Edge runtime where node:crypto is unavailable — see
apps/web/src/server/lib/service-token-guard.ts. Mirror impl in deploy/pdf-renderer/src/server.js.
Locked: yes — header name + comparison strategy frozen across web + renderer + worker (5.3b).

## Puppeteer Concurrency + Rate Limiter (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: BullMQ pdf-render worker concurrency=2, limiter={max:5, duration:1000}
Rationale: Chromium PDF rendering is heavy on CPU + memory (~300-500MB resident per browser
instance, ~1-3s per page render). Concurrency=2 caps two concurrent renders per worker
container — exceeds this risks OOM on smaller staging/prod hosts. Limiter 5/sec is a per-worker
queue ceiling that smooths bursty admin "rebuild all reports" actions without backlogging the
queue. Scale throughput by running multiple worker container replicas rather than raising the
in-process concurrency. v2 PRODUCT.md §776-779 typical latency 3-30s — concurrency=2 sustains
~40-160 reports/min per worker container. Tune in production based on observed Active CPU.
Locked: yes — defaults frozen for 5.3b; revisit only after production telemetry justifies a change.

## PDF Renderer Internal Route Path (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: Print-only render target lives at `/print-render/[tenantSlug]/[reportType]/[exportId]`
Rationale: v2 PRODUCT.md L724 specifies `/_print/{tenant_slug}/{report_type}/{export_id}` but
Next.js App Router treats folders prefixed with `_` as private folders that are excluded from
the routing system (`apps/web/src/app/_print/` would not generate a route). "Internal-only"
semantics are enforced by the X-PDF-Renderer-Token guard in middleware.ts (constant-time
compare bypasses the user-session auth gate, returns 401 without the header). The leading
underscore in the spec was conventional shorthand for "internal"; the service-token guard
makes that semantic explicit. URL-encoded folder name (`%5Fprint`) was considered and rejected
as it complicates tooling and IDE navigation.
Locked: yes — path frozen across web router + middleware guard + 5.3b BullMQ producer
(constructs printUrl from this template) + 5.3a Puppeteer service Dockerfile env.

## MinIO Client Library Choice (Phase 8 Batch 5 Sub-batch 5.3c)
Decision: `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (NOT the `minio` Node client)
Rationale: Both speak the S3 protocol that MinIO implements. AWS SDK gives a broader S3-compat
surface so the eventual migration to Amazon S3 (declared as an option in "ReportExport PDF
Storage Backend" above) is configuration-only — change `MINIO_ENDPOINT` to the S3 regional
endpoint and the same code paths run unchanged. The `minio` Node client is smaller and has a
MinIO-native API but locking to it would force a rewrite of packages/storage if the project
moves to AWS. `forcePathStyle: true` is required for MinIO compatibility and is also accepted
by AWS S3, so the configuration is portable. AWS SDK bundle cost is acceptable — the storage
package is only consumed by the worker process (server-side, no client bundle impact) and the
download Route Handler (already a Node runtime, not Edge).
Locked: yes — packages/storage uses @aws-sdk/client-s3 exclusively. `minio` Node client not in
the dependency tree and must not be added without revisiting this decision.

## ReportExport Download URL Shape (Phase 8 Batch 5 Sub-batch 5.3c)
Decision: `/api/exports/reports/${exportId}/download` (NOT v2 spec §506 `/${tenantSlug}/exports/${exportId}/download`)
Rationale: v2 PRODUCT.md §506 specifies a tenant-prefixed URL shape inherited from the broader
`/${tenantSlug}/*` URL convention. For the download endpoint specifically, the tenant prefix
is information leakage — the URL identifies which tenant a row belongs to, which a user without
the row's tenant access could discover by URL probing. The Route Handler enforces tenant scope
server-side via `session.tenantId` from `requireRouteAuth` (security.md L11 manual auth pattern)
so the URL no longer needs to carry tenantId. 404 (not 403) on cross-tenant access prevents
existence leakage. This is a controlled deviation from v2 §506 — the spec's intent (a download
URL that resolves to the right file for the right user) is preserved, only the URL shape changes.
Locked: yes — `reportExport.getDownloadUrl` returns the `/api/exports/reports/${id}/download`
shape; the Route Handler lives at apps/web/src/app/api/exports/reports/[id]/download/route.ts.
5.3d UI surfaces consume the URL via the existing `getDownloadUrl` tRPC procedure — no UI
change needed when this decision was made.

## ReportExport row.filePath Storage Convention (Phase 8 Batch 5 Sub-batch 5.3c)
Decision: `row.filePath` stores the S3 KEY only (`${tenantId}/${YYYY}/${MM}/${exportId}.pdf`)
— NOT the full bucket+key path (`marine-guardian-${env}-exports/${tenantId}/...`)
Rationale: Bucket name is environment-dependent configuration (`marine-guardian-{env}-exports`
varies per env); the key is per-export data that should not be coupled to deployment env.
Storing the bucket inside the DB row would couple data to its deployment env and break clean
cross-env data restores (e.g. dump prod → restore to staging would carry stale bucket names).
Bucket is derived at write+read time via `packages/storage.getExportsBucketName()` — the single
source of truth for the bucket shape. 5.3b stub temporarily stored the full bucket+key string,
but no production data exists yet (5.3b never wrote real uploads) so the shape change in 5.3c
is safe without a migration. Future restoration semantics: `key` is portable across envs as
long as the env-prefixed bucket exists.
Locked: yes — `row.filePath` always stores the key only. Code that reads `filePath` MUST pair
it with `getExportsBucketName()` to compute the full s3:// reference.

## Storage Feature Flag (Phase 8 Batch 5 Sub-batch 5.3c — Rule 9 sync)
Decision: `inputs.yml` storage.enabled flipped `false` → `true` + provider = `minio`
Rationale: 5.3a built the MinIO Docker infrastructure + env vars; 5.3c built the
packages/storage source surface that consumes them. Rule 9 (bidirectional governance) requires
`inputs.yml` to reflect the activated state of every package. Prior `storage.enabled: false`
was correct through Sub-batch 5.3b (no source consumed MinIO directly — the pdf-render
processor only wrote a stub path). Post-5.3c, storage is in active use by both the worker
process (uploadPdf) and the download Route Handler (getPdfReadStream).
Locked: yes — `storage.enabled` stays `true` for the remainder of the project. Disabling
storage would break the pdf-render pipeline + 5.3d admin UI.


## Coverage Report Page 2 Map Render Strategy (Phase 8 Batch 6 Sub-batch 6.1b)
Decision: Leaflet client-side + Puppeteer `window.__renderReady` wait flag — NOT static SVG composition.
Rationale: Page 2 (Area Boundary Summary) of the Coverage Report needs a basemap with patrol
tracks + filled cyan polygons + optional ArcGIS reference outlines. Static SVG composition
server-side was rejected because it produces no basemap context (white background only) which
makes the report less useful to funders. Leaflet client-side + Puppeteer wait is well-trodden
(established pattern across reporting toolchains), supports OpenStreetMap tiles for free, and
the ArcGIS reference layer fits naturally as a second Leaflet pane. Trade-off accepted: tile
network dependency adds 0.5-2s to PDF render time + requires the Puppeteer service to have
egress to tile.openstreetmap.org. Decision per v2 PRODUCT.md L771 note "Lock the decision in
DECISIONS_LOG.md".
Implementation: Page 2 client island sets `window.__renderReady = true` after both tile load
+ polygon paint complete. pdf-renderer service.js calls `page.waitForFunction(() =>
(window).__renderReady === true)` AFTER its existing `networkidle0` wait, with a swallow-catch
so pages without maps (e.g. coverage Page 1 only when no enabled boundaries exist) continue
to render fine. Timeout = 8s — generous enough for 256-tile mosaics, fast enough to fail loud
when egress is broken. Lock will also govern 6.1c Page 3 map.
Locked: yes — Leaflet + OpenStreetMap tiles + Puppeteer wait flag is the map render
contract for ALL future Coverage Report pages and any other report that embeds a map (Per Area
Report, future Quarterly Report). Static SVG composition is rejected for this report family.



## Coverage Clip Library Choice (Phase 8 Batch 6 Sub-batch 6.1c-i)
Decision: Narrow @turf/* modules — boolean-point-in-polygon + helpers + length + line-split,
all pinned at ^7.1.0 — NOT the full @turf/turf bundle, NOT @turf/intersect, NOT pure-math
hand-rolled clipping.
Rationale: Page 3 (Area Covered) of the Coverage Report — and every future report that
computes coverage_km / coverage_hrs per AreaBoundary (Per Area Report, future Quarterly
Report) — needs to clip patrol track LineStrings against enabled boundary Polygons. Three
options surfaced via AskUserQuestion at session start:
  • Narrow @turf/* modules (4 packages, ~60KB tree-shaken, MIT)
  • Full @turf/turf bundle (~200KB, MIT, more helpers for future reports)
  • Pure-math hand-rolled (Sutherland-Hodgman + haversine + point-in-polygon, ~250 LOC)
User selected the narrow-modules path. Justifications: (a) packages/shared minimalism — the
package has ~50 cumulative LOC of geometry math today across area-derivation; adding 4 narrow
deps is a smaller surface than 250 LOC of hand-rolled clipping that we have to test + maintain.
(b) Correctness — turf's lineSplit + booleanPointInPolygon have years of geospatial-edge-case
hardening (anti-meridian wrap, near-pole projections, polygon hole semantics). (c) Algorithm
clarity — the clip primitive reads as 5 sequential turf calls vs hundreds of lines of geometry.
@turf/intersect was rejected (polygon × polygon — wrong primitive for line × polygon clipping).
Full @turf/turf bundle was rejected (~200KB unnecessary for narrow surface; tree-shaking helps
but cleaner to depend only on what's used; future Per Area Report can add another @turf/*
module if needed). Pure-math was rejected (~250 LOC + correctness risk + slower velocity).
Implementation: packages/shared/src/lib/coverage-clip/ (5 src + 1 test file, 29 vitest cases).
Surface: clipTrackToBoundary(track, boundary) → ClipResult{totalKm, trackTotalKm};
computeCoverageHours(totalHours, coverageKm, trackTotalKm) → CoverageHoursResult{coverageHrs,
estimated}; accumulateCoverageByBoundary(patrols, boundaries) → AccumulatedCoverage{rows,
missingTracksCount}. LineString boundaries return 0 km (coastlines enclose no area); fallback
path classifies non-crossing tracks via first-vertex booleanPointInPolygon when turf.lineSplit
returns an empty FeatureCollection. Polygon holes (coordinates[1..]) NOT subtracted in 6.1c —
no enabled boundary uses holes today; future enhancement is mechanical.
Locked: yes — the coverage-clip module is the SINGLE source of truth for line × polygon
clipping across this codebase. Per Area Report + future Quarterly Report MUST consume the
same module — no second-source clip library. Bumping turf to a major version (e.g. v8 when
released) requires re-running the full 29-case test suite + verifying lineSplit empty-result
fallback still applies.



## Heatmap Renderer Choice (Phase 8 Batch 6 Sub-batch 6.2b)
Decision: leaflet.heat plugin (vanilla-Leaflet L.heatLayer) + ~250m track-point densification
for the patrol-track variant — NOT a custom density-grid SVG renderer, NOT a hybrid mix.
Rationale: Per Area Report Page 2 needs two heatmaps overlaid on a basemap (PRODUCT.md L135
event location heatmap + L137 patrol track heatmap). Three options surfaced via AskUserQuestion
at sub-batch start:
  • leaflet.heat plugin (~10KB MIT, Canvas raster, densify tracks → points)
  • Custom density-grid SVG (~0 deps, vector cells, +1 shared lib + ~15-20 test cases)
  • Hybrid (heat for events, density-grid for tracks — two patterns to maintain)
User selected the leaflet.heat path. Justifications: (a) Reuses ~100% of the proven Leaflet
client-island pattern from 6.1b (AreaCoverageMap) — MapContainer + TileLayer + MapReadySignal
+ AutoFitBounds — plus a thin HeatLayer wrapper hook using useMap() to mount/cleanup
L.heatLayer. (b) Faster to ship — Per Area Report has 6.2c (fuel) + optional 6.2d (export
wiring) still queued; reducing 6.2b custom-algorithm surface preserves velocity. (c) Funder
recognition — gradient Canvas heatmaps are the established visual language for ranger/marine
density reports; SVG density grids are visually divergent from what funders expect. (d) Print
quality acceptable at PDF DPI (96-150) — Canvas raster heatmaps are the industry default for
mapping-toolchain PDFs (Mapbox, ArcGIS Online, QGIS print layouts all output raster heat overlays
at this DPI band). The custom SVG density-grid path was rejected (zero deps but +1 shared
library + 15-20 algorithm tests + bbox + grid + color-scale code + custom legend = strictly
more code than the wrapper-hook path for the same funder-facing output). The hybrid path was
rejected (two visual styles on one page + two test patterns + two render-ready paths to sync
before window.__renderReady flip).
Implementation: apps/web/package.json adds `leaflet.heat ^0.2.0` + `@types/leaflet.heat ^0.2.4`.
New shared library `packages/shared/src/lib/heatmap-sample/` provides
sampleTrackPoints(lineString, intervalMeters=250) → Array<[lat, lon, weight]> for the patrol-
track variant (events use raw lat/lon, weight=1). New client island
`apps/web/src/app/print-render/.../components/per-area-heatmap-map.tsx` extends the AreaCoverageMap
pattern: MapContainer + TileLayer + <HeatLayer points={…} variant="events|tracks"/> + MapReadySignal.
The HeatLayer wrapper component uses useMap() + useEffect to L.heatLayer(points, options).addTo(map)
on mount and map.removeLayer(heat) on unmount. Variant palettes: events = red gradient (red-200 →
red-600), tracks = blue gradient (blue-200 → blue-700). Legend rendered server-side in the RSC
composer as a static gradient bar to avoid hydration mismatch. The MapReadySignal pattern
locked in "Coverage Report Page 2 Map Render Strategy" applies unchanged (waits for tile load
+ paint flush before flipping window.__renderReady=true for Puppeteer).
Locked: yes — leaflet.heat plugin is the heatmap renderer contract for the Per Area Report.
Future report families that need heatmaps (Quarterly Report, ad-hoc analytics exports) MUST
consume the same wrapper hook + sample-track-points library — no second-source heatmap renderer.
Bumping leaflet.heat or pivoting to a vector renderer requires explicit re-decision +
DECISIONS_LOG.md entry with reason.


## Area boundary geometry is editable after create — supersedes prior "locked-after-create" design (Phase 7 Feature Update — Area Boundary Map Drawing Editor, 2026-05-26)
Decision: AreaBoundary geometry IS in-place editable on the Edit dialog. Admin can drag
vertices, drag the whole shape, or remove + redraw via the leaflet-geoman toolbar. The
geometry TYPE (Polygon vs LineString) remains locked at the editor level on Edit — the
editor enables only the draw tool matching the original geometryType. To change the geometry
TYPE, the admin must still delete the boundary and create a new one with the desired type.
The Source field also remains locked on Edit (out of scope for this decision — Source semantics
have not changed and the Source field's lock-after-create rationale (provenance integrity for
EarthRanger-imported boundaries) still holds).
Status: LOCKED — 2026-05-26
Context: The Edit dialog at apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx
originally enforced a "delete + recreate to change geometry" workflow via a disabled
geometry-type `<select>` + helper text explaining the lock. This was a deliberate prior
design intended to preserve referential integrity with derived data (AreaCoverage rows
produced by the coverage-clip library shipped in Batch 6 Item 1, patrol reports
referencing the boundary by ID, etc.). The Map Drawing Editor feature (commit cd93cd9)
needed the Edit dialog to mount a live editor — which only makes sense if geometry can
actually be edited in place. Escalated mid-session to the product owner; resolved in
favor of removing the lock.
Rationale: "Delete + recreate to change a polygon" was hostile UX for the actual user
(site admin, not GIS analyst — the typical edit is "I drew the boundary 5 meters off
the actual MPA corner, let me drag that one vertex"). The locked-after-create design also
did not actually protect downstream referential integrity in the way the original design
implied: boundary updates have ALWAYS been permitted for the name, region, aliases, and
isEnabled fields, so a boundary's identity-as-referenced-record was never frozen — the
geometry lock was an inconsistent half-measure. Downstream consumers of boundary
geometry (AreaCoverage derivation in the coverage-clip library, Patrol records that
reference areaBoundaryId, future Quarterly Report aggregations) all re-derive on demand
or are point-in-time snapshots — none require the boundary's geometry to be immutable
for correctness. Removing the lock simplifies the mental model: a boundary record's
geometry can change in place; downstream consumers re-derive as needed.
Implications:
  • Edit dialog mounts the AreaBoundaryEditor with mode="edit" + initialGeometry +
    initialType props. The editor seeds the map with the existing geometry, fits viewport
    via map.fitBounds with 16px padding, and enables only the toolbar draw tool matching
    the original geometryType (so the admin can re-draw the same kind of geometry but
    not switch Polygon↔LineString).
  • Edit dialog handleSubmit gains the same defense-in-depth validation as Create:
    null guard on editor emit + JSON parse of the leaflet-positions-to-geojson result
    + validateGeoJsonShape on the parsed Geometry. Previously trusted because the field
    was UI-locked; now the field is editable so the validation must run.
  • The Source field remains locked on Edit (out of scope for this decision).
  • Any future audit-trail / referential-integrity requirements for boundary geometry
    changes (e.g. "log every geometry mutation to AuditLog with before/after GeoJSON for
    funder traceability") should be added as separate AuditLog entries on the
    boundary.update tRPC path — not by reinstating the UI lock.
  • Boundary-deletion semantics are unchanged. The Delete action still cascades through
    the existing referential checks (cannot delete a boundary with active patrols, etc.);
    Edit is now the lower-friction path for the "this polygon needs to shift 5m" use case.
Files affected:
  • apps/web/src/app/(dashboard)/patrol-areas/edit-area-boundary-dialog.tsx
    (locked-state UI removed: disabled geometryType `<select>` deleted, "geometry locked
    after create — delete and recreate to change" helper paragraph deleted; editor mount
    + handleSubmit defense-in-depth validation added)
  • apps/web/src/app/(dashboard)/patrol-areas/__tests__/edit-area-boundary-dialog.test.tsx
    (locked-state assertions removed: disabled-select, helper-text, "edit name only"
    flow tests deleted; editor mount + emit-flow tests added covering initialGeometry
    seeding, edited geometry submit, validation rejection + inline error, Polygon +
    LineString row types)
Locked by: Bonito (product owner) via mid-session decision during the Map Drawing Editor
implementation, 2026-05-26. Resolved a design conflict surfaced during Task 5 (Edit
dialog implementation) of the feat/area-boundary-map-drawing-editor branch. Bundled
atomically with the Editor feature ship (cd93cd9); governance entries (this DECISIONS_LOG
entry + the paired CHANGELOG_AI entry) follow in the next commit per Rule 3 non-blocking
governance writes.
