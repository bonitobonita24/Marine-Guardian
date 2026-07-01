# Decisions Log — Marine Guardian Command Center
# Format: ## [Decision Title] → Decision: [value] → Rationale: [why] → Locked: yes/no
# NEVER re-ask anything listed here.
# ---

## 2026-06-21 — Activate live EarthRanger recurring sync on PROD "Demo Site" tenant
Decision: Owner approved wiring the LIVE mindoro.pamdas.org EarthRanger connection into the prod
"Demo Site" tenant (id cmqgv4kit0000gmygz0ulcjos) with a 5-minute (interval_ms=300000) recurring
sync. The ER base_url + DAS bearer token were entered through the prod app UI
(Settings → EarthRanger Sync) so the token passes the app's AES-256-GCM encryption path and is
stored encrypted in tenant_er_connections.api_token_enc — never written to Postgres directly.
Activation result: Test Connection → status='connected'; recurring enabled at 300000ms and
persisted (verified via reload + getErConnection); full delta sync green end-to-end —
subjects 85, event_types 39, observations 25, patrols 25, events 3 (all sync_logs status='success',
0 errors); dashboard renders healthy with live data.
Rationale: Final step of the prod cutover (prod was LIVE at 19c7e58 but ER sync sat BLOCKED awaiting
a verified connection + owner go-ahead). Owner greenlit the live mindoro connection for the prod
demo tenant on 2026-06-21.
Defects found + fixed during activation (all HOW-to-build/technical — fixed autonomously per Fleet
GitHub Autonomy policy; none change product intent):
  1. PROD app container could not enqueue BullMQ jobs (ECONNREFUSED): the `app` service in
     deploy/compose/prod/docker-compose.app.yml was missing REDIS_HOST/REDIS_PORT overrides, so it
     inherited .env.prod's host-CLI values localhost:6381. BullMQ (packages/jobs/connection.ts) reads
     REDIS_HOST/REDIS_PORT, NOT REDIS_URL. Added the same overrides the `worker` service already had
     (REDIS_HOST=${COMPOSE_PROJECT_NAME}_valkey, REDIS_PORT=6379). Applied to repo + live server.
  2. Worker reported "EarthRanger not configured" despite a saved connection: er-sync.processor.ts
     read the unused Tenant.earthrangerUrl/earthrangerDasToken columns instead of the canonical
     tenant_er_connections table the Settings UI writes to. Fixed to read tenantErConnection
     (baseUrl plaintext + decrypt(apiTokenEnc)).
  3. EarthRanger client mis-parsed DAS/DRF responses: events/patrols/observations threw
     "X is not iterable" and event_types returned 404. Fixed earthranger-client.ts request() to
     unwrap the data→{results} envelope and corrected getEventTypes path to
     /activity/events/eventtypes/ (matches the known-good scripts/ingest-earthranger.mjs).
Deploy: image bonitobonita24/marine-guardian:prod-hotfix-ersync-0621-2307
  (digest sha256:51e6da41…e4c3613, web+worker); APP_IMAGE_TAG flipped to it in
  /etc/komodo/stacks/marine-guardian/.env.prod + .env; app + worker recreated, both healthy.
Known follow-up (pre-existing, OUT OF SCOPE, unrelated to ER sync): the `alerts` worker throws
  Prisma "Unknown argument userId" (Notification model uses `recipients`, not `userId`) — worth a
  separate fix; does not affect worker health or the ER sync path.
Files affected:
  • deploy/compose/prod/docker-compose.app.yml — app service REDIS_HOST/REDIS_PORT overrides added.
  • packages/jobs/src/processors/er-sync.processor.ts — read tenantErConnection (canonical table).
  • packages/jobs/src/lib/earthranger-client.ts — DRF envelope unwrap + event_types path fix.
  • docs/STATE.md — PROD_DEPLOY RECURRING ER SYNC flipped ❌ BLOCKED → ✅ LIVE.
Rollback: set APP_IMAGE_TAG back to prod-sha-19c7e58 and `docker compose up -d`.
Locked: yes

## 2026-06-16 — Auth.js trustHost behind Traefik proxy → Decision: set trustHost: true in authConfig (config.ts) + AUTH_TRUST_HOST=true in .env.example → Rationale: Auth.js v5 returns HTTP 500 on /api/auth/* when running behind a reverse proxy (Traefik) unless it trusts the forwarded Host header; code-level fix (trustHost: true) is durable across all environments without relying on the env var; env var documented in .env.example for operator awareness → Locked: yes

## 2026-06-16 — Accompanying-ranger autocomplete: 3-source merge + dedupe + promotion (PRODUCT.md §82, §265, §270-271)
Decision: The `event.addAccompanyingRanger` tRPC procedure gains an optional `knownRangerId`
param (tenant-scoped, validated against KnownRanger table before create). Two new procedures
added to `eventRouter`:
  • `event.suggestAccompanyingRangers(query)` — merges (1) KnownRanger registry, (2) recent
    freetext accompanying-ranger names (last 90 days, event entity), (3) EarthRanger Subject rows
    with subject_type "person"/"ranger" not already covered by a knownRanger erSubjectId match.
    Dedupe strategy: normalised name (lowercase + collapsed whitespace) is the primary key;
    source-1 beats source-3 beats source-2 on collision; erSubjectId collision is detected before
    name normalisation so ER subjects already in KnownRanger are skipped at the id level. Returns
    up to 20 suggestions sorted by name; each entry carries id, name, source, erSubjectId.
  • `event.promoteToKnownRanger(name)` — idempotent: case-insensitive name lookup scoped to
    tenant; returns existing record + created=false if already present, else creates with
    source="manual_entry" + created=true. Does NOT mutate existing AccompanyingRanger rows (audit
    lineage preserved); caller links the knownRangerId on the next addAccompanyingRanger call.
