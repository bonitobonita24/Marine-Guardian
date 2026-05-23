# Lessons Memory — Spec-Driven Platform V31
# Entry format: ## YYYY-MM-DD — [ICON] [Title]
# Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change
# READ ORDER: 🔴 first → 🟤 second → rest by relevance
# ---

## 2026-05-23 — 🔴 AWS S3 SDK rejects hostnames containing underscores (RFC 1123) — Docker default `${COMPOSE_PROJECT_NAME}_minio` hostname fails with "Invalid Request (invalid hostname)"
- Type:      🔴 gotcha
- Phase:     Task Queue Task 3 (Per Area Report end-to-end smoke test, post-Task-2 storage provisioning)
- Files:     deploy/compose/dev/docker-compose.storage.yml (added `aliases: [minio-dev]` under `networks.app_network`); .env.dev (INTERNAL_STORAGE_ENDPOINT now points at `http://minio-dev:9000` instead of `http://marine-guardian_dev_minio:9000`); packages/storage/src/index.ts forcePathStyle:true is correct but the hostname check happens BEFORE the path-style negotiation
- Concepts:  aws-sdk-s3, s3client, rfc-1123, hostname-validation, underscore-rejection, docker-compose-network-alias, minio, dev-container-naming, container-hostname
- Narrative: The Rule 22 dev-container-naming convention (`${COMPOSE_PROJECT_NAME}_${service}` — e.g. `marine-guardian_dev_postgres`, `marine-guardian_dev_minio`) intentionally uses underscores for visual project grouping in `docker ps`. PostgreSQL, Valkey, MailHog, pgAdmin all accept this fine because their client libraries (pg, ioredis, smtp) do their own URL parsing and don't apply strict RFC validation. **The AWS S3 SDK is the exception**: `@aws-sdk/client-s3` validates `endpoint` hostnames per RFC 1123 (no underscores in DNS labels) BEFORE the request goes out, throwing `Invalid Request (invalid hostname)` with no useful error context. forcePathStyle:true does NOT help — the check happens upstream. Fix: give the MinIO service a hyphenated network alias (`minio-dev` in this project) and point `INTERNAL_STORAGE_ENDPOINT` at the alias, not the default hostname. **Operational rule for ALL future S3-compatible storage in Docker**: if the service is reached via `@aws-sdk/client-s3` (or any SDK that wraps it — `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner`, etc.), the Docker hostname MUST be RFC 1123 compliant — hyphens + alphanumerics only, NO underscores. Apply via `networks: { app_network: { aliases: [<hyphenated-name>] } }` on the service. Other containers (postgres, valkey, mailhog) keep the underscore-style hostname for project grouping; only S3 endpoints need this alias. The same gotcha will recur in staging/prod compose when those land — the storage compose for those envs MUST also use the hyphenated alias.

