# CHANGELOG — AI-Generated Changes
# Format: Rule 15 attribution format
# Agent values: CLINE | CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN
# ---

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

## 2026-05-03 — Phase 4 Part 4: packages/ui + packages/jobs (storage skipped)
- Agent:               CLAUDE_CODE
- Why:                 Scaffold shared UI package (shadcn/ui foundation) and BullMQ job queue system — Part 4 of 8 Phase 4 scaffold
- Files added:         packages/ui/ (package.json, tsconfig.json, src/globals.css, src/lib/utils.ts, src/tailwind.config.ts), packages/jobs/ (package.json, tsconfig.json, src/connection.ts, src/index.ts, src/queues/types.ts, src/queues/queue-factory.ts, src/queues/er-sync.queue.ts, src/queues/alerts.queue.ts, src/queues/email.queue.ts, src/queues/maintenance.queue.ts, src/queues/index.ts, src/workers/base-worker.ts, src/workers/index.ts)
- Files modified:      pnpm-lock.yaml (added bullmq, ioredis, class-variance-authority, clsx, tailwind-merge, tailwindcss dependencies), .cline/STATE.md (Phase 4 Part 4 complete)
- Files deleted:       none
- Schema/migrations:   none
- Errors encountered:  packages/ui tailwind.config.ts used require("tailwindcss-animate") — CJS require() not available in ESM TypeScript module
- Errors resolved:     Replaced require("tailwindcss-animate") with empty plugins array — animate plugin will be added when apps consume the config via proper ESM import
