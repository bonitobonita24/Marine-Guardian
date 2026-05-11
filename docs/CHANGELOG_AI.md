# CHANGELOG — AI-Generated Changes
# Format: Rule 15 attribution format
# Agent values: CLINE | CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN
# ---

## 2026-05-11 — Phase 8 Batch 2: Interactive Map Feature (sub-sessions 1.1 + 1.2a + 1.2b + 1.2c)
- Agent:               CLAUDE_CODE (Opus 4.7 architect; Sonnet 4.6 executors for 1.1 + 1.2a)
- Why:                 Phase 8 Batch 2 backlog item — give operators a live geospatial view of the Banda Sea operating area. Sub-session decomposition applied per memory-governance.md §5 Thrashing Recovery after prior Sonnet thrash on map work. Output produced is functionally complete across all 4 sub-sessions: tRPC geo router (1.1) + mapcn MapLibre primitive install (1.2a) + InteractiveMap client wrapper (1.2b) + page route wiring (1.2c).
- Files added:         apps/web/src/server/trpc/routers/map.ts (4 geo procedures: getBounds, getSubjects, getPatrolAreas, getEvents — all tenant-scoped with L6 guardrails + cross-tenant isolation tests), apps/web/src/server/trpc/routers/__tests__/map.test.ts (10 unit tests covering tenant isolation, role-based access, geo filtering), apps/web/src/components/ui/map.tsx (1844-line mapcn MapLibre primitive — MIT, registry-managed via `npx shadcn@latest add @mapcn/map`), apps/web/src/components/map/InteractiveMap.tsx (25-line "use client" wrapper around mapcn Map + MapControls, centered on Banda Sea [127.5, -2.5] zoom 6, props surface = className?: string only).
- Files modified:      apps/web/src/server/trpc/index.ts (registered map router on appRouter), apps/web/src/app/(dashboard)/map/page.tsx (server component renders <InteractiveMap /> inside full-viewport rounded container), apps/web/src/components/ui/map.tsx (added file-level `/* eslint-disable */` + `// @ts-nocheck` headers — vendor file, see DECISIONS_LOG), docs/DECISIONS_LOG.md (2 new locked entries: mapcn vendor suppression rationale + user dialog strict-mode lint deferral).
- Files deleted:       none
- Schema/migrations:   none (read-only geo procedures over existing patrols/subjects/patrol_areas/events tables).
- Errors encountered:  (1) Sub-session 1.1: mapcn registry URL not found on first install attempt — resolved by adopting `@mapcn/map.json` direct URL pattern. (2) Sub-session 1.2a vendor file shipped with 64 ESLint errors + 4 TS18048 errors under strict config — registry-managed, would be clobbered on next `shadcn add` pull. (3) Sub-session 1.2c lint pre-flight surfaced 13 pre-existing ESLint errors in user management dialogs (`create-user-dialog.tsx`, `edit-role-dialog.tsx`, `reset-password-dialog.tsx`) — confirmed byte-identical to main via `git checkout main --` + `git diff HEAD`, so these are pre-existing tech debt unrelated to map work.
- Errors resolved:     (1) Resolved during 1.2a — install command locked in recovery-plan. (2) Applied file-level `/* eslint-disable */` + `// @ts-nocheck` headers to vendor map.tsx, mirroring obs 82 pattern from `map.test.ts` in 1.1. Locked in DECISIONS_LOG ("mapcn Vendor File Lint/TS Suppression"). (3) Deferred to dedicated `fix/user-dialogs-strict-mode` branch — locked rationale in DECISIONS_LOG ("User Management Dialogs — Strict-Mode Lint Deferral"). 1.2c merge proceeds with these lint errors on main (CI lint gate currently fails for this reason — pre-existing).
- Visual QA:           Deferred to user manual verification. Server-side route confirmed serving `/map` (HTTP 307 → /login with callbackUrl=/map — correct auth gate). Headless Playwright check blocked by missing Chrome binary in this environment + dashboard auth requirement.
- Side fixes surfaced: AUTH_TRUST_HOST=true added to .env.dev (Auth.js v5 was rejecting localhost:45204 as untrusted, masking login errors); INTERNAL_DATABASE_URL + INTERNAL_REDIS_URL added to .env.dev with docker-compose.app.yml overrides (app container was hitting `localhost:DB_PORT` which resolves to the container itself, not the host). The docker-compose change is stashed and will land on a separate `fix/dev-docker-internal-urls` branch to keep this merge scoped to the map feature.
- Two-stage review:    Stage 1 PASS (PRODUCT.md L191 map view implemented: tenant-scoped data API + CARTO tile rendering centered on operating area + zoom/pan controls). Stage 2 PASS for files in scope (InteractiveMap.tsx clean under strict; map.tsx vendor suppression is the locked decision; tests pass). Pre-existing dialog lint errors documented and deferred.
- Branch:              feat/interactive-map — 4 commits ahead of main: 78cd87a (geo router) → e2d28d1 (recovery plan) → 4582cf0 (mapcn install) → c2d4823 (InteractiveMap wrapper). Final 1.2c commit adds page route + vendor suppression + DECISIONS_LOG entries.

