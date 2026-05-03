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
