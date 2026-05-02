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
