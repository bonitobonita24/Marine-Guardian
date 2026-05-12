# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# Last updated: 2026-05-12 — Phase 7 Feature Update: Notification.patrolId nullable FK added (migration 20260512024505_add_notification_patrol_id). Router list query now includes patrol relation. Notification Center UI implements PRODUCT.md L187 click-through priority: patrol → event → no-link. Spec deferral #3 cleared. Pre-existing SyncStatus.running schema drift swept into same migration. 50/50 tests pass. Seed-password rotation tech debt also cleared earlier same day. MAP FEATURE GROUP COMPLETE (basemap + subjects + events + patrol tracks + patrol-area polygons — PRODUCT.md L191 fully satisfied).
# ---

## Status: Phase 8 Batch 1 complete. Phase 8 Batch 2 — Alert Rule Evaluation Engine processor body + er-sync create-path enqueue integration shipped. Engine fires on every newly-synced EarthRanger event. All Docker services healthy.

### Schema Delta Fixes (feat/schema-delta-fixes — merged to main)
- [x] PatrolType enum: seabourn → seaborne (Prisma, shared types/schemas, seed, tRPC routers)
- [x] Patrol.boatName: nullable String field added
- [x] Tenant.currency: String(3) with default 'IDR' added
- [x] PatrolSchedule.tenantId: direct tenant_id column added, tRPC router uses direct scoping
- [x] Migration: 20260504162834_schema_delta_fixes (manual SQL — rename enum, add columns, add FK)
- [x] ESLint: next-env.d.ts ignored, webpack externals scoped eslint-disable

---