## 2026-05-11 — Phase 8 Batch 2: Wire Alert Enqueue from Event Sync (deferred integration closed)
- Agent:               CLAUDE_CODE (Opus 4.7)
- Why:                 Close the Phase 8 Batch 2 deferred integration so the alerts engine fires on real events. STATE.md NEXT had described the integration point as `event.create` tRPC mutation, but no such mutation exists — events are created via the `er-sync.processor.ts` `syncEvents` upsert from EarthRanger. Wired enqueue at the actual create site instead.
- Files added:         none
- Files modified:      packages/jobs/src/processors/er-sync.processor.ts (refactor `syncEvents`: split `upsert` into `findUnique` + `create`/`update` so create-vs-update is distinguishable; enqueueAlert called only on create path; wrapped in try/catch so a queue outage never fails the sync; removed two unnecessary type assertions on toJsonOrNull args), packages/jobs/src/__tests__/er-sync.processor.test.ts (replaced `event.upsert` mock with `findUnique`/`create`/`update`; mocked `../queues/alerts.queue`; replaced single "syncs events" test with 5 cases — create-path, update-path, enqueue-on-create-only, no-enqueue-on-update, sync-succeeds-on-enqueue-failure)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  ESLint flagged two `as Record<string, unknown> | null | undefined` casts on toJsonOrNull args as @typescript-eslint/no-unnecessary-type-assertion after the refactor extracted the `data` const out of the upsert input-type context.
- Errors resolved:     Removed the casts — `toJsonOrNull` parameter type already accepts the inferred shapes of `e.event_details` and `e.notes`.
- Tests:               16/16 pass (5 alerts.processor + 11 er-sync, including the 5 new cases). Lint 0, typecheck 0.
- Two-stage review:    Stage 1 PASS (closes deferred integration — engine now fires on real events). Stage 2 PASS (no any types, no unnecessary casts, scope confined to 2 files, enqueue failure isolated from sync).
- Note:                STATE.md NEXT was wrong about the integration point being `event.create` router mutation; flagged and corrected during this session. Real integration site is `er-sync.processor.ts syncEvents`.

## 2026-05-02 — Phase 3: Generate Spec Files
- Agent:               CLAUDE_CODE
- Why:                 Generate all Phase 3 deliverables — env files, inputs.yml, schema, credentials, sync script
- Files added:         inputs.yml, inputs.schema.json, .env.dev, .env.staging, .env.prod, .env.example, scripts/sync-credentials-to-env.sh
- Files modified:      CREDENTIALS.md (Phase 3 credential regeneration — all openssl values updated), docs/DECISIONS_LOG.md (3 new locked decisions: port strategy, docker publish, spec stress-test)
- Files deleted:       none
- Schema/migrations:   none (Phase 4 generates Prisma schema)
- Errors encountered:  none
- Errors resolved:     none

## 2026-05-02 — Phase 4 Part 1: Root Config Files
- Agent:               CLAUDE_CODE
- Why:                 Scaffold root monorepo config files — Part 1 of 8 Phase 4 scaffold
- Files added:         pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .editorconfig, pnpm-lock.yaml
- Files modified:      package.json (added turbo scripts + devDependencies), .prettierrc (regenerated), eslint.config.mjs (ESLint 9.x flat config — replaces legacy .eslintrc.js), .gitignore (final version with coverage/), .nvmrc (unchanged — confirmed Node 22)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  none
- Errors resolved:     none

## 2026-05-02 — Governance Sync: scan-project + 12 Project Skills Installed
- Agent:               CLAUDE_CODE
- Why:                 Ran /scan-project skill to analyze tech stack and install matched project skills. User approved all HIGH + MEDIUM confidence skills (12 total) plus ui-ux-pro-max by explicit request.
- Files added:         .claude/scan-results.json, .claude/skills/vercel-agent-skills/SKILL.md, .claude/skills/test-driven-development/SKILL.md, .claude/skills/frontend-design/SKILL.md, .claude/skills/awesome-design-md/SKILL.md, .claude/skills/postgres/SKILL.md, .claude/skills/defense-in-depth/SKILL.md, .claude/skills/webapp-testing/SKILL.md, .claude/skills/systematic-debugging/SKILL.md, .claude/skills/using-git-worktrees/SKILL.md, .claude/skills/planning-with-files/SKILL.md, .claude/skills/spartan-ai-toolkit/SKILL.md, .claude/skills/ui-ux-pro-max/ (309 files — full plugin with scripts, data CSVs, font files, templates)
- Files modified:      none
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  accesslint-contrast-checker not found in skills-library (already global — skipped project copy)
- Errors resolved:     ui-ux-pro-max not in skills-library — found in plugins cache at ~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max, copied successfully

## 2026-05-02 — Phase 4 Part 2: packages/shared + packages/api-client
- Agent:               CLAUDE_CODE
- Why:                 Generate shared TypeScript types, Zod validation schemas, and typed tRPC API client — Part 2 of 8 Phase 4 scaffold
- Files added:         packages/shared/ (18 type interfaces in src/types/, 18 Zod schemas in src/schemas/, barrel exports, package.json, tsconfig.json), packages/api-client/ (typed tRPC client factory with superjson transformer, package.json, tsconfig.json). 58 source files total.
- Files modified:      pnpm-lock.yaml (added zod, @trpc/client, @trpc/server, superjson dependencies), .cline/STATE.md (Phase 4 Part 2 complete)
- Files deleted:       none
- Schema/migrations:   none (Zod schemas generated — Prisma schema in Part 3)
- Errors encountered:  tRPC v11 httpBatchLink type incompatibility with exactOptionalPropertyTypes: true — TransformerOptions conditional type unresolvable with generic AnyRouter
- Errors resolved:     Cast httpBatchLink as (opts: unknown) => TRPCLink<TRouter> to bypass conditional type system — safe because actual router types resolve at call site