Rationale: Owner decision 2026-06-16. KnownRanger registry was server-side only and never
surfaced in the accompanying-ranger flow. Three-source autocomplete was the owner-specified UX.
Ad-hoc freetext path continues to work unchanged (knownRangerId is optional). No schema change
required — knownRangerId column and KnownRanger FK already exist in AccompanyingRanger.
Files affected:
  • apps/web/src/server/trpc/routers/event.ts
    (addAccompanyingRanger: added knownRangerId optional param + tenant-guard validation;
    new suggestAccompanyingRangers query; new promoteToKnownRanger mutation)
  • apps/web/src/server/trpc/routers/__tests__/event.test.ts
    (mocks extended with knownRanger + subject; 17 net-new test cases across 3 new describes
    + 2 cases added to addAccompanyingRanger describe)
  • docs/PRODUCT.md §82, §265, §270-271
  • docs/DECISIONS_LOG.md (this entry)
Locked: yes

## 2026-06-16 — Accompanying-ranger picker UI: debounced combobox replaces plain Input (Task 1 UI layer)
Decision: `AccompanyingRangersInput` component fully rebuilt as a debounced combobox
(250 ms) calling `event.suggestAccompanyingRangers`. Dropdown groups suggestions by source
with section headers (Known Rangers / EarthRanger Subjects / Recent Names). Selecting a
`known_ranger` suggestion passes `knownRangerId` to `addAccompanyingRanger`. Selecting
`er_subject` or `recent_freetext` uses the freetext path (no knownRangerId). Typing a name
not in the dropdown shows "Add as ad-hoc" inline; Enter commits the typed value. After
attaching, freetext rangers without a `knownRangerId` link surface a "Promote" section
calling `promoteToKnownRanger`. The old two-Input layout (registered-user search + freetext
add) is fully replaced; the registered-user picker path (registeredUserId) is now reachable
via the combobox if the user.list router is wired in a future iteration.
Rationale: Owner-directed in architect task brief 2026-06-16. The server layer (3-source
  suggestAccompanyingRangers + promoteToKnownRanger) was already merged at ed1e8e3; this
  commit adds the matching UI layer.
Files changed:
  • apps/web/src/components/events/accompanying-rangers-input.tsx (rebuilt)
  • apps/web/src/components/events/__tests__/accompanying-rangers-input.test.tsx (rebuilt, 11 tests)
  • docs/PRODUCT.md §82 (combobox UX documented)
  • docs/DECISIONS_LOG.md (this entry)
Locked: yes

## 2026-06-16 — Phase 8 completeness sweep: Observations + Sync Status pages wired
Decision: The /observations and /sync placeholder pages are now wired to their existing
tenant-scoped read routers (observation.list, syncLog.list + syncLog.latest), following the
already-merged /subjects data-table pattern exactly. /observations renders recorded-at,
subject, type, source, lat/lon with cursor pagination. /sync renders a connection-health
indicator (from syncLog.latest) + a sync-log table (data type × status × records synced ×
started × completed × error) with a sync-type filter and pagination — matching PRODUCT.md
§200-205. No router/schema changes, no DB writes, no migration. Read-only display of data
that already exists.
Rationale: These two were flagged as "intentional placeholders," but the backends already
existed and were merely unwired — identical situation to /subjects, which was wired in the
prior merge. PRODUCT.md §155/§200-205/§249 promise both surfaces. This is autonomous
UI-wiring of existing endpoints, not a new product feature.
Locked: yes

## 2026-06-16 — Settings (Tenant ER Connection) page left as OWNER-GATED placeholder [SUPERSEDED]
Decision: SUPERSEDED by the entry below ("Settings: TenantErConnection model + /settings page built").
The original deferral reason (no encryption approach, no router, no audit) has been resolved by
the architect session that implemented Task 2 on 2026-06-16.
Locked: no (superseded)

## 2026-06-16 — Settings: TenantErConnection model + /settings page built (owner-directed Task 2)
Decision: Built a dedicated `TenantErConnection` Prisma model (table: `tenant_er_connections`,
unique on `tenant_id`) instead of using the existing inline Tenant fields. New fields: `base_url`,
`api_token_enc` (AES-256-GCM ciphertext, ENCRYPTION_KEY env var), `status`, `last_validated_at`.
The existing Tenant inline columns (`earthrangerUrl`, `earthrangerDasToken`, etc.) are left
untouched to avoid a breaking migration — they are legacy and will be addressed in a separate
cleanup sweep.
Credentials strategy:
  • Encryption: AES-256-GCM via the existing `encrypt()`/`decrypt()` helpers from `@marine-guardian/db`
    (same key + format already used by the Tenant inline fields via `encryptionExtension`).
  • The plaintext token is NEVER returned to the client. The `maskConnection()` helper replaces
    `apiTokenEnc` with the sentinel `••••••••` before the payload leaves the server.
  • Update UX: leaving the token field blank (or sending the sentinel) preserves the existing
    encrypted token server-side — no need to re-enter it on URL-only updates.
tRPC procedures (`settings` router, admin-only mutations, all L5 audited):
  • `settings.getErConnection` — tenantProcedure, read-only, returns masked row or null.
  • `settings.upsertErConnection(baseUrl, apiToken?)` — adminProcedure, create/update. Requires
    apiToken on first create; preserves existing enc token when omitted on update.
  • `settings.testErConnection` — adminProcedure, decrypts token server-side, probes
    `GET /api/v1.0/subjects/?page_size=1` with 8 s timeout, updates status + lastValidatedAt.
UI: `ErConnectionCard` client component at
  `apps/web/src/app/(dashboard)/settings/_components/er-connection-card.tsx`.
  Token field always `type="password"`. Test Connection button only visible after first save.
  Status badge: connected (green) / error (red) / not yet verified (muted).