### Root Config (Part 1)
- [x] pnpm-workspace.yaml
- [x] turbo.json
- [x] tsconfig.base.json (strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- [x] .editorconfig, .prettierrc, eslint.config.mjs (ESLint 9.x flat config)
- [x] .gitignore (final — includes CREDENTIALS.md, .env.*, .specstory/, .code-review-graph/)
- [x] .nvmrc (Node 22)
- [x] package.json (turbo scripts + devDependencies)
- [x] pnpm-lock.yaml

### Spec Files (Phase 3)
- [x] inputs.yml (version 3 — 18 entities, 19 modules, 4 roles)
- [x] inputs.schema.json
- [x] .env.dev (gitignored — generated credentials, non-standard ports)
- [x] .env.staging (gitignored — standard ports, Traefik vars)
- [x] .env.prod (gitignored — standard ports, Traefik vars)
- [x] .env.example (committed — placeholder template only)
- [x] scripts/sync-credentials-to-env.sh
- [x] CREDENTIALS.md (gitignored — master credential file with all service passwords)

### packages/shared (Part 2)
- [x] 19 TypeScript interfaces: Tenant, User, Patrol, PatrolArea, PatrolSegment, PatrolSchedule,
      AccompanyingRanger, Event, EventType, Observation, Subject, SubjectGroup, KnownRanger,
      AlertRule, Notification, SyncLog, AuditLog, Enums, index barrel
- [x] 19 Zod schemas with create/update variants (matching TypeScript interfaces)
- [x] All schemas re-export from packages/shared/src/schemas/index.ts

### packages/api-client (Part 2)
- [x] Typed tRPC client factory with superjson transformer
- [x] Exports createTRPCClient() for all apps to consume

### packages/db (Part 3)
- [x] 18 Prisma models (all entities from inputs.yml)
- [x] 13 enums (PatrolStatus, EventCategory, ObservationType, SubjectStatus, AlertSeverity,
      AlertStatus, NotificationType, NotificationStatus, SyncStatus, UserRole, TenantStatus,
      PatrolScheduleFrequency, SubjectSex)
- [x] Init migration (up + down SQL) — tenantId NOT NULL on all entities (multi-tenant)
- [x] PostgreSQL RLS enabled on all tenant-scoped tables (L2 — multi mode)
- [x] seed.ts — webmaster super_admin account + demo tenant + sample data
- [x] src/client.ts — Prisma client with L6 tenant-guard extension
- [x] src/middleware/tenant-guard.ts — L6 Prisma $allOperations auto-inject tenantId
- [x] src/middleware/encryption.ts — AES-256-GCM field encryption for sensitive columns
- [x] src/helpers/audit.ts — L5 writeAuditLog() immutable audit trail helper
- [x] src/helpers/rls.ts — L2 withTenant() PostgreSQL RLS transaction wrapper

### packages/ui (Part 4)
- [x] Tailwind CSS configuration (tailwind.config.ts)
- [x] Shared globals.css (CSS custom properties — shadcn/ui color tokens)
- [x] src/lib/utils.ts (cn() helper)
- [x] shadcn/ui components.json present in apps/web (New York style, CSS variables)

### packages/jobs (Part 4 + Phase 7)
- [x] BullMQ connection factory (src/connection.ts)
- [x] Queue factory with standard job options (src/queues/queue-factory.ts)
- [x] 5 typed queues: alerts, email, er-sync (EarthRanger sync), maintenance, index barrel
- [x] Base worker class with tenantId validation + error handling (src/workers/base-worker.ts)
- [x] Workers index barrel (src/workers/index.ts)
- [x] er-sync processor (src/processors/er-sync.processor.ts) — 5 sync functions: syncEventTypes, syncSubjects, syncEvents, syncPatrols, syncObservations. SyncLog lifecycle (running→success/failed), tenant validation, credential decryption, Prisma JSON nullable via toJsonOrNull() helper
- [x] er-sync processor tests (src/__tests__/er-sync.processor.test.ts) — 7 tests: tenant not configured, sync event_types, sync subjects, sync events, sync patrols, sync observations, API error → failed SyncLog

### apps/web (Part 5 — Next.js 15, App Router)
- [x] next.config.ts (output: standalone, 7 HTTP security headers, Content-Security-Policy,
      serverExternalPackages: ["bcrypt"], node: URI scheme webpack external handler)
- [x] tailwind.config.ts + postcss.config.js
- [x] apps/web/src/env.ts (Zod-validated env vars, server + client split)
- [x] Auth.js v5 config (Credentials provider + bcrypt), session with roles + tenantId
- [x] apps/web/src/server/auth/auth.config.ts (edge-compatible auth — JWT only, no bcrypt/prisma)
- [x] tRPC handler at /api/trpc/[trpc]
- [x] Health endpoint at /api/health (returns 200 + build metadata)
- [x] src/middleware.ts (tenant resolution + auth guard + rate limiting)
- [x] src/server/lib/rate-limit.ts (LRU-cache, 4 tiers: public/auth/api/upload)
- [x] src/server/lib/sanitize.ts (DOMPurify XSS sanitizer — sanitize() + sanitizePlainText())
- [x] L3 RBAC middleware (src/server/trpc/middleware/rbac.ts)
- [x] L1 tenant scoping middleware (src/server/trpc/middleware/tenant.ts)
- [x] tRPC context (userId, roles, tenantId from session)
- [x] 13 tRPC routers: alertRule, event, eventType, knownRanger, notification, observation,
      patrol, patrolArea, patrolSchedule, subject, syncLog, user, index barrel
- [x] 13 dashboard pages (App Router):
      /dashboard, /map, /patrols, /patrol-areas, /events, /observations,
      /subjects, /alerts, /notifications, /users, /settings, /sync, /login
- [x] Dashboard layout with sidebar + header components
- [x] shadcn/ui base components: button, card, badge, input, label
- [x] i18n messages: en.json, id.json (Bahasa Indonesia), ms.json (Malay)
- [x] Dockerfile (multi-stage: deps → builder → runner, node:22-alpine)
- [x] .dockerignore

### deploy/compose (Part 7)
- [x] deploy/compose/start.sh (all-in-one dev/stage/prod startup, --build for dev)
- [x] deploy/compose/push.sh (dev→hub→staging→prod promotion pipeline)

- [x] deploy/compose/dev/docker-compose.db.yml (PostgreSQL 16 + PgBouncer)
- [x] deploy/compose/dev/docker-compose.cache.yml (Valkey 7)
- [x] deploy/compose/dev/docker-compose.infra.yml (MailHog dev email)
- [x] deploy/compose/dev/docker-compose.pgadmin.yml (pgAdmin 4)
- [x] deploy/compose/dev/docker-compose.app.yml (builds from source — has build: key)
- [x] deploy/compose/dev/pgadmin-servers.json (pre-configured server registration)

- [x] deploy/compose/stage/docker-compose.db.yml
- [x] deploy/compose/stage/docker-compose.cache.yml
- [x] deploy/compose/stage/docker-compose.pgadmin.yml
- [x] deploy/compose/stage/docker-compose.app.yml (pulls from Docker Hub, NO build:, Traefik labels)
- [x] deploy/compose/stage/pgadmin-servers.json

- [x] deploy/compose/prod/docker-compose.db.yml
- [x] deploy/compose/prod/docker-compose.cache.yml
- [x] deploy/compose/prod/docker-compose.pgadmin.yml
- [x] deploy/compose/prod/docker-compose.app.yml (pulls from Docker Hub, NO build:, Traefik labels)
- [x] deploy/compose/prod/pgadmin-servers.json

- [x] .socraticodecontextartifacts.json (4 entries: database-schema, implementation-map,
      decisions-log, product-definition)

### tools/ (Part 7)
- [x] tools/validate-inputs.mjs (validates inputs.yml against inputs.schema.json)
- [x] tools/check-env.mjs (validates required env vars present in .env.dev)
- [x] tools/check-product-sync.mjs (PRODUCT.md ↔ inputs.yml alignment + private tag check)
- [x] tools/hydration-lint.mjs (SSR hydration mismatch detection)

### scripts/ (Part 7)
- [x] scripts/log-lesson.sh (human quick-log to lessons.md in Rule 18 typed format)
- [x] scripts/sync-credentials-to-env.sh (propagate CREDENTIALS.md → .env files)
- [x] COMMANDS.md (master dev command reference)

### CI / GitHub Actions (Part 8)
- [x] .github/workflows/ci.yml
      - governance job: validate-inputs + check-env + check-product-sync
      - quality matrix: lint, typecheck, test, build (via pnpm turbo run)
      - security job: pnpm audit --audit-level=high (blocks on HIGH/CRITICAL CVEs)
- [x] .github/workflows/docker-publish.yml
      - triggers on push to main + workflow_dispatch
      - multi-platform build: linux/amd64 + linux/arm64
      - pushes tags: latest, staging-latest, sha-{short}, branch ref
      - image: secrets.DOCKERHUB_USERNAME/marine-guardian
      - Dockerfile: ./apps/web/Dockerfile

### Governance docs (all Parts)
- [x] MANIFEST.txt (complete file inventory across all 8 Parts)
- [x] docs/PRODUCT.md (human-owned — V31 spec)
- [x] docs/DESIGN.md (extracted design aesthetic — Sentry/dark palette)
- [x] docs/CHANGELOG_AI.md (agent attribution log — Parts 1-8)
- [x] docs/DECISIONS_LOG.md (13 locked decisions)
- [x] docs/IMPLEMENTATION_MAP.md (this file)
- [x] .cline/STATE.md (phase position — updated after every task)
- [x] .cline/memory/lessons.md (typed entries — 🔴 gotchas and 🟤 decisions)
- [x] .cline/memory/agent-log.md (running action log)
- [x] project.memory.md
- [x] .github/skills/spec-driven-core/SKILL.md
- [x] .vscode/mcp.json (SocratiCode + Context7 + shadcn MCP servers)

---

### Security Layers Active
- [x] L1 — tRPC tenantId scoping (multi-tenant — required in all resolvers)
- [x] L2 — PostgreSQL RLS (active — SET LOCAL app.current_tenant_id via withTenant())
- [x] L3 — RBAC middleware (requireRole() on all protected tRPC procedures)
- [x] L4 — PgBouncer (connection pooling — pool limits per COMPOSE_PROJECT_NAME)
- [x] L5 — Immutable AuditLog (writeAuditLog() on all mutations)
- [x] L6 — Prisma $allOperations tenant-guard (auto-injects tenantId, all operations)
- [x] HTTP Security Headers (7 headers in next.config.ts — all routes)
- [x] Rate limiting (4 tiers: public 30/min, auth 10/min, api 120/min, upload 20/min)
- [x] DOMPurify XSS sanitizer (sanitize() + sanitizePlainText() in sanitize.ts)
- [x] AES-256-GCM field encryption (sensitive columns via Prisma extension)

---

### Ports (dev — all non-standard, from inputs.yml ports.dev)
- App:            45204
- PostgreSQL:     44027
- PgBouncer:      44028
- Valkey:         44029
- MinIO API:      44030
- MinIO Console:  44031
- MailHog SMTP:   44032
- MailHog UI:     44033
- pgAdmin:        44034

---

### Phase 6 — Docker Services + Visual QA (2026-05-05)
- [x] All Docker services started via deploy/compose/start.sh dev up -d
- [x] PostgreSQL 16: port 45194 ✅ healthy
- [x] PgBouncer: port 45195 ✅ healthy
- [x] Valkey 7: port 45196 ✅ healthy
- [x] MinIO: port 45197 (API), 45198 (console) ✅ healthy
- [x] MailHog: port 45199 (SMTP), 45200 (UI) ✅ running
- [x] pgAdmin 4: port 45201 ✅ healthy
- [x] App (Next.js): port 45204 ✅ healthy
- [x] Worker: 4 BullMQ workers stable (er-sync, alerts, email, maintenance) — Docker internal networking fix applied
- [x] 2 migrations applied: init + schema_delta_fixes
- [x] Seed data: 1 tenant, webmaster super_admin, admin user, 3 event types, 1 patrol area
- [x] Visual QA: /api/health → 200, /login → 200, /dashboard → 302 redirect (auth working)

Docker fixes applied (6 total):
1. PgBouncer env_file removal — individual env vars instead of full .env.dev
2. Prisma engine binary copy — find+cp in Dockerfile builder stage
3. Healthcheck localhost→127.0.0.1 — Alpine IPv6 resolution fix
4. DATABASE_URL password URL-encoding — %2F and %2B for special chars
5. Prisma CLI env sourcing — set -a && source .env.dev prefix for host commands
6. Worker Docker internal networking — REDIS_HOST/REDIS_PORT overrides in compose environment: block pointing to ${COMPOSE_PROJECT_NAME}_valkey:6379 (not host-mapped localhost:45196)

---

### Not yet built (deferred to Phase 7/8)
- [x] ~~EarthRanger API sync implementation (er-sync worker body)~~ — DONE (Phase 7)
- [x] ~~Dashboard: KPI cards, event breakdown charts, recent events feed, quick stats~~ — DONE (Phase 8 Batch 1 Item 1)
- [x] ~~Event Kanban Board: drag-and-drop state transitions, tenant-scoped updateState, optimistic UI, unit tests~~ — DONE (Phase 8 Batch 1 Item 2)
- [x] ~~Alert rule evaluation engine (alerts worker body)~~ — DONE (Phase 8 Batch 2; processor + tests shipped 2026-05-11; er-sync create-path enqueue integration shipped 2026-05-11 — closes the deferred follow-up)
- [x] ~~Interactive map (MapLibre/mapcn on /map page)~~ — DONE (Phase 8 Batch 2; geo router + vendor primitive + InteractiveMap wrapper + page route shipped 2026-05-11 across 4 sub-sessions 1.1/1.2a/1.2b/1.2c)
- [ ] Real-time notifications (WebSocket/SSE)
- [ ] PDF/CSV export endpoints
- [ ] Mobile app (not in scope for V1)
- [ ] README.md (generated by Phase 8 when PRODUCT.md fully implemented)

### Dashboard (Phase 8 Batch 1 Item 1)
- [x] tRPC router: `apps/web/src/server/trpc/routers/dashboard.ts` — 3 tenant-scoped procedures (kpis, eventBreakdown, recentEvents)
- [x] Router registration: added to `apps/web/src/server/trpc/routers/index.ts`
- [x] Dashboard page: `apps/web/src/app/(dashboard)/dashboard/page.tsx` — KPI cards, horizontal bar charts (law enforcement + monitoring), recent events feed, quick stats sidebar
- [x] shadcn/ui chart component: `apps/web/src/components/ui/chart.tsx` + recharts dependency
- [x] shadcn/ui config: `apps/web/components.json` (new-york style, CSS variables)

### Event Kanban Board (Phase 8 Batch 1 Item 2 — COMPLETE)
- [x] Kibo UI Kanban component: `apps/web/src/components/kibo-ui/kanban/index.tsx` — KanbanProvider, KanbanBoard, KanbanCards, KanbanCard, KanbanHeader (TypeScript strict fixes applied)
- [x] shadcn/ui scroll-area: `apps/web/src/components/ui/scroll-area.tsx` (React 19 ComponentRef compat)
- [x] Events page rewrite: `apps/web/src/app/(dashboard)/events/page.tsx` — 3-column Kanban (New/Active/Resolved), drag-and-drop state transitions, optimistic UI with rollback on error, priority badges, stats bar
- [x] Dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @radix-ui/react-scroll-area
- [x] tRPC `event.updateState` mutation — tenant-scoped updateMany with FORBIDDEN guard when tenantId absent
- [x] tRPC `event.stats` query — tenant-scoped counts by state (total, newEvents, active, resolved)
- [x] Unit tests: `apps/web/src/server/trpc/routers/__tests__/event.test.ts` — 4 tests (happy path, tenant scoping, FORBIDDEN, schema validation), all passing
- [x] vitest upgraded ^2.1.8→^4.1.5 — resolves Vite 8 incompatibility from root pnpm override
- [x] Two-stage review: Stage 1 PASS (spec compliance), Stage 2 PASS (code quality)

### Alert Rules + Notification Center (Phase 7 Feature Update — COMPLETE)
- [x] Alert Rules page: `apps/web/src/app/(dashboard)/alerts/page.tsx` — list, create/edit dialog, severity Select, channel multi-select (in_app + email), isActive Switch toggle, inline delete confirm. Backed by `alertRule` tRPC router (already on main: list/create/update/delete with tenant scoping + adminProcedure for writes)
- [x] Notification Center page: `apps/web/src/app/(dashboard)/notifications/page.tsx` — full rewrite from 8-line stub. Chronological list (newest first), type filter (critical/warning/info/system + "all"), priority color indicators (red/orange/blue/gray dot + badge), unread state (border-left + "New" pill), mark-individual-read (Mark read button on unread items), mark-all-read button, click-through to `/events/{eventId}` when notification has eventId
- [x] Sidebar unread badge: `apps/web/src/components/layout/sidebar.tsx` — `notification.unreadCount` query with 30s refetchInterval + 15s staleTime, pill badge on /notifications nav item with "99+" cap and aria-label
- [x] 6 shadcn primitives added: `apps/web/src/components/ui/{dialog,dropdown-menu,select,separator,switch,tabs}.tsx` — React 19 ComponentRef from the outset, dropdown-menu CheckboxItem `checked` conditionally spread for exactOptionalPropertyTypes:true
- [x] Dependencies: @radix-ui/react-{dialog,dropdown-menu,select,separator,switch,tabs}
- [x] Unit tests: `apps/web/src/server/trpc/routers/__tests__/alertRule.test.ts` (6 tests — list+tenant, list+filter, create+RBAC, create non-admin rejection, update tenant-scoped, delete non-admin rejection); `apps/web/src/server/trpc/routers/__tests__/notification.test.ts` (5 tests — list+tenant+user, list+filter, markRead, markAllRead, unreadCount+FORBIDDEN). Plus typed `partial<T>` helper added to alertRule/notification/event test files for vitest matcher type safety
- [x] Lint cleanup: alerts/page.tsx tightened against Prisma schema (creator + isActive non-nullable), bulk React.ElementRef→React.ComponentRef across vendored shadcn primitives (28 errors fixed in one sed), dropdown-menu strict-boolean for optional `inset` prop
- [x] Two-stage review: Stage 1 PASS (spec compliance with 3 deferrals logged), Stage 2 PASS (code quality)
- [x] Final: lint 0, typecheck 0, 17/17 tests passing in 429ms

#### Spec deferrals from this branch (logged in CHANGELOG_AI 2026-05-08)
- [ ] **Alert history log** (PRODUCT.md L182) — not implemented; needs separate scope decision (notifications view filtered by alertRuleId, or dedicated page)
- [ ] **Filter type spec/schema alignment** (PRODUCT.md L189 "event alert, system alert, escalation, warning" vs schema enum `critical | warning | info | system`) — implementation uses schema enum; recommend updating PRODUCT.md L189 (1-line edit) to resolve drift
- [ ] **Notification → patrol click-through** (PRODUCT.md L187) — events implemented; patrol requires `Notification.patrolId` FK migration (current schema has only `eventId`)

---

### Interactive Map (Phase 8 Batch 2 — COMPLETE)
- [x] Geo tRPC router: `apps/web/src/server/trpc/routers/map.ts` — 4 tenant-scoped read-only procedures (getBounds, getSubjects, getPatrolAreas, getEvents) with L6 guardrails. Registered on appRouter.
- [x] Router tests: `apps/web/src/server/trpc/routers/__tests__/map.test.ts` — 10 unit tests covering tenant isolation, role-based access, geo filtering. All pass.
- [x] mapcn vendor primitive: `apps/web/src/components/ui/map.tsx` — 1844-line MapLibre GL primitive (MIT) installed via `npx shadcn@latest add @mapcn/map`. File-level `/* eslint-disable */` + `// @ts-nocheck` headers applied — registry-managed, see DECISIONS_LOG ("mapcn Vendor File Lint/TS Suppression").
- [x] InteractiveMap wrapper: `apps/web/src/components/map/InteractiveMap.tsx` — 25-line `"use client"` component, centered on Banda Sea `[127.5, -2.5]` zoom 6, props surface `className?: string` only. No data layers, no tRPC calls, no markers (deferred to follow-up).
- [x] Map page route: `apps/web/src/app/(dashboard)/map/page.tsx` — server component renders `<InteractiveMap />` inside full-viewport rounded container.
- [x] Coordinate convention locked: `[lon, lat]` (mapcn primitive contract) — see DECISIONS_LOG from sub-session 1.2a.
- [x] Two-stage review: Stage 1 PASS (PRODUCT.md L191 map view served, tenant-scoped data API ready). Stage 2 PASS for map files; pre-existing user-dialog lint errors documented + deferred to `fix/user-dialogs-strict-mode`.
- [x] Sub-session decomposition: 1.1 (router, Sonnet) → 1.2a (mapcn install, Sonnet) → 1.2b (wrapper, Opus direct) → 1.2c (page route + suppression + governance, Opus direct). Applied per memory-governance.md §5 Thrashing Recovery.
- [x] **Data layer wiring — subjects + events markers (2026-05-12, commit f041215).** Subjects render as emerald-500 circular markers (gray-400 if stale); events render as 45°-rotated diamonds colored by EarthRanger priority tier (red-600/orange-500/amber-400/sky-400). Null lat/lon filtered client-side for type narrowing. Tooltips via `MarkerTooltip`.
- [x] **Patrol tracks wiring (2026-05-12, commit e1e2d8a).** PatrolSelector shadcn `<Select>` overlay (top-left, `absolute z-10 max-w-xs`) queries `trpc.patrol.list({ state: "open", limit: 200 })`. Selected patrol id triggers `trpc.map.patrolTracks.byPatrolId` query; result mapped to `[lon, lat]` tuples and rendered as `<MapRoute color="#2563eb" width={3} opacity={0.85} />` when ≥2 valid points. MapRoute cleans up its own MapLibre source/layer on patrol change via existing useEffect cleanup. Sentinel `"__none__"` value used for clear-selection option.
- [x] **Patrol-area polygons (2026-05-12, commit 7250039).** New `apps/web/src/components/map/MapPolygon.tsx` (119 lines) — client component using `useMap()` to imperatively `addSource` (geojson Feature wrapping the stored Polygon/MultiPolygon) + two `addLayer` calls (fill at 0.2 opacity, line outline at 0.8 opacity 1.5px width), both colored by per-area `colorHex`. InteractiveMap queries `trpc.map.patrolAreas.list({ activeOnly: true })` and maps each result to `<MapPolygon>` rendered BEFORE `<MapRoute>` for correct z-order (track line on top). Prisma `Json` → `GeoJSON.Polygon | GeoJSON.MultiPolygon` cast routed through `unknown`. **MAP FEATURE GROUP COMPLETE.**

### Alert Rule Evaluation Engine (Phase 8 Batch 2 — COMPLETE)
- [x] Processor: `packages/jobs/src/processors/alerts.processor.ts` — `evaluateAlerts(job)` exported. Tenant-scoped event load → active rule load → match on `conditionJson.eventTypeId + minPriority` → recipient fallback to super_admin/site_admin → atomic Prisma `$transaction` creates Notification + AuditLog (action `ALERT_FIRED`) per rule×recipient. Returns `{rulesEvaluated, rulesMatched, notificationsCreated}`.
- [x] Tests: `packages/jobs/src/__tests__/alerts.processor.test.ts` — 5 vitest cases (missing tenantId rejection, no-active-rules, match+recipient happy path with notification + audit log assertions, match+no-recipient yields zero without opening transaction, transaction-failure atomic no-partial-commit). All pass in 132ms.
- [x] Worker registration: pre-existed in `packages/jobs/src/start-workers.ts:12` from Phase 4 scaffold. `processAlert` deprecated re-export preserved at end of processor file for compat.
- [x] **Enqueue integration shipped 2026-05-11** — actual integration site is `er-sync.processor.ts syncEvents`, not the (non-existent) `event.create` tRPC mutation. Refactored `syncEvents` to split `upsert` into `findUnique` + `create`/`update` so create-vs-update is distinguishable. `enqueueAlert({tenantId, userId:"system", alertRuleId:"", eventId, priority})` is called on the create path only, wrapped in try/catch so a queue outage never fails the sync. 5 new er-sync tests cover create-path, update-path, enqueue-on-create-only, no-enqueue-on-update, sync-succeeds-on-enqueue-failure.

### Next Step
Map feature group COMPLETE + seed-rotation tech debt cleared. Phase 8 Batch 2 remaining backlog (Opus-recommended order, updated 2026-05-12 after seed rotation merge):
1. Spec deferral #3: Notification.patrolId FK migration + UI wiring (PRODUCT.md L187). Migration + router update + notification-center click-through wiring. Tier 2.
2. Real-time notifications (WebSocket/SSE — Tier 3, must split into ≥3 sub-sessions per memory-governance.md §1).
3. PDF/CSV export endpoints (per entity, one at a time).
4. Spec deferral #1: Alert history log (now meaningful since engine fires on real events).

Shipped since the last "Next Step" rewrite (2026-05-11):
- ✅ `fix/dev-docker-internal-urls` (92e0e65) — compose overrides + INTERNAL_DATABASE_URL/REDIS_URL pattern + AUTH_TRUST_HOST in .env.dev
- ✅ `fix/user-dialogs-strict-mode` (29e66b0) — 13 ESLint errors cleared; CI lint gate now passes on main
- ✅ `feat/map-data-layer` (f041215) — subjects + events markers wired into InteractiveMap
- ✅ `fix/worker` (e409aba) — Prisma ESM externalization + pnpm symlink dereference; alerts engine + er-sync workers unblocked
- ✅ `feat/map-patrol-tracks` (e1e2d8a) — PatrolSelector + MapRoute wiring for selected patrol GPS path
- ✅ `feat/map-patrol-areas` (7250039) — MapPolygon component + InteractiveMap polygon overlay rendering — MAP FEATURE GROUP COMPLETE
- ✅ `fix/seed-password-from-env` — seed.ts reads WEBMASTER_PASSWORD + DEMO_SITE_ADMIN_PASSWORD from env vars, upsert update path rotates hashes on re-seed, plaintext lifted out of source into .env.{env} + CREDENTIALS.md
- ✅ `feat/map-patrol-areas` (7250039) — MapPolygon component + patrol-area overlays. **Map feature group COMPLETE.**

No known blockers. All services operational. 4 commits on main ahead of origin/main (push when ready).
