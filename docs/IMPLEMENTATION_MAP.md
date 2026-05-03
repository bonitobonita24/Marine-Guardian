# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# ---

## Status: Phase 4 Part 7 complete — PAUSED (Part 8 next: CI + governance + MANIFEST)

### Root Config
- [x] pnpm-workspace.yaml
- [x] turbo.json
- [x] tsconfig.base.json
- [x] .editorconfig, .prettierrc, eslint.config.mjs (ESLint 9.x flat config)
- [x] .gitignore (final)
- [x] .nvmrc (Node 22)
- [x] package.json (turbo scripts + devDependencies)
- [x] pnpm-lock.yaml (111 packages)

### Spec Files (Phase 3)
- [x] inputs.yml (version 3 — 18 entities, 19 modules, 4 roles)
- [x] inputs.schema.json
- [x] .env.dev (gitignored — generated credentials)
- [x] .env.staging (gitignored — generated credentials)
- [x] .env.prod (gitignored — generated credentials)
- [x] .env.example (committed — placeholder template)
- [x] scripts/sync-credentials-to-env.sh
- [x] CREDENTIALS.md (gitignored — master credential file)

### Packages
- [x] packages/shared (18 TypeScript interfaces + 18 Zod schemas with create/update variants)
- [x] packages/api-client (typed tRPC client factory with superjson transformer)
- [x] packages/db (18 Prisma models, 13 enums, init migration up+down, seed script, L2 RLS active, L5 AuditLog, L6 tenant-guard, AES-256-GCM encryption extension)
- [x] packages/ui (shadcn/ui foundation — globals.css, cn() utility, tailwind config with CSS variable theming)
- [x] packages/jobs (BullMQ + ioredis — 4 queues: er-sync, alerts, email, maintenance; worker factory with tenant validation; queue singleton factory)

### Apps
- [x] apps/web (Next.js 15 — Command Center: App Router, Auth.js v5, tRPC 18 routers, rate limiter, sanitizer, i18n, Dockerfile, shadcn/ui, security headers, health endpoint)
- [ ] apps/mobile — SKIPPED (no mobile declared in inputs.yml)

### Tools
- [x] tools/validate-inputs.mjs (validates inputs.yml against inputs.schema.json)
- [x] tools/check-env.mjs (verifies all required env vars present in .env.dev)
- [x] tools/check-product-sync.mjs (PRODUCT.md ↔ inputs.yml sync + private tag leakage check)
- [x] tools/hydration-lint.mjs (SSR hydration mismatch pattern scan — route.ts/tsx excluded)

### Deploy
- [x] deploy/compose/start.sh (convenience startup: dev|stage|prod, --build on dev app)
- [x] deploy/compose/push.sh (manual promotion: dev→hub, dev→staging, staging→prod)
- [x] deploy/compose/dev/docker-compose.db.yml (PostgreSQL 16 + PgBouncer — creates shared network)
- [x] deploy/compose/dev/docker-compose.cache.yml (Valkey 7)
- [x] deploy/compose/dev/docker-compose.pgadmin.yml (pgAdmin 4)
- [x] deploy/compose/dev/docker-compose.infra.yml (MailHog — dev only)
- [x] deploy/compose/dev/docker-compose.app.yml (Next.js app + BullMQ worker — build: from source)
- [x] deploy/compose/dev/pgadmin-servers.json (pre-configured server: marine-guardian_dev_postgres)
- [x] deploy/compose/stage/docker-compose.db.yml
- [x] deploy/compose/stage/docker-compose.cache.yml
- [x] deploy/compose/stage/docker-compose.pgadmin.yml
- [x] deploy/compose/stage/docker-compose.app.yml (image pull only — NO build: key; Traefik labels)
- [x] deploy/compose/stage/pgadmin-servers.json
- [x] deploy/compose/prod/docker-compose.db.yml
- [x] deploy/compose/prod/docker-compose.cache.yml
- [x] deploy/compose/prod/docker-compose.pgadmin.yml
- [x] deploy/compose/prod/docker-compose.app.yml (image pull only — NO build: key; Traefik labels)
- [x] deploy/compose/prod/pgadmin-servers.json
- [ ] deploy/compose/*/docker-compose.storage.yml — NOT GENERATED (storage.enabled: false)
- [ ] .github/workflows/ci.yml — Part 8
- [ ] .github/workflows/docker-publish.yml — Part 8

### Governance
- [x] CLAUDE.md (V31 compact)
- [x] .claude/rules/ (6 files)
- [x] docs/PRODUCT.md (complete)
- [x] docs/DESIGN.md (Meta Dark Mode)
- [x] .gitignore (final)
- [x] .vscode/mcp.json
- [x] docs/DECISIONS_LOG.md (13 locked decisions)
- [x] docs/CHANGELOG_AI.md (Phase 3 + Parts 1–5 + Part 7 entries)
- [x] project.memory.md
- [x] .cline/STATE.md
- [x] .cline/memory/lessons.md
- [x] .cline/memory/agent-log.md
- [x] COMMANDS.md (master command reference — Docker, DB, testing, governance, git, utilities)
- [x] .claude/scan-results.json (scan-project output — tech stack + 12 installed skills)
- [x] .claude/skills/ (12 project skills)
- [x] .socraticodecontextartifacts.json (gitignored — local SocratiCode context: schema.prisma + 3 governance docs)
- [ ] MANIFEST.txt — Part 8

### Notes
- packages/storage NOT generated (v1 decision — no file uploads, ER hosts files)
- Turnstile disabled (internal tool, no public forms)
- File storage toggle: disabled for v1
- Part 6 (mobile) skipped — no mobile declared in inputs.yml
- Docker Hub image: bonitobonita24/marine-guardian
- App ports: APP=45204 DB=45194 PGBOUNCER=45195 CACHE=45196 PGADMIN=45201 MAILHOG=45199/45200