## 2026-05-03 — Phase 4 Part 3: packages/db — Full Prisma ORM
- Agent:               CLAUDE_CODE
- Why:                 Generate full ORM schema with all 18 entities, migrations, seed script, and multi-tenant security layers — Part 3 of 8 Phase 4 scaffold
- Files added:         packages/db/ (Prisma schema with 18 models + 13 enums, init migration up+down, seed script, src/client.ts, src/index.ts, src/helpers/audit.ts, src/helpers/rls.ts, src/middleware/tenant-guard.ts, src/middleware/encryption.ts, package.json, tsconfig.json)
- Files modified:      package.json (added pnpm.onlyBuiltDependencies for prisma/bcrypt/esbuild native builds), pnpm-lock.yaml (added prisma, @prisma/client, bcrypt, @types/bcrypt dependencies), .cline/STATE.md (Phase 4 Part 3 complete), docs/CHANGELOG_AI.md (this entry)
- Files deleted:       none
- Schema/migrations:   18 Prisma models (Tenant, User, EventType, Event, Subject, SubjectGroup, Patrol, PatrolSegment, Observation, PatrolArea, PatrolSchedule, AlertRule, Notification, SyncLog, AuditLog, AccompanyingRanger, KnownRanger, Session), 13 enums, init migration 00000000000000_init (up.sql + down.sql), active L2 RLS policies for all tenant-scoped tables
- Errors encountered:  (1) $use deprecated in Prisma v6 — client.ts used old middleware API, (2) encryption.ts used deprecated Prisma.Middleware type, (3) audit.ts changesJson type Record<string,unknown> incompatible with Prisma.InputJsonValue under exactOptionalPropertyTypes, (4) seed.ts missing syncedAt on EventType creates, (5) seed.ts PatrolArea upsert referenced non-existent compound unique tenantId_name, (6) seed.ts PatrolArea missing required patrolType field
- Errors resolved:     (1) Rewrote client.ts to use $extends chain: encryptionExtension then tenantGuardExtension, (2) Rewrote encryption.ts from Prisma.Middleware to Prisma.defineExtension with $allOperations, (3) Changed changesJson type to Prisma.InputJsonValue + spread pattern for optional field, (4) Added syncedAt: now to all 5 event type objects, (5) Replaced upsert with findFirst + conditional create pattern, (6) Added patrolType: "seabourn" to PatrolArea create

## 2026-05-03 — Phase 4 Part 5: apps/web Next.js Full Scaffold
- Agent:               CLAUDE_CODE
- Why:                 Scaffold complete Next.js 15 web application with App Router, Auth.js v5, tRPC, security hardening, i18n, and Docker image — Part 5 of 8 Phase 4 scaffold
- Files added:         apps/web/ (68 files — package.json, tsconfig.json, next.config.ts with security headers, src/env.ts typed env validation, src/app/ App Router layout + pages for all modules, src/app/api/trpc/[trpc]/route.ts, src/app/api/health/route.ts, src/server/trpc/ (context, trpc base, 18 entity routers, appRouter), src/server/auth/ (config.ts Credentials provider + types.ts module augmentation), src/server/lib/rate-limit.ts (4 tiers: public/auth/api/upload), src/server/lib/sanitize.ts (DOMPurify), src/middleware.ts (auth + tenant resolution), src/lib/i18n/request.ts + routing.ts, src/components/ (theme-provider, sidebar, header), src/types/tailwindcss-animate.d.ts, messages/en.json, Dockerfile multi-stage standalone, .dockerignore, tailwind.config.ts, postcss.config.js, components.json shadcn config)
- Files modified:      pnpm-lock.yaml (added next, react, next-auth, @trpc/server, @trpc/client, @trpc/react-query, @tanstack/react-query, zod, bcrypt, tailwindcss, postcss, autoprefixer, isomorphic-dompurify, lru-cache, next-intl, next-themes, lucide-react, class-variance-authority, clsx, tailwind-merge, tailwindcss-animate + all shadcn component deps), .cline/STATE.md (Phase 4 Part 5 complete), docs/CHANGELOG_AI.md (this entry)
- Files deleted:       none
- Schema/migrations:   none (Prisma schema from Part 3 — this Part consumes it via @marine-guardian/db)
- Errors encountered:  (1) TS2412 exactOptionalPropertyTypes on JWT interface — user.id type incompatible with optional property declaration, (2) TS2307 Cannot find module 'tailwindcss-animate' — no type declarations shipped, (3) AbstractIntlMessages type incompatibility with Record<string, unknown> in i18n request config
- Errors resolved:     (1) Changed JWT interface optional fields to `key?: Type | undefined` pattern to satisfy exactOptionalPropertyTypes, (2) Created ambient module declaration src/types/tailwindcss-animate.d.ts, (3) Changed type assertion to Record<string, Record<string, string>> matching AbstractIntlMessages structure