Migration: `20260616113329_add_tenant_er_connection` (forward-only, no down migration).
Tests: 18 router tests in `__tests__/settings.test.ts` — encrypt round-trip, RBAC gates
  (field_coordinator/operator → FORBIDDEN), masked output, probe happy/fail paths, audit log.
Rationale: Owner-directed in architect task brief 2026-06-16. Single-table approach over
  Tenant-inline simplifies the unique constraint, makes encrypt/decrypt auditable per-row, and
  avoids touching the encryption extension that wraps ALL Tenant mutations.
Files added/changed:
  • packages/db/prisma/schema.prisma (TenantErConnection model + Tenant.erConnection relation)
  • packages/db/prisma/migrations/20260616113329_add_tenant_er_connection/migration.sql
  • apps/web/src/server/trpc/routers/settings.ts (new)
  • apps/web/src/server/trpc/routers/index.ts (settings router registered)
  • apps/web/src/server/trpc/routers/__tests__/settings.test.ts (new, 18 tests)
  • apps/web/src/app/(dashboard)/settings/page.tsx (wired to ErConnectionCard)
  • apps/web/src/app/(dashboard)/settings/_components/er-connection-card.tsx (new)
  • docs/PRODUCT.md §200-209 (Tenant Settings section updated)
  • docs/DECISIONS_LOG.md (this entry)
Locked: yes

## Receipt photo upload deferred from initial Fuel Logging UI ship
Decision: First /fuel ship lands without receipt photo upload UI. Schema field receiptPhotoUrl
remains nullable (no schema change). No upload pipeline, no presigned URL helper, no
camera/file picker in either Create or Edit dialog. Display in list also omits photo.
Follow-up batch will add the full pipeline (packages/storage presigned URL helper +
new tRPC procedure + camera/file picker UI).
Rationale: packages/storage exports only PDF helpers — there is no presigned URL
infrastructure to point a client-side file upload at. Building it would add 3-5 files
(storage helper + bucket assertion + Route Handler for upload + camera/file picker
client component + tests), pushing the Fuel Logging UI from Tier 2 (~40K tokens,
single-session safe) to Tier 3 (~70K+, likely needs subagent dispatch or split).
PRODUCT.md §118 lists photo as a field but it is optional. Splitting the ship
preserves the core L/km math + list + analytics value without rework.
Locked: yes — committed 2026-05-26. Follow-up batch may revisit storage strategy
(presigned URLs vs Route Handler proxy vs Vercel Blob if Vercel migration ever happens).

## Cross-area Fuel Consumption analytics built as a new module, not extracted from Per Area Report Page 3
Decision: /fuel page analytics uses a NEW server-side aggregator at
apps/web/src/server/fuel-analytics/get-fuel-consumption.ts. The Per Area Report
Page 3 buildFuelConsumption helper in apps/web/src/server/per-area-report/
get-per-area-report-data.ts stays untouched (locked design — funder-deliverable PDF
2026-05-22, monthly-grain + single-area only).
Rationale: Per Area Report's helper is single-area + month-grain-only by locked
design. /fuel needs cross-area summary + 5 grains (day/week/month/quarter/year)
per PRODUCT.md §124. The bucketing function signatures differ enough that
extracting a shared helper would force changes to both call sites + risk
regressing the PDF Page 3 layout that funders already consume. The duplicated
5-line resolveTenantOffsetMinutes is intentional — proper extract to a shared
util deferred until a 3rd consumer or DST-observing tenant arrives (whichever
comes first), per the inline TODO comment.
Locked: yes — committed 2026-05-26.

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

## 2026-06-16 — Ranger autocomplete everywhere a ranger is named (owner decision)
Decision: The 3-source ranger autocomplete combobox (calling `event.suggestAccompanyingRangers`)
must appear on EVERY surface in the app where a user types or selects a ranger/person name —
not only on the Event Detail page.

Surface inventory (2026-06-16):
  • Event Detail — `AccompanyingRangersInput` combobox → ALREADY WIRED (prior session)
  • Patrol Schedule assignment dialog — `rangerName` plain `<Input>` → WIRED in this change
  • Patrol Detail page (`patrols/[id]/page.tsx`) — read-only display; no input → n/a
  • Fuel Logging (create/edit dialogs) — no ranger/person name field → n/a
  • Observations page — read-only ER-synced display → n/a
  • Alert rules / patrol-areas / reports — no ranger name input → n/a

Implementation for Patrol Schedule:
  `AssignmentDialog` ranger-name `<Input>` replaced with an inline debounced combobox
  (250 ms) calling `event.suggestAccompanyingRangers`. Selecting a suggestion sets
  `rangerName` state — all downstream submit/validation logic is unchanged. No promote path
  (patrol schedule stores a freetext name string, not an AccompanyingRanger entity). The
  existing registered-user `<Select>` auto-fill still works and now also closes the dropdown.
Rationale: Owner direction 2026-06-16 — KnownRanger suggestions should be available
  everywhere a ranger name can be entered, not just on events.
Files changed:
  • apps/web/src/app/(dashboard)/patrol-schedule/_components/assignment-dialog.tsx
  • docs/PRODUCT.md (patrol-schedule section updated)
  • docs/DECISIONS_LOG.md (this entry)
Locked: yes

## 2026-06-21 — V32.9 Compliance & Data Privacy layer (PH Data Privacy Act / RA 10173)
Decision (OWNER-RATIFIED 2026-06-21): Implement the V32.9 Compliance & Data Privacy feature for fleet parity with Yelli + Orqafy, adapted to Marine Guardian's conservation/ranger-patrol domain.

