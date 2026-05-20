# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# Last updated: 2026-05-20 — Phase 8 Batch 4 Sub-batch 4.1d SHIPPED (squash-merge to main pending). NotificationRecipient split with data migration per v2 spec L480-484: removed userId+isRead from Notification, added subjectId nullable FK to Subject (SET NULL), new NotificationRecipient model (cuid PK, notification_id CASCADE, user_id NO ACTION, is_read default false, read_at + email_sent_at nullable, email_status enum default pending, 3 indexes), new enum NotificationEmailStatus{pending,sent,suppressed_by_cooldown,digested,failed}. Migration 20260519233500_add_notification_recipient_split has 14-step DDL with backfill (1 NotificationRecipient row per existing Notification, deterministic md5-derived ID for idempotency) BEFORE column drops + hand-written 10-step down.sql (lossy when N>1 recipients). Pre-flight: 0 notifications in dev → backfill no-op but SQL correct for staging/prod. Router full rewrite — all 4 procedures (list/markRead/markAllRead/unreadCount) query notificationRecipient with nested join filter notification:{tenantId}; markRead+markAllRead set both isRead=true AND readAt=now() per spec L483; list returns flattened shape so UI markRead({id: n.id}) naturally targets recipient.id. Exports/notifications route updated to query recipient join (CSV ID column still uses notification.id for backward-compat). UI page + SSE Route Handler + sidebar + realtime-store + poller all NO-OP (router's flattened shape matches what consumers already expected). 262 tests passing across 37 files (was 260; +2 net: notification.test.ts 6→10 with 3 NEW pathways for cross-user reject, user-scoped markAllRead, flattened shape). typecheck 0 / lint 0. 3 plan corrections caught during main-session v2-spec audit (notificationType stays on Notification, read_at field added, email_status is 5-value enum). 3 new lessons: 🔴 prisma migrate dev advisory-lock hang + 🟤 deterministic md5 backfill IDs + 🟤 always verify plan text against authoritative v2 spec. Phase 8 Batch 4 progress: 4 of 5 sub-batches shipped (4.1a + 4.1b + 4.1c + 4.1d); 1 remains (4.1e Event/Patrol attribution FKs + Tenant ArcGIS fields).
# Prior 2026-05-19 — Phase 8 Batch 4 Sub-batch 4.1c SHIPPED to main (commit e972d82, squash-merged from feat/fuel-entry-report-export-scaffold which was branched off f1b188a). Adds FuelEntry + ReportExport v2 foundation tables (CC-native, additive, non-breaking). Schema: 3 new enums (ReportType{coverage,area,consolidated,detailed,rangers,patrol_filtered} + PaperSize{A4,Letter,Legal} + ReportExportStatus{queued,rendering,ready,failed}) + 2 new models (FuelEntry with cuid PK, tenant_id FK RESTRICT, area_name string, area_boundary_id nullable FK to AreaBoundary with SET NULL preserving area_name snapshot, date_received DATE, liters DECIMAL(12,3), total_price DECIMAL(14,2), currency string, receipt_photo_url nullable, notes nullable, logged_by_user_id FK to users RESTRICT, 3 indexes; ReportExport with cuid PK, tenant_id FK RESTRICT, requested_by_user_id FK to users RESTRICT, report_type + paper_size + status enums, params_json JSONB, file_path/file_size_bytes/error_message nullable, completed_at nullable, 3 indexes) + back-relations on Tenant (fuelEntries + reportExports), User (loggedFuelEntries + requestedReportExports with named relations), AreaBoundary (fuelEntries). Migrations (2 separate per task spec): 20260519231300_add_fuel_entry/{migration,down}.sql (DROP TABLE only — no enums) and 20260519231301_add_report_export/{migration,down}.sql (DROP TABLE then drop 3 enum types in dependency order). Routers: fuelEntry (list/getById/create [operator+]/update [ownership-checked]/updateAny [coordinator+ no ownership check]/delete [site_admin+] per RBAC matrix spec §405-408 — split into two update procedures because single procedure would conflate ownership + role checks) + reportExport (list/getById/pollStatus/create [coordinator+ inserts queued row, DOES NOT enqueue BullMQ yet]/getDownloadUrl [returns null when not ready, canonical /[tenantId]/exports/[id]/download URL when status=ready, throws NOT_FOUND for missing rows — no cross-tenant existence leak]). Shared schemas: fuel-entry.ts + report-export.ts + 3 enum additions to enums.ts; both exported through index.ts. FuelEntry decimal handling: stored as Postgres DECIMAL, serialized by Prisma as string, Zod input validates positive decimal regex + Number()>0 refinement (no float precision loss round-tripping from UI). Currency snapshot per spec §196: read from prisma.tenant.findFirst at create time, not from session (session doesn't carry currency). 21 new tests across 2 files (12 fuelEntry + 9 reportExport using the partial<T> helper pattern from 2026-05-08 lesson). Verification: typecheck 0 / lint 0 / vitest 260 passing (was 239 baseline + 21 new; zero regressions across 37 test files). NOTE: packages/db Node-types failures pre-existing — identical baseline shipped on 4.1a/4.1b. Two new lessons added: (1) 🔴 "Prisma migrate dev sweeps multiple new models into one migration" — when both new models are in schema.prisma at migrate-dev time, --name flag does NOT control which model lands in which migration; agent split by hand after sweep; (2) 🟡 "Zod cuid() strict format check rejects synthetic short strings" — test fixtures need 25-char cuid-shaped strings starting with 'c', not bare 'ab-1'. Phase 8 Batch 4 progress: 3 of 5 sub-batches shipped (4.1a + 4.1b + 4.1c); 2 remain (4.1d NotificationRecipient split with data migration, 4.1e Event/Patrol attribution FKs + Tenant ArcGIS fields).
# Prior 2026-05-17 — Phase 8 Batch 2 Item 5 (Realtime SSE) CODE COMPLETE on feat/sse-events-and-hardening (3 commits awaiting squash-merge). SSE-1 + SSE-2 already shipped to main commit 3710472 on 2026-05-17 morning. SSE-3 splits the UI/hardening work across the open branch: 3a (d15631f) mounts RealtimeProvider in the dashboard layout + adds NotificationBell to the header + invalidates the /notifications page tRPC queries on every new realtime event; 3b (dac6bfd) drops the 30s tRPC `refetchInterval` from the sidebar's unreadCount query and replaces it with useEffect-driven invalidation keyed on the notification-store's notifications.length — zero background polling between events, near-instant badge updates on event arrival; 3c (b0b768a) hardens the SSE Route Handler with two additions: (a) per-userId rate-limit via existing `rateLimiters.api` 120/min tier (try/check after requireRouteAuth → 429 NextResponse on throw, skips subscribe entirely on rate-limit), (b) new module apps/web/src/server/lib/sse-metrics.ts with process-local active-connection counter + reconnect counter (5 getters/mutators + __resetMetricsForTests, monotonic with clamp-at-0 decrement), wired into route.ts via incrementConnection() after successful subscribeToChannel + decrementConnection() in cancel() gated on connectionTracked flag to keep increment/decrement paired across subscribe-failure path. Test deltas: 128 → 140 (+12: 6 sse-metrics module tests + 6 new route-handler tests covering increment, decrement, no-increment-on-subscribe-rejection, rate-limit-token-is-userId, 429-skips-subscribe, auth-failure-short-circuits-rate-limit). All gates green: typecheck clean, lint clean (zero in-session fixups for 3c), test 140/140, build registers /api/stream/notifications as 161 B ƒ Dynamic Route (unchanged). Deferred per task scope: server-side reconnect attribution (needs client session-correlation header), multi-instance metric aggregation (needs Redis-backed counter), metric exposure endpoint (no public surface yet — getters are importable today). Phase 8 Batch 2 backlog after 3c squash-merges: 0 items — Batch 2 COMPLETE. Prior 2026-05-13: Item 4 SS-4 — Notifications + Alert History Export Route Handlers shipped on feat/exports-audit-views (squash-merge pending). Two routes in one branch: apps/web/src/app/api/exports/notifications/route.ts (GET handler — tenant+user-scoped findMany with isRead + notificationType filters; 9-column NotificationRow with flattened alertRuleName/eventTitle/patrolTitle relations) AND apps/web/src/app/api/exports/alert-history/route.ts (GET handler — tenant-scoped findMany with alertRuleId filter; 8-column AlertHistoryRow with both immutable snapshot columns AND current relation values falling back to "(deleted)"). 6 tests each (12 new). Modified: notification.ts + alertHistory.ts routers exported `notificationListFilters` + `alertHistoryListFilters` z.objects — single source of truth. /notifications/page.tsx + /alerts/history/page.tsx headers gained Export CSV + Export PDF buttons (same `<Button asChild><a download href={buildExportUrl(entity, filters, format)}>` shape; notifications passes current typeFilter so export matches view). Full web suite: 84/84 (was 72 — added 12), typecheck 6/6 clean, lint 5/5 clean (zero fixups — SS-3 lint patterns carried forward). Build registers all 5 export Dynamic Routes (/api/exports/events|patrols|alert-rules|notifications|alert-history at 159 B / 103 kB each). No new lessons. After SS-4 fully ships, Item 4 (PDF/CSV Exports) is COMPLETE. Only Real-time SSE remains in Phase 8 Batch 2 (Tier 3, mandatory split ≥3 sub-sessions per memory-governance.md §1). Prior 2026-05-13: SS-3 Alert Rules Export shipped on feat/exports-alert-rules (squash-merge pending). New: apps/web/src/app/api/exports/alert-rules/route.ts (GET handler — same shape as SS-1 events + SS-2 patrols handlers with prisma.alertRule.findMany + creator include + 9-column AlertRuleRow: id, name, condition=JSON.stringify(conditionJson), channels=notificationChannels.join(", "), isActive="true"/"false", creatorName, creatorId, createdAt ISO, updatedAt ISO), 6 new route tests (CSV byte-level BOM + tenant scoping + channels-joined-comma + escaped-JSON conditionJson assertions, PDF content-type, 401, 413 overflow + no audit row, DATA_EXPORT audit shape with 64-hex filterHash + entityType="alert-rules", isActive filter boolean-coercion propagation). Modified: alertRule.ts router exported `alertRuleListFilters` z.object ({isActive}) — single source of truth; alertRuleRouter.list now uses `alertRuleListFilters.extend({cursor, limit})`. alerts/page.tsx: inserted Export CSV + Export PDF buttons (same `<Button asChild><a download href={buildExportUrl("alert-rules", {}, format)}>` shape) inside the existing header flex-gap-2 group before View History + New Rule. Full web suite: 72/72 (was 66 — added 6), typecheck 6/6 clean, lint 5/5 clean (one trivial fixup — removed unnecessary `?.` + `??` on r.creator.fullName since Prisma include with required FK narrows to non-null), build registers /api/exports/alert-rules alongside /api/exports/events and /api/exports/patrols as ƒ Dynamic Route. No new lessons — SS-1's BOM-via-arrayBuffer 🟡 fix and SS-2's lint patterns carried forward verbatim. Plan deviation (1, minor): used JSON.stringify(conditionJson) for the condition column over the plan's "priority>=200" example because conditionJson is an opaque Json column whose structure varies; raw JSON is the honest representation. Column count 9 (one fewer than SS-1/SS-2's 10) — AlertRule is a leaner entity, padding would be artificial. SS-4 (Notifications + Alert History combined) remains as the final Item 4 sub-session (~22K, branch feat/exports-audit-views). Phase 8 Batch 2 backlog after Item 4 fully ships: 1 item — real-time SSE (Tier 3, mandatory split per memory-governance.md §1).
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
- [ ] Real-time notifications (WebSocket/SSE) — Phase 8 Batch 2 final item; Tier 3 split into SSE-1/SSE-2/SSE-3. **SSE-1 + SSE-2 SHIPPED to main 2026-05-17 in squash-merge commit 3710472 (pushed to origin/main). feat/sse-foundation branch deleted locally (never pushed to remote).** SSE-1: Valkey pub/sub publisher in packages/jobs + subscriber in apps/web + per-user SSE endpoint at /api/stream/notifications + alerts.processor publishes after tx commit. SSE-2: client SSE pipeline — EventSource wrapper (apps/web/src/lib/realtime/event-source-client.ts) + Zustand notification store (notification-store.ts) + REST polling fallback (notification-poller.ts) + orchestration hook (useNotificationStream.ts) with exponential backoff [1,2,4,8,16]s and polling fallback after 5 failed reconnects. SSE-3 (events stream endpoint + UI integration + War Room hook + securityVersion hardening + E2E) remaining on fresh branch feat/sse-events-and-hardening.
- [x] ~~PDF/CSV export endpoints~~ — DONE (Phase 8 Batch 2 Item 4 — SS-1 events, SS-2 patrols, SS-3 alert-rules, SS-4 notifications + alert-history; all 5 endpoints live under /api/exports/* with identical shape)
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

### Exports (Phase 8 Batch 2 Item 4 — IN PROGRESS)
- [x] **SS-0: Foundation primitives (2026-05-12, commit 4caa449).** 5 shared helpers in apps/web/src/server/lib/: route-auth.ts (Auth.js v5 session verifier — `requireRouteAuth()` returns `{userId, tenantId, roles}`, throws RouteAuthError with 401 NextResponse), export-csv.ts (~30-LOC RFC-4180 renderer with UTF-8 BOM + CRLF endings), export-pdf.tsx (React-PDF Document component + `renderExportPdf()` async Buffer wrapper), export-audit.ts (writeExportAudit → DATA_EXPORT AuditLog row with filterHash entityId + changesJson={format, rowCount}), export-filename.ts (`{entity}-{tenantSlug}-{YYYYMMDD-HHmmss}.{ext}` UTC). 15 unit tests across 3 test files (10 csv + 2 pdf + 3 audit). @react-pdf/renderer added to deps. vitest.config.ts gained @vitejs/plugin-react to support JSX in `.tsx` test files (Next.js tsconfig sets jsx:preserve).
- [x] **SS-1: Events export (2026-05-12, branch feat/exports-events — squash-merge pending).** Route Handler at apps/web/src/app/api/exports/events/route.ts: manual auth via `requireRouteAuth()`, rate limit via `rateLimiters.upload.check(userId)` (20/min), validates state+priority via reused `eventListFilters` (exported from event router), fetches Tenant.slug+name for filename + PDF header, prisma.event.findMany with `take: 10001` for overflow detection (HTTP 413 on >10000), sha256 filterHash from sorted-keys JSON, flattens to 10-column EventRow (id, serial, title, state, priority, eventType.display+category, reportedByName, reportedAt ISO, createdAt ISO), branches on `format=csv|pdf`, writes DATA_EXPORT audit log AFTER success. New helper apps/web/src/lib/exports.ts `buildExportUrl(entity, filters, format)`. /events page header gains Export CSV + Export PDF outline buttons (`<Button asChild><a download href=...>`). 6 new route-handler tests (CSV byte-level BOM + tenant scoping, PDF content-type, 401 missing session, 413 overflow, audit shape with 64-hex filterHash, filter propagation). Full web suite: 60/60 (was 54). Lessons: 🟡 fix — Response.text() strips UTF-8 BOM during decoding; assert via arrayBuffer() byte-level check.
- [x] **SS-2: Patrols export (2026-05-12, branch feat/exports-patrols — squash-merge pending).** Route Handler at apps/web/src/app/api/exports/patrols/route.ts: same shape as SS-1 events handler, substituting `patrol` for `event`. Manual auth via `requireRouteAuth()`, rate limit via `rateLimiters.upload.check(userId)` (20/min), validates state+patrolType via reused `patrolListFilters` (exported from patrol router), fetches Tenant.slug+name, prisma.patrol.findMany with `take: 10001` for overflow detection (HTTP 413 on >10000), sha256 filterHash from sorted-keys JSON, flattens to 10-column PatrolRow (id, serialNumber, title, patrolType, state, boatName, startTime ISO, endTime ISO, totalDistanceKm, createdAt ISO), branches on `format=csv|pdf`, writes DATA_EXPORT audit log AFTER success. /patrols page header gains Export CSV + Export PDF outline buttons (`<Button asChild><a download href={buildExportUrl("patrols", {}, format)}>`); page no longer a stub. 6 new route-handler tests (CSV byte-level BOM + tenant scoping, PDF content-type, 401 missing session, 413 overflow + no audit row, audit shape with 64-hex filterHash, state+patrolType filter propagation). Full web suite: 66/66 (was 60). No new lessons — SS-1's BOM-via-arrayBuffer 🟡 fix carried forward verbatim.
- [x] **SS-3: Alert Rules export (2026-05-13, branch feat/exports-alert-rules — squash-merge pending).** Route Handler at apps/web/src/app/api/exports/alert-rules/route.ts: same shape as SS-1/SS-2 handlers, substituting `alertRule` for the entity. Manual auth via `requireRouteAuth()`, rate limit via `rateLimiters.upload.check(userId)` (20/min), validates query-string `isActive` (coerced from string to boolean before safeParse) via reused `alertRuleListFilters` (exported from alertRule router), fetches Tenant.slug+name, prisma.alertRule.findMany with `include: { creator: { select: { id, fullName } } }` + `take: 10001` for overflow detection (HTTP 413 on >10000), sha256 filterHash from sorted-keys JSON, flattens to 9-column AlertRuleRow (id, name, condition=JSON.stringify(conditionJson), channels=notificationChannels.join(", "), isActive="true"/"false", creatorName=creator.fullName, creatorId=createdBy, createdAt ISO, updatedAt ISO), branches on `format=csv|pdf`, writes DATA_EXPORT audit log AFTER success. /alerts page header gains Export CSV + Export PDF outline buttons positioned before View History + New Rule (`<Button asChild variant="outline" size="sm"><a download href={buildExportUrl("alert-rules", {}, format)}>`). 6 new route-handler tests (CSV byte-level BOM + tenant scoping + channels-joined-comma + escaped-JSON conditionJson body assertions, PDF content-type, 401 missing session, 413 overflow + no audit row, audit shape with 64-hex filterHash + entityType="alert-rules", isActive filter propagation with boolean coercion verified). Full web suite: 72/72 (was 66). No new lessons — SS-1's BOM-via-arrayBuffer 🟡 fix and SS-2's lint patterns carried forward. One trivial lint fixup: removed unnecessary `?.` + `??` on `r.creator.fullName` (Prisma include with required FK narrows to non-null).
- [x] **SS-4: Notifications + Alert History (2026-05-13, branch feat/exports-audit-views — squash-merge pending).** Two Route Handlers in one branch. (1) `apps/web/src/app/api/exports/notifications/route.ts`: same shape as SS-1/2/3 with TENANT+USER scoping (notifications are per-user), reuses `notificationListFilters` (exported from notification router) for isRead boolean + notificationType enum validation; query-string isRead coerced "true"/"false"/undefined → boolean before safeParse; prisma.notification.findMany with `include: {alertRule, event, patrol}` + take 10001; flattens to 9-column NotificationRow (id, title, message, type, isRead, alertRuleName, eventTitle, patrolTitle, createdAt ISO) with relation columns using nullish coalescing to "" since alertRule/event/patrol are optional FKs. (2) `apps/web/src/app/api/exports/alert-history/route.ts`: same shape with tenant-only scoping, reuses `alertHistoryListFilters` (exported from alertHistory router) for alertRuleId filter; prisma.alertHistory.findMany with `include: {alertRule, event}` + take 10001 + `orderBy: {firedAt: "desc"}`; flattens to 8-column AlertHistoryRow (id, ruleNameSnapshot, eventTitleSnapshot, matchedPriority as string, recipientCount as string, alertRuleCurrent=alertRule?.name ?? "(deleted)", eventCurrent=event?.title ?? "(deleted)", firedAt ISO) — exposes both the immutable snapshot fields AND the current relation values since alertHistory rows survive deletion of FK targets via SetNull onDelete. Both handlers: manual auth + rateLimiters.upload (20/min) + sha256 filterHash + CSV/PDF branches + DATA_EXPORT audit AFTER success. /notifications page header: Export CSV + Export PDF buttons inserted before the existing Select + Mark all as read, pass `notificationType: typeFilter==="all"?undefined:typeFilter` so the export matches the user's filtered view. /alerts/history page header: wrapped existing Back to Alert Rules in flex group, prepended Export CSV + Export PDF (no filter — page does not yet expose alertRuleId filter UI). 12 new route-handler tests (6 per route — CSV byte-level BOM + tenant scoping + flattened relation columns assertion for notifications, snapshot column assertions for alert-history; PDF content-type, 401 missing session, 413 overflow + no audit row, DATA_EXPORT audit shape with 64-hex filterHash + entityType, filter propagation into prisma.where with boolean coercion for notifications and alertRuleId string for alert-history). Full web suite: 84/84 (was 72). No new lessons — SS-1's BOM-via-arrayBuffer 🟡 fix and SS-3's lint patterns carried forward verbatim (zero fixups this session).

### Phase 8 Batch 4 — v2 Foundation Tables (IN PROGRESS)
- [x] **Sub-batch 4.1a: AreaBoundary scaffold (2026-05-19, branch feat/area-boundary-scaffold — squash-merge pending).** First sub-batch of the additive non-breaking v2 foundation work. Adds Prisma model `AreaBoundary` + 2 new enums (`BoundarySource{official,custom}`, `GeometryType{Polygon,LineString}`) + back-relations on Tenant (`areaBoundaries`) and User (`createdAreaBoundaries`). Migration 20260519183900_add_area_boundary creates the `area_boundaries` table with cuid PK, tenant FK (RESTRICT), name, aliases TEXT[], region, source default `custom`, geometry_type enum, geometry_geojson JSONB, is_enabled default true, override_official default false, nullable arcgis_reference_id, created_by_user_id FK (RESTRICT), timestamps, and indexes on tenant_id + (tenant_id, is_enabled). Shared Zod schemas: `areaBoundarySchema` + `createAreaBoundarySchema` (omits id/tenantId/createdByUserId/timestamps) + `updateAreaBoundarySchema` (`create.partial()`). New tRPC router `areaBoundary` mounted on appRouter with `list`/`getById` via tenantProcedure (paginated, filter by isEnabled + region) and `create`/`update`/`delete` via adminProcedure (super_admin + site_admin only). 6 router tests across 2 describes — list tenant scoping + filter assertion, create tenant+creator scoping, RBAC rejection for operator, update + delete tenant scoping. Full web suite 232/232 (was 226). Derivation algorithm, ArcGIS reference load, override_official auto-flip, audit wiring, Area Boundary Editor UI, and seed data all explicitly deferred to Batch 5+.
- [x] **Sub-batch 4.1b: PatrolTrack scaffold (2026-05-19, branch feat/patrol-track-scaffold — squash-merge pending).** Second sub-batch of the additive non-breaking v2 foundation work. Adds Prisma model `PatrolTrack` + 1 new enum (`TrackSource{er_api,cache}`) + back-relation `patrolTracks` on Tenant + one-to-one back-relation `track PatrolTrack?` on Patrol. Migration 20260519223000_add_patrol_track creates the `patrol_tracks` table with cuid PK, tenant_id FK (RESTRICT), patrol_id FK (CASCADE) with UNIQUE constraint enforcing the one-track-per-patrol invariant, nullable subject_id, since/until timestamps, track_geojson JSONB, has_timestamps default false, point_count default 0, nullable last_track_time, patrol_ended default false, source enum non-null, fetched_at timestamp, timestamps, indexes on tenant_id + (tenant_id, patrol_ended). Shared Zod schemas: `patrolTrackSchema` + 3 input schemas (`listPatrolTracksInputSchema` with optional patrolId/patrolEnded filters + cursor pagination, `getPatrolTrackByIdInputSchema`, `getPatrolTrackByPatrolIdInputSchema`). New tRPC router `patrolTrack` mounted on appRouter is READ-ONLY by design: `list`/`getById`/`getByPatrolId` all via tenantProcedure — no create/update/delete (writes flow exclusively through the Patrol Track Materialization job per PRODUCT.md §501-502 to keep the upsert invariant centralized). Stub `apps/web/src/server/sync/patrol-track-materialization.ts` added with `materializePatrolTrack(patrolId)` throwing "Not implemented — Batch 5 wiring"; header docblock documents the `needs_refetch` predicate per PRODUCT.md §1043, the per-tenant async-pool concurrency cap of 4, and planned integration with packages/jobs/src/processors/er-sync.processor.ts in Batch 5. 7 router tests across 3 describes (list tenant scoping, list patrolId filter, list patrolEnded filter, getById success path, getById cross-tenant returns null, getByPatrolId success path, getByPatrolId returns null when no materialized track). Full web suite 239/239 (was 232). Patrol Track Materialization real impl + Valkey cache layer + area-covered aggregation + Patrol Track Viewer Modal UI + track time math + Douglas-Peucker simplification + computed_distance_km/computed_duration_hours on Patrol + is_test_patrol/is_deleted/sync_needed flags all explicitly deferred to Batch 5+.
- [x] **Sub-batch 4.1c: FuelEntry + ReportExport scaffolds (2026-05-19, squash-merged to main as e972d82, pushed to origin).** See header (line 3) for full prose entry.
- [x] **Sub-batch 4.1d: NotificationRecipient split with data migration (2026-05-20, branch feat/notification-recipient-split — squash-merge pending).** Fourth sub-batch of the additive v2 foundation work — and the ONLY one with real data-migration semantics. Splits per-user read state OFF Notification ONTO NotificationRecipient per v2 spec L480-484: one Notification row, N NotificationRecipient rows. Schema delta on Notification: removed userId+isRead, added subjectId nullable FK to Subject (SET NULL); removed indexes user_id+is_read; added index subject_id. New NotificationRecipient model: cuid PK, notification_id FK CASCADE, user_id FK NO ACTION, is_read default false, read_at nullable, email_sent_at nullable, email_status enum default pending, created_at; 3 indexes (notification_id, (user_id, is_read), (user_id, created_at DESC)). New enum NotificationEmailStatus with 5 literal values (pending, sent, suppressed_by_cooldown, digested, failed). Back-relations updated: User.notifications → User.notificationRecipients; Subject.notifications added; Notification.recipients added. Migration 20260519233500_add_notification_recipient_split: 14-step DDL — CREATE enum + table + 3 indexes + 2 FKs FIRST, then backfill INSERT (1 NotificationRecipient row per existing Notification preserving user_id+is_read+created_at, using deterministic md5-derived ID for idempotency on re-run), THEN drop indexes + FK + columns on notifications + add subject_id + FK + index. Hand-written down.sql reverses in 10 steps with lossy restore (picks earliest recipient per notification when N>1). Pre-flight: SELECT COUNT(*) FROM notifications → 0 rows in dev → backfill ran as no-op but the SQL is correct for staging/prod safety. Plan corrections caught during main-session review against v2 spec L480-484: (1) notificationType STAYS on Notification (not moved per stale STATE.md plan text), (2) read_at field added to NotificationRecipient (omitted in plan), (3) email_status is a 5-value enum not a default-string. Router rewrite of apps/web/src/server/trpc/routers/notification.ts: all 4 procedures (list/markRead/markAllRead/unreadCount) now query prisma.notificationRecipient.* with nested join filter `notification: {tenantId: ctx.tenantId}` for tenant scoping + top-level `userId: ctx.userId` for user scoping; markRead+markAllRead set BOTH isRead=true AND readAt=new Date() per v2 spec L483; list returns FLATTENED shape so item.id surfaces as recipient.id and UI's markRead({id: n.id}) naturally targets the recipient. Tests: notification.test.ts went 6 → 10 cases with 3 NEW pathways (cross-user markRead silent reject — proves userId filter in WHERE is load-bearing, user-scoped markAllRead, flattened shape mapping). Consumers: exports/notifications/route.ts rewritten to query notificationRecipient.findMany with same nested-filter pattern; CSV's ID column still uses notification.id (not recipient.id) for backward-compat with older CSV consumers. UI page apps/web/src/app/(dashboard)/notifications/page.tsx needed ZERO edits — router's flattened return shape matches what the page consumed. SSE Route Handler + sidebar + realtime-store + poller all no-op (shape decoupled from DB column shape). 262 tests passing across 37 files (was 260; +2 net). typecheck 0 / lint 0. Migration applied cleanly to dev DB. 3 new lessons: 🔴 "prisma migrate dev hangs on stale advisory locks" + 🟤 "Backfill SQL should use deterministic md5 IDs for idempotency" + 🟤 "v2 spec is authoritative — verify against PRODUCT.md before trusting STATE.md plan text". Deferred: actual Notification creation flow (fan-out to N recipients per alert) — Batch 5+ AlertRule restructure. Email dispatch worker that flips emailStatus pending→sent/suppressed_by_cooldown/digested/failed — Batch 5+. Read-at rendering in UI ("Read 2 hours ago") — Batch 6+ UI polish. NotificationRecipient retention policy (1y per spec L645) — Batch 7+.
- [x] **Sub-batch 4.1e: Event/Patrol area attribution + Tenant ArcGIS fields (2026-05-20, squash-merged to main as 6687112).** Fifth and final sub-batch of the additive non-breaking v2 foundation work — **closes Batch 4**. Adds 3 columns to Event + 3 to Patrol (areaName + areaBoundaryId FK to AreaBoundary SET NULL + areaDerivedAt, all nullable) + 2 columns to Tenant (arcgisBoundaryUrl + arcgisBoundaryOutfields, both nullable; encrypted at app layer per existing earthrangerUrl precedent, plain TEXT in DB) + 2 back-relations on AreaBoundary (events + patrols) + 2 composite indexes (events_tenant_id_area_boundary_id_idx + patrols_tenant_id_area_boundary_id_idx for "items in this area" Per Area Report queries — Batch 6+). Migration 20260520010000_add_area_attribution_and_tenant_arcgis: 7-step additive DDL (ALTER TABLE tenants/events/patrols ADD COLUMN + AddForeignKey + CreateIndex) + lossless 7-step down.sql. All additive nullable — no backfill needed, no data-migration risk; fields stay NULL until the AreaBoundary derivation algorithm (`derive_area(row)` per v2 spec L516+L540) lands in Batch 5+. Plan correction caught against v2 spec L456+L463: STATE.md plan listed only `area_boundary_id + area_derived_at` — v2 spec also includes `area_name` (free-text from ER on Event, free-text "primary area" on Patrol, derived from objective field or start_location's nearest AreaBoundary). Added area_name to both per the same "v2 spec is authoritative" correction pattern caught in 4.1d. Note: areaName already pre-existed in packages/shared/src/types/event.ts + schemas/event.ts (latent shared/Prisma drift) — 4.1e resolves the drift by adding it to the Prisma schema. Shared types + schemas updated: types/{event,patrol,tenant}.ts + schemas/{event,patrol,tenant}.ts — 6 files, additive only (areaBoundaryId as `z.string().cuid().nullable()`, areaDerivedAt as `z.coerce.date().nullable()`, arcgisBoundaryUrl as `z.string().url().nullable()` matching earthrangerUrl pattern). Routers UNTOUCHED: apps/web/src/server/trpc/routers/event.ts + patrol.ts both use `include` (not `select`) on their Event/Patrol queries, so new schema fields auto-surface in responses with zero router code change. Tests: NEW apps/web/src/server/trpc/routers/__tests__/patrol.test.ts (6 cases — closes existing gap as patrol router previously had zero coverage; covers list/getById/stats with 4.1e area-attribution assertions baked in: fields surface as null when un-derived, fields surface populated when derivation has run, cross-tenant isolation, FORBIDDEN guard, tenant-scoped count grouping). Verification: typecheck 0 (except pre-existing packages/db Node-types baseline — identical to 4.1a-4.1d) / lint 5/5 0 warnings / vitest 268 passing across 38 files (was 262/37; +6 cases +1 file) / migration applied cleanly to dev DB. Dispatch experience: Opus 4.7 executor subagent reported "completed" but actually dropped at step 7 of 11 after writing schema.prisma + migration SQL + running pnpm prisma migrate dev. Salvageable per [[feedback_sonnet_thrash_inspect_before_redispatch]] doctrine — Architect verified partial work matched brief exactly + completed remaining 7 files (6 shared + patrol.test.ts) in main session. **🎯 BATCH 4 COMPLETE** — all 5 sub-batches shipped (4.1a AreaBoundary → 4.1b PatrolTrack → 4.1c FuelEntry+ReportExport → 4.1d NotificationRecipient split → 4.1e Event/Patrol/Tenant area attribution). v2 foundation tables in place. Deferred to Batch 5+: AreaBoundary derivation algorithm (Event area_boundary_id+area_derived_at set by sync job from area_name match OR nearest-boundary lookup; Patrol area_boundary_id+area_derived_at set from start_location nearestBoundary) — re-derive BullMQ job + manual rebuild button. Patrol Track Materialization job (per-patrol GPS track fetch from ER). ReportExport pdf-render queue + marine-guardian-pdf-renderer Docker service. Notification fan-out flow + email dispatch worker. Tenant sync-engine fields (15 fields). Event/Patrol enum changes (priority Int→enum, state new_event→new, Patrol.state expansion). AlertRule restructure. AuditLog impersonation fields.

### Next Step
SSE-1 + SSE-2 Real-time pipeline SHIPPED to main 2026-05-17 via squash-merge commit 3710472 (pushed to origin). Three feat-branch commits (a426c95 SSE-1 + 0cf0b49 SSE-2 RED + f64d88b SSE-2 GREEN) collapsed into one atomic feature commit. Server foundation + client pipeline live. Phase 8 Batch 2 remaining backlog:

1. **SSE-3: Events stream + UI integration + War Room hook + security hardening + E2E** — Tier 2-3, ~28K estimate (slightly larger than originally specced because SSE-2 deliberately scoped down to the 4 stub modules from RED; UI integration moved here). Scope:
   - `apps/web/src/app/api/stream/events/route.ts` — second SSE endpoint, tenant-scoped (no user filter — all operators see all events). Uses eventChannel(tenantId) from SSE-1 + same subscribeToChannel pattern as the notifications route.
   - Publisher integration at event-creation seam (er-sync processor or event router create) — uses eventChannel(tenantId) from SSE-1.
   - `apps/web/src/hooks/useEventStream.ts` — events SSE channel hook with tRPC query invalidation pattern mirroring useNotificationStream.
   - Sidebar UI wiring: `apps/web/src/components/layout/sidebar.tsx` replaces 30s refetchInterval with SSE-driven invalidate (built-in polling fallback covers reliability).
   - `/notifications` page UI wiring: invoke useNotificationStream + optional audio chime for `type === "critical"`.
   - `/events` page UI wiring: invoke useEventStream + live toast on new event.
   - Security: `securityVersion` check on heartbeat to close stream on role/tenant change (security.md L255).
   - Playwright E2E: trigger alert via API → assert notification appears <2s without refresh.
   - 4 new test files: events route + events publisher integration + securityVersion invalidation + E2E happy-path.
   - Branch options: `feat/sse-events-and-hardening` (squash-merge SSE-1+SSE-2 first; smaller PRs) OR extend current `feat/sse-foundation` (single Phase 8 Batch 2 completion PR for all three sub-sessions).

2. Open spec deferral: filter type drift (PRODUCT.md L189 enum mismatch) — 1-line human edit, not agent-side.

Shipped since the last "Next Step" rewrite (2026-05-16):
- ✅ `feat/exports-foundation` (4caa449) — SS-0 Export Foundation primitives merged
- ✅ `feat/exports-events` (SS-1, commit 0171309 + final-ship 1c783cd) — Events Export Route Handler + UI buttons merged + pushed to origin
- ✅ `feat/exports-patrols` (SS-2, commit 52869ae + final-ship e735686) — Patrols Export Route Handler + UI buttons merged + pushed to origin
- ✅ `feat/exports-alert-rules` (SS-3, commit 1e03188 + final-ship 0070eeb) — Alert Rules Export Route Handler + UI buttons merged + pushed to origin
- ✅ `feat/exports-audit-views` (SS-4, commit ab5a782 + final-ship 0b0d421) — Notifications + Alert History Export Route Handlers + UI buttons merged + pushed to origin; Item 4 (PDF/CSV Exports) COMPLETE
- ✅ `feat/sse-foundation` SSE-1 + SSE-2 — squash-merged to main 2026-05-17 as commit 3710472, pushed to origin/main, local branch deleted. Combined three feat commits (a426c95 SSE-1 server foundation + 0cf0b49 SSE-2 RED stubs + f64d88b SSE-2 GREEN client pipeline). Files: realtime-publisher.ts, realtime-subscriber.ts, /api/stream/notifications/route.ts, alerts.processor.ts publish hook, event-source-client.ts, notification-store.ts, notification-poller.ts, useNotificationStream.ts + their test files. 20 new SSE-2 client tests + 13 SSE-1 server tests, all GREEN.

No known blockers. All services operational. Main currently at b0b36c8 (chore scan recording 2026-05-17 re-scan verifying Foundation Bundle 3 plugins active) on top of 3710472 (SSE-1+SSE-2 squash-merge), both pushed to origin/main. 144 tests passing across all packages (117 web — +20 SSE-2 client + 27 jobs unchanged).
