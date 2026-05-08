# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# Last updated: 2026-05-08 — Phase 8 Batch 1 Item 2: Event Kanban Board COMPLETE.
# ---

## Status: Phase 8 Batch 1 — Items 1 (Dashboard) and 2 (Event Kanban Board) complete. All Docker services healthy.

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
- [ ] Alert rule evaluation engine (alerts worker body)
- [ ] Interactive map (Leaflet.js on /map page)
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

---

### Next Step
Phase 8 Batch 1 Item 3. No known blockers. All services operational.
