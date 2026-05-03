# Lessons Memory — Spec-Driven Platform V31
# Entry format: ## YYYY-MM-DD — [ICON] [Title]
# Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change
# READ ORDER: 🔴 first → 🟤 second → rest by relevance
# ---

## BOOTSTRAP — 🔴 WSL2 + Docker Desktop known pitfalls
- Type:      🔴 gotcha
- Phase:     Phase 0 Bootstrap / Phase 1 dev environment open
- Files:     .env.dev, docker-compose.*.yml, .nvmrc
- Concepts:  wsl2, docker-desktop, pnpm, nvm, permissions
- Narrative: Real failures on WSL2 + Docker Desktop. All fixes baked into Bootstrap template.
  (1) Never use corepack enable — use npm install -g pnpm. corepack symlinks fail in some WSL2 setups.
  (2) pnpm install must run from WSL2 terminal — not Windows PowerShell or CMD.
  (3) Docker Desktop must be running before any docker compose command. Check with: docker ps.
  (4) Port conflicts: dev services use non-standard random ports (Rule 22). If conflict occurs,
      regenerate ports in inputs.yml → run Phase 7 → restart services.
  (5) nvm must be sourced in .bashrc — add: [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  (6) WSL2 file permissions: always develop inside WSL2 filesystem (/home/user/) not /mnt/c/.
      Working in /mnt/c/ causes severe pnpm and docker performance issues.
# ---

## 2026-05-03 — 🔴 Prisma v6 deprecated $use/$middleware — use $extends + defineExtension
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 3
- Files:     packages/db/src/client.ts, packages/db/src/middleware/encryption.ts, packages/db/src/middleware/tenant-guard.ts
- Concepts:  prisma, middleware, extension, $use, $extends, defineExtension
- Narrative: Prisma v6 removed $use() and the Prisma.Middleware type. All middleware must be rewritten
  as Prisma extensions using Prisma.defineExtension with $allOperations. Chain extensions via
  basePrisma.$extends(ext1).$extends(ext2). The encryption extension must be applied first in the
  chain so encrypted fields are handled before tenant scoping.

## 2026-05-03 — 🔴 npx prisma pulls v7 globally — use workspace-local prisma
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 3
- Files:     packages/db/package.json
- Concepts:  prisma, npx, pnpm, version conflict
- Narrative: Running `npx prisma generate` pulls Prisma v7 from the global registry even when
  the workspace has v6 in package.json. Prisma v7 has breaking changes (different schema syntax,
  renamed types). Always use `pnpm --filter @marine-guardian/db exec prisma generate` to run
  the workspace-local version.

## 2026-05-03 — 🟡 exactOptionalPropertyTypes + Prisma JSON fields
- Type:      🟡 fix
- Phase:     Phase 4 Part 3
- Files:     packages/db/src/helpers/audit.ts
- Concepts:  typescript, exactOptionalPropertyTypes, prisma, InputJsonValue, JSON
- Narrative: With exactOptionalPropertyTypes: true, you cannot assign `undefined` to an optional
  property. For optional Prisma JSON fields, use a spread pattern instead:
  `...(value != null ? { field: value } : {})`. Also, Prisma JSON fields require
  `Prisma.InputJsonValue` — not `Record<string, unknown>` (which contains `unknown` values
  that Prisma's JSON type system rejects).

## 2026-05-03 — 🔴 CJS require() fails in ESM TypeScript modules
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 4
- Files:     packages/ui/src/tailwind.config.ts
- Concepts:  esm, cjs, require, tailwindcss, plugins, type module
- Narrative: With "type": "module" in package.json, CJS require() is not available. The tailwind
  config used `plugins: [require("tailwindcss-animate")]` which fails with TS2580. Fix: use an
  empty plugins array and let consuming apps add the animate plugin via proper ESM import.
  This applies to ALL packages in the monorepo — never use require() in any .ts file.

## 2026-05-03 — 🟡 Seed script upsert requires schema-defined unique constraint
- Type:      🟡 fix
- Phase:     Phase 4 Part 3
- Files:     packages/db/prisma/seed.ts
- Concepts:  prisma, upsert, unique constraint, seed
- Narrative: Prisma upsert's `where` clause only accepts fields with @unique or @@unique
  constraints. If no compound unique exists (e.g. PatrolArea has no @@unique([tenantId, name])),
  use findFirst + conditional create pattern instead of upsert for idempotent seeding.

## 2026-05-03 — 🔴 exactOptionalPropertyTypes breaks next-auth module augmentation
- Type:      🔴 gotcha
- Phase:     Phase 4 Part 5
- Files:     apps/web/src/server/auth/types.ts, apps/web/src/server/auth/config.ts
- Concepts:  typescript, exactOptionalPropertyTypes, next-auth, module-augmentation
- Narrative: With exactOptionalPropertyTypes: true, declaring `userId?: string` in a
  module-augmented interface means the property can be omitted but CANNOT be explicitly
  set to undefined. Since next-auth's base User type has `id?: string` (which resolves
  to string | undefined at usage), assigning `token.userId = user.id` triggers TS2412.
  Fix: declare all optional JWT properties as `key?: Type | undefined` to allow explicit
  undefined assignment. This pattern is needed for ANY module augmentation where the base
  library types use plain optional syntax.

## 2026-05-03 — 🟡 tailwindcss-animate has no type declarations
- Type:      🟡 fix
- Phase:     Phase 4 Part 5
- Files:     apps/web/src/types/tailwindcss-animate.d.ts, apps/web/tailwind.config.ts
- Concepts:  typescript, tailwind, ambient-module-declaration
- Narrative: tailwindcss-animate ships no TypeScript declarations. Importing it in a
  strict TypeScript tailwind.config.ts causes TS2307 "Cannot find module". Fix: create
  an ambient module declaration file `declare module "tailwindcss-animate";` and ensure
  the types directory is included in tsconfig.json.

## 2026-05-03 — 🟤 GitHub Actions security hook fires on ALL .github/workflows/ writes — approve both
- Type:      🟤 decision
- Phase:     Phase 4 Part 8
- Files:     .github/workflows/ci.yml, .github/workflows/docker-publish.yml
- Concepts:  github-actions, security-hook, injection, ci, workflow
- Narrative: The project pre-tool-use security hook fires a GitHub Actions injection warning
  whenever Claude Code writes to .github/workflows/. This is EXPECTED BEHAVIOR — the hook
  correctly audits workflows for injection vectors. Both Part 8 workflow files are safe:
  ci.yml uses only matrix.task (static enum: lint/typecheck/test/build), github.ref_name,
  github.sha — no user-controlled values in run: commands.
  docker-publish.yml uses only secrets.DOCKERHUB_USERNAME, secrets.DOCKERHUB_TOKEN,
  steps.meta.outputs.tags, steps.meta.outputs.labels — no user-controlled values in run: commands.
  Decision: approve both workflow writes after confirming no injection vectors. The hook is
  working correctly — review it on each future workflow write, but these two files are safe.

## 2026-05-03 — 🔴 pnpm audit --fix writes overrides but lockfile must be regenerated before --frozen-lockfile works
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     package.json (root), pnpm-lock.yaml
- Concepts:  pnpm, audit, overrides, lockfile, frozen-lockfile, CVE
- Narrative: Running `pnpm audit --fix` writes pnpm.overrides entries to root package.json
  but does NOT regenerate pnpm-lock.yaml. The next `pnpm install --frozen-lockfile` then
  fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH because the lockfile doesn't reflect the
  new overrides. Fix: run bare `pnpm install` (without --frozen-lockfile) immediately after
  `pnpm audit --fix` to regenerate the lockfile. Commit the updated lockfile alongside the
  package.json overrides. After that, `pnpm install --frozen-lockfile` (CI) will pass.
  This session: bcrypt > @mapbox/node-pre-gyp > tar@6.2.1 chain had 6 HIGH CVEs.
  10 pnpm overrides applied; 0 vulnerabilities after re-audit.

## 2026-05-03 — 🔴 bcrypt native binary missing after clean install — must pre-download before pnpm build
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     node_modules/bcrypt/
- Concepts:  bcrypt, native-addon, node-pre-gyp, node_modules, build
- Narrative: bcrypt's native C++ addon (bcrypt_lib.node) is not included in the npm package.
  It must be compiled or downloaded from GitHub releases via node-pre-gyp. After a fresh
  `pnpm install`, the binary is absent and `pnpm build` fails with a module-not-found error
  at runtime (Next.js standalone build tries to require the native module).
  Fix: `cd node_modules/bcrypt && npx @mapbox/node-pre-gyp install --fallback-to-build`
  This downloads the prebuilt binary for the current platform, falling back to compilation
  if no prebuilt exists. Must be re-run on any new machine or after `rm -rf node_modules`.
  The committed pnpm-lock.yaml does NOT preserve this binary — it is machine-local.

## 2026-05-03 — 🔴 useSearchParams() in Next.js App Router requires Suspense boundary on static pages
- Type:      🔴 gotcha
- Phase:     Phase 5
- Files:     apps/web/src/app/login/page.tsx
- Concepts:  nextjs, app-router, useSearchParams, suspense, static-rendering, prerender
- Narrative: Any component that calls `useSearchParams()` must be wrapped in a `<Suspense>`
  boundary. If the page component itself calls useSearchParams(), Next.js cannot statically
  prerender the page shell and throws a build error. Fix: extract the useSearchParams consumer
  into a separate module-level component (e.g. `LoginForm`), then make the page export a thin
  `<Suspense><LoginForm /></Suspense>` wrapper. The page component itself must not call any
  hook that requires client-side rendering. This applies to ALL App Router pages that read
  URL search params.

## 2026-05-03 — 🟡 squash-merge requires git branch -D (force delete)
- Type:      🟡 fix
- Phase:     Phase 4 Part 8 (also applies to all scaffold/part-N branches)
- Files:     none (git operation)
- Concepts:  git, squash-merge, branch-delete
- Narrative: After squash-merging a feature branch to main, `git branch -d` refuses to delete
  the branch because squash merge does not register as a fully merged commit in git's tracking
  (the branch commit is not an ancestor of main after a squash). Fix: always use
  `git branch -D` (force delete) after squash-merging. This is expected behavior for all
  scaffold/part-N branches and feat/{slug} branches in this project.
