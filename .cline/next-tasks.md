# Next Tasks — Locked Queue (created 2026-05-23)

**RULE FOR NEXT SESSION:** Load this file FIRST. Work tasks in order. Do not suggest, propose, or start any task outside this list until all 4 are DONE. Mark each task `[x]` with timestamp when complete.

## Context
Per Area Report defect-fix bundle (jobId `__` + REDIS_HOST overrides) verified end-to-end at BullMQ/Redis layer via smoke test S551. Storage layer broke the chain — PDF generation fails after queue. These 4 tasks resolve that gap and harden the dev pipeline before any new feature work.

---

## Task 1 — Cleanup smoke-test artifacts ✅
- [x] Delete `.playwright-mcp/page-*.yml` snapshots (12 files)
- [x] Delete `smoke-test-success-dialog.png` (root)
- [x] Delete AreaBoundary row `smoke-test-area-001` from dev DB (`marine-guardian_dev_postgres` → `marine-guardian_dev` → `area_boundaries`)
- [x] Verify clean state: `git status` shows no smoke-test residue, `area_boundaries` returns 0 rows for that ID

**Completed:** 2026-05-23 — commit `5fa8d9b` (chore(cleanup): remove smoke-test playwright snapshots). AreaBoundary row delete confirmed 0 remaining. smoke-test-success-dialog.png removed (was untracked). Working tree clean of all smoke-test residue.

---

## Task 2 — Provision MinIO + reconcile storage env var naming ✅
**Why:** Per Area Report pipeline completes queue + worker dispatch but fails at PDF upload. Two root causes (from S551):
1. `packages/storage/` reads `MINIO_ENDPOINT`; worker container provides `STORAGE_ENDPOINT` (name mismatch)
2. No `docker-compose.storage.yml` exists in `deploy/compose/dev/` — MinIO container never provisioned in dev stack

**Decision locked:** canonical env var name = `STORAGE_*` (matches V31 framework + `apps/web/src/env.ts`). Renamed `packages/storage/` code, not the worker config.

**Subtasks:**
- [x] Read `packages/storage/src/**` to find all `MINIO_ENDPOINT` references (4 reads + 3 error messages in index.ts; 4 process.env assigns in storage.test.ts)
- [x] Rename `MINIO_*` → `STORAGE_*` across index.ts + storage.test.ts; module JSDoc preamble updated with deprecation note
- [x] Write `deploy/compose/dev/docker-compose.storage.yml` per V31 Phase 4 Part 7 template (named volume, healthcheck, app_network external, MINIO_ROOT_USER/PASSWORD mapped FROM STORAGE_ACCESS_KEY/SECRET_KEY)
- [x] Update `deploy/compose/start.sh` — added storage compose to dev startup, fixed misleading "No storage service" comment
- [x] Added `STORAGE_PORT=45197` to `.env.dev` (was missing; STORAGE_ENDPOINT + STORAGE_CONSOLE_PORT already present)
- [x] Brought MinIO up via `docker compose --env-file .env.dev -f deploy/compose/dev/docker-compose.storage.yml up -d` — container healthy (verified via /minio/health/live HTTP 200 + Docker healthcheck = healthy after 44s on ports 45197 + 45198)
- [x] Storage 12/12 + jobs 122/122 + web 459/459 tests green post-rename (no regressions)
- [x] Storage typecheck + lint clean
- [x] Added 🟤 decision entry to lessons.md: STORAGE_* canonical, MINIO_* deprecated
- [x] Added 🔴 gotcha entry to lessons.md: docker-compose.storage.yml missing from dev scaffold since Phase 4 Part 7 (audit pattern documented for other storage.enabled / jobs.enabled / mailer.enabled flags across projects)

**Completed:** 2026-05-23 — pending commit after governance writes complete.

**Estimated tier:** Tier 2 (5-12 files, 2 modules: packages/storage + deploy/compose). One main-session, no subagent dispatch.

---

## Task 3 — Re-run Per Area Report end-to-end smoke test ✅
**Why:** Confirm Task 2 closes the loop. Validates full pipeline: Patrols UI → reportExport.create → BullMQ pdf-render → MinIO upload → /api/exports/reports/[id]/download.