Ratified product values (do NOT re-flag as assumptions):
  • q-v329-01 DSR statutory response window = 15 calendar days (NPC reasonable-period guidance). dueAt = requestedAt + 15d.
  • q-v329-02 Retention periods — audit & security logs 5 years · operational/patrol/observation/general data 3 years. MG has NO payroll/financial 7-year category (the fleet-default 7y financial-hold tier does not apply; fuel-entry financial amounts sit under the 3y operational tier). Recorded in a RetentionPolicy register model.
  • q-v329-03 Erasure model = request-and-review. `dsr.requestErasure` creates a RECEIVED DataSubjectRequest for site_admin action; it does NOT self-purge the user, because audit logs (5yr) and operational records (3yr) are under legal-hold / storage-limitation (RA 10173 §11(e)/§19). A site_admin reconciles each request against those holds.
  • q-v329-04 Breach deadlines per NPC Circular 16-03 = NPC notification within 72h of knowledge + full written report within +5 business days. writtenReportDueAt pre-computed at record time.
  • q-v329-05 ComplianceFooter is HONEST: design-claim chips ON (security-by-default, RA 10173 alignment, WCAG 2.2 AA target); certification badges OFF (ISO 27001 / SOC 2 / PCI all false — not held).
  • q-v329-06 Accessibility target = WCAG 2.2 AA (not 2.1) on compliance + auth surfaces.

STILL PENDING (owner — NOT invented, left as clearly-marked placeholders):
  • DPO contact — interim placeholder bonitobonita24@gmail.com (marked TODO-owner on /privacy + footer).
  • NPC registration number / PIA reference — not yet issued.
  • Per-processing-activity lawful-basis fine-tuning — provisional (consent/contract/legitimate-interest/legal-obligation declared at a high level).

Runtime-deferred: migration 20260621000000_add_compliance_privacy is generated + committed but NOT applied (no live dev DB reachable this session). Operator runs `prisma migrate deploy` (or `migrate dev`) against the target DB; it is create-only (4 new tables + 5 enums, no destructive changes).

Implementation:
  • prisma: ConsentLog, DataSubjectRequest, BreachNotificationRecord, RetentionPolicy + enums LawfulBasis/DsrType/DsrStatus/BreachStatus/BreachSeverity; all tenant-scoped (tenantId + indexes), Tenant/User relations wired.
  • routers: dsr (inform/access/port/rectify/object/requestErasure/myRequests + admin adminList/adminUpdateStatus) and breach (record/markNpcNotified/markSubjectsNotified/submitReport/list). Subject ops session-scoped; admin ops adminProcedure-gated + tenant-scoped; passwordHash never selected; every mutation L5-audited via writeAuditLog.
  • frontend: public /privacy notice · Settings → Data & Privacy self-service (DataPrivacyCard) · /settings/breach admin register · ComplianceFooter · WCAG 2.2 AA on those + /login.
  • tests: 23 new vitest (dsr 15 + breach 8). Full suite 818 green; typecheck 7/7; lint 6/6; real next build 2/2.
Rationale: Owner authorized the build for fleet parity (Yelli d639a5b + Orqafy b0fcae0 already shipped it). Adapted to MG's domain (no HR/finance; rangers/patrols/observations/fuel).
Locked: yes (ratified values + pending items above)

## 2026-06-21 — Operations Epic Milestone 1: recurring incremental ER sync (backend-only)
Decision (OWNER-RATIFIED 2026-06-21 via session handoff — see docs/mg-operations-epic-todo branch DECISIONS_LOG):
Implement the backend foundation for the Operations epic. No UI in M1.

Ratified technical values (do NOT re-flag as assumptions):
  • q-ops-01 erOriginalSnapshot: immutable JSON blob, set ONLY on first insert (create path), never overwritten on update. Captures the exact raw EarthRanger payload at first ingest. Column: `er_original_snapshot JSONB` on events + patrols tables.
  • q-ops-02 EventRevision / PatrolRevision: append-only revision tables with no UPDATE/DELETE ever. Purpose: M2 will write edit mutations here. M1 scaffolds the tables + FK; M2 will write the mutation procedures.
  • q-ops-03 Watermark = SyncLog.completedAt of the LAST SUCCESSFUL run (status='success', ordered desc, scoped to tenantId+syncType). NOT `updatedAt` of the most recent record — the ER API `updated_since` param matches SyncLog timing.
  • q-ops-04 Delta-capable types: events, patrols, observations (use `?updated_since=<ISO>`). Full-pull types: subjects, event_types (no date filter on those ER endpoints). scheduleRecurringErSync + enqueueErSyncWithWatermark both honour this split.
  • q-ops-05 Default interval = 300,000ms (5 minutes). Minimum = 60,000ms (1 minute). The incorrect default of 30,000ms and 0ms minimum were bugs, now fixed.
  • q-ops-06 First-ever sync (no SyncLog yet) is a full backfill; this is the ONLY permitted full-pull for delta types. After first success, all subsequent recurring runs are delta-only.
  • q-ops-07 since=undefined is FORBIDDEN in the recurring path once a watermark exists. Enforced by getWatermark returning undefined on first run (backfill case) and a defined string thereafter; scheduleRecurringErSync uses the watermark at schedule-time.
  • q-ops-08 removeRecurringErSync uses BullMQ v5 removeJobScheduler(id) with the stable scheduler id `er-sync__recurring__<tenantId>__<syncType>`. No getRepeatableJobs() iteration needed.
  • q-ops-09 Bootstrap: start-workers.ts bootstrapRecurringErSync() runs at worker startup, queries all TenantErConnection rows, schedules enabled+connected tenants, removes schedulers for disabled/invalid connections.
  • q-ops-10 Settings mutations: syncNow (one-shot delta sync all 5 types, adminProcedure, L5 TRIGGER_ER_SYNC_NOW audit) and updateErSyncConfig (toggle + interval update, adminProcedure, L5 UPDATE_ER_SYNC_CONFIG audit, immediately schedules/removes BullMQ scheduler).