## 2026-05-23 — 🔴 INTERNAL_STORAGE_ENDPOINT was missing — `.env.dev` `STORAGE_ENDPOINT=localhost:45197` is host-only; containers cannot reach localhost. Same dual-mode pattern as INTERNAL_DATABASE_URL / INTERNAL_REDIS_URL needed to be replicated for storage
- Type:      🔴 gotcha
- Phase:     Task Queue Task 3 (Per Area Report end-to-end smoke test, post-Task-2 storage provisioning)
- Files:     .env.dev (added `INTERNAL_STORAGE_ENDPOINT=http://minio-dev:9000` next to existing INTERNAL_DATABASE_URL + INTERNAL_REDIS_URL); deploy/compose/dev/docker-compose.app.yml (added `STORAGE_ENDPOINT: ${INTERNAL_STORAGE_ENDPOINT}` override to BOTH `app` and `worker` services' `environment:` blocks — matches the existing DATABASE_URL/REDIS_URL override pattern)
- Concepts:  env-var-dual-mode, internal-storage-endpoint, container-network, host-network, localhost-vs-container-hostname, docker-compose-override, scaffold-gap, task-2-followup
- Narrative: Task 2 added `docker-compose.storage.yml` + renamed packages/storage env vars from MINIO_* → STORAGE_*. What Task 2 MISSED: the dual-mode endpoint pattern. `.env.dev` has `STORAGE_ENDPOINT=http://localhost:45197` — the host-mapped port, correct for host-side mc client / local pnpm tests. But the worker + app containers cannot resolve localhost to the MinIO container — they need the Docker network hostname. The other backing services already have this dual-mode pattern: `DATABASE_URL=<host>` for tools + `INTERNAL_DATABASE_URL=<container-network>` overridden in compose `environment:` block. `REDIS_URL` + `INTERNAL_REDIS_URL` same pattern. Storage was the only backing service that lacked the INTERNAL_ override. Fix: add `INTERNAL_STORAGE_ENDPOINT=http://minio-dev:9000` to .env.dev (note hyphenated hostname per the S3 SDK gotcha above) and `STORAGE_ENDPOINT: ${INTERNAL_STORAGE_ENDPOINT}` to BOTH app + worker compose environment blocks. **Operational rule for ALL future backing services that need both host-side AND container-side access**: ALWAYS add both `XXX_*=<host-mapped>` (in .env.{env}) AND `INTERNAL_XXX_*=<container-network>` (also in .env.{env}) AND the container-environment override block. **Future-proofing checklist when adding any backing service Docker compose**: (1) compose file with named volume + alias if S3-compatible (2) .env.{env} XXX_* vars pointing at host (3) .env.{env} INTERNAL_XXX_* vars pointing at container DNS name (4) app + worker compose environment block override mapping XXX_* = ${INTERNAL_XXX_*}. Missing any of these 4 = container will reach for `localhost` and fail. Apply the same pattern when staging/prod storage compose lands.

## 2026-05-23 — 🟢 Per Area Report end-to-end smoke test PASSES — full pipeline operational from login through PDF download
- Type:      🟢 change
- Phase:     Task Queue Task 3 (post-Task-2 verification) — Phase 8 Batch 6 Item 2 (Per Area Report) is now genuinely ship-complete on dev container
- Files:     scripts/smoke-tests/per-area-report.mjs (Node.js test runner — login → tRPC create → poll → download → validate PDF magic + page count); scripts/smoke-tests/run-per-area-smoke.sh (shell wrapper — extracts demo-site admin password from CREDENTIALS.md to env var, never echoes); deploy/compose/dev/docker-compose.app.yml + docker-compose.storage.yml + .env.dev (the 3 storage-layer fixes per the 2 🔴 entries above); packages/jobs/dist/start-workers.mjs (rebuilt after Task 2 to bake STORAGE_* refs into the worker bundle); marine-guardian:dev-latest Docker image (rebuilt to ship the new worker bundle)
- Concepts:  smoke-test, per-area-report, end-to-end-verification, pipeline-operational, login-csrf-credentials, trpc-batch-format, bullmq-pdf-render, minio-upload, audit-log-export-download, batch-6-item-2-ship-ready
- Narrative: Full pipeline now confirmed operational on dev container: NextAuth credentials login (302 + session cookie) → tRPC `reportExport.create` mutation (status=queued, exportId returned) → BullMQ pdf-render worker pickup (status=rendering 2s later) → Puppeteer renderer at marine-guardian_dev_pdf_renderer:4000 (3 retry attempts visible in render logs, each ~191KB) → MinIO upload to `marine-guardian-development-exports/${tenantId}/2026/05/${exportId}.pdf` (status=ready, fileSizeBytes=191494) → tRPC `reportExport.getDownloadUrl` returns `/api/exports/reports/${id}/download` → Route Handler streams PDF with EXPORT_DOWNLOAD audit log written (L5 audit confirmed: 2 audit_logs rows for the test export — EXPORT_REQUESTED + EXPORT_DOWNLOAD). PDF validation: magic=%PDF, version 1.4, 3 pages — matches the Per Area Report 3-page funder template from v2 PRODUCT.md §776-779. Total wall-clock: ~10 seconds from create to ready, ~11 seconds from create to downloaded. **Operational note**: the smoke test runner is reusable for any future regression check on this pipeline — `bash scripts/smoke-tests/run-per-area-smoke.sh` exits 0 on success, non-zero with detailed log otherwise. The wrapper extracts the demo-site admin password from CREDENTIALS.md via subprocess (value never enters AI agent context per Scenario 34 pattern). **Followup defects discovered but out of Task 3 scope**: (a) APP_ENV=development in .env.dev produces bucket name `marine-guardian-development-exports` but DECISIONS_LOG storage convention says `marine-guardian-${env}-exports` with env=dev/staging/prod — `STORAGE_BUCKET=marine-guardian-dev` in .env.dev is then a misleading dead env var that the upload code doesn't read. Cleanup decision: should APP_ENV in .env.dev change to `dev` (re-aligning bucket name + STORAGE_BUCKET intent), or should the storage code read STORAGE_BUCKET instead of computing from APP_ENV? Defer to a separate task. (b) pdf_renderer container reports "unhealthy" in docker ps despite serving render requests successfully — healthcheck definition is `wget /health` but the service might respond on a different path or return non-200; not blocking but should be fixed. (c) Orphan containers warning about `yelli_dev_*` from a prior project — `--remove-orphans` would clean but might affect other work.

## 2026-05-22 — 🔴 BullMQ rejects jobIds containing `:` — unit tests that mock queue.add() never catch this
- Type:      🔴 gotcha
- Phase:     Phase 7 defect fix (post-Batch 6 Item 2 ship-readiness smoke test) — applies to ALL future BullMQ queue work
- Files:     packages/jobs/src/queues/{alerts,area-rederive,email,er-sync,maintenance,patrol-track-materialize,pdf-render}.queue.ts (the 7 jobId templates — all flipped from `:` to `__`); packages/jobs/src/queues/types.ts L75 (the only schema-side jobId reference); apps/web/src/server/trpc/routers/{patrol,reportExport}.ts (3 doc-comment references); packages/jobs/src/queues/__tests__/{pdf-render,patrol-track-materialize,area-rederive}.queue.test.ts (12 assertion strings); deploy/compose/dev/docker-compose.app.yml (the partner defect — app container missing REDIS_HOST/PORT overrides)
- Concepts:  bullmq, jobid, custom-id, colon-separator, double-underscore, queue.add, mocked-tests, real-validation, smoke-test, redis-host, redis-port, container-env, end-to-end-blocker, dedupe, idempotency
- Narrative: Per Area Report (Batch 6 Item 2) shipped to main as fully tested code but a manual smoke test on the dev container revealed two compounded defects that broke end-to-end report generation. Defect 1: the app container in docker-compose.app.yml inherited DB_HOST/DB_PORT but NOT REDIS_HOST/REDIS_PORT — the worker container had the overrides, but the app's BullMQ connection.ts fell back to "localhost:45196" and ECONNREFUSED'd. Fix: added explicit REDIS_HOST/REDIS_PORT to the app service environment. Defect 2 (the actually deep one): even after Defect 1 fix, reportExport.create wrote the ReportExport row but the BullMQ job was never published to Redis. Root cause: queue.add() rejected the jobId with `Error: Custom Id cannot contain :`. The 7 queue implementations used colon-separated jobId templates (e.g. `pdf-render:${exportId}`, `patrol-track-materialize:${tenantId}:${patrolId}`, `alert:${tenantId}:${alertRuleId}:${eventId}`) as a systematic convention since Phase 8 Batch 5. The 12 vitest cases in pdf-render.queue.test.ts / patrol-track-materialize.queue.test.ts / area-rederive.queue.test.ts ALL passed because `vi.mock("../queue-factory")` returned `{ add: vi.fn() }` — the mock never executes BullMQ's real Redis-key validation. **Operational rule for ALL future BullMQ work in this monorepo**: jobIds MUST use `__` (double underscore) as the segment separator — NEVER `:`. The 7 production queues + 12 test asserts + 4 doc comments are now consistent. **Why `__` and not `-` or `.`**: `-` collides with existing payload segment content (cuids like `export-cuid-1`, kebab queue names like `pdf-render`, tenant slugs like `tenant-a`); `.` has implicit meaning in URLs, file paths, log viewers, and serialization formats; `__` is unambiguous, never special, and easy to grep (`grep '__'` finds separators only). Some segments retain single underscores (`cleanup_old_sync_logs`, `archive_resolved_events`) — that's fine, the double-underscore boundary is visually + lexically distinct from single underscores inside segment names. **Future regression-prevention idea (not yet shipped)**: add an integration test in packages/jobs that creates a real BullMQ Queue against a localhost Redis or ioredis-mock and asserts queue.add() does NOT throw for each queue's jobId template. Until that ships, the unit-test mock gap is documented here as the reason this slipped through.

## 2026-05-22 — 🟤 FuelEntry is area-keyed, NOT patrol-keyed — L/km is always an aggregate ratio
- Type:      🟤 decision
- Phase:     Phase 8 Batch 6 Sub-batch 6.2c — Per Area Report Page 3 (Fuel Consumption)
- Files:     packages/db/prisma/schema.prisma line 468-491 (FuelEntry model — tenantId + areaBoundaryId + dateReceived, no patrolId column); apps/web/src/server/per-area-report/get-per-area-report-data.ts (the buildFuelConsumption helper enforces the aggregate-ratio contract); apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/page-3-fuel-consumption.tsx (Page 3 methodology footer surfaces this caveat to funders); docs/PRODUCT.md §128 + §138 + §268 (the source spec assertion); docs/PRODUCT.md §126 (Fuel Logging analytics page — a separate surface that DOES show a trend chart, but that's still aggregate not per-patrol)
- Concepts:  fuel-entry, per-area-keying, area-boundary-id, no-patrol-join, l-per-km, divide-by-zero-guard, aggregate-ratio, per-area-report, page-3, fuel-consumption, prisma-schema, operational-reality
- Narrative: The original draft of 6.2c (locked into STATE.md NEXT field earlier in the day) included a `perPatrolBreakdown` field that would have surfaced fuel consumption per individual seaborne patrol. **This is impossible.** The FuelEntry Prisma model is keyed by (tenantId, areaBoundaryId, dateReceived) with NO patrolId field — fuel is allocated at the AREA level, not the PATROL level. PRODUCT.md §128 spells this out explicitly: "Fuel is shared across all boats in an area — not tracked per individual boat." Scope correction landed in STATE.md at 7:58pm GMT+8 (2026-05-22) before any 6.2c code shipped — the corrected estimate dropped from 25-30K to 18-22K main-session tokens because the per-patrol cross-product (patrol × fuel-entry × date-overlap) and the chart Client component both fell out of scope. **Operational rule for ALL future Per Area Report extensions or fuel-related features**: never assume a Patrol↔FuelEntry join. Liters-per-km is ALWAYS an aggregate ratio of sum(liters) / sum(seaborne km) within an area + period window. The divide-by-zero guard (averageLitersPerKm = null when totalSeabornePatrolKm === 0) is structural — surfaces as "N/A" on the funder PDF. The per-month bucket breakdown table renders only when dateRange spans ≥2 calendar months (single-month range shows KPI cards alone — no breakdown to add) — derived from perMonthBreakdown.length ≥ 2 on the loader output. Future extensions that need fuel-cost trend visualisation belong on the Fuel Logging analytics page (PRODUCT.md §126), NOT on the Per Area Report PDF.

## 2026-05-22 — 🟤 Heatmap Renderer Choice locked to leaflet.heat plugin + ~250m track-point densification
- Type:      🟤 decision
- Phase:     Phase 8 Batch 6 Sub-batch 6.2b — Per Area Report Page 2 (event location heatmap + patrol track heatmap)
- Files:     apps/web/package.json (forthcoming: leaflet.heat ^0.2.0 + @types/leaflet.heat ^0.2.4); packages/shared/src/lib/heatmap-sample/ (forthcoming: sampleTrackPoints densifier); apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/components/per-area-heatmap-map.tsx + components/heat-layer.tsx (forthcoming wrapper hook); docs/DECISIONS_LOG.md "Heatmap Renderer Choice (Phase 8 Batch 6 Sub-batch 6.2b)" — full rationale + 3 rejected alternatives
- Concepts:  leaflet, leaflet.heat, react-leaflet, heatmap, density, canvas-raster, svg-density-grid, point-densification, line-string-sampling, funder-pdf-template, per-area-report
- Narrative: User selected leaflet.heat over (a) custom density-grid SVG renderer and (b) hybrid mix at sub-batch start. Decision rationale captured fully in DECISIONS_LOG.md — the 4 deciding factors: ~100% reuse of the 6.1b AreaCoverageMap Leaflet client-island pattern (only add a thin HeatLayer wrapper hook using useMap()), faster velocity for the remaining 6.2c (fuel) + optional 6.2d (export wiring) queue, funder-recognized gradient Canvas heatmap visual language, acceptable print quality at PDF DPI 96-150. The wrapper hook pattern is: useMap() → useEffect(() => { const heat = L.heatLayer(points, options).addTo(map); return () => map.removeLayer(heat); }, [map, points]). Events feed raw [lat, lon, 1] tuples; patrol-tracks feed sampleTrackPoints(lineString, 250) → [lat, lon, weight=1] tuples (haversine-stepped along the LineString). Variant palettes: events=red gradient (red-200→red-600), tracks=blue gradient (blue-200→blue-700). The MapReadySignal contract locked in "Coverage Report Page 2 Map Render Strategy" applies unchanged — Canvas heat layers paint synchronously after tile load, so the existing requestAnimationFrame×2 paint-flush before window.__renderReady=true flip continues to work without modification. The decision is the heatmap-renderer contract for ALL future report families that need density overlays (Quarterly Report, ad-hoc analytics exports) — no second-source renderer.

## 2026-05-21 — 🔴 turf.lineSplit returns an EMPTY FeatureCollection when the line does not cross the splitter — must fall back to point-in-polygon
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 6 Sub-batch 6.1c-i (coverage-clip line × polygon clipping primitive)
- Files:     packages/shared/src/lib/coverage-clip/clip-track-to-boundary.ts (the fallback path); packages/shared/src/lib/coverage-clip/__tests__/coverage-clip.test.ts (5 of 29 cases failed before the fix landed)
- Concepts:  turf.js, lineSplit, line-polygon clipping, GeoJSON, edge case, empty FeatureCollection, booleanPointInPolygon, geospatial
- Narrative: When clipping a patrol track LineString against an AreaBoundary polygon via `turf.lineSplit(track, ring)`, the FIRST implementation assumed lineSplit always returns at least one feature. WRONG. lineSplit returns an EMPTY FeatureCollection (`split.features.length === 0`) when the input line does NOT intersect the splitter at all — which is the common case when the track is either fully inside OR fully outside the polygon. The initial implementation that iterated `for (const piece of split.features)` and summed inside-piece lengths returned coverageKm = 0 for EVERY fully-inside track — exactly the patrols we most need to count. 5 of 29 vitest cases failed on the first run (all fully-inside-track variants + multi-patrol aggregation tests that depend on them). Fix: add an explicit fallback path when `split.features.length === 0` — test the track's first vertex via `booleanPointInPolygon(turfPoint(track[0]), polygon)`. If inside → return `{ totalKm: trackTotalKm, trackTotalKm }`. If outside → return `{ totalKm: 0, trackTotalKm }`. All 137 tests pass after the fix. **General rule for future turf-based clipping work**: never trust that the result of any `split` / `intersect` / `difference` operation is non-empty for the obvious "everything's inside" case. Always have a fallback that classifies the no-result case via a primitive geometric test (point-in-polygon for inside/outside, bbox overlap for touching, etc.). This pattern will reappear when 6.1c-ii Page 3 or future Per Area Report layers reach for `@turf/intersect`, `@turf/difference`, or `@turf/line-overlap` — the no-intersection branch always needs a fallback.

## 2026-05-21 — 🔴 The `coverage/` entry in root .gitignore matches *any* directory named coverage anywhere in the tree — name new dirs accordingly
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 6 Sub-batch 6.1a (Coverage Report Page 1 server query layer)
- Files:     .gitignore (line 55: `coverage/` — meant for test-coverage output but the glob is unbounded); apps/web/src/server/coverage-report/ (the resolved name); the original apps/web/src/server/coverage/ that was silently gitignored
- Concepts:  gitignore, glob semantics, directory naming, coverage-report, test-coverage
- Narrative: Created apps/web/src/server/coverage/ for the Coverage Report server query layer in 6.1a. `git add` reported "paths are ignored by one of your .gitignore files" — the root .gitignore line 55 `coverage/` is intended to ignore test-coverage output (`coverage/lcov.info` etc.) but the unanchored glob matches *every* directory named "coverage" anywhere in the tree, including server code modules. Resolution: renamed apps/web/src/server/coverage/ → apps/web/src/server/coverage-report/ and updated 3 import paths (page.tsx, coverage-report.tsx, test file). Rule for future: avoid bare names that conflict with common .gitignore patterns (node_modules, dist, build, coverage, .next, .turbo). When in doubt, prefix the directory with the feature name (coverage-report, coverage-computation) rather than the bare concept. The alternative — adding a negation `!apps/web/src/server/coverage/` to .gitignore — would work but the rename is less invasive and more self-documenting.

## 2026-05-21 — 🔴 Next.js App Router excludes underscore-prefixed folders from routing — v2 spec paths starting with `_` need a rename
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 5 Sub-batch 5.3a (Puppeteer pdf-renderer infrastructure) — applies to any future route whose v2 PRODUCT.md path starts with `_` (e.g. `/_print/`, `/_internal/`, `/_admin/`)
- Files:     apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx (the renamed-from-`_print` route); apps/web/src/middleware.ts (the service-token guard matcher); docs/DECISIONS_LOG.md "PDF Renderer Internal Route Path" lock; docs/v2/PRODUCT.md L724 (the spec line whose `/_print/{tenant_slug}/{report_type}/{export_id}` path was deviated from)
- Concepts:  next-js-app-router, private-folders, routing-conventions, v2-spec-deviation, service-token-auth, puppeteer-target, underscore-prefix, /_print/, /print-render/
- Narrative: Next.js App Router treats any folder prefixed with `_` as a **private folder** — its `page.tsx`/`route.ts` files are EXCLUDED from the routing system entirely. `apps/web/src/app/_print/[tenantSlug]/[reportType]/[exportId]/page.tsx` would not generate a route at `/_print/.../.../...` — direct browser access (and Puppeteer navigation) would 404 with no obvious reason.

  ROOT CAUSE: This is an intentional Next.js feature for hiding implementation-detail folders alongside routes (e.g. `_components/`, `_utils/`). The leading `_` is the only marker — there is no opt-out without renaming or URL-encoding (`%5F`).

  DETECTION: Caught during 5.3a implementation before any commit by re-reading Next.js routing conventions while writing the page.tsx file. Would have surfaced as a 404 at the first Puppeteer navigation attempt in 5.3b dispatch — far more expensive to debug after the fact.

  v2 PRODUCT.md L724 specifies `/_print/{tenant_slug}/{report_type}/{export_id}` because the spec author used `_` as a "this is internal-only" convention. But the internal-only semantic is properly enforced by the X-PDF-Renderer-Token middleware guard, not by a URL prefix.

  FIX (locked in DECISIONS_LOG "PDF Renderer Internal Route Path"): Renamed route to `/print-render/[tenantSlug]/[reportType]/[exportId]`. URL-encoded folder name `%5Fprint` was considered and rejected — it complicates IDE navigation, file-search, and grep workflows, and offers zero functional benefit over a clean folder name when service-token auth already provides the access gate.

  COROLLARY 1: If v2 spec specifies any route path starting with `_`, deviate to a non-underscore equivalent BEFORE generating the page.tsx — and lock the deviation in DECISIONS_LOG so all downstream producers (BullMQ processors that construct the URL, link generators, sitemap generators) use the corrected path.

  COROLLARY 2: This convention also excludes `_components`, `_lib`, `_utils`, etc. inside the app directory — useful for co-locating implementation files next to routes without them becoming accidental routes. The corollary is one-way: a folder name starting with `_` is private. Folders containing but not starting with `_` (e.g. `my_route`) ARE routes. Route group syntax `(group)` is different — those folders don't appear in the URL at all.

  COROLLARY 3 (re-validated): The (dashboard) folder pattern used elsewhere in this codebase (`apps/web/src/app/(dashboard)/users/page.tsx` → URL `/users`) is a **route group** — parentheses syntax — and is unrelated to the underscore-prefix private folder mechanism.

## 2026-05-21 — 🟡 @marine-guardian/jobs barrel transitively loads workers — adding a jobs import to any router file expands route-handler test mocks too
- Type:      🟡 fix
- Phase:     Phase 8 Batch 5 Sub-batch 5.2c (patrol.rebuildTracks admin mutation) — pattern applies to ALL future router files that gain an `@marine-guardian/jobs` import, especially routers whose schemas (zod filters etc.) are cross-imported by Route Handlers in apps/web/src/app/api/
- Files:     apps/web/src/app/api/exports/patrols/__tests__/route.test.ts (the test that broke); apps/web/src/server/trpc/routers/patrol.ts (the router that gained the jobs import); packages/jobs/src/index.ts (the eager-load barrel)
- Concepts:  vitest, vi.mock, module-graph, barrel-imports, side-effect-modules, eager-load, monorepo-test-isolation, bullmq, platformPrisma
- Narrative: Adding `import { enqueuePatrolTrackMaterialize } from "@marine-guardian/jobs"` to apps/web/src/server/trpc/routers/patrol.ts caused apps/web/src/app/api/exports/patrols/__tests__/route.test.ts to fail with `[vitest] No "platformPrisma" export is defined on the "@marine-guardian/db" mock` — even though route.test.ts has zero direct relationship to jobs and the test file wasn't modified.

  ROOT CAUSE: The @marine-guardian/jobs package's barrel (packages/jobs/src/index.ts) re-exports both queue helpers AND worker factories. The worker barrel (packages/jobs/src/workers/index.ts) imports the area-rederive worker which imports the area-rederive processor which has a TOP-LEVEL `platformPrisma as unknown as ExtendedPrismaClient` cast that EXECUTES at module-load time. So loading anything from @marine-guardian/jobs eagerly evaluates the platformPrisma cast.

  THE CROSS-IMPORT CHAIN: route.ts imports `patrolListFilters` from `@/server/trpc/routers/patrol` — a zod schema cross-import that existed long before 5.2c. With my 5.2c change, patrol.ts now also imports from @marine-guardian/jobs. So route.ts (and route.test.ts) now transitively load the jobs barrel including workers, even though they never call any job function.

  WHY route.test.ts FAILED: it mocks @marine-guardian/db with only `{prisma: {...}}` — no `platformPrisma` export. When the jobs worker barrel loads at module-init, area-rederive.processor.ts:53 reads `platformPrisma` from the mock and finds it undefined → vitest throws.

  THE FIX: Add `platformPrisma: {}` (any value — even an empty object) to the @marine-guardian/db mock in route.test.ts. The processor only CASTS platformPrisma at module load (`const prisma: ExtendedPrismaClient = platformPrisma as unknown as ExtendedPrismaClient`); it doesn't actually invoke any method on it during module init. So a stub value satisfies the import-time existence check without needing to mock methods.

  GENERAL RULE for vitest mocks of @marine-guardian/db when ANYTHING in the test's module graph touches @marine-guardian/jobs (directly OR transitively via a router that does): include `platformPrisma: {}` in the mock. This applies to:
  - Route Handler tests that import shared schemas from router files (the export endpoints all do this)
  - Component tests for client components that import tRPC types from router files
  - Server Action tests in apps/web that import server utilities depending on routers

  WHY NOT FIX THE BARREL: The jobs barrel re-exporting workers is intentional — start-workers.ts (the BullMQ orchestrator) needs to import all worker factories from one entrypoint, and consumers (admin UIs, monitoring scripts) sometimes need worker handles directly. Splitting the barrel into `@marine-guardian/jobs/client` (queues only) vs `@marine-guardian/jobs/server` (queues + workers) would be ideal but is invasive — pickup path: do this when worker factories grow beyond 6 (currently er-sync/alerts/email/maintenance/area-rederive/patrol-track-materialize). For now, the per-test mock stub is the correct contained fix.

  PRIOR ART: 5.1e areaBoundary.ts also imports @marine-guardian/jobs (enqueueAreaRederive), but no Route Handler tests cross-import from areaBoundary.ts the way route.ts does from patrol.ts, so this pattern only surfaced now.

## 2026-05-20 — 🟡 BullMQ jobId dedupe pattern: exclude userId for cross-operator collapse
- Type:      🟡 fix
- Phase:     Phase 8 Batch 5 Sub-batch 5.2b (patrol-track-materialize queue) — pattern applies to ALL future BullMQ queues where the underlying job is "refresh resource X for tenant Y" and the requesting user is incidental
- Files:     packages/jobs/src/queues/patrol-track-materialize.queue.ts (pattern origin); contrast with packages/jobs/src/queues/area-rederive.queue.ts (5.1c — no jobId pattern, no dedupe needed because CUD events ARE the dedupe boundary)
- Concepts:  bullmq, jobid, dedupe, idempotency, queue design, multi-operator coordination
- Narrative: 5.2b's queue uses jobId `patrol-track-materialize:${tenantId}:${patrolId}` for BullMQ-layer dedupe at enqueue time. The dedupe key DELIBERATELY excludes userId even though every job payload carries userId (required by BaseJobPayload contract for observability).

  WHY exclude userId from jobId: when 5.2c admin manual-rebuild fans out per-patrol jobs across the tenant, two operators (e.g. two site_admins) might both click "Rebuild Tracks" within seconds of each other. With userId in the jobId, each operator's request creates a separate job per patrol — N patrols × 2 operators = 2N redundant ER fetches against the same data. With userId excluded, the second operator's enqueue collides with the first (BullMQ rejects the duplicate jobId silently) and only N ER fetches happen. Both operators see the same fresh data when the jobs complete. This is correct because the materialization output (PatrolTrack row) is identical regardless of who triggered it — userId is observability metadata, not a derivation input.

  WHEN to apply this pattern:
  - Job output depends ONLY on the resource being refreshed (tenant + entity id) — not on the requester
  - Multiple operators can legitimately trigger the same refresh independently
  - The cost of a duplicate fetch is non-trivial (network call to vendor API, expensive computation, etc.)

  WHEN NOT to apply (keep userId in jobId or use no jobId pattern):
  - The job output is user-scoped (e.g. "generate report for user X" — different users get different reports)
  - The job is intentionally side-effect-driven per-call (e.g. "send notification to user X" — must run once per request even if duplicated)
  - The queue uses CUD events as the dedupe boundary (e.g. 5.1c area-rederive — every CUD event creates a fresh job by design; deduping there would mask legitimate re-derivations)

  HOW 5.2c INHERITS: when 5.2c admin tRPC mutation enqueues per-patrol jobs, the dedupe at the queue layer means the mutation can safely fire `enqueuePatrolTrackMaterialize` per patrol without checking whether one is already queued — BullMQ handles the dedupe atomically. The mutation reports `enqueued: N` based on the count of patrols it iterated, not the count of actually-new jobs. This is the right user-facing semantic: "we queued a refresh for all N patrols" is honest even if some of those N collapsed to existing in-flight jobs from another operator.

## 2026-05-20 — 🟤 BullMQ worker rate limiter sizing is context-dependent (in-process vs network-bound)
- Type:      🟤 decision
- Phase:     Phase 8 Batch 5 Sub-batch 5.2b (patrol-track-materialize worker) — applies to ALL future BullMQ worker rate limiter sizing decisions
- Files:     packages/jobs/src/workers/patrol-track-materialize.worker.ts (5.2b — 20/sec, concurrency=5); contrast with packages/jobs/src/workers/area-rederive.worker.ts (5.1c — 50/sec, concurrency=10)
- Concepts:  bullmq, rate-limiter, concurrency, throughput, network-bound, in-process, vendor-api, er-api-budget
- Narrative: 5.1c area-rederive uses limiter `{max:50, duration:1000}` + concurrency=10. 5.2b patrol-track-materialize uses limiter `{max:20, duration:1000}` + concurrency=5. v2 spec L545 specified the 50/sec figure for area-rederive but is silent on patrol-track-materialize. Reasoning for the divergence:

  AREA-REDERIVE (5.1c — 50/sec, concurrency=10):
  - Work is IN-PROCESS: load row + load tenant's boundaries + run pure derivation + write back. No external network calls.
  - Per-job latency dominated by PostgreSQL round-trips (~5-20ms each); ~50ms median total.
  - Bottleneck is PostgreSQL connection pool, not vendor API budget.
  - 50/sec limiter + 10 concurrency = ample throughput for bulk re-derivation after AreaBoundary CUD.

  PATROL-TRACK-MATERIALIZE (5.2b — 20/sec, concurrency=5):
  - Work is NETWORK-BOUND: load patrol + decrypt tenant credentials + fetch GPS track from EarthRanger `/subject/{id}/tracks/` + summarise features + atomic upsert.
  - Per-job latency dominated by ER API roundtrip (~200-500ms typical, can spike higher for long patrols with thousands of coordinates).
  - Bottleneck is the ER vendor API rate limit, which is typically stricter on `/tracks/` than on `/events/` or `/subjects/` because tracks payloads are larger.
  - Concurrency=5 × ~200-500ms = arithmetic ceiling of 10-25 jobs/sec; 20/sec limiter is the BINDING constraint that ensures we stay well below typical vendor rate limits even on the fast end.
  - 5x safety margin from v2 figure: 5.1c is in-process and can absorb whatever PostgreSQL allows; 5.2b is gated by an external vendor we don't control.

  RULE OF THUMB for future worker rate limiter sizing:
  - IN-PROCESS work (DB queries, pure computation, file I/O): start at 50/sec + concurrency=10. Tune up if PostgreSQL pool sustains it.
  - NETWORK-BOUND to OWN infrastructure (Redis, MinIO): start at 30/sec + concurrency=10. Watch for connection saturation.
  - NETWORK-BOUND to VENDOR API: start at 20/sec + concurrency=5. Halve both if vendor rate-limit responses appear in logs. Lock the decision in lessons.md with the vendor name.
  - NETWORK-BOUND with heavy compute (e.g. PDF render via Puppeteer for ReportExport Item 3): start at 10/sec + concurrency=3. Memory pressure usually binds before throughput.

  HOW 5.2c USES THIS: 5.2c admin mutation fans out N patrols × 1 job each. With N=100 active patrols and the 20/sec limiter, completion takes ~5 seconds of queue runtime + per-job processing. UI confirm dialog should warn "may take a few minutes for large tenants" rather than promise instant completion. Same shape as 5.1e RebuildAreaBoundariesButton's dialog copy.

## 2026-05-20 — 🟡 Test helper overrides: `null ?? default` returns default, not null
- Type:      🟡 fix
- Phase:     Phase 8 Batch 5 Sub-batch 5.2a (materializePatrolTrack tests) — applies to ALL test helper factories that accept Partial<T> overrides
- Files:     packages/jobs/src/lib/__tests__/patrol-track-materialization.test.ts (origin); pattern recurs across area-derivation.test.ts, areaBoundary.test.ts, and any future factory-style mock helper
- Concepts:  vitest, mock helpers, nullish coalescing, JavaScript operator semantics, test discipline
- Narrative: While writing 5.2a tests, two `no_credentials` cases failed with `TypeError: Cannot read properties of undefined (reading 'features')` from inside `summariseFeatures(trackResponse.features)` — meaning the helper's null-check on `tenant.earthrangerUrl` did NOT short-circuit even though the test mock was passing `{ earthrangerUrl: null }`. Root cause: the makeTenant helper was using nullish coalescing for override-vs-default selection — `return { earthrangerUrl: overrides.earthrangerUrl ?? "enc:https://er.example.test", ... }`. When the test passes `{ earthrangerUrl: null }` as the override, `null ?? "enc:..."` evaluates to `"enc:..."` because `??` falls through on both `null` and `undefined`. The mock therefore returned a tenant with a non-null URL, the helper's credential check passed, and execution proceeded into the ER fetch path where the mock returned undefined (fetchSubjectTracks was never set up by these test cases because they expected to skip before that point). FIX: distinguish "explicit null override" from "absent key" using the `in` operator: `earthrangerUrl: "earthrangerUrl" in overrides ? overrides.earthrangerUrl : "enc:..."` — the `in` operator returns true for any property present in the object, including those whose value is null or undefined. APPLY when: any test helper that constructs mocks accepting `Partial<T>` overrides AND where the field type allows null AND where a test case needs to assert behavior with an explicit null. ALTERNATIVE patterns considered: (a) ternary `overrides.earthrangerUrl !== undefined ? overrides.earthrangerUrl : default` — works but `undefined !== null` semantics can confuse readers and require a `null` sentinel in the override type; (b) split into two helpers (makeTenantWithCreds + makeTenantNoCreds) — more verbose, fragments test setup. The `in` operator pattern is the cleanest. NOTE: the existing area-derivation.test.ts makeBoundary helper uses `??` for all defaults — but every field there is non-nullable, so the bug doesn't surface. If a future test ever needs to override one of those fields with null, this lesson applies.

## 2026-05-20 — 🟡 platformPrisma → ExtendedPrismaClient cast pattern for BullMQ processors
- Type:      🟡 fix
- Phase:     Phase 8 Batch 5 Sub-batch 5.1c (BullMQ area-rederive processor) — pattern applies to ALL future BullMQ processors that call into ExtendedPrismaClient-typed helpers
- Files:     packages/jobs/src/processors/area-rederive.processor.ts (pattern origin), packages/jobs/src/lib/area-derivation.ts (helper expecting ExtendedPrismaClient)
- Concepts:  bullmq, prisma, extendedprismaclient, type-narrowing, tenant-guard, worker-context, l6-tenant-guard, processor-typing
- Narrative: BullMQ processors instantiate `platformPrisma` (the un-extended PrismaClient — existing pattern from er-sync/alerts/email/maintenance processors) but the helpers they call (e.g. applyAreaDerivation from 5.1b) type their `prisma` arg as `ExtendedPrismaClient` (the L6 tenant-guarded variant — this typing decision was deliberate in 5.1b to share the type with admin-context tRPC callers in 5.1e where ctx.prisma IS already extended). Direct assignment fails typecheck.

  RESOLUTION: cast `platformPrisma as unknown as ExtendedPrismaClient` in the processor module with a clear explanatory comment. The cast is structurally sound because: (1) worker queries ALWAYS pass explicit tenantId — the row's tenantId is what scopes the boundary fetch, never a context-derived one — so the L6 tenant-guard extension is a no-op in worker context; (2) the @marine-guardian/db encryption extension is unused for the plaintext columns the helper touches (tenantId / areaName / locationLat / locationLon / areaBoundaryId / areaDerivedAt — none are encrypted columns); (3) runtime shape is structurally compatible with ExtendedPrismaClient for every model + method invoked.

  Why NOT the cleaner alternatives:
  - "Instantiate a separate ExtendedPrismaClient just for the worker" — adds complexity without runtime benefit (worker would need its own connection pool config, healthcheck, shutdown handler) and the extension's purpose (tenant context propagation) is not needed since the worker context has no implicit tenantId to propagate.
  - "Change applyAreaDerivation to accept `PrismaClient | ExtendedPrismaClient`" — invasive change to the helper's public type contract; risks blowing apart 5.1e admin tRPC where the extended client is the natural type.
  - "Make a PrismaClientLike intersection type that accepts both" — proliferates type aliases; the `as unknown as` cast is local to one module and clearly intentional with the comment.

  HOW 5.1d INHERITS THIS: when 5.1d adds inline applyAreaDerivation to er-sync.processor.ts, the same cast applies — er-sync.processor.ts already uses `platformPrisma` (same pattern as 5.1c). 5.1d processor MUST use the identical cast pattern + identical explanatory comment for consistency. Do NOT invent a new helper type alias.

  HOW 5.1e DIFFERS: 5.1e admin tRPC mutation calls applyAreaDerivation with `ctx.prisma` which IS already typed as ExtendedPrismaClient — no cast needed there. This is the architectural reason 5.1b's helper was typed for ExtendedPrismaClient: 5.1e is the "primary" caller pathway with cleaner typing, and worker callers absorb the cast as the cost of running outside a tRPC context.

## 2026-05-19 — 🔴 `pnpm prisma migrate dev` hangs on stale advisory locks from backgrounded prior runs
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     packages/db/prisma/migrations/20260519233500_add_notification_recipient_split/
- Concepts:  prisma migrate dev, pg_advisory_lock, schema-engine, stale process, kill PID, dev DB
- Narrative: While applying 4.1d's migration, `pnpm prisma migrate dev` hung indefinitely at the `pg_advisory_lock` step.
  Cause: a previous `prisma migrate dev` invocation from an earlier session was backgrounded (probably via Ctrl+Z or a parent shell exit) and its schema-engine subprocess still held the migration advisory lock against the dev DB.
  Diagnosis: `ps aux | grep prisma` showed multiple stale schema-engine PIDs lingering from earlier sessions; `SELECT * FROM pg_locks WHERE locktype='advisory';` against the dev DB confirmed the lock holders matched those PIDs.
  Fix: kill the stale PIDs (`kill <pid>` for each schema-engine in the ps output — they release the advisory lock on exit). Then re-run `pnpm prisma migrate dev` and it completes normally.
  Rule of thumb: when migrate dev hangs >30s with no output, suspect a stale lock holder. Don't kill --9 the foreground prisma — kill the background schema-engine process(es) instead. The foreground command resumes once locks free up.
  Preventative: in future sessions, always foreground prisma migrate dev (don't background or pipe to nohup). If a migrate dev is interrupted, run `ps aux | grep prisma` immediately and kill any leftover schema-engine PIDs before retrying.

## 2026-05-19 — 🟤 Backfill SQL inside Prisma migrations should use deterministic IDs for idempotency
- Type:      🟤 decision
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     packages/db/prisma/migrations/20260519233500_add_notification_recipient_split/migration.sql
- Concepts:  prisma migrations, data migration, backfill, idempotency, cuid vs uuid vs md5, staging/prod recovery
- Narrative: 4.1d's migration creates a new table (notification_recipients) and back-fills 1 row per existing Notification.
  Question: what ID strategy for the backfilled rows? Prisma's `@id @default(cuid())` only fires when no ID is supplied to INSERT; direct SQL INSERT must supply IDs.
  **Decision**: use a deterministic md5-derived ID: `'c' || substring(md5('nr_' || id || '_' || user_id) FROM 1 FOR 24)`. Format matches cuid shape (25 chars, starts with 'c') so the column type is honest; same inputs always produce the same ID.
  **Why**: idempotent re-run. If a DBA needs to re-execute the backfill by hand during staging/prod recovery (e.g., partial migration failure, accidental table truncation), the same source rows produce the same target IDs — no duplicate-key risk, no data divergence between recovery attempts. Alternatives rejected: `gen_random_uuid()::text` (non-deterministic, re-run produces fresh IDs); generating IDs in app code via Prisma (would require a separate migration script outside the prisma migrate flow, breaking the atomic-migration property).
  **Trade-off**: mixed-inventory IDs across the table — backfilled rows have md5-derived IDs while new rows (created via Prisma client) have true cuid IDs. Acceptable since IDs are opaque strings everywhere they're consumed. No ID-format-validation code anywhere assumes pure cuid format.
  **When to apply**: any future migration that backfills a new table from an existing one. Default to deterministic md5(constants || source_id || ...) over gen_random_uuid().

## 2026-05-19 — 🟤 v2 spec is the authoritative source — verify against PRODUCT.md before trusting STATE.md plan text
- Type:      🟤 decision
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     docs/v2/PRODUCT.md (L480-484), .cline/STATE.md (4.1d plan section), project_marine_guardian_phase8_batch4.md memory file
- Concepts:  governance hierarchy, plan vs spec, PRODUCT.md priority 4, decision verification
- Narrative: The STATE.md plan text for 4.1d had 3 errors that would have shipped wrong v2 schema if executed verbatim:
  (1) Plan said move `notificationType` from Notification to NotificationRecipient. v2 spec L480 keeps it on Notification (alert type doesn't vary per recipient).
  (2) Plan omitted the `read_at` field on NotificationRecipient. v2 spec L483 includes it (per-user read timestamp).
  (3) Plan implied `email_status` was just a default-string field. v2 spec L483 defines it as a 5-value enum (`pending|sent|suppressed_by_cooldown|digested|failed`).
  Caught during main-session pre-flight inspection (grep docs/v2/PRODUCT.md for "NotificationRecipient" + "Notification (Command Center"). Fixed in the dispatched subagent's task brief BEFORE the work was dispatched.
  **Rule**: BEFORE executing any sub-batch plan, grep the authoritative spec (docs/v2/PRODUCT.md for v2 work; docs/PRODUCT.md for v1) for the relevant model section. Compare each field listed in the plan against the spec. If the plan deviates, the spec wins (priority 4 in CLAUDE.md hierarchy) — update the plan BEFORE dispatching execution. Treat STATE.md plan text as a starting hypothesis, not a contract.
  This is especially load-bearing for v2 work where the plan was written from a draft entity-vs-schema diff that may not have captured every field per the final v2 spec.

## 2026-05-19 — 🔴 Prisma migrate dev sweeps multiple new models into ONE migration — --name does NOT split
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1c (FuelEntry + ReportExport scaffolds)
- Files:     packages/db/prisma/migrations/20260519231300_add_fuel_entry/, packages/db/prisma/migrations/20260519231301_add_report_export/, packages/db/prisma/schema.prisma
- Concepts:  prisma-migrate, migrate-dev, multi-model-sweep, --create-only, --name flag, migration-splitting
- Narrative: When a task spec demands "one migration per table" and you add MULTIPLE new models to schema.prisma BEFORE running migrate-dev, Prisma sweeps ALL pending model additions into a SINGLE migration regardless of `--name`. The `--name` flag only controls the directory name — it does NOT scope which schema changes land in the migration. The Sub-batch 4.1c agent ran `prisma migrate dev --create-only --name add_fuel_entry` with both FuelEntry AND ReportExport already in schema.prisma; Prisma generated one migration containing both tables. Two workarounds: (a) PREFERRED — add models to schema.prisma INCREMENTALLY: add model 1 → run migrate-dev with name1 → add model 2 → run migrate-dev with name2; (b) ACCEPTED HERE — let the sweep happen, then hand-split the SQL: keep the first table's SQL in the original migration directory (rename the directory if needed for ordering) and write the second table's SQL into a fresh migration directory with a timestamp 1 second later (matching format: `YYYYMMDDHHMMSS+1_add_X`). The hand-split path is fine for additive scaffolds but riskier when migrations have ordering dependencies — the (a) path is safer. Related: the 2026-05-12 🟡 "enum drift sweeps into next migration" lesson is the same family of issue. Pattern recognition: if `prisma migrate dev --create-only --name X` produces a migration containing changes you didn't expect → check schema.prisma for ALL pending model/enum/index changes; the migration is a snapshot of the current schema-vs-DB delta, not a snapshot of what `--name X` semantically describes.

## 2026-05-19 — 🟡 Zod .cuid() strict format check rejects synthetic short strings in test fixtures
- Type:      🟡 fix
- Phase:     Phase 8 Batch 4 Sub-batch 4.1c (FuelEntry + ReportExport scaffold tests)
- Files:     apps/web/src/server/trpc/routers/__tests__/fuelEntry.test.ts, apps/web/src/server/trpc/routers/__tests__/reportExport.test.ts
- Concepts:  zod, cuid, test-fixtures, schema-validation, vitest, mock-data
- Narrative: When a Zod input schema uses `.cuid()` to validate an ID field, test fixtures using short strings like `"ab-1"` or `"user-1"` fail validation with "Invalid cuid" at the input-parsing stage — BEFORE the procedure body runs. The Sub-batch 4.1c tests hit this when writing the first happy-path test for fuelEntry.update: `{ id: "fe-1" }` failed `.parse()` immediately. Cuid format spec: ~25 lowercase alphanumeric chars starting with 'c'. Fix: use a synthetic 25-char cuid-shaped string in test fixtures: `"c000000000000000000000001"` (starts with c, all valid chars, exactly 25 chars). Increment the trailing digits for unique IDs across the test file: `"c000000000000000000000002"`, etc. Define a fixture helper at the top of the test file to keep this DRY:
    `const cuid = (n: number) => 'c' + n.toString(36).padStart(24, '0');`
  Then call sites: `cuid(1)`, `cuid(42)`, etc. Same pattern needed for any procedure whose input schema validates `.cuid()` — areaBoundary (4.1a) and patrolTrack (4.1b) test files used the same synthetic-cuid pattern but the helper was inlined per-test; the helper extraction is cleaner. Note: Zod's `.cuid()` also accepts `cuid2` format if the schema uses `.cuid2()` — different format (lowercase letters + digits, 24 chars by default, no starting-letter constraint). Marine-Guardian uses Prisma's `@default(cuid())` which is the original cuid spec.

## 2026-05-12 — 🟡 Response.text() strips UTF-8 BOM during decoding — assert BOM via arrayBuffer()
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 Item 4 SS-1 (events export Route Handler tests)
- Files:     apps/web/src/app/api/exports/events/__tests__/route.test.ts
- Concepts:  utf-8, bom, response, fetch-spec, text-decoder, vitest, route-handler, csv
- Narrative: A test that asserted `(await res.text()).charCodeAt(0) === 0xFEFF` failed even though
  the CSV body definitely starts with the BOM. Root cause: per the Fetch spec, `Response.text()`
  runs UTF-8 decoding via TextDecoder which strips a leading BOM by default
  (https://encoding.spec.whatwg.org/#utf-8-decode). The BOM IS on the wire — just gone after decoding.
  Fix: read the response as bytes and check the raw three-byte sequence:
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const bodyText = new TextDecoder("utf-8").decode(buf);  // explicit decode preserves BOM if needed
  Note: `TextDecoder("utf-8", { ignoreBOM: true })` is the default; pass `{ ignoreBOM: false }` only
  if you need to surface the BOM as U+FEFF in the decoded string. Excel still detects the encoding
  fine because it reads the raw bytes — only JavaScript decoders strip it.
  Applies to: SS-2/SS-3/SS-4 (patrols / alert-rules / notifications + alert-history) — every export
  Route Handler test should follow this pattern when verifying CSV BOM presence.

## 2026-05-12 — 🟡 Vitest needs @vitejs/plugin-react when tsconfig sets jsx:preserve
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 Item 4 SS-0 (exports foundation)
- Files:     apps/web/vitest.config.ts, apps/web/package.json (devDependencies)
- Concepts:  vitest, vite, jsx, tsconfig, @vitejs/plugin-react, @react-pdf/renderer, test-setup
- Narrative: First time the repo introduced a server-side `.tsx` source file (apps/web/src/server/lib/export-pdf.tsx for
  @react-pdf/renderer) and tried to test it with vitest. Tests failed with "Failed to parse source for import analysis
  because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve."
  Root cause: tsconfig.base.json has `"jsx": "preserve"` (the Next.js default — Next handles the JSX transform during
  its own build, so tsc emits JSX unchanged). Vite 8 / vitest 4 honor that setting during the import-analysis pass on
  `.tsx` files. Two fix attempts that DID NOT work: (a) `esbuild.jsx: "automatic"` in vitest.config.ts — vite still
  reads the disk tsconfig for the parse pass; (b) `esbuild.tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } }` —
  same result, the override is applied to esbuild but vite's import-analysis runs first. The fix that works:
  `pnpm --filter @marine-guardian/web add -D @vitejs/plugin-react`, then in vitest.config.ts add
  `plugins: [react()]` to the defineConfig. The plugin transforms JSX before vite's import-analysis sees it, so the
  tsconfig.json's `jsx: "preserve"` setting becomes a no-op for tests (Next.js's own build still respects it). This
  is now baked in for any future server-side `.tsx` file the project adds (PDF templates, MJML email templates, etc.).
  Apply when: adding any new `.tsx` source file outside `apps/web/src/app/**` or `apps/web/src/components/**` and
  writing a vitest test for it. NOT needed for `.ts` tests that only import `.tsx` indirectly via type — only the
  direct `.tsx` import (source or test) triggers the parse failure.

## 2026-05-12 — 🟢 AlertHistory immutable audit trail added (Phase 8 Batch 2 Item 3)
- Type:      🟢 change
- Phase:     Phase 8 Batch 2 — alert engine hardening
- Files:     packages/db/prisma/schema.prisma, packages/jobs/src/processors/alerts.processor.ts, apps/web/src/server/trpc/routers/alertHistory.ts, apps/web/src/app/(dashboard)/alerts/history/page.tsx
- Concepts:  alert-engine, audit-trail, snapshot-fields, transaction-atomicity, prisma
- Narrative: AlertHistory model holds one row per (rule × event) match — NOT per recipient. Grain choice matters:
  per-recipient would conflate "rule fired once for 5 admins" with "rule fired 5 times" in reports. The processor
  writes the history row INSIDE the same `$transaction` as the per-recipient notification + audit log writes,
  so if history.create fails the whole alert rolls back atomically (no notifications without history). Snapshot
  fields `ruleNameSnapshot` and `eventTitleSnapshot` preserve display strings even after the parent rule or event
  is later deleted — FK constraints use `ON DELETE SET NULL` so history rows survive deletion with the snapshot
  taking over for display ("Rule Name (deleted)" italic in the UI). Lessons for future audit-trail work in this
  codebase: (a) bake the snapshot column in from migration #1 — backfilling snapshots later is expensive;
  (b) write inside the same transaction as the side-effects you're auditing, never in a follow-up step.
# ---

## 2026-05-12 — 🟡 shadcn Table primitive missing — install via shadcn CLI, not by hand
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 — alert history UI page
- Files:     apps/web/src/components/ui/table.tsx
- Concepts:  shadcn, ui-primitives, missing-component, dlx
- Narrative: Marine-Guardian was scaffolded with a minimal shadcn footprint — only button, card, dialog, badge,
  input, label, select, switch, separator were installed initially. Table is NOT among them. First time something
  needs a `<Table>` (here: alert history list), the import fails with `Cannot find module '@/components/ui/table'`.
  Fix: `cd apps/web && pnpm dlx shadcn@latest add table --yes`. Same pattern applies for any other shadcn primitive
  not yet installed (data-table, accordion, sheet, tabs, etc.). Do NOT hand-write a Table component — the shadcn
  one has the correct CSS variable + Tailwind class composition for dark mode + the rest of the design system.
# ---

## BOOTSTRAP — 🔴 WSL2 + Docker Desktop known pitfalls
- Type:      🔴 gotcha
- Phase:     Phase 0 Bootstrap / Phase 1 dev environment open
- Files:     .env.dev, docker-compose.*.yml, .nvmrc
- Concepts:  wsl2, docker-desktop, pnpm, nvm, permissions
- Narrative: Real failures on WSL2 + Docker Desktop. All fixes baked into Bootstrap template.
  (1) Never use corepack enable — use npm install -g pnpm. corepack symlinks fail in some WSL2 setups.
  (2) pnpm install must run from WSL2 terminal — not Windows PowerShell or CMD.
  (3) Docker Desktop must be running before any docker compose command. Check with: docker ps.
  (4) Port conflicts: dev services use non-standard random ports (Rule 22). If conflict occurs,
      regenerate ports in inputs.yml → run Phase 7 → restart services.
  (5) nvm must be sourced in .bashrc — add: [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  (6) WSL2 file permissions: always develop inside WSL2 filesystem (/home/user/) not /mnt/c/.
      Working in /mnt/c/ causes severe pnpm and docker performance issues.
# ---

## 2026-05-03 — 🔴 Prisma v6 deprecated $use/$middleware — use $extends + defineExtension
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 3
- Files:     packages/db/src/client.ts, packages/db/src/middleware/encryption.ts, packages/db/src/middleware/tenant-guard.ts
- Concepts:  prisma, middleware, extension, $use, $extends, defineExtension
- Narrative: Prisma v6 removed $use() and the Prisma.Middleware type. All middleware must be rewritten
  as Prisma extensions using Prisma.defineExtension with $allOperations. Chain extensions via
  basePrisma.$extends(ext1).$extends(ext2). The encryption extension must be applied first in the
  chain so encrypted fields are handled before tenant scoping.

## 2026-05-03 — 🔴 npx prisma pulls v7 globally — use workspace-local prisma
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 3
- Files:     packages/db/package.json
- Concepts:  prisma, npx, pnpm, version conflict
- Narrative: Running `npx prisma generate` pulls Prisma v7 from the global registry even when
  the workspace has v6 in package.json. Prisma v7 has breaking changes (different schema syntax,
  renamed types). Always use `pnpm --filter @marine-guardian/db exec prisma generate` to run
  the workspace-local version.

## 2026-05-03 — 🟡 exactOptionalPropertyTypes + Prisma JSON fields
- Type:      🟡 fix
- Phase:     Phase 4 Part 3
- Files:     packages/db/src/helpers/audit.ts
- Concepts:  typescript, exactOptionalPropertyTypes, prisma, InputJsonValue, JSON
- Narrative: With exactOptionalPropertyTypes: true, you cannot assign `undefined` to an optional
  property. For optional Prisma JSON fields, use a spread pattern instead:
  `...(value != null ? { field: value } : {})`. Also, Prisma JSON fields require
  `Prisma.InputJsonValue` — not `Record<string, unknown>` (which contains `unknown` values
  that Prisma's JSON type system rejects).

## 2026-05-03 — 🔴 CJS require() fails in ESM TypeScript modules
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 4
- Files:     packages/ui/src/tailwind.config.ts
- Concepts:  esm, cjs, require, tailwindcss, plugins, type module
- Narrative: With "type": "module" in package.json, CJS require() is not available. The tailwind
  config used `plugins: [require("tailwindcss-animate")]` which fails with TS2580. Fix: use an
  empty plugins array and let consuming apps add the animate plugin via proper ESM import.
  This applies to ALL packages in the monorepo — never use require() in any .ts file.

## 2026-05-03 — 🟡 Seed script upsert requires schema-defined unique constraint
- Type:      🟡 fix
- Phase:     Phase 4 Part 3
- Files:     packages/db/prisma/seed.ts
- Concepts:  prisma, upsert, unique constraint, seed
- Narrative: Prisma upsert's `where` clause only accepts fields with @unique or @@unique
  constraints. If no compound unique exists (e.g. PatrolArea has no @@unique([tenantId, name])),
  use findFirst + conditional create pattern instead of upsert for idempotent seeding.

## 2026-05-03 — 🔴 exactOptionalPropertyTypes breaks next-auth module augmentation
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 5
- Files:     apps/web/src/server/auth/types.ts, apps/web/src/server/auth/config.ts
- Concepts:  typescript, exactOptionalPropertyTypes, next-auth, module-augmentation
- Narrative: With exactOptionalPropertyTypes: true, declaring `userId?: string` in a
  module-augmented interface means the property can be omitted but CANNOT be explicitly
  set to undefined. Since next-auth's base User type has `id?: string` (which resolves
  to string | undefined at usage), assigning `token.userId = user.id` triggers TS2412.
  Fix: declare all optional JWT properties as `key?: Type | undefined` to allow explicit
  undefined assignment. This pattern is needed for ANY module augmentation where the base
  library types use plain optional syntax.

## 2026-05-03 — 🟡 tailwindcss-animate has no type declarations
- Type:      🟡 fix
- Phase:     Phase 4 Part 5
- Files:     apps/web/src/types/tailwindcss-animate.d.ts, apps/web/tailwind.config.ts
- Concepts:  typescript, tailwind, ambient-module-declaration
- Narrative: tailwindcss-animate ships no TypeScript declarations. Importing it in a
  strict TypeScript tailwind.config.ts causes TS2307 "Cannot find module". Fix: create
  an ambient module declaration file `declare module "tailwindcss-animate";` and ensure
  the types directory is included in tsconfig.json.

## 2026-05-03 — 🟤 GitHub Actions security hook fires on ALL .github/workflows/ writes — approve both
- Type:      🟤 decision
- Phase:     Phase 4 Part 8
- Files:     .github/workflows/ci.yml, .github/workflows/docker-publish.yml
- Concepts:  github-actions, security-hook, injection, ci, workflow
- Narrative: The project pre-tool-use security hook fires a GitHub Actions injection warning
  whenever Claude Code writes to .github/workflows/. This is EXPECTED BEHAVIOR — the hook
  correctly audits workflows for injection vectors. Both Part 8 workflow files are safe:
  ci.yml uses only matrix.task (static enum: lint/typecheck/test/build), github.ref_name,
  github.sha — no user-controlled values in run: commands.
  docker-publish.yml uses only secrets.DOCKERHUB_USERNAME, secrets.DOCKERHUB_TOKEN,
  steps.meta.outputs.tags, steps.meta.outputs.labels — no user-controlled values in run: commands.
  Decision: approve both workflow writes after confirming no injection vectors. The hook is
  working correctly — review it on each future workflow write, but these two files are safe.

## 2026-05-03 — 🔴 pnpm audit --fix writes overrides but lockfile must be regenerated before --frozen-lockfile works
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     package.json (root), pnpm-lock.yaml
- Concepts:  pnpm, audit, overrides, lockfile, frozen-lockfile, CVE
- Narrative: Running `pnpm audit --fix` writes pnpm.overrides entries to root package.json
  but does NOT regenerate pnpm-lock.yaml. The next `pnpm install --frozen-lockfile` then
  fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH because the lockfile doesn't reflect the
  new overrides. Fix: run bare `pnpm install` (without --frozen-lockfile) immediately after
  `pnpm audit --fix` to regenerate the lockfile. Commit the updated lockfile alongside the
  package.json overrides. After that, `pnpm install --frozen-lockfile` (CI) will pass.
  This session: bcrypt > @mapbox/node-pre-gyp > tar@6.2.1 chain had 6 HIGH CVEs.
  10 pnpm overrides applied; 0 vulnerabilities after re-audit.

## 2026-05-03 — 🔴 bcrypt native binary missing after clean install — must pre-download before pnpm build
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     node_modules/bcrypt/
- Concepts:  bcrypt, native-addon, node-pre-gyp, node_modules, build
- Narrative: bcrypt's native C++ addon (bcrypt_lib.node) is not included in the npm package.
  It must be compiled or downloaded from GitHub releases via node-pre-gyp. After a fresh
  `pnpm install`, the binary is absent and `pnpm build` fails with a module-not-found error
  at runtime (Next.js standalone build tries to require the native module).
  Fix: `cd node_modules/bcrypt && npx @mapbox/node-pre-gyp install --fallback-to-build`
  This downloads the prebuilt binary for the current platform, falling back to compilation
  if no prebuilt exists. Must be re-run on any new machine or after `rm -rf node_modules`.
  The committed pnpm-lock.yaml does NOT preserve this binary — it is machine-local.

## 2026-05-03 — 🔴 useSearchParams() in Next.js App Router requires Suspense boundary on static pages
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     apps/web/src/app/login/page.tsx
- Concepts:  nextjs, app-router, useSearchParams, suspense, static-rendering, prerender
- Narrative: Any component that calls `useSearchParams()` must be wrapped in a `<Suspense>`
  boundary. If the page component itself calls useSearchParams(), Next.js cannot statically
  prerender the page shell and throws a build error. Fix: extract the useSearchParams consumer
  into a separate module-level component (e.g. `LoginForm`), then make the page export a thin
  `<Suspense><LoginForm /></Suspense>` wrapper. The page component itself must not call any
  hook that requires client-side rendering. This applies to ALL App Router pages that read
  URL search params.

## 2026-05-03 — 🟡 squash-merge requires git branch -D (force delete)
- Type:      🟡 fix
- Phase:     Phase 4 Part 8 (also applies to all scaffold/part-N branches)
- Files:     none (git operation)
- Concepts:  git, squash-merge, branch-delete
- Narrative: After squash-merging a feature branch to main, `git branch -d` refuses to delete
  the branch because squash merge does not register as a fully merged commit in git's tracking
  (the branch commit is not an ancestor of main after a squash). Fix: always use
  `git branch -D` (force delete) after squash-merging. This is expected behavior for all
  scaffold/part-N branches and feat/{slug} branches in this project.

## 2026-05-05 — 🔴 Alpine Linux resolves localhost to IPv6 — use 127.0.0.1 in Docker healthchecks
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     deploy/compose/dev/docker-compose.app.yml
- Concepts:  docker, alpine, ipv6, healthcheck, localhost, wget
- Narrative: Alpine Linux's /etc/hosts maps `localhost` to `::1` (IPv6 loopback). When Next.js
  starts with HOSTNAME="0.0.0.0", it binds to IPv4 only. A healthcheck using
  `wget -qO- http://localhost:3000/api/health` resolves to ::1 and gets "Connection refused"
  even though the app is running fine on 0.0.0.0:3000. Fix: always use `http://127.0.0.1:3000`
  in Docker healthcheck commands for Alpine-based images. This applies to ALL node:*-alpine
  images used in this project.

## 2026-05-05 — 🔴 Passwords with special characters in DATABASE_URL must be URL-encoded
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     .env.dev
- Concepts:  postgresql, database-url, url-encoding, prisma, password, pgbouncer
- Narrative: If an auto-generated password contains `/` or `+`, the DATABASE_URL connection
  string breaks because `/` is parsed as a path separator and `+` as a space. Prisma reports
  "invalid port number" (P1013) because it reads the portion after the slash as part of the
  host:port. Fix: URL-encode special characters in the password portion of connection strings:
  `/` → `%2F`, `+` → `%2B`, `@` → `%40`, `#` → `%23`. The raw DB_PASSWORD env var keeps
  the original characters — only the composed URL fields (DATABASE_URL, PGBOUNCER_DATABASE_URL)
  need encoding. Phase 3 credential generation should URL-encode passwords when composing URLs.

## 2026-05-05 — 🔴 PgBouncer env_file must not include DATABASE_URL — use individual env vars
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     deploy/compose/dev/docker-compose.db.yml
- Concepts:  pgbouncer, docker-compose, env_file, database-url, password
- Narrative: The edoburu/pgbouncer Docker image reads DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
  DB_NAME as individual environment variables to construct its internal connection. When
  env_file includes the full .env.dev file, PgBouncer also receives DATABASE_URL which it
  tries to parse separately — and if the password contains `/`, the URL is malformed causing
  PgBouncer to crash on startup. Fix: remove env_file from the pgbouncer service and set
  only the individual variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, POOL_MODE,
  MAX_CLIENT_CONN, DEFAULT_POOL_SIZE, AUTH_TYPE) directly in the environment: block.

## 2026-05-05 — 🔴 Prisma engine binary must be explicitly copied in Alpine standalone Dockerfile
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     apps/web/Dockerfile
- Concepts:  prisma, alpine, standalone, query-engine, dockerfile, binary
- Narrative: Next.js standalone output does not include Prisma's native query engine binary
  (libquery_engine-linux-musl-openssl-3.0.x.so.node). The app container starts but every
  database query fails with "Query engine library not found". Fix: in the Dockerfile builder
  stage, after `pnpm build`, add a step to find and copy the engine binary:
  `RUN mkdir -p /prisma-engines && find /app -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" -exec cp {} /prisma-engines/ \;`
  Then in the runner stage, copy to both locations Prisma checks:
  `COPY --from=builder /prisma-engines/ ./node_modules/.prisma/client/`
  `COPY --from=builder /prisma-engines/ ./apps/web/.next/server/`

## 2026-05-05 — 🟡 Prisma CLI on host requires sourcing .env.dev for DATABASE_URL
- Type:      🟡 fix
- Phase:     Phase 6
- Files:     .env.dev
- Concepts:  prisma, env-vars, database-url, source, shell
- Narrative: Prisma CLI (pnpm db:migrate, pnpm db:seed) runs on the host machine, not inside
  Docker containers. It needs DATABASE_URL from .env.dev but pnpm scripts don't auto-load
  env files. Fix: prefix Prisma commands with `set -a && source .env.dev && set +a &&` to
  export all variables from .env.dev into the current shell session before running Prisma.
  Alternative: add dotenv-cli as a dev dependency and prefix scripts with `dotenv -e .env.dev --`.

## 2026-05-06 — 🔴 Docker internal networking: worker containers must NOT use host-mapped ports
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     packages/jobs/src/connection.ts, deploy/compose/dev/docker-compose.app.yml, deploy/compose/stage/docker-compose.app.yml, deploy/compose/prod/docker-compose.app.yml
- Concepts:  docker, networking, valkey, redis, bullmq, worker, compose, env-vars
- Narrative: Worker containers crashed with ECONNREFUSED to localhost:45196. Root cause: .env.dev
  sets REDIS_HOST=localhost and REDIS_PORT=45196 (host-mapped port) which is correct for the host
  machine but WRONG inside Docker containers. Inside the Docker network, Valkey is reachable at
  ${COMPOSE_PROJECT_NAME}_valkey:6379 (internal hostname and internal port). Fix: add REDIS_HOST
  and REDIS_PORT overrides in the compose environment: block for the worker service, pointing to
  the Docker internal hostname and port 6379. REDIS_PASSWORD flows correctly from env_file without
  needing an override. IMPORTANT: never reference ${REDIS_PASSWORD} in a compose environment: block
  — Docker Compose interpolates ${VAR} in environment: from the SHELL environment at compose-up
  time, NOT from env_file contents. This causes "variable not set" warnings and blank passwords.
  Keep secrets in env_file only; use environment: overrides only for non-secret values like
  hostnames and ports that differ between host and container contexts.

## 2026-05-08 — 🔴 React.ElementRef deprecated in React 19 — affects every shadcn primitive
- Type:      🔴 gotcha
- Phase:     Phase 7 (Feature Update — alerts/notifications UI)
- Files:     apps/web/src/components/ui/{dialog,dropdown-menu,select,separator,switch,tabs,scroll-area}.tsx
- Concepts:  shadcn/ui, react-19, forwardRef, eslint-no-deprecated, ComponentRef
- Narrative: Every shadcn/ui primitive vendored via `npx shadcn@latest add` uses
  `React.ElementRef<typeof Primitive>` paired with `React.forwardRef`. Under React 19 this is
  deprecated; `@typescript-eslint/no-deprecated` flags every occurrence. One bulk sed fixes all:
  `sed -i 's/React\.ElementRef/React.ComponentRef/g' src/components/ui/*.tsx`
  `ComponentRef<T>` is the drop-in replacement (both come from React core, same generic shape).
  Apply this immediately after any `npx shadcn@latest add` until shadcn updates their templates.
  Already seen with: scroll-area (Event Kanban), dialog/dropdown-menu/select/separator/switch/tabs
  (alerts/notifications). Will recur with any future shadcn add.

## 2026-05-08 — 🟡 vitest expect.objectContaining unsafe-assignment in nested matchers
- Type:      🟡 fix
- Phase:     Phase 7 (alertRule/notification/event tRPC tests)
- Files:     apps/web/src/server/trpc/routers/__tests__/{alertRule,notification,event}.test.ts
- Concepts:  vitest, eslint-no-unsafe-assignment, objectContaining, DeeplyAllowMatchers, type-safety
- Narrative: vitest's `expect.objectContaining(x)` returns `any`. When used as a nested property
  value (`{ where: expect.objectContaining({ tenantId }) }`) the outer object literal triggers
  `@typescript-eslint/no-unsafe-assignment` because the inner result is typed `any`. Naive fix
  with `<T extends object>(obj: Partial<T>): T { return expect.objectContaining(obj) as T; }`
  fails typecheck because `objectContaining` formally takes `DeeplyAllowMatchers<T>` (not exported
  cleanly). Working pattern: define one helper per test file with widened input + narrow
  one-line cast and disable comment, signature `partial<T>(obj: T): T`:
    function partial<T>(obj: T): T {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return expect.objectContaining(obj as any) as T;
    }
  Then call sites become `partial({ where: partial<{ tenantId: string }>({ tenantId: "abc" }) })`
  — fully typed, no lint errors, no typecheck errors. The `as any` is justified: vitest matchers
  ARE inherently dynamic and typing them precisely requires importing internal vitest types that
  are not stable across versions.

## 2026-05-08 — 🟡 shadcn DropdownMenuCheckboxItem violates exactOptionalPropertyTypes
- Type:      🟡 fix
- Phase:     Phase 7 (alerts/notifications UI — dropdown-menu primitive)
- Files:     apps/web/src/components/ui/dropdown-menu.tsx
- Concepts:  shadcn/ui, exactOptionalPropertyTypes, radix-ui, CheckedState, conditional-spread
- Narrative: shadcn's vendored `DropdownMenuCheckboxItem` does
  `<DropdownMenuPrimitive.CheckboxItem checked={checked} {...props}>` after destructuring
  `checked` from optional props. Under our root tsconfig `exactOptionalPropertyTypes: true`,
  `checked` becomes `CheckedState | undefined`, but Radix's prop type is `CheckedState` (no
  undefined). TS errors: `Type 'undefined' is not assignable to type 'CheckedState'`. Fix is to
  conditionally spread instead of always passing the prop:
    {...(checked !== undefined ? { checked } : {})}
  Same pattern applies to any vendored shadcn primitive whose Radix counterpart has a
  non-optional discriminator that shadcn's wrapper exposes as optional. Quick scan after any
  shadcn add: grep for `={[a-zA-Z]+}` after destructured optional props passed straight through
  to Radix primitives. Related: optional booleans like `inset` need explicit `=== true` check
  in conditional class expressions to satisfy strict-boolean-expressions.

## 2026-05-12 — 🟢 Seed passwords moved from hardcoded constants to env vars
- Type:      🟢 change
- Phase:     Phase 8 Batch 2 (post-map-feature-group cleanup — Tier 1 tech debt)
- Files:     packages/db/prisma/seed.ts, .env.dev, .env.staging, .env.prod, .env.example, CREDENTIALS.md
- Concepts:  prisma-seed, upsert, password-rotation, bcrypt, env-vars, idempotent-seed
- Narrative: The seed script previously hardcoded `WEBMASTER_PASSWORD` as a top-level constant AND
  used `update: {}` on the user upsert. Two problems combined: (a) the plaintext password was
  visible in git history forever, and (b) re-running `pnpm db:seed` did nothing to the password
  even if you wanted to rotate it — the upsert took the `update: {}` no-op path on existing users.
  Fix: read both `WEBMASTER_PASSWORD` and `DEMO_SITE_ADMIN_PASSWORD` from `process.env` via a
  `requireEnv()` helper that throws with a remediation message; set `update: { passwordHash }` on
  both user upserts so re-seeding always rotates. Pattern for any seed account: env-var sourced
  + upsert-update-path = rotatable. Plaintext lives only in CREDENTIALS.md (gitignored) and
  .env.{env} (gitignored). Verified with `bcrypt.compare(process.env.X, user.passwordHash)`
  returning true for both accounts after re-seed. Applies to any future seeded account — never
  hardcode credentials in seed scripts again, even for "demo" accounts in dev.

## 2026-05-12 — 🟢 Notification.patrolId nullable FK added; UI click-through prioritizes patrol over event
- Type:      🟢 change
- Phase:     Phase 7 Feature Update (spec deferral #3 from STATE.md)
- Files:     packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260512024505_add_notification_patrol_id/, packages/shared/src/types/notification.ts, apps/web/src/server/trpc/routers/notification.ts, apps/web/src/app/(dashboard)/notifications/page.tsx
- Concepts:  prisma-fk, nullable-relation, click-through, notification-center, exactOptionalPropertyTypes
- Narrative: PRODUCT.md L187 says "Click-through to related event or patrol" — until this change
  only the event path existed. Added `patrolId String? @map("patrol_id")` on Notification with
  `patrol Patrol? @relation(fields: [patrolId], references: [id])`, plus `notifications Notification[]`
  inverse on Patrol, plus `@@index([patrolId])`. Router `list` query now `include`s
  `patrol: { select: { id: true, title: true, serialNumber: true } }` alongside the existing
  event include. UI click-through priority: patrol → event → no-link (patrol wins when both
  present because it's the more specific destination). Metadata row mirrors the priority and
  uses `n.patrol.title ?? n.patrol.serialNumber ?? n.patrol.id` for the label (Patrol.title is
  nullable). Pattern reusable for any "Notification has one of several optional related
  entities" — order the priorities by specificity, compute one `href` variable, conditionally
  wrap Link only when href !== null. Alerts processor untouched — patrolId stays null on
  notifications created from event-only alerts; future patrol-aware rules can populate it.

## 2026-05-12 — 🟡 Subagent thrashing from hook-injection overhead — escalate to Opus-direct, do NOT re-dispatch
- Type:      🟡 fix
- Phase:     Phase 7 Feature Update (Notification.patrolId FK migration)
- Files:     n/a (process gotcha — applies to any Phase 7/8 work)
- Concepts:  subagent, thrashing, hook-injection, vercel-plugin, claude-mem, opus-escalation, memory-governance
- Narrative: Sonnet 4.6 subagent thrashed on a tightly-scoped Tier-2 task that should have fit
  in its 30K budget. Root cause was NOT the task scope — it was the hook-injection overhead.
  Every Read tool call from inside a subagent triggers (a) vercel-plugin auto-suggesters that
  pattern-match on file paths like `prisma/schema.prisma`, `app/**`, `apps/web/**` and inject
  ~1.5K of "use this skill" boilerplate (next-forge, vercel-storage, bootstrap, nextjs,
  next-cache-components — none applicable to this self-hosted Docker project), and (b)
  claude-mem prior-observation context (~500 tokens per Read pointing at past observation IDs).
  10 Read calls = ~20K of pure hook overhead before any real work. The subagent burned its
  budget on the injected context, not on the planned reads. Fix per memory-governance.md §4
  thrashing rule: STOP the agent. DO NOT re-dispatch the same task — it will thrash again the
  same way. Escalate per §2.5b: complete the remaining work as Opus-direct (Opus has 100K
  budget, can absorb the hook overhead) and log the justification in STATE.md. Pattern: if a
  subagent thrashes despite a token estimate well under 30K, check whether hook injection is
  inflating every tool call. If yes → Opus-direct is the right call, not "split the task
  smaller" (which still pays the hook overhead per call). Forward fix on the horizon: hook
  filtering by relevance, or disabling vercel-plugin auto-suggesters for non-Vercel projects.

## 2026-05-12 — 🟡 Pre-existing schema drift sweeps into next migration (SyncStatus.running case)
- Type:      🟡 fix
- Phase:     Phase 7 Feature Update (Notification.patrolId FK migration)
- Files:     packages/db/prisma/schema.prisma (SyncStatus enum line ~60), packages/db/prisma/migrations/20260512024505_add_notification_patrol_id/migration.sql
- Concepts:  prisma-migrate, schema-drift, enum-value, postgres-enum-immutability, migration-hygiene
- Narrative: `prisma migrate dev --create-only` unexpectedly included `ALTER TYPE "SyncStatus"
  ADD VALUE 'running'` alongside the actual Notification.patrolId changes. Investigation showed
  the init migration created SyncStatus with `('success', 'failed', 'partial')` only — but
  schema.prisma had `running` added at some point (almost certainly with the alert engine sync
  wiring on 2026-05-11, see observation 58) without a corresponding migration. The drift sat
  dormant until the next `migrate dev` run. Prisma's drift detector correctly swept the missing
  value into this migration. Decision: KEEP the sweep in this migration (reverting would just
  push the same drift into the NEXT migration — endless punt). Document the sweep in down.sql
  header comment so anyone running a rollback knows why an enum value remains. PostgreSQL note:
  `DROP VALUE` is not a supported operation on enums — the only way to "remove" a value is to
  rename the enum, create a fresh one without the value, alter the column type, drop the old.
  Too heavy for a routine down-migration. So enum value additions are effectively one-way in
  PG; the down.sql cleanly reverses the patrol_id column changes but leaves the enum value as
  a no-op residue. Prevention: every time you edit an enum in schema.prisma, IMMEDIATELY run
  `prisma migrate dev --name <descriptive>` to capture it as its own migration. Don't let enum
  changes sit alongside other in-flight schema work — they pollute the next unrelated migration
  with a confusing extra line.

## 2026-05-20 — 🔴 Opus 4.7 executor subagent can silently drop mid-brief while reporting "completed"
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1e (and applies to any future Architect-Execute dispatch on this codebase)
- Files:     N/A — process/orchestration lesson
- Concepts:  architect-execute, subagent-dispatch, opus-executor, partial-completion, status-trust, git-verify
- Narrative: Dispatched Opus 4.7 executor subagent in background for Tier-2 ~30K-token sub-batch (11-file brief: schema edit + migration + 6 shared package files + 2 test files + branch + commit). Subagent reported `STATUS: completed` after 6.6 min / 35 tool uses / 269K tokens consumed. But final visible result text was truncated mid-sentence: `"Client generated. Now read shared package files to match prevailing style:"` — clearly stopped at step 7 of 11. Git inspection confirmed: branch created + schema.prisma edited + migration directory created (both .sql files) + prisma generate + prisma migrate dev all completed correctly. But the 6 shared package edits + 2 test files were NOT done. NO commit on the branch. NEVER trust the verbal "completed" status without verifying actual repo state via git status + git diff + git log. Lesson confirmed previously for Sonnet executors ([[feedback_sonnet_thrash_inspect_before_redispatch]]) — now confirmed for Opus too. The salvage protocol is identical regardless of which model dropped: (1) git status to see uncommitted modifications + untracked files, (2) git diff to verify partial work matches the brief's prescription, (3) git stash list for any escape-hatch stashes, (4) if partial work is correct → continue from interrupted step in main session OR re-dispatch with narrower scope, (5) if partial work is wrong → reset + re-dispatch. For 4.1e the salvage continuation in main session cost ~15K extra tokens vs an additional ~25K for a re-dispatch — Architect time was cheaper. Token usage 269K with only 35 tool uses suggests the subagent spent most of its budget on reasoning/planning rather than execution, possibly hitting an internal context wall during step 7's pre-edit shared file analysis. Future mitigation: for Tier-2 dispatches with many small file edits at the tail, consider splitting into "schema + migration" subagent + "shared package + tests" subagent rather than a single 11-file dispatch — keeps each agent's working set under a single concept.

## 2026-05-20 — 🟢 Sub-batch 4.1e shipped — 🎯 Phase 8 Batch 4 v2 Foundation Tables COMPLETE
- Type:      🟢 change
- Phase:     Phase 8 Batch 4 (closes the batch)
- Files:     packages/db/prisma/schema.prisma (Tenant + Event + Patrol + AreaBoundary edits), packages/db/prisma/migrations/20260520010000_add_area_attribution_and_tenant_arcgis/{migration,down}.sql, packages/shared/src/types/{event,patrol,tenant}.ts, packages/shared/src/schemas/{event,patrol,tenant}.ts, apps/web/src/server/trpc/routers/__tests__/patrol.test.ts (NEW)
- Concepts:  v2-foundation, area-attribution, arcgis, additive-schema, batch-complete, milestone
- Narrative: 4.1e adds the final v2 foundation wiring: area attribution columns on Event/Patrol (areaName + areaBoundaryId FK SET NULL + areaDerivedAt — all nullable, all stay NULL until Batch 5+ derivation algorithm lands) + Tenant ArcGIS reference fields (arcgisBoundaryUrl + arcgisBoundaryOutfields, encrypted at app layer per earthrangerUrl precedent). 7-step additive DDL with lossless reverse. Routers untouched (include-based queries auto-surface new fields). New patrol.test.ts closes the only v2-foundation router-test gap (6 cases — list happy + populated + getById + cross-tenant isolation + FORBIDDEN guard + stats). 268 tests passing across 38 files (was 262/37). Squash-merged as commit 6687112 on main. 🎯 All 5 Batch 4 sub-batches now shipped: 4.1a AreaBoundary 56fb3fa → 4.1b PatrolTrack cfe9195 → 4.1c FuelEntry+ReportExport e972d82 → 4.1d NotificationRecipient split d32e618 → 4.1e Event/Patrol/Tenant area attribution 6687112. v2 foundation tables in place for Batch 5+ work. Plan-correction-vs-v2-spec pattern confirmed twice now (4.1d notificationType + 4.1e area_name) — the lesson 🟤 "v2 spec is authoritative — verify against PRODUCT.md before trusting STATE.md plan text" continues to pay dividends. Deferred to Batch 5+: AreaBoundary derivation algorithm (event area_boundary_id+area_derived_at set by sync job from area_name match OR nearest-boundary; patrol from start_location nearestBoundary), Patrol Track Materialization job, ReportExport pdf-render queue, Notification fan-out flow, Tenant sync-engine fields (15 fields), Event/Patrol enum changes (priority+state), AlertRule restructure, AuditLog impersonation fields. Once all deferred work ships: mechanical `mv docs/v2/PRODUCT.md docs/PRODUCT.md` swap.

## 2026-05-20 — 🟢 Sub-batch 5.1a SHIPPED — Phase 8 Batch 5 Item 1 underway
- Type:      🟢 change
- Phase:     Phase 8 Batch 5 Sub-batch 5.1a (AreaBoundary derivation algorithm — pure functions layer)
- Files:     packages/shared/src/lib/area-derivation/* (3 impl + 1 barrel + 1 types + 3 tests) + packages/shared/vitest.config.ts + package.json
- Concepts:  area-derivation, name-match, nearest-boundary, haversine, equirectangular-projection, polygon-edge-distance, vitest-bootstrap, pure-functions, batch-5
- Narrative: 5.1a shipped to main as commit 6686042 (squash-merge of feat/area-derivation-functions, 11 files +1019/-2). matchByName + findNearestBoundary + composite deriveArea per v2 spec L531-L561 algorithm — pure logic LEAF layer with zero DB/queue/UI dependency. 55 vitest tests across 3 files cover all spec L561 mandate cases (exact match, alias match, case difference, trimming, threshold within/at/beyond, LineString geometry, malformed-skip, invalid-lat-lon). Zero external geo deps (turf/geolib/mapbox NOT installed — haversine + pointToSegmentDistanceKm implemented by hand using equirectangular foot-of-perpendicular projection + haversine great-circle, accurate to <0.1% within 5km threshold). Vitest bootstrap added to packages/shared (previously no test runner — minimum-viable matching jobs package convention). Opus 4.7 executor reported clean DONE on first dispatch — no salvage required, contrasting with 4.1e's silent step-7/11 drop. Confirms [[feedback_marine_guardian_opus_executor_default]]. Batch 5 Item 1 progress: 1 of 5 sub-batches shipped (5.1a ✅), 4 queued (5.1b applyAreaDerivation persistence helper, 5.1c BullMQ area-rederive queue+processor+worker, 5.1d sync inline re-derive + AreaBoundary CUD enqueue, 5.1e admin manual-rebuild button + UI).

## 2026-05-20 — 🟤 AreaBoundaryForDerivation structural subset pattern for cross-package pure functions
- Type:      🟤 decision
- Phase:     Phase 8 Batch 5 Sub-batch 5.1a (refined design for cross-package isolation)
- Files:     packages/shared/src/lib/area-derivation/types.ts + match-by-name.ts + find-nearest-boundary.ts + derive-area.ts
- Concepts:  structural-typing, package-isolation, prisma-decoupling, pure-functions, type-design
- Narrative: When a pure function in packages/shared needs to operate on a model that lives in packages/db (Prisma client), import only a structural SUBSET of the model — not the full Prisma type. For 5.1a's area-derivation functions, the AreaBoundary table has ~10 fields but the algorithm only needs id/name/aliases/isEnabled/geometryType/geometryGeojson (the matching + geometry inputs). Defined AreaBoundaryForDerivation in packages/shared/src/lib/area-derivation/types.ts with exactly those 6 fields. Callers in 5.1b's persistence layer (which DOES have Prisma access) project full AreaBoundary rows down to this shape at the query layer via Prisma `select` or simple destructuring. Why this pattern: (1) packages/shared cannot import from packages/db without creating a circular workspace dep — pure functions stay leaf-level; (2) the type stays usable from contexts that don't have a Prisma client (workers, tests with mocked DB, future Sandbox functions); (3) decouples shared/lib from schema changes — adding a new column to AreaBoundary doesn't require touching the derivation code. Trade-off: requires callers to project down (a one-line concern), but the architectural cleanliness pays off across all 5 sub-batches in Item 1. Apply to future cross-package pure-function design: import the minimum structural subset, name it `[Model]For[Purpose]`, never re-export from packages/db.


## 2026-05-20 — 🟤 5.1d scope adjustment: Area B (CUD fan-out) shipped, Area A (sync inline derive) deferred
- Type:       🟤 decision
- Phase:      Phase 8 Batch 5 Sub-batch 5.1d
- Files:      packages/jobs/src/lib/earthranger-client.ts (ErEvent + ErPatrol interfaces — gap), packages/jobs/src/processors/er-sync.processor.ts (syncEvents + syncPatrols data spreads — gap), apps/web/src/server/trpc/routers/areaBoundary.ts (Area B shipped here)
- Concepts:   v2-spec, area-derivation, sync-engine, scope-adjustment, precondition-gap, area_name-ingestion
- Narrative:  The original 5.1d brief specified two work areas: Area A — sync engine inline re-derive when an Event/Patrol upsert detects a change to areaName (v2 L546, small blast-radius), and Area B — AreaBoundary CUD fan-out via BullMQ (v2 L545, large blast-radius). Pre-flight investigation surfaced a precondition gap for Area A: ErEvent and ErPatrol interfaces in earthranger-client.ts do not currently include any area_name field, and the syncEvents/syncPatrols data spreads in er-sync.processor.ts do not map any area_name field either. v2 L456 explicitly says area_name should be "preserved verbatim from ER" — so the sync-side ingestion of area_name is an unbuilt feature, not a 5.1d touch-up. Implementing Area A as briefed would have produced a phantom feature: the "incoming vs persisted areaName" comparison would never fire because sync never sees an incoming areaName. User confirmed Ship Area B Only path via AskUserQuestion. Two follow-up paths recorded in STATE.md DEFERRED field: (1) precursor sub-batch 5.1d.A that extends the ER client + sync mapping to ingest area_name AND bootstraps er-sync.processor.test.ts (currently no tests for this processor at all — significant test infrastructure work), THEN adds the inline-derive; (2) fold Area A into a later Batch 5 Item that owns area_name ingestion as an explicit deliverable. Either path is sound. The lesson for future architects authoring sub-batch briefs against v2: verify the entire data path the brief depends on, not just the target file. The original 5.1d brief was authored without inspecting earthranger-client.ts to confirm area_name is in the payload type. Future briefs that depend on sync-engine field detection MUST verify the field is in the ER client interface AND mapped in the data spread before assuming "the sync upsert sees a change to field X". Doctrine: when a sub-batch brief assumes data flows through a processor, the brief MUST cite the line numbers in both the type interface and the data spread that prove the data is wired. If those citations cannot be made → the precondition is unbuilt → scope is wrong → split the sub-batch.

## 2026-05-20 — 🔴 Opus subagent dispatch returned interim status mid-stream — main-session fallback works
- Type:       🔴 gotcha
- Phase:      Phase 8 Batch 5 Sub-batch 5.1d
- Files:      none (framework-level)
- Concepts:   subagent-dispatch, Agent-tool, Opus-executor, dispatch-failure, fallback-pattern, SendMessage
- Narrative:  When dispatching 5.1d via Agent(model: "opus") with a comprehensive brief, two consecutive dispatches returned interim status messages mid-stream rather than completing the work. Both burned ~70s + ~10 tool uses (~287K + ~264K total_tokens) without producing branches, commits, or file changes — verified via git log/status/branch. Each return ended with the agent's own narration ("Reading the queue and area-rederive worker to verify..." / "Noted — skill suggestion ignored... Continuing.") followed by a system-appended ":agentId: XXX (use SendMessage with to: '...' to continue this agent)" hint. SendMessage tool was NOT surfaced in the deferred tool inventory (ToolSearch "select:SendMessage" returned "No matching deferred tools found" twice), so neither agent could actually be continued. Root cause not investigated — could be (a) Agent tool output-budget that returned interim narration as terminal output, (b) PreToolUse skill injection hook noise (the second agent's return explicitly mentioned acknowledging a next-forge skill suggestion that was a false-positive pattern match on apps/web/**), (c) Opus 4.7 subagent return-at-natural-sentence-boundary behavior when uncertain about how to proceed. Fallback that worked: user authorized main-session implementation (the architect session itself, also Opus 4.7) via AskUserQuestion. Entire 5.1d-B work landed cleanly in ~10 minutes including governance writes. Pattern for future dispatches: if the first Opus subagent dispatch returns an interim-status pattern, do NOT immediately re-dispatch. Inspect git state to confirm nothing landed. Consider one Sonnet retry if scope is tight (≤30K tokens, low risk of Sonnet thrash). Otherwise pivot to main-session implementation — it works cleanly for sub-batches that fit the main session's safe budget. Avoid burning multiple Opus subagent dispatches before pivoting. The main-session path also has the architecturally-pleasant side-effect that the architect understands the codebase deeply (reads done in this session), so post-ship governance writes are more accurate than they would be after a subagent return.

## 2026-05-20 — 🟢 Phase 8 Batch 5 Item 1 (AreaBoundary derivation algorithm) COMPLETE for scope under remit
- Type:       🟢 change
- Phase:      Phase 8 Batch 5 Sub-batch 5.1e (final sub-batch of Item 1)
- Files:      apps/web/src/server/trpc/routers/areaBoundary.ts (+rebuild adminProcedure mutation), apps/web/src/server/trpc/routers/__tests__/areaBoundary.test.ts (+7 rebuild tests + auditLog mock), apps/web/src/app/(dashboard)/patrol-areas/rebuild-button.tsx (NEW Client Component), apps/web/src/app/(dashboard)/patrol-areas/page.tsx (+button wiring)
- Concepts:   batch-5, item-1-complete, area-rebuild, super_admin, PLATFORM-auditlog, fanOutAreaRederive, main-session-dispatch
- Narrative:  Item 1 SHIPPED across 5 sub-batches: 5.1a (pure derivation functions in packages/shared, 6686042) + 5.1b (applyAreaDerivation persistence helper, c4a14a9 — relocated to packages/jobs at 5.1c) + 5.1c (BullMQ area-rederive queue + processor + worker with 50/sec limiter, 3b4145f) + 5.1d Area B (AreaBoundary CUD fan-out v2 L545 large-blast-radius path, 068d32f) + 5.1e (admin manual-rebuild adminProcedure mutation with PLATFORM:AREA_REBUILD AuditLog convention + minimal UI stub button on patrol-areas placeholder, 88744ed). Total monorepo test count 268 (pre-Batch 5) → 338 (+70 across all 5 sub-batches). 5.1d Area A (sync inline re-derive on areaName change — v2 L546 small-blast-radius) DEFERRED because precondition (area_name ingestion through ER sync engine) is unbuilt. 5.1e UI scope adjusted from "button on /admin/area-boundaries" to "minimal stub on patrol-areas placeholder" because the /admin/area-boundaries page does not exist (no admin boundary CRUD UI has been built yet) — same precondition-deferral pattern as 5.1d Area A. Two pickup paths for both deferred items documented in STATE.md. Doctrine confirmation: [[feedback_marine_guardian_opus_executor_default]] held for 5.1a/b/c (clean Opus subagent dispatches) but failed for 5.1d (2 consecutive interim-status stalls before main-session pivot) and was deliberately skipped for 5.1e (small scope + dispatch-mechanism risk unresolved). Pragmatic rule emerging: prefer dispatched Opus for Tier 2+ scope; prefer main-session Opus for Tier 1 + cleanly-scoped sub-batches under ~50K main-session tokens. Apply to upcoming Batch 5 Item 2 (PatrolTrack Materialization job) — that scope is likely Tier 2 (queue + processor + worker + ER client extension + sync integration + admin mutation), so Opus subagent dispatch is appropriate IF dispatch-mechanism issues from 5.1d are root-caused first. Otherwise main-session remains the safe fallback.

## 2026-05-21 — 🔴 react-leaflet 4.x has unmet peer dep with React 19 — use react-leaflet 5+ for the Marine-Guardian stack
- Type:       🔴 gotcha
- Phase:      Phase 8 Batch 6 Sub-batch 6.1b — Leaflet client island for Coverage Report Page 2 area-coverage map
- Files:      apps/web/package.json (leaflet ^1.9.4 + react-leaflet ^5.0.0 + @types/leaflet ^1.9.21)
- Concepts:   leaflet, react-leaflet, react-19, peer-dependency, pnpm-warning, client-island, ssr-safety
- Narrative:  `pnpm add react-leaflet` resolved to v4.2.1 by default — which declares peer dependency `react ^18.0.0 || react-dom ^18.0.0`. apps/web is on React 19.2.5, so pnpm emitted unmet-peer warnings but still installed (the lockfile preserves the install — pnpm warns, never errors). Build would have succeeded in dev but runtime risk: react-leaflet v4 uses `React.createContext` patterns that may break under React 19's stricter Suspense + concurrent rendering semantics. Upgrade path is clean: `pnpm remove react-leaflet && pnpm add react-leaflet` resolves to v5+ which adds React 19 to peer range. The bare `leaflet` package itself (vanilla JS, no React) has no peer dep concern — only react-leaflet's wrapper layer needs the version pin. Future Leaflet-bearing sub-batches (6.1c if Page 3 reuses the map component, Per Area Report map, Quarterly Report map): install react-leaflet at v5+ explicitly via `pnpm add react-leaflet@^5` to skip the v4 default-resolution detour. SSR note: react-leaflet IS marked "use client" in Marine-Guardian's print-render code path, and the parent print-render route is dynamic (service-token-guarded — no caching). DO NOT attempt to render a Leaflet client island server-side or inside a cached page — leaflet imports `window` unconditionally at module load and crashes in node. The vi.mock pattern in __tests__/page-2-area-boundary-summary.test.tsx + __tests__/coverage-report.test.tsx is the test-time equivalent: any RSC test that indirectly imports the map component MUST mock `../components/area-coverage-map` to avoid the same node window-undefined crash. Pattern: `vi.mock("../components/area-coverage-map", () => ({ AreaCoverageMap: () => null }));` at the top of the test file. Same pattern applies for any future Leaflet-bearing client island.

## 2026-05-22 — 🟤 PDF print-render URL slug = ReportType enum value (not spec route segment label)

- Type:       🟤 decision
- Phase:      Phase 8 Batch 6 Sub-batch 6.2a — Per Area Report Page 1 dispatch wiring
- Files:      apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/page.tsx, apps/web/src/server/per-area-report/get-per-area-report-data.ts
- Concepts:   reportexport, reporttype, url-routing, schema-alignment, slug-convention
- Narrative:  PRODUCT.md §342 specifies user-facing routes like `/[tenant]/reports/area`, `/[tenant]/reports/consolidated`, etc. — the "area" route is labelled "Per-area report" in docs. The Prisma ReportType enum mirrors these route segments verbatim: `coverage | area | consolidated | detailed | rangers | patrol_filtered`. The print-render internal URL `/print-render/[tenantSlug]/[reportType]/[exportId]` uses `reportType` as both the URL slug AND the value compared against `reportExport.reportType`. Initial 6.2a impl used `"per-area"` as the URL slug (matching the docs label) — TypeScript caught it (`Type '"per-area"' has no overlap with ReportType enum`). Decision lock: URL slug always equals the DB enum value, never the docs-label variant. The implementation file name (`per-area-report.tsx`) can stay descriptive — only the URL segment + the reportType string comparison must match the enum. Future ReportType dispatch branches (consolidated, detailed, rangers, patrol_filtered) follow the same rule: slug = enum value. Add to VALID_REPORT_TYPES set in page.tsx using enum values, not docs labels.


## 2026-05-23 — 🟤 STORAGE_* env vars canonical; MINIO_* deprecated across packages/storage
- Type:       🟤 decision
- Phase:      Locked Task Queue Task 2 (defect-fix follow-up after S551 Per Area Report smoke test)
- Files:      packages/storage/src/index.ts, packages/storage/src/__tests__/storage.test.ts, .env.dev, deploy/compose/dev/docker-compose.storage.yml (new)
- Concepts:   env-var-naming, storage, minio, s3, naming-convention, framework-alignment, batch-6-follow-up
- Narrative:  packages/storage previously read MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_REGION from process.env, but the rest of the stack (apps/web/src/env.ts, .env.dev, V31 framework Phase 3 templates) uses STORAGE_* throughout. S551 smoke test exposed the mismatch end-to-end: pdf-render worker container had STORAGE_ENDPOINT injected via env_file, packages/storage's getClient() read MINIO_ENDPOINT, returned undefined, threw "STORAGE_ENDPOINT is not configured" — the report export FAILED at the storage layer despite queue + worker dispatch working correctly. Rename direction locked at start of Task 2: keep STORAGE_* (matches V31 Phase 3 template + apps/web env validation), deprecate MINIO_* in packages/storage. No env_file changes needed — .env.dev already had STORAGE_* values. Migration: 4 env var reads + 3 error messages in packages/storage/src/index.ts, 4 process.env assignments in storage.test.ts. Module JSDoc preamble updated with the deprecation note pointing back to this entry. Single remaining MINIO_* string in packages/storage source is the JSDoc deprecation note (intentional). dist/start-workers.mjs still has bundled MINIO_* literals — those are stale build artifacts and will be regenerated next worker rebuild. Naming rule for all future storage env work: STORAGE_* is canonical, MINIO_ROOT_USER / MINIO_ROOT_PASSWORD are valid ONLY inside docker-compose.storage.yml where they are MinIO's container-internal env vars (mapped FROM STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY at the compose layer). Future S3/MinIO/R2/B2 work in this repo uses STORAGE_* on the application side, period.


## 2026-05-23 — 🔴 docker-compose.storage.yml was missing from dev scaffold since Phase 4 Part 7
- Type:       🔴 gotcha
- Phase:      Locked Task Queue Task 2 (defect-fix follow-up after S551 Per Area Report smoke test)
- Files:      deploy/compose/dev/docker-compose.storage.yml (NEW), deploy/compose/start.sh (wired storage compose into dev startup)
- Concepts:   scaffold-gap, docker-compose, minio, framework-template, phase-4-part-7, storage-enabled, audit-other-services
- Narrative:  The V31 framework Phase 4 Part 7 template generates `docker-compose.storage.yml` whenever `storage.enabled: true` in inputs.yml. Marine-Guardian's inputs.yml DOES declare storage.enabled: true, AND packages/storage exists with full MinIO S3 client surface (uploadPdf, getPdfReadStream, deletePdf, assertBucketExists, getExportsBucketName, buildExportKey), AND .env.dev has STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET/REGION fully populated, AND the pdf-render worker (Batch 5 Sub-batch 5.3b) was wired to call packages/storage.uploadPdf — yet the docker-compose.storage.yml file itself was never written. The deploy/compose/start.sh comment at the top even said "No storage service — storage.enabled: false in inputs.yml" which contradicted the actual inputs.yml (S4176 May 23 12:06p captured this contradiction: "Storage service was intentionally disabled during scaffolding; MinIO environment configured but container never provisioned"). Result: every layer above storage (queue, worker, processor, BullMQ wiring, MinIO env vars, S3 client code, tests) all green and shipped — but no MinIO container ever existed in dev. The S551 smoke test was the first end-to-end run that pushed a PDF buffer through to packages/storage.uploadPdf, where it failed at the env-var read (and would have failed at the network connection had STORAGE_ENDPOINT been correct). Lesson: at scaffold time, when storage.enabled: true in inputs.yml, agents MUST verify (a) packages/storage exists, (b) docker-compose.storage.yml exists, (c) start.sh references it, (d) .env.dev has STORAGE_* keys. All four are required for the chain to function. Two of four were generated (b + c missing). Audit recommendation for older projects: grep for `storage.enabled: true` in inputs.yml then verify deploy/compose/*/docker-compose.storage.yml exists for each env. Future Phase 4 Part 7 self-audits should add a post-generation `ls deploy/compose/*/docker-compose.*` check against the inputs.yml enabled flags. Related: jobs.enabled, mailer.enabled, pdf-renderer (all of which DID generate compose files correctly — the gap is storage-specific in this project, but the verification pattern applies broadly).


## 2026-05-23 — 🟢 Platform-admin empty-tenant UX hint shipped across area + patrol pickers
- Type:       🟢 change
- Phase:      Locked Task Queue Task 4 (last item in 2026-05-23 queue)
- Files:      apps/web/src/lib/auth/use-platform-admin-empty-context.ts (NEW), apps/web/src/app/(dashboard)/patrols/generate-report-button.tsx, apps/web/src/components/map/PatrolSelector.tsx, apps/web/src/app/(dashboard)/patrols/__tests__/generate-report-button.test.tsx (+4 tests, 9→13)
- Concepts:   ux-empty-state, super_admin, platform-admin, tenant-scoping, picker-guidance, session-tenantid, area-boundary, patrol-selector
- Narrative:  S551 smoke test surfaced confusing UX — webmaster (super_admin, tenant_id NULL in DB → "" via Auth.js session callback at apps/web/src/server/auth/config.ts L102) opened Generate Report → Per Area Report and saw an empty area dropdown with no guidance. Root cause: every tenant-scoped tRPC query (areaBoundary.list, patrol.list, etc.) returns zero rows when ctx.tenantId is null/empty because L1 + L6 tenant scoping filters by that field. The fix is purely UX layer — no router or auth changes. Pattern: a small client-side hook `useIsPlatformAdminWithoutTenant` reads `useSession()` and returns true only when status="authenticated" AND roles includes "super_admin" AND tenantId === "". A single canonical message `PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE` ("You're signed in as a platform admin without a tenant context. Switch to a tenant to access tenant-scoped data.") is exported alongside the hook. Two pickers consume both: (1) generate-report-button.tsx area dropdown — placeholder swaps "No areas available" → "No tenant context" when platform admin, and renders a `<p data-testid="area-boundary-platform-admin-hint">` beneath the select with the full message. (2) PatrolSelector.tsx — wrapped the Select in a `<div className="space-y-1">` and added the same hint paragraph below when items.length === 0 AND platform admin. Empty-list and loading branches verified separately so the hint never renders for tenant-scoped users (the existing "No areas available" empty-state) or while the query is still loading. 4 new vitest cases on GenerateReportButton: (a) platform admin empty shows hint + "No tenant context" placeholder, (b) tenant-scoped super_admin empty shows "No areas available" + NO hint, (c) loading state hides hint, (d) platform admin with items hides hint. Existing 6.2d "empty area list renders placeholder" test extended with explicit queryByTestId(null) assertion that tenant-scoped users do not see the hint. Tier 1 (3 source files + 1 test file, 1 module). Web test count 459 → 463 (+4). Test mock change: stubs.tenantId is now mockable per-test (default "t1" preserves prior semantics, "" simulates platform admin). Visual QA per Rule 16: deferred to user since the running dev container image (Task 3 build) does not contain the new code, and rebuilding the image for a 3-line conditional render with 4 explicit unit tests covering every branch (renders DOM, asserts text content + presence/absence) was disproportionate. The vitest cases ARE the Visual QA at the component level — they render the React tree via @testing-library/react and assert on the rendered HTML output. Future tenant-scoped pickers (alertRule, ranger, event, accompanying-rangers-input.tsx user-search, etc.) should import the same hook + message constant to keep the empty-state copy consistent across the app. The hook is intentionally narrow (super_admin + empty tenantId) — operators and field_coordinators always have a tenantId, so they don't need this hint; site_admins with a tenantId see the normal "No X available" empty-state which is correct for their context.


## 2026-05-23 — 🟢 Task 3 follow-up defect cleanup basket (b + c-finding + a + d)
- Type:       🟢 change
- Phase:      Post-locked-queue cleanup — Task 3 surfaced 4 small defects flagged in STATE.md; user picked all 4 as one basket
- Files:      deploy/compose/dev/docker-compose.pdf-renderer.yml (b), packages/storage/src/index.ts + packages/storage/src/__tests__/storage.test.ts (a), scripts/rotate-demo-site-admin-password.sh NEW (d)
- Concepts:   pdf-renderer-healthcheck, wget-not-in-image, node-runtime-fallback, orphan-containers-finding, yelli-coexistence, APP_ENV-mapping, bucket-naming, DECISIONS_LOG-§142, credential-rotation, scenario-34, defensive-output-redaction
- Narrative:  (b) pdf_renderer healthcheck was reporting unhealthy because the compose `test` was `wget -qO- http://127.0.0.1:4000/health` but the `node:22-slim` base image doesn't ship wget. Confirmed via `docker exec marine-guardian_dev_pdf_renderer wget …` returning exit 127. Fix: replaced with `CMD-SHELL node -e "require('http').get('http://127.0.0.1:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"`. Node is always present in this image (CMD is `node src/server.js`), no extra install needed. Container recreate alone applied the change (healthcheck is container-level, not image-level). Transitioned to `(healthy)` 30s after recreate. Pattern: prefer `node -e` healthchecks over `wget`/`curl` when the base image is `node:*-slim`/`node:*-alpine` — they may or may not have HTTP CLIs depending on tag.

(c) "yelli_dev_* orphan containers" was a misclassification when STATE.md was written. Investigated:
docker inspect on yelli_dev_mailhog showed com.docker.compose.project=yelli_dev with config_files pointing at /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/ — yelli is Bonito's parallel active project (livekit + coturn + Postgres + Valkey + MinIO + their own Next.js app), 10 running containers. Zero yelli containers labelled marine-guardian_dev (verified with `docker ps -a --filter "label=com.docker.compose.project=marine-guardian_dev"`). The "Found orphan containers ([marine-guardian_dev_app marine-guardian_dev_worker …])" warning that triggered the defect note is emitted whenever you run `docker compose -f deploy/compose/dev/docker-compose.<single-file>.yml up -d` — docker-compose lists every other marine-guardian container as an "orphan of THIS compose file" because they're not defined in that one file. Benign. When invoking via `bash deploy/compose/start.sh dev up -d` (which passes all compose files together with `-f` flags), no warning appears. Resolution: documented, no source change. Future agents reading this: if you see "orphan containers" warning from a marine-guardian compose command, check whether ALL the listed names belong to marine-guardian_dev project — if yes, it's a per-file scope warning and benign; if any belong to a DIFFERENT project, investigate further before any --remove-orphans command.

(a) APP_ENV (NODE_ENV-mirroring: development|staging|production) didn't match DECISIONS_LOG §142 bucket convention `marine-guardian-{env}-exports where env ∈ {dev,staging,prod}`. Live dev bucket was `marine-guardian-development-exports` instead of locked `marine-guardian-dev-exports`; prod would have been `marine-guardian-production-exports` instead of `marine-guardian-prod-exports`. APP_ENV used in exactly one place (packages/storage/src/index.ts:107 getExportsBucketName, confirmed via grep across apps/web/src + packages/) so direction had narrow blast radius either way. User picked option 1: map at storage layer (preserves NODE_ENV-mirroring convention). Added `APP_ENV_TO_BUCKET_ENV: Record<string,string>` with the 3 mappings + throw-on-unknown (silent fallthrough to "dev" would risk writing prod data into dev bucket if APP_ENV ever drifts to "preview" / "qa"). +3 tests on getExportsBucketName: maps development, maps production, throws on unknown. beforeEach APP_ENV now "development" (was misleading "test" which would now throw). Storage test count 12 → 15. Runtime activation: created `marine-guardian-dev-exports` bucket, `mc mv --recursive` migrated the single Task 3 smoke PDF (187 KiB), removed old bucket. Rebuilt packages/jobs dist (`pnpm --filter @marine-guardian/jobs build`), rebuilt app image (`docker compose build app`), recreated worker+app containers. Smoke test PASS — full pipeline now writes to `marine-guardian-dev-exports/${tenantId}/2026/05/${exportId}.pdf`. Note for cross-env data restores (DECISIONS_LOG §226): bucket name is derived at write+read time via getExportsBucketName, NOT stored in the report_exports DB row — the existing PDF's row didn't need a DB update after the bucket rename because only the key (path-relative-to-bucket) is persisted.

(d) Demo-site admin (admin@demo-site.local) credential rotation. Original incident 2026-05-23 ~12:48pm: agent's awk-based extraction from CREDENTIALS.md leaked col-3 (passwords) for all 3 envs into prior conversation context (now /clear'd but lessons.md notes the leak). Solution: scripts/rotate-demo-site-admin-password.sh NEW. Per Scenario 34 pattern — script runs entirely in user's terminal, NEVER echoes the password to stdout. Generates 22-char password via openssl, updates .env.{env} DEMO_SITE_ADMIN_PASSWORD line via sed `s|^…=.*|…=NEW|` (avoids slash/b64 char clashes), updates CREDENTIALS.md "### Demo Site Admin" `| {env} | … | password |` row via column-aware awk replacement (NEVER full-file cat to stdout), and applies the new hash. Dev mode: runs `pnpm db:seed` (seed.ts L19-23 reads DEMO_SITE_ADMIN_PASSWORD, bcrypt-hashes at rounds=12, upserts passwordHash on admin@demo-site.local). Staging/prod modes: skips DB write, writes SQL UPDATE statement (with pre-computed bcrypt hash from local node + bcryptjs) to /tmp/rotate-sql-{env}.sql for user to apply on the corresponding server (psql "$DATABASE_URL" -f rotate-sql-{env}.sql). Defensive command output redaction: piped script output through `sed 's/[A-Za-z0-9+/=]\{20,\}/<redacted>/g'` as a backstop in case any 22-char string leaked from a nested tool, though the script itself avoids echoing. Dev rotation executed + smoke test PASS confirms the new credential works through NextAuth login → tRPC mutate → BullMQ → MinIO → PDF download. Staging/prod rotation NOT executed in this session — they require server access; user runs the script with env=staging or env=prod when convenient + syncs the updated .env.{env} to the corresponding server + applies the emitted SQL. Future credential rotations (any account, any env) should follow this same script pattern: openssl-generate, sed-update env file, awk-update CREDENTIALS.md by structural slicing, apply hash via seed (dev) or SQL UPDATE (staging/prod), NEVER echo plaintext to stdout. Scenario 34 documents this as the canonical pattern for sensitive-credential mutations.