## 2026-05-03 — Phase 4 Part 7: tools/ + deploy/compose/ + push.sh + COMMANDS.md + .socraticodecontextartifacts.json
- Agent:               CLAUDE_CODE
- Why:                 Generate all Part 7 deliverables — validation tools, Docker Compose files for all environments, image promotion pipeline, command reference, and SocratiCode context artifacts — Part 7 of 8 Phase 4 scaffold
- Files added:         tools/validate-inputs.mjs, tools/check-env.mjs, tools/check-product-sync.mjs, tools/hydration-lint.mjs, deploy/compose/start.sh, deploy/compose/push.sh, deploy/compose/dev/docker-compose.db.yml, deploy/compose/dev/docker-compose.cache.yml, deploy/compose/dev/docker-compose.pgadmin.yml, deploy/compose/dev/pgadmin-servers.json, deploy/compose/dev/docker-compose.infra.yml, deploy/compose/dev/docker-compose.app.yml, deploy/compose/stage/docker-compose.db.yml, deploy/compose/stage/docker-compose.cache.yml, deploy/compose/stage/docker-compose.pgadmin.yml, deploy/compose/stage/pgadmin-servers.json, deploy/compose/stage/docker-compose.app.yml, deploy/compose/prod/docker-compose.db.yml, deploy/compose/prod/docker-compose.cache.yml, deploy/compose/prod/docker-compose.pgadmin.yml, deploy/compose/prod/pgadmin-servers.json, deploy/compose/prod/docker-compose.app.yml, COMMANDS.md, .socraticodecontextartifacts.json
- Files modified:      .cline/STATE.md (Phase 4 Part 7 complete), docs/CHANGELOG_AI.md (this entry)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) check-product-sync.mjs used exact section header strings that did not match PRODUCT.md's actual headings (e.g. "## App Name" vs "## App Identity"), (2) check-product-sync.mjs .env.dev gitignore check looked for literal ".env.dev" but .gitignore uses ".env.*" wildcard, (3) hydration-lint.mjs flagged new Date() in apps/web/src/app/api/health/route.ts as hydration risk (false positive — API Route Handlers are server-only)
- Errors resolved:     (1) Switched check-product-sync.mjs section checks to regex patterns matching multiple heading variants, added inline field match for "Primary users:", (2) Added wildcard pattern check — accepts ".env.*" as covering ".env.dev", (3) Added route.ts/route.tsx skip rule in hydration-lint.mjs walkDir function

## 2026-05-03 — Phase 4 Part 8: CI + governance docs + MANIFEST.txt
- Agent:               CLAUDE_CODE
- Why:                 Generate all Part 8 deliverables — GitHub Actions CI pipeline, Docker Hub publish workflow, complete file manifest, implementation map rewrite, STATE.md update — Part 8 of 8 Phase 4 scaffold (FINAL PART)
- Files added:         .github/workflows/ci.yml, .github/workflows/docker-publish.yml, MANIFEST.txt
- Files modified:      docs/IMPLEMENTATION_MAP.md (complete Phase 4 snapshot — all 8 Parts), .cline/STATE.md (Phase 4 complete — all 8 Parts done), docs/CHANGELOG_AI.md (this entry)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  Pre-tool-use security hook fired on both workflow files (GitHub Actions injection warning — confirmed safe: ci.yml uses only matrix.task and github.* context values, docker-publish.yml uses only secrets.* and steps.meta.outputs.* — no user-controlled input in run: commands)
- Errors resolved:     Confirmed both workflows safe after hook review. Proceeded with writes.
- Notes:               SocratiCode initial index (codebase_index → codebase_status → codebase_context_index) requires Docker + SocratiCode MCP running — must be triggered manually after Phase 5 passes by saying "Index this codebase" in Claude Code with Docker running.

## 2026-05-03 — Phase 4 Part 4: packages/ui + packages/jobs (storage skipped)
- Agent:               CLAUDE_CODE
- Why:                 Scaffold shared UI package (shadcn/ui foundation) and BullMQ job queue system — Part 4 of 8 Phase 4 scaffold
- Files added:         packages/ui/ (package.json, tsconfig.json, src/globals.css, src/lib/utils.ts, src/tailwind.config.ts), packages/jobs/ (package.json, tsconfig.json, src/connection.ts, src/index.ts, src/queues/types.ts, src/queues/queue-factory.ts, src/queues/er-sync.queue.ts, src/queues/alerts.queue.ts, src/queues/email.queue.ts, src/queues/maintenance.queue.ts, src/queues/index.ts, src/workers/base-worker.ts, src/workers/index.ts)
- Files modified:      pnpm-lock.yaml (added bullmq, ioredis, class-variance-authority, clsx, tailwind-merge, tailwindcss dependencies), .cline/STATE.md (Phase 4 Part 4 complete)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  packages/ui tailwind.config.ts used require("tailwindcss-animate") — CJS require() not available in ESM TypeScript module
- Errors resolved:     Replaced require("tailwindcss-animate") with empty plugins array — animate plugin will be added when apps consume the config via proper ESM import