Implementation:
  • packages/db/prisma/schema.prisma — erOriginalSnapshot on Event + Patrol; EventRevision + PatrolRevision models; TenantErConnection.recurringEnabled + intervalMs; SyncLog composite watermark index.
  • packages/db/prisma/migrations/20260621030355_ops_m1_snapshot_revisions_recurring_sync — additive, backward-compatible; manually excludes the accompanying_ranger FK re-adds (footgun from prior migration that dropped them).
  • packages/jobs/src/lib/er-sync-watermark.ts — getWatermark / getRequiredWatermark / hasEverSynced.
  • packages/jobs/src/queues/er-sync.queue.ts — enqueueErSyncWithWatermark + scheduleRecurringErSync (fixed) + removeRecurringErSync (v5 API).
  • packages/jobs/src/processors/er-sync.processor.ts — syncEvents/syncPatrols set erOriginalSnapshot on create only.
  • packages/jobs/src/start-workers.ts — bootstrapRecurringErSync().
  • apps/web/src/server/trpc/routers/settings.ts — syncNow + updateErSyncConfig mutations.
  • Tests: 17 new (er-sync-watermark 16, er-sync-queue 8, settings-sync 17). Full suite 835/835 green.
  • Gate: typecheck 7/7, lint 11/11, test 835/835, build 2/2.
Locked: yes

## 2026-06-21 — Operations Epic Milestone 2: Editable Records + Edit History + Settings Sync Controls (M2)
Decision: Implement field-level local editing for Events and Patrols with full audit trail, plus ER sync conflict protection and settings UI.

Extends q-ops-01..10 with:
  • q-ops-02 extended: event.update and patrol.update mutations (tenantProcedure) write append-only EventRevision/PatrolRevision rows per changed field (beforeJson/afterJson as JSONB using Prisma.JsonNull sentinel for nulls). Gated by L6 tenant-scoping (findFirst with tenantId guard). L5 audit: UPDATE_EVENT, UPDATE_PATROL.
  • q-ops-04 (edit-protection merge rule) — REVISION-PRESENCE strategy: if a field has any revision row in event_revisions/patrol_revisions, it is skipped in the ER sync update path. The revision table IS the protection signal; no extra column needed. getEventEditedFields/getPatrolEditedFields helpers in er-sync.processor.ts query distinct fieldNames and return Set<string>. The update path uses Object.fromEntries/filter to build a safeFields object (no dynamic-delete anti-pattern). erOriginalSnapshot remains immutable (set-once, never updated by sync).
  • q-ops-10 extended: getSyncLogs query (tenantProcedure, read-all-roles) returns last 10 SyncLog rows newest-first with select {id, syncType, status, recordsSynced, errorMessage, startedAt, completedAt}.

Conflict default (REVISION-PRESENCE): local edits survive ER upstream changes by default. ER data is NOT clobbered for locally-edited fields. No explicit "merge" UI in M2 — revision table provides full audit trail for future reconciliation.

Edit-protection scope: Events — EVENT_EDITABLE_FIELDS (title, priority, locationLat, locationLon, offenderName, vesselName, vesselRegistration, address, actionTaken, notesJson, eventDetailsJson). Patrols — PATROL_EDITABLE_FIELDS (title, boatName, areaName). Other patrol fields (startTime, endTime, patrolType, state) are ER-authoritative and never locally edited.

Prisma.JsonNull: exported as value from @marine-guardian/db (was type-only). Required for nullable JSON fields (EventRevision.beforeJson/afterJson, PatrolRevision.beforeJson/afterJson) when value is null.

UI — Edit forms (shadcn/ui + React Hook Form pattern):
  • event-detail-modal.tsx: Tabs (Edit/History) split; historyActive state for lazy getRevisions load; edit form inline in Dialog; onSuccess invalidates both getById and getRevisions; WCAG 2.2 AA.
  • patrols/[id]/page.tsx: same Tabs pattern; edit form for title/boatName/areaName with isDirty guard; saveSuccess toast.
  • Both gated on RBAC at backend (tenantProcedure); UI stays accessible to all tenant members.

UI — Revision timeline (shared component):
  • src/components/revisions/revision-timeline.tsx: newest-first ordering; ER baseline (erOriginalSnapshot) shown as dashed "EarthRanger baseline" entry at bottom; formatJsonValue() caps display at 120 chars; WCAG 2.2 AA (role=list/listitem, aria-busy, time[dateTime]).

UI — Settings ER Sync controls (er-sync-card.tsx):
  • Recurring toggle: Switch (admin-only, gated on isConnected).
  • Interval input: Input[type=number min=60000 max=86400000 step=60000] + "Save interval" button.
  • Sync now: one-shot trigger, disabled if not connected or not admin.
  • Sync log table: last 10 SyncLog entries (Type, Status badge, Records, Started, Completed).
  • Warning banner when connection not verified.

Test coverage added:
  • event.test.ts: +8 tests (event.update revision writes × 4, event.getRevisions × 4).
  • patrol.test.ts: +9 tests (patrol.update × 6, patrol.getRevisions × 3).
  • settings.test.ts: +7 tests (getSyncLogs × 7).
  • er-sync.processor.test.ts: mocks extended (patrol.findUnique, eventRevision.findMany, patrolRevision.findMany) — existing 24 tests preserved, revision queries default to empty (no protection applied).
  • Total: 859 web tests + 181 jobs tests = 1040/1040 green.