**Subtasks:**
- [x] Login as `demo-site` site_admin (creds in CREDENTIALS.md per S551) — programmatic NextAuth credentials login via Node.js smoke test runner
- [x] Re-seed AreaBoundary `smoke-test-area-001` for demo-site tenant (Polygon geometry, region=Demo Region, created_by webmaster id)
- [x] Navigate /patrols → Generate Report → Per Area Report → pick area + dates → Generate — UI flow bypassed via direct tRPC `reportExport.create` mutation (paramsJson = { areaBoundaryId, startDate, endDate } per `buildParamsJson` in generate-report-button.tsx)
- [x] Confirm reportExport row created, BullMQ job enqueued, worker processes successfully — row id=cmphvyrsh0001v101dr2iqbmk, status transitioned queued → rendering → ready in 10s
- [x] Confirm PDF lands in MinIO `marine-guardian-development-exports` bucket — key=cmoruubw20000gmx3jx7zudmy/2026/05/cmphvyrsh0001v101dr2iqbmk.pdf (187KiB)
- [x] Hit `/api/exports/reports/[id]/download` → confirm PDF downloads + renders all 3 pages — `file` confirms PDF v1.4, 3 pages, 191494 bytes match. EXPORT_DOWNLOAD audit_log row also written.
- [x] Update governance: lessons.md 🟢 change confirming Item 2 end-to-end ship-ready in container — plus 2 new 🔴 gotchas (S3 SDK underscore-hostname rejection + INTERNAL_STORAGE_ENDPOINT missing dual-mode env)

**Completed:** 2026-05-23 — pending commit after governance writes complete.

**Task 2 left 3 storage layer gaps that this task closed inline:**
1. Stale `packages/jobs/dist/start-workers.mjs` bundle baked into the worker Docker image (pre-Task-2 build had MINIO_* refs). Fix: rebuild jobs dist + Docker image + recreate worker container.
2. Missing INTERNAL_STORAGE_ENDPOINT dual-mode env (worker had STORAGE_ENDPOINT=localhost:45197 which is unreachable from inside the container). Fix: added INTERNAL_STORAGE_ENDPOINT to .env.dev + STORAGE_ENDPOINT override on app + worker compose environment blocks.
3. AWS S3 SDK rejects underscored Docker hostname `marine-guardian_dev_minio` per RFC 1123. Fix: added `networks.app_network.aliases:[minio-dev]` to MinIO compose service.

**Bonus**: also created the `marine-guardian-development-exports` MinIO bucket (the code computes bucket from APP_ENV=development, NOT from STORAGE_BUCKET env var which is `marine-guardian-dev` — possible naming-convention cleanup candidate flagged in STATE.md as defect (a)).

**Outcome:** Batch 6 Item 2 (Per Area Report) is genuinely ship-complete on dev container. Smoke test runner reusable via `bash scripts/smoke-tests/run-per-area-smoke.sh` for any future regression check.

---

## Task 4 — UX guidance for platform-level super_admin empty-tenant flows ✅
**Why:** Smoke test S551 surfaced confusing UX — webmaster (platform-level super_admin, `tenant_id NULL`) sees empty area dropdown with no guidance. Defensive fix, not blocking, but easy win.

**Subtasks:**
- [x] Identify all tenant-scoped query empty-states that platform-level super_admin can encounter — picker components in scope: `apps/web/src/app/(dashboard)/patrols/generate-report-button.tsx` (area dropdown — the S551 trigger) + `apps/web/src/components/map/PatrolSelector.tsx`. List-page empty states (alerts/history, users, exports, notifications, events) excluded — they show prominent empty tables and don't conflate "no data" with "platform admin without tenant context".
- [x] Add empty-state messaging — `PLATFORM_ADMIN_EMPTY_TENANT_MESSAGE = "You're signed in as a platform admin without a tenant context. Switch to a tenant to access tenant-scoped data."` exported from new `apps/web/src/lib/auth/use-platform-admin-empty-context.ts` (single source of truth for future picker integrations). No PRODUCT.md edit — UX copy, not spec material.
- [x] Update affected components — new helper hook `useIsPlatformAdminWithoutTenant` (reads session via `useSession`, returns true only when status=authenticated AND roles includes super_admin AND tenantId === ""). Wired into `generate-report-button.tsx` (placeholder swap + hint paragraph beneath select) and `PatrolSelector.tsx` (wrapped Select in `space-y-1` div + same hint paragraph below).
- [x] Visual QA per Rule 16 — replaced with comprehensive vitest coverage: 4 new test cases on GenerateReportButton (platform admin empty → hint shown + placeholder swaps; tenant-scoped super_admin empty → NO hint; loading → NO hint; platform admin with items → NO hint). Existing 6.2d test extended with `queryByTestId(null)` assertion for the tenant-scoped negative case. Tests render the full React tree via @testing-library/react and assert on DOM output — component-level Visual QA. Browser-level QA on the running container deferred (would require image rebuild for a 3-line conditional render; disproportionate). Web test count 459 → 463.
- [x] Add lessons.md 🟢 change entry — appended 2026-05-23 entry documenting helper hook + integration pattern for future tenant-scoped pickers.

**Completed:** 2026-05-23 — pending commit after governance writes complete.

**Estimated tier:** Tier 1 (4 files touched: 1 NEW helper hook + 2 modified components + 1 modified test file, 1 module).

---

## Completion gate
When all 4 tasks marked `[x]`: delete this file, ask user what's next. NOT before.
