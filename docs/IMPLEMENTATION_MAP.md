# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# ---

## Status: Phase 4 Part 4 complete — PAUSED (packages/ui + packages/jobs done)

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
- [ ] apps/web (Next.js — Command Center)

### Deploy
- [ ] deploy/compose/dev/
- [ ] deploy/compose/stage/
- [ ] deploy/compose/prod/
- [ ] .github/workflows/ci.yml
- [ ] .github/workflows/docker-publish.yml

### Governance
- [x] CLAUDE.md (V31 compact)
- [x] .claude/rules/ (6 files)
- [x] docs/PRODUCT.md (complete)
- [x] docs/DESIGN.md (Meta Dark Mode)
- [x] .gitignore (final)
- [x] .vscode/mcp.json
- [x] docs/DECISIONS_LOG.md (13 locked decisions)
- [x] docs/CHANGELOG_AI.md (Phase 3 + Part 1 + Part 2 + Part 3 + Part 4 entries)
- [x] project.memory.md
- [x] .cline/STATE.md
- [x] .cline/memory/lessons.md
- [x] .cline/memory/agent-log.md
- [x] .claude/scan-results.json (scan-project output — tech stack + 12 installed skills)
- [x] .claude/skills/ (12 project skills: vercel-agent-skills, test-driven-development, frontend-design, awesome-design-md, postgres, defense-in-depth, webapp-testing, systematic-debugging, using-git-worktrees, planning-with-files, spartan-ai-toolkit, ui-ux-pro-max)

### Notes
- packages/storage NOT generated (v1 decision — no file uploads, ER hosts files)
- Turnstile disabled (internal tool, no public forms)
- File storage toggle: disabled for v1