Files affected:
  • apps/web/src/server/trpc/routers/event.ts — event.update (revision writes), event.getRevisions, event.getEditedFields.
  • apps/web/src/server/trpc/routers/patrol.ts — patrol.update, patrol.getRevisions, patrol.getEditedFields.
  • apps/web/src/server/trpc/routers/settings.ts — settings.getSyncLogs.
  • apps/web/src/components/events/event-detail-modal.tsx — rewritten with Tabs + RevisionTimeline.
  • apps/web/src/components/revisions/revision-timeline.tsx — NEW shared revision display.
  • apps/web/src/app/(dashboard)/patrols/[id]/page.tsx — rewritten with Tabs + edit form.
  • apps/web/src/app/(dashboard)/settings/_components/er-sync-card.tsx — NEW.
  • apps/web/src/app/(dashboard)/settings/page.tsx — added ErSyncCard.
  • packages/db/src/index.ts — export Prisma as value (was type-only).
  • packages/jobs/src/processors/er-sync.processor.ts — REVISION-PRESENCE edit protection merge.
  • Gate: typecheck, lint, test 1040/1040, build — all green.
Locked: yes

---

## 2026-06-21 — Operations Epic Milestone 3: Events List Redesign (Kanban → infinite-scroll Operations List)
Decision: Replace the Kanban board with a continuous infinite-scroll vertical list (q-ops-01, owner-ratified).

Technical decisions ratified:
  • UI shape: continuous vertical list (role=list/listitem), NOT columns. Newest-first (createdAt desc).
    50 records/page, cursor-based pagination (no page numbers). Auto-load via IntersectionObserver sentinel
    + fallback "Load more" button (keyboard/no-JS). Smooth scroll.
  • Inline state control: shadcn Select per row replaces drag-between-columns. Values: New / Active / Resolved.
    Wired through existing event.updateState mutation (tenantProcedure, L6 tenant-scoped updateMany).
    RBAC: updateState is tenantProcedure (all authenticated tenant members); no adminProcedure gate (same as Kanban drag).
  • Server-side filters (event.list Zod schema extended, backward-compatible):
    state (existing), category (eventType.category, case-insensitive equals),
    areaName (contains, case-insensitive), dateFrom + dateTo (reportedAt gte/lte — monthly-accomplishment gate).
    eventListFilters is the exported single source of truth for list + /api/exports/events.
  • Click row → M2 EventDetailModal (Edit/History tabs) — no change to modal behaviour.
  • WCAG 2.2 AA: state badge = icon + text (never color-alone); Select is keyboard-operable; time[dateTime];
    role=list/listitem; aria-label on row button and Select trigger; aria-live on loading indicator.
  • shadcn/ui only (Select, Badge, Button). Design tokens inherited from DESIGN.md (no regeneration).
  • MG is NOT a gov/LGU app — WCAG gate is best-effort (not DICT MC 004 hard gate).

Files affected:
  • apps/web/src/server/trpc/routers/event.ts — eventListFilters extended (category, areaName, dateFrom, dateTo).
  • apps/web/src/components/events/events-list.tsx — NEW EventsList + EventRow components.
  • apps/web/src/app/(dashboard)/events/page.tsx — Kanban removed, EventsList mounted.
  • apps/web/src/server/trpc/routers/__tests__/event.test.ts — 15 new tests (pagination ×5, filters ×7, state ×3).
  • docs/PRODUCT.md — Event Management section updated; /events URL description updated.
  • docs/STATE.md — LAST_DONE updated; Operations epic flagged feature-complete.
Gate: typecheck 13/13, lint 0 errors, test 874/874, build — all green.
Locked: yes

## 2026-06-21 — Alert Acknowledgement feature (WHAT_OWNER_DECISIONS closure)
Decision: Add `acknowledgedAt DateTime?` + `acknowledgedBy String?` to `AlertHistory`; add
  `alertHistory.acknowledge` mutation (admin-only, L5-audited, L6 tenant-scoped, idempotent);
  update `dashboard.alertStats` to return true unacknowledged count (WHERE acknowledgedAt IS NULL,
  last 24h window) instead of the previous "recent alerts last 24h" proxy; update WAR ROOM 5th KPI
  tile label from "Recent Alerts" to "Unacknowledged"; add ACK button per alert in AlertsPanel
  (visible to super_admin / site_admin only); acked alerts show ack state (badge + timestamp) not
  button; ACK button keyboard-operable with aria-label (WCAG 2.2 AA).
  Roles that can ACK: super_admin, site_admin (adminProcedure — same as breach/settings/user mutations).
  Idempotency: double-acking is a no-op (returns existing row, no second audit entry).
  Unacknowledge: out of scope — ack-only is the approved model (owner decision 2026-06-21).
Rationale: Owner greenlit 2026-06-21; closes the WAR ROOM fidelity WHAT_OWNER_DECISIONS ACK item.
  Schema change is minimal (two nullable columns + one index, fully additive migration).
  Matches the ACK button shown in docs/v2/mpa-command-center-v6.jsx mockup (PRODUCT.md §13, §33).
Files affected:
  • packages/db/prisma/schema.prisma — acknowledgedAt, acknowledgedBy columns + index added.
  • packages/db/prisma/migrations/20260621100000_add_alert_history_acknowledgement/migration.sql — additive migration.
  • apps/web/src/server/trpc/routers/alertHistory.ts — acknowledge mutation + unacknowledgedCount query added.
  • apps/web/src/server/trpc/routers/dashboard.ts — alertStats returns unacknowledged count.
  • apps/web/src/app/(dashboard)/dashboard/_components/alerts-panel.tsx — ACK button + ack state display.
  • apps/web/src/app/(dashboard)/dashboard/page.tsx — acknowledge mutation wired; canAck derived from session roles; KPI tile updated.
  • apps/web/src/server/trpc/routers/__tests__/alertHistory.test.ts — 8 new tests added.
  • apps/web/src/app/(dashboard)/dashboard/_components/__tests__/alerts-panel.test.tsx — NEW, 9 tests.
  • docs/PRODUCT.md — Alert System section confirms ACK shipped.
  • docs/STATE.md — WHAT_OWNER_DECISIONS ACK item resolved; LAST_DONE updated.
Gate: see feat/mg-alert-acknowledge PR.
Locked: yes