## 2026-05-03 — Phase 5: Validation — all 9 commands pass
- Agent:               CLAUDE_CODE
- Why:                 Run all 9 Phase 5 validation commands and resolve all failures so the build gate is clean before Phase 6 Docker startup
- Files added:         apps/web/src/server/auth/auth.config.ts (edge-compatible NextAuth config for middleware — no bcrypt/prisma/node:crypto)
- Files modified:      apps/web/next.config.ts (removed orphaned webpack Configuration type annotation; added serverExternalPackages: ["bcrypt"]; added node: URI scheme webpack external handler), apps/web/src/app/login/page.tsx (extracted LoginForm component with useSearchParams, wrapped in <Suspense> in LoginPage to satisfy Next.js SSG prerender requirement), apps/web/src/middleware.ts (use edgeAuthConfig instead of full auth config), package.json (pnpm overrides: esbuild, tar, vite, postcss, next-intl — resolves 6 HIGH CVEs in tar@6.x via bcrypt→@mapbox/node-pre-gyp chain), pnpm-lock.yaml (updated lockfile after overrides applied), apps/web/tsconfig.json + apps/web/package.json + packages/* (typecheck fixes from prior sessions — tracked here for completeness), .cline/STATE.md (Phase 5 complete)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) TypeScript: "Cannot find module 'webpack'" — orphaned Configuration type annotation in next.config.ts webpack function parameter after prior session removed the import. (2) Runtime: bcrypt_lib.node native addon not found — ran npx @mapbox/node-pre-gyp install --fallback-to-build from bcrypt package dir to download prebuilt binary. (3) Next.js SSG: "useSearchParams() should be wrapped in a suspense boundary at page /login" — entire LoginPage was the useSearchParams consumer. (4) Audit: 6 HIGH CVEs in tar@6.2.1 via bcrypt>@mapbox/node-pre-gyp chain.
- Errors resolved:     (1) Removed ": Configuration" from webpack function parameter — TypeScript infers type from NextConfig.webpack signature. (2) Downloaded bcrypt native binary via node-pre-gyp. (3) Extracted LoginForm as separate module-level component with useSearchParams, made LoginPage a <Suspense> wrapper. (4) pnpm audit --fix added overrides; pnpm install applied them; re-audit confirms 0 vulnerabilities.

## 2026-05-04 — Schema Delta Fixes (feat/schema-delta-fixes)
- Agent:               CLAUDE_CODE
- Why:                 Fix 4 PRODUCT.md schema deltas discovered during pre-Phase 6 audit — PatrolType enum typo, missing Patrol.boatName, missing Tenant.currency, missing PatrolSchedule.tenantId
- Files added:         packages/db/prisma/migrations/20260504162834_schema_delta_fixes/migration.sql (manual SQL — ALTER TYPE rename enum value, ADD COLUMN ×3, ADD CONSTRAINT FK)
- Files modified:      packages/db/prisma/schema.prisma (PatrolType enum seabourn→seaborne, Patrol.boatName nullable String, Tenant.currency String(3) default IDR, PatrolSchedule.tenantId + relation), packages/shared/src/types/enums.ts (seabourn→seaborne), packages/shared/src/types/patrol.ts (boatName field), packages/shared/src/types/tenant.ts (currency field), packages/shared/src/types/patrol-schedule.ts (tenantId field), packages/shared/src/schemas/enums.ts (seabourn→seaborne), packages/shared/src/schemas/patrol.ts (boatName schema), packages/shared/src/schemas/tenant.ts (currency schema), apps/web/src/server/trpc/routers/patrol.ts (seaborne enum), apps/web/src/server/trpc/routers/patrolArea.ts (seaborne enum ×2), apps/web/src/server/trpc/routers/patrolSchedule.ts (direct tenantId scoping — replaced indirect patrolArea.tenantId join), eslint.config.mjs (added next-env.d.ts to ignores), apps/web/next.config.ts (scoped eslint-disable for webpack externals), docs/IMPLEMENTATION_MAP.md (updated status + schema delta section)
- Files deleted:       none
- Schema/migrations:   20260504162834_schema_delta_fixes — rename PatrolType.seabourn→seaborne, add Patrol.boat_name, add Tenant.currency, add PatrolSchedule.tenant_id + FK
- Errors encountered:  (1) next-env.d.ts lint error from strictTypeChecked, (2) webpack externals `any`-related lint errors in next.config.ts, (3) 4 typecheck errors in tRPC routers from stale enum values and missing tenantId
- Errors resolved:     (1) Added next-env.d.ts to eslint ignores, (2) Scoped eslint-disable block around webpack externals + single-line disable for return, (3) Updated all Zod enums to seaborne and added tenantId to patrolSchedule create mutation

## 2026-05-05 — Schema Delta Fixes Squash-Merge + Session Pause
- Agent:               CLAUDE_CODE
- Why:                 Complete squash-merge of feat/schema-delta-fixes to main (9b33fc1), write handoff for Phase 6 resume
- Files added:         .cline/handoffs/2026-05-05-schema-merge-complete-pause.md
- Files modified:      .cline/STATE.md (PAUSED status, branch field updated), docs/CHANGELOG_AI.md (this entry)
- Files deleted:       none (feat/schema-delta-fixes branch deleted after squash-merge)
- Schema/migrations:   none (migration already committed in prior session)
- Errors encountered:  none
- Errors resolved:     none

## 2026-05-05 — Phase 6 — Docker Services Startup + Visual QA
- Agent:               CLAUDE_CODE
- Why:                 Start all Docker dev services, run migrations + seed, perform Visual QA, complete Phase 6 Output Contract
- Files added:         none
- Files modified:      deploy/compose/dev/docker-compose.app.yml (healthcheck localhost→127.0.0.1 for Alpine IPv6), deploy/compose/dev/docker-compose.db.yml (PgBouncer: removed env_file, added individual env vars to avoid password-with-slash URL parsing), apps/web/Dockerfile (added Prisma engine binary copy step for Alpine standalone), .env.dev (URL-encoded special chars in DATABASE_URL and PGBOUNCER_DATABASE_URL passwords), .cline/STATE.md (Phase 6 complete)
- Files deleted:       none
- Schema/migrations:   Ran existing migrations (init + schema_delta_fixes) via pnpm db:migrate. Seed data populated (tenant, webmaster admin, event types, patrol area).
- Errors encountered:  (1) PgBouncer crash — env_file injected DATABASE_URL with `/` in password breaking URL parsing, (2) Prisma engine binary missing in Alpine standalone — query_engine .so.node not copied to runner stage, (3) App healthcheck failing — Alpine resolves `localhost` to IPv6 `::1` but Next.js binds IPv4 only, (4) Prisma CLI migrate fails — DATABASE_URL password `/` parsed as path separator, (5) Worker container restarts — worker.js not in Next.js standalone output (non-blocking)
- Errors resolved:     (1) Removed env_file from PgBouncer, added explicit DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME env vars, (2) Added find+cp step in Dockerfile builder stage to collect libquery_engine-linux-musl-openssl-3.0.x.so.node into /prisma-engines/, copied to runner .prisma/client/ and .next/server/, (3) Changed healthcheck URL to http://127.0.0.1:3000/api/health, (4) URL-encoded passwords in .env.dev: `/`→`%2F`, `+`→`%2B`, (5) Worker issue deferred to Phase 7 — non-blocking

## 2026-05-07 — Phase 7 Feature Update: EarthRanger Sync Processor Implementation
- Agent:               CLAUDE_CODE
- Why:                 Implement the er-sync processor body — 5 sync functions (event_types, subjects, events, patrols, observations) with SyncLog lifecycle, tenant validation, credential decryption, and Prisma JSON nullable handling
- Files added:         packages/jobs/src/processors/er-sync.processor.ts, packages/jobs/src/__tests__/er-sync.processor.test.ts
- Files modified:      .cline/STATE.md, docs/CHANGELOG_AI.md (this entry), docs/IMPLEMENTATION_MAP.md, .cline/memory/agent-log.md
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) Prisma JSON nullable — plain null not assignable to InputJsonValue | NullableJsonNullValueInput, (2) ESLint strict-boolean-expressions — nullable strings in conditionals need explicit != null, (3) ESLint no-unsafe-assignment — expect.objectContaining returns any, (4) ESLint no-unnecessary-type-assertion — as never casts on vi.fn().mockResolvedValue() unnecessary
- Errors resolved:     (1) Created toJsonOrNull() helper using Prisma.JsonNull + explicit type casts at call sites, (2) Changed all ternaries to use != null pattern, (3) Added <Record<string, unknown>> generic to expect.objectContaining, (4) Removed as never casts from mock setup

## 2026-05-06 — Worker Fix — Docker Internal Networking for BullMQ Workers
- Agent:               CLAUDE_CODE
- Why:                 Fix worker container crash loop — ECONNREFUSED to localhost:45196 inside Docker. Workers must connect to Valkey via Docker internal hostname, not host-mapped port.
- Files added:         none
- Files modified:      packages/jobs/src/connection.ts (rewrote from REDIS_URL parsing to individual REDIS_HOST/REDIS_PORT/REDIS_PASSWORD env vars), deploy/compose/dev/docker-compose.app.yml (added REDIS_HOST=${COMPOSE_PROJECT_NAME}_valkey + REDIS_PORT=6379 overrides to worker service), deploy/compose/stage/docker-compose.app.yml (same worker REDIS_HOST/REDIS_PORT overrides), deploy/compose/prod/docker-compose.app.yml (same worker REDIS_HOST/REDIS_PORT overrides), .cline/STATE.md (removed worker blocker, updated LAST_DONE)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) Worker ECONNREFUSED localhost:45196 — .env.dev sets REDIS_HOST=localhost and REDIS_PORT=45196 (host-mapped port), but inside Docker container, Valkey is at marine-guardian_dev_valkey:6379 on the internal network. (2) Attempted REDIS_URL override with ${REDIS_PASSWORD} in compose environment: block — Docker Compose interpolates from shell env (not env_file), causing "variable not set" warning and blank password.
- Errors resolved:     (1) Rewrote connection.ts to read REDIS_HOST/REDIS_PORT/REDIS_PASSWORD individually. Added REDIS_HOST and REDIS_PORT overrides in compose environment: block for worker service across all 3 envs. REDIS_PASSWORD flows correctly from env_file (no shell interpolation needed). (2) Dropped REDIS_URL approach entirely — individual vars avoid the Compose shell interpolation problem.

## 2026-05-08 — Phase 8 Batch 1 Item 1: Dashboard (Standard) — Command Center
- Agent:               CLAUDE_CODE
- Why:                 Implement dashboard as first Phase 8 iterative buildout item — KPI cards, event breakdown charts, recent events feed, quick stats
- Files added:         apps/web/src/server/trpc/routers/dashboard.ts (3 tenant-scoped procedures: kpis, eventBreakdown, recentEvents), apps/web/src/components/ui/chart.tsx (shadcn/ui chart component — Recharts wrapper), apps/web/components.json (shadcn/ui config)
- Files modified:      apps/web/src/app/(dashboard)/dashboard/page.tsx (full rewrite — KPI cards, bar charts, event feed, quick stats), apps/web/src/server/trpc/routers/index.ts (added dashboardRouter), apps/web/src/components/ui/card.tsx (updated shadcn card component), apps/web/package.json (added recharts dependency), pnpm-lock.yaml
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) exactOptionalPropertyTypes — passing undefined to optional number prop. (2) Date | null not assignable to new Date(). (3) strict-boolean-expressions — truthy checks on nullable strings and numbers.
- Errors resolved:     (1) Conditional rendering pattern — only pass delta/deltaLabel props when data exists. (2) Ternary null check on reportedAt. (3) Changed nullable length checks to explicit `!== undefined && .length > 0` pattern, changed nullable string checks to `!== null`.

## 2026-05-08 — Phase 8 Batch 1 Item 2: Event Kanban Board — UI Scaffold (PAUSED)
- Agent:               CLAUDE_CODE
- Why:                 Implement Event Kanban Board — drag-and-drop state transitions (New → Active → Resolved) using Kibo UI kanban component + dnd-kit
- Files added:         apps/web/src/components/kibo-ui/kanban/index.tsx (Kibo UI Kanban component), apps/web/src/components/ui/scroll-area.tsx (shadcn/ui scroll-area — kanban dependency), .cline/handoffs/2026-05-08-event-kanban-pause.md (pause handoff)
- Files modified:      apps/web/src/app/(dashboard)/events/page.tsx (full rewrite — Kanban board with 3 columns, drag-and-drop, priority badges, event cards), apps/web/package.json (added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @radix-ui/react-scroll-area), pnpm-lock.yaml, .cline/STATE.md (PAUSED)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  none (UI scaffold only — no typecheck/lint run yet)
- Errors resolved:     none
- Status:              PAUSED — tRPC event.updateState + event.stats procedures NOT verified. Typecheck/lint/tests NOT run. Two-stage review NOT performed.

## 2026-05-08 — Phase 8 Batch 1 Item 2: Event Kanban Board — COMPLETE
- Agent:               CLAUDE_CODE
- Why:                 Resume paused Event Kanban Board — add event.updateState + event.stats tRPC procedures, fix all TypeScript errors, write unit tests (TDD), resolve vitest/Vite 8 compatibility, run two-stage review
- Files added:         apps/web/src/server/trpc/routers/__tests__/event.test.ts (4 unit tests: happy path, tenant scoping, FORBIDDEN on missing tenantId, schema validation)
- Files modified:      apps/web/src/server/trpc/routers/event.ts (added updateState mutation: tenant-scoped updateMany, FORBIDDEN guard; added stats query), apps/web/src/app/(dashboard)/events/page.tsx (wired updateState + stats queries, optimistic UI with rollback on error), apps/web/src/components/kibo-ui/kanban/index.tsx (TypeScript fixes — ComponentRef, DragEndEvent export, strict null checks), apps/web/src/components/ui/scroll-area.tsx (React.ElementRef→React.ComponentRef for React 19 compat), apps/web/vitest.config.ts (vmForks pool, resolve.alias for @ path), apps/web/package.json (vitest ^2.1.8→^4.1.5 — Vite 8 compat fix), pnpm-lock.yaml
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  (1) __vite_ssr_exportName__ is not defined — vitest 2.x incompatible with Vite 8.0.10 imposed by root pnpm override. 6 config-level attempts failed. (2) TypeScript strict errors in kanban component (ComponentRef, DragEndEvent, optional chaining). (3) React 19 ElementRef deprecation in scroll-area.
- Errors resolved:     (1) Upgraded vitest ^2.1.8→^4.1.5 — vitest 4.x pairs with Vite 8.x. All 4 tests pass in 307ms. (2)/(3) Fixed TypeScript and React 19 compat issues at source. Two-stage review: Stage 1 PASS (all spec behaviours implemented — columns, drag-and-drop, optimistic UI, tenant scoping, priority badges, stats), Stage 2 PASS (no any types, tests written RED before GREEN, blast-radius scope only).

## 2026-05-08 — Phase 7 Feature Update: Alert Rules CRUD UI + Notification Center
- Agent:               CLAUDE_CODE
- Why:                 Implement PRODUCT.md L177-190 Alert System + Notification Center modules — full Alert Rules CRUD on /alerts (admin-only writes via existing alertRule tRPC router), full Notification Center on /notifications (chronological list, type filter, unread state, mark-read, click-through to event), sidebar unread badge polling notification.unreadCount. Routers (alertRule.ts, notification.ts) already on main from Phase 4 — this branch adds UI + tests.
- Files added:         apps/web/src/components/ui/dialog.tsx, apps/web/src/components/ui/dropdown-menu.tsx, apps/web/src/components/ui/select.tsx, apps/web/src/components/ui/separator.tsx, apps/web/src/components/ui/switch.tsx, apps/web/src/components/ui/tabs.tsx (6 shadcn primitives — vendored with React 19 ComponentRef from the outset), apps/web/src/server/trpc/routers/__tests__/alertRule.test.ts (6 unit tests: list+tenant scoping, list+isActive filter, create+RBAC, create rejects non-admin, update tenant-scoped, delete rejects non-admin), apps/web/src/server/trpc/routers/__tests__/notification.test.ts (5 unit tests: list+tenant+user scoping, list+notificationType filter, markRead, markAllRead, unreadCount+FORBIDDEN guard)
- Files modified:      apps/web/src/app/(dashboard)/alerts/page.tsx (full CRUD UI — list, create/edit dialog, severity Select, channel multi-select via checkbox, isActive Switch, delete with inline confirm; lint cleanup against actual schema — creator/isActive non-nullable per Prisma), apps/web/src/app/(dashboard)/notifications/page.tsx (full Notification Center — was 8-line stub), apps/web/src/components/layout/sidebar.tsx (added trpc.notification.unreadCount.useQuery with 30s refetch + 15s staleTime; pill badge on /notifications nav item, "99+" cap, aria-label), apps/web/src/server/trpc/routers/__tests__/event.test.ts (added typed `partial<T>` helper to satisfy no-unsafe-assignment on nested vitest matchers — same pattern applied in alertRule + notification tests), apps/web/package.json (added @radix-ui/react-{dialog,dropdown-menu,select,separator,switch,tabs} as runtime deps for the new shadcn primitives), pnpm-lock.yaml
- Files deleted:       none
- Schema/migrations:   none (alertRule + notification routers + Prisma models pre-existed on main from Phase 4)
- Errors encountered:  (1) ESLint: 53 errors after first lint pass — 28× React.ElementRef deprecated in vendored shadcn primitives (React 19), 3× strict-boolean-expressions on dropdown-menu `inset` optional prop, 14× alerts/page.tsx unnecessary conditionals/optional chains (pre-existing tech debt against Prisma's non-nullable types), 7× no-unsafe-assignment on nested expect.objectContaining matchers in 3 test files, 1× restrict-template-expressions on number→string in sidebar badge. (2) TypeScript: dropdown-menu CheckboxItem `checked: CheckedState | undefined` violated exactOptionalPropertyTypes:true; partial<T extends object>(obj: Partial<T>) didn't satisfy vitest's DeeplyAllowMatchers<T>.
- Errors resolved:     (1a) sed bulk-replace React.ElementRef→React.ComponentRef across 6 shadcn primitives. (1b) `inset && "pl-8"` → `inset === true && "pl-8"` in 3 places in dropdown-menu. (1c) Removed redundant `?.` and `?? false` in alerts/page.tsx where Prisma schema declares fields as non-null (User.fullName, AlertRule.creator, AlertRule.isActive). (1d) Defined `function partial<T>(obj: T): T { return expect.objectContaining(obj as any) as T; }` per test file (one narrow `as any` with eslint-disable + reason comment — vitest's DeeplyAllowMatchers<T> can't be expressed without importing internal vitest types). (1e) `String(unread)` for sidebar pill text. (2) Conditionally spread `checked` in dropdown-menu CheckboxItem: `{...(checked !== undefined ? { checked } : {})}`. Final: pnpm lint EXIT 0, pnpm typecheck EXIT 0, pnpm vitest run EXIT 0 — 17/17 passing in 429ms (alertRule 6, notification 5, event 6). Two-stage review: Stage 1 PASS, Stage 2 PASS.
- Spec deferrals:      (1) PRODUCT.md L182 "Alert history log" — not implemented this branch; needs separate scope (filter notifications by alertRuleId, or dedicated page). (2) PRODUCT.md L189 filter type names ("event alert, system alert, escalation, warning") differ from schema enum (critical | warning | info | system); implementation uses schema enum as locked technical contract — recommend updating PRODUCT.md to align. (3) PRODUCT.md L187 click-through to "related event or patrol" — events implemented; patrol click-through requires Notification.patrolId FK migration (current schema only has eventId).

## 2026-05-11 — Phase 8 Batch 2: Alert Rule Evaluation Engine (processor body)
- Agent:               CLAUDE_CODE (Architect-Execute: Opus planned + dispatched 2× Sonnet, both thrashed; Opus took over per memory-governance.md §4 BLOCKED clause)
- Why:                 Alert Rules CRUD UI shipped 2026-05-08 but rules did not fire — alerts BullMQ queue was wired to a stub processAlert. This task implements the processor body so events trigger notifications end-to-end.
- Files added:         packages/jobs/src/__tests__/alerts.processor.test.ts (5 vitest cases: missing tenantId rejection via validateTenantContext, no-active-rules zero-result, match+recipient creates Notification with correct fields + AuditLog, match+no-recipient yields zero notifications without opening transaction, transaction-failure throws atomically with no partial commit)
- Files modified:      packages/jobs/src/processors/alerts.processor.ts (replaced 662-byte stub with 143-line implementation: tenant-scoped event load → active rule load → ruleMatches() against conditionJson.eventTypeId + minPriority → recipient resolution via super_admin/site_admin role fallback → atomic Prisma $transaction creating Notification + AuditLog ALERT_FIRED per rule×recipient → returns {rulesEvaluated, rulesMatched, notificationsCreated}; preserved processAlert deprecated re-export for start-workers.ts compat)
- Files deleted:       none
- Schema/migrations:   none (AlertRule + Notification + AuditLog models pre-existed on main from Phase 4)
- Errors encountered:  (1) Two consecutive Sonnet subagent dispatches thrashed at "Autocompact is thrashing — context refilled to limit within 3 turns of the previous compact, 3 times in a row" — Sonnet 1 (525s, 12 tool uses) wrote test file then thrashed before processor; Sonnet 2 (378s, 15 tool uses) wrote 143-line processor then thrashed before tests/lint/commit. Auto-loaded baseline (CLAUDE.md + 5 rules files + Vercel plugin hooks + MCP server reminders + skills lists) appears to consume more than the 60K SAFE zone budgeted, leaving insufficient workspace for tool-use turns. (2) TypeScript TS2322: '"admin"' not assignable to UserRole — original Opus task spec inlined "admin" as a default-fallback recipient role, but UserRole enum is super_admin | site_admin | field_coordinator | operator (no plain "admin"). (3) ESLint: 5× no-unsafe-assignment on test file's vitest matcher chain (expect.objectContaining + expect.any + expect.stringMatching all return any per @vitest/expect typing).
- Errors resolved:     (1) Opus took over remaining work directly per memory-governance.md §4 — verified Sonnet 2's processor passed all 5 tests, made the 2 small fixes below, ran lint+typecheck clean, committed and squash-merged. Reasonable cost trade vs a 3rd dispatch attempt with low success probability. (2) Changed processor recipient query to role: { in: ["site_admin", "super_admin"] } and updated mockAdminUser.role to "site_admin" in test for consistency. (3) Wrapped vitest matcher assertion block in scoped /* eslint-disable @typescript-eslint/no-unsafe-assignment */ ... /* eslint-enable */ comment pair (alternative was duplicating the partial<T> helper pattern from the alert/notification test files; chose disable-block as more localized and idiomatic for matcher-heavy assertions). Final: 5/5 alerts.processor tests pass in 132ms, pnpm lint exit 0, pnpm typecheck exit 0, two-stage review PASS, squash-merged commit 0e62d62.
- Worker registration: alertsWorker was already wired in packages/jobs/src/start-workers.ts:12 from Phase 4 scaffold (createWorker(QUEUE_NAMES.ALERTS, processAlert, { concurrency: 3 })). Sonnet 2 preserved the processAlert named export at the bottom of alerts.processor.ts as a deprecated re-export of evaluateAlerts so start-workers.ts compiles unchanged. No edit to workers/index.ts or start-workers.ts needed.
- Deferred:            event.create enqueue integration — separate follow-up task. Without enqueue, alerts evaluation engine is fully built and tested but does not yet fire on real event creation. Next task scope: (a) inject alertsQueue into event.ts tRPC router, (b) after successful event.create, enqueue { tenantId: ctx.tenantId, eventId: created.id } with try/catch around the enqueue (mutation must still succeed if queue enqueue fails), (c) add a single integration test asserting the enqueue is called.