## 2026-06-21 — Live Map all-active-tracks overlay (foot vs seaborne styling)
Decision: Render ALL active (state='open') patrol tracks on the Live Map at once, visually
  differentiated by patrol type using BOTH an accent color AND a line pattern (colorblind-safe,
  the solid/dashed pattern is a non-color cue):
    • Seaborne = SOLID line, cyan #00C9DB (the existing MG `info` design token — already the
      "patrol tracks" color).
    • Foot     = DASHED line ([2,2]), orange #E8912D (the existing MG `warning` design token).
  Hues differ (~183° vs ~25°) and both sit at high contrast on the #0A0A0A dark map base.
  Pulled from docs/tokens.json so they fit the theme — no new colors invented.
  Adds: (1) all-active-tracks overlay — a `map.patrolTracks.active` tRPC procedure (tenantProcedure,
  L6-scoped) returning each open patrol's materialized track GeoJSON + its patrolType, bounded to
  50 patrols × 5000 points each, only tracks with ≥2 points; (2) a LEGEND with TEXT labels (never
  color-only) showing both type styles; (3) a master show/hide toggle + per-type toggles. All toggles
  are keyboard-operable Radix switches with aria-labels and ≥44px touch targets (WCAG 2.2 AA).
  "Active patrols" = state='open' (excludes test + soft-deleted), per the existing PatrolSelector
  convention. The single selected-patrol drill-down line (PatrolSelector) is unchanged and kept.
Rationale: Owner approved 2026-06-21. Implements the PRODUCT.md Live Map line item "Patrol track
  overlays showing active and recent patrol routes (foot vs seaborne colors)". NO schema change
  needed — reuses the existing observation-reconstruction track logic (shared via a new
  resolvePatrolTrackWindow helper). Bounded payload avoids unbounded map renders.
Files affected:
  • apps/web/src/server/trpc/routers/map.ts — new `patrolTracks.active` procedure + extracted
    resolvePatrolTrackWindow() shared helper (byPatrolId refactored to use it).
  • apps/web/src/components/map/patrolTrackStyle.ts — NEW: per-type style map + filterVisibleTracks().
  • apps/web/src/components/map/TrackLegend.tsx — NEW: legend + master/per-type toggles (shadcn Switch/Label).
  • apps/web/src/components/map/InteractiveMap.tsx — wires active query, visibility state, per-type
    MapRoute polylines (solid/dashed by type), and the TrackLegend.
  • apps/web/src/components/map/__tests__/patrolTrackStyle.test.ts — NEW, 7 tests (styling + filter logic).
  • apps/web/src/server/trpc/routers/__tests__/map.test.ts — 3 new `active` tests (per-type, tenant scope, <2-point filter).
  • docs/PRODUCT.md — Live Map section updated with the all-active overlay + legend + toggle detail.
Verification: dev stack rebuilt; logged in (Demo Site); /api/trpc/map.patrolTracks.active returned
  200 with 2 tracks (1 foot 8pts, 1 seaborne 8pts); screenshot confirms solid-cyan seaborne + dashed-orange
  foot legend entries, toggles flip the overlay; 0 console errors. Full validation green
  (typecheck/lint/944 tests/build). (Live open patrols had only 1 track point each, so a QA fixture
  augmented two open patrols' leader observations to ≥2 points for the visual check, then removed.)
Gate: see feat/map-all-active-tracks PR.
Locked: yes

## 2026-06-24 — Alert-rule condition model: canonical schema reconciliation
Decision: Adopt `{ minPriority?: number, eventTypeId?: string }` as the ONE canonical
  conditionJson shape across the UI create-form, the tRPC router input schema, and the
  alert evaluator (alerts.processor.ts ruleMatches function).
Rationale: Three-way mismatch existed between:
  (1) UI form (alerts/page.tsx) — stored `{ severity: "critical"|"high"|"medium"|"low" }`.
      The evaluator has no branch for "severity" → every UI-created rule was a catch-all.
  (2) Seed (packages/db/prisma/seed.ts) — stored `{ priority: { gte: 2 } }` (Prisma filter
      object, wrong scale 0-3) and `{ eventTypeValue: "sos_distress" }` (human-readable code,
      not the DB ID the evaluator compares against). Neither seed rule ever fired.
  (3) Evaluator (alerts.processor.ts ConditionJson) — read `minPriority` (number, 0/100/200/300
      scale) and `eventTypeId` (Prisma string ID). Correct, but nothing wrote rules in this shape.
  (4) Shared Zod schema (packages/shared/src/schemas/alert-rule.ts) — defined `eventType`,
      `priorityThreshold`, `category` — a fourth distinct shape, unused by everyone.
  All four now agree on `{ minPriority?: number, eventTypeId?: string }`.
  Priority scale: 0=LOW / 100=MEDIUM / 200=HIGH / 300=CRITICAL (EventPriority const).
  UI "severity" dropdown maps: critical→300, high→200, medium→100, low→0.
  No Prisma migration needed — conditionJson is a JSON column; existing seeded rules are
  re-written by re-running the seed (upsert is guarded by name uniqueness).
  Legacy { severity } rows in production will be treated as catch-alls by the evaluator
  (no recognized field → ruleMatches returns true for every event). Admins should
  re-save any UI-created rules through the Edit dialog to migrate them to canonical shape.
Files changed:
  • packages/shared/src/schemas/alert-rule.ts — new canonical Zod schema
  • packages/shared/src/types/alert-rule.ts — updated TS interface
  • packages/jobs/src/processors/alerts.processor.ts — imports AlertRuleCondition from shared
  • apps/web/src/server/trpc/routers/alertRule.ts — conditionJson validated via canonical schema
  • apps/web/src/app/(dashboard)/alerts/page.tsx — form writes minPriority, display updated
  • packages/db/prisma/seed.ts — seed conditions fixed to { minPriority: 200 } / { eventTypeId }
  • apps/web/src/server/trpc/routers/__tests__/alertRule.test.ts — tests updated + rejection test
  • packages/jobs/src/__tests__/alerts.processor.test.ts — 5 new REGRESSION tests
Gate: see fix/alert-condition-model PR.
Locked: yes

## R2 Photo Cache (2026-06-29)
Decision: Cloudflare R2 is used as a 24h-TTL read-through CACHE (not durable storage)
for the Telegram-stored event photos served by /api/assets/[id]. On a route MISS the
bytes are pulled from Telegram (source of truth) and written through to R2; subsequent
views read from R2 and skip the Telegram round-trip. A whole-bucket R2 lifecycle rule
expires every object 1 day after creation, so the footprint is the working set only and
re-populates on the next access — keeping it well under R2's 10 GB/account free tier.
Rationale: /api/assets proxied Telegram on EVERY view (2 round-trips, no cache, subject
to Telegram getFile rate limits). Under the Report Map load-storm (many simultaneous
marker-thumbnail + modal requests) this caused transient getFile rate-limiting that the
owner saw as "broken/corrupted images". The cache removes the origin→Telegram round-trips.
Design (locked, see docs/plans/r2-photo-cache-plan.md):
  • Own lazy S3Client in packages/storage/src/r2-cache.ts — NOT the MinIO singleton.
    R2 config: endpoint=R2_ENDPOINT, region="auto", forcePathStyle=true,
    requestChecksumCalculation/responseChecksumValidation="WHEN_REQUIRED" (the AWS SDK
    v3.729+ default CRC32 request checksums are rejected by R2 on PutObject — verified
    against aws-sdk-js-v3 docs; WHEN_REQUIRED restores R2-compatible behaviour).
  • Distinct R2_* env namespace (R2_CACHE_ENABLED, R2_ENDPOINT, R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_CACHE_BUCKET). Cache only activates when
    R2_CACHE_ENABLED="true" AND creds present; otherwise the route is byte-for-byte
    identical to before (ships dark).
  • Cache key = ${tenantId}/${assetId} (immutable server id; tenant prefix is
    defence-in-depth — real auth stays the DB findFirst({id, tenantId}) at the route).
  • Dedicated bucket marine-guardian-{env}-photo-cache, separate from -exports, with a
    whole-bucket "expire 1 day after creation" lifecycle configured once by
    scripts/setup-r2-cache-bucket.ts (idempotent). App code never sets per-object TTL.
  • Serve = PROXY-STREAM R2 bytes through the existing route (keep manual auth, egress
    audit, SAFE_INLINE allowlist gating on row.mimeType, sandbox CSP, nosniff). NEVER
    redirect to a presigned/public R2 URL (capability leak / bypasses audit + rate limit).
  • Best-effort: R2 read error → fall through to Telegram; R2 write error → swallowed.
Secrets source (single source of truth, never duplicated into the repo):
  Server-Setups/Powerbyte-Hostinger/secrets/cloudflare-r2.enc.yaml (sops -d).
Dev bucket marine-guardian-dev-photo-cache created 2026-06-29 on the owner's Cloudflare
account; lifecycle verified (Expiration.Days=1). Staging/prod buckets created at their
respective deploys (staging owner-authorized this session; prod manual/owner-gated).
Locked: yes

## Asset-route rate-limit tier — assetRead (2026-06-29)
Decision: /api/assets/[id] uses a dedicated generous `assetRead` rate-limit tier
(600 req/min per user) instead of the strict `upload` tier (20/min).
Root cause (found during R2 Visual QA, empirically via Playwright): the owner's
"broken/corrupted event images" were overwhelmingly caused by OUR OWN route
rate limiter, NOT Telegram. Opening an event with 52 archived photos fires 52
simultaneous same-user GET /api/assets requests; the `upload` tier capped that
at exactly 20/min, so ~20 thumbnails loaded and ~31 returned HTTP 429 → broken
images. The R2 cache could not help because the 429 fires BEFORE byte
resolution (every call counts against the limit regardless of cache).
Fix: a read-specific tier sized for photo galleries + repeat views. These reads
are auth-gated (requireRouteAuth), egress-audited (ASSET_DOWNLOAD), and
R2-cached, so a generous limit is safe and bounded against scripted abuse.
Verified live (dev app rebuilt, R2_CACHE_ENABLED=true): the same 52-photo event
went from 20 loaded / 31×429 to 51 loaded / 0 broken / 0 fallback / 0 console
errors. R2 HIT latency 145–240ms vs a cold Telegram MISS of ~2700ms (~12–18×).
Files: apps/web/src/server/lib/rate-limit.ts (new tier),
apps/web/src/app/api/assets/[id]/route.ts (upload→assetRead).
Locked: yes

## Cloudflare public edge caching for event photos — Option A: keep auth + private R2 (2026-06-29)
Decision: do NOT put event photos behind a Cloudflare public edge cache. Keep the
current posture — photos are served via the auth-gated /api/assets/[id] route,
egress-audited (ASSET_DOWNLOAD), and tenant-scoped R2 read-through cached (private).
Option B (signed-token public-edge redesign) is NOT pursued.
Rationale: event photos are tenant-private and auth-gated; a shared public CDN edge
would risk cross-tenant leakage and bypass the per-request auth/audit trail. The
private R2 read-through cache already delivers ~12-18× speedup (145-240ms HIT vs
~2700ms Telegram MISS) without any public exposure. Owner chose A on 2026-06-29.
Locked: yes
- [swarm S1 · 2026-07-01 09:44:28] 2026-07-01 q-S1-01 insert_session: inserted session S0.5 (Prisma ReportType enum + hand-authored SQL migration for report_map) before S1 to satisfy hand-authored-migration policy and unblock DB-touching code paths.
