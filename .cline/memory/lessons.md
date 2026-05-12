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

## 2026-05-05 — 🔴 Alpine Linux resolves localhost to IPv6 — use 127.0.0.1 in Docker healthchecks
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     deploy/compose/dev/docker-compose.app.yml
- Concepts:  docker, alpine, ipv6, healthcheck, localhost, wget
- Narrative: Alpine Linux's /etc/hosts maps `localhost` to `::1` (IPv6 loopback). When Next.js
  starts with HOSTNAME="0.0.0.0", it binds to IPv4 only. A healthcheck using
  `wget -qO- http://localhost:3000/api/health` resolves to ::1 and gets "Connection refused"
  even though the app is running fine on 0.0.0.0:3000. Fix: always use `http://127.0.0.1:3000`
  in Docker healthcheck commands for Alpine-based images. This applies to ALL node:*-alpine
  images used in this project.

## 2026-05-05 — 🔴 Passwords with special characters in DATABASE_URL must be URL-encoded
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     .env.dev
- Concepts:  postgresql, database-url, url-encoding, prisma, password, pgbouncer
- Narrative: If an auto-generated password contains `/` or `+`, the DATABASE_URL connection
  string breaks because `/` is parsed as a path separator and `+` as a space. Prisma reports
  "invalid port number" (P1013) because it reads the portion after the slash as part of the
  host:port. Fix: URL-encode special characters in the password portion of connection strings:
  `/` → `%2F`, `+` → `%2B`, `@` → `%40`, `#` → `%23`. The raw DB_PASSWORD env var keeps
  the original characters — only the composed URL fields (DATABASE_URL, PGBOUNCER_DATABASE_URL)
  need encoding. Phase 3 credential generation should URL-encode passwords when composing URLs.

## 2026-05-05 — 🔴 PgBouncer env_file must not include DATABASE_URL — use individual env vars
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     deploy/compose/dev/docker-compose.db.yml
- Concepts:  pgbouncer, docker-compose, env_file, database-url, password
- Narrative: The edoburu/pgbouncer Docker image reads DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
  DB_NAME as individual environment variables to construct its internal connection. When
  env_file includes the full .env.dev file, PgBouncer also receives DATABASE_URL which it
  tries to parse separately — and if the password contains `/`, the URL is malformed causing
  PgBouncer to crash on startup. Fix: remove env_file from the pgbouncer service and set
  only the individual variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, POOL_MODE,
  MAX_CLIENT_CONN, DEFAULT_POOL_SIZE, AUTH_TYPE) directly in the environment: block.

## 2026-05-05 — 🔴 Prisma engine binary must be explicitly copied in Alpine standalone Dockerfile
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     apps/web/Dockerfile
- Concepts:  prisma, alpine, standalone, query-engine, dockerfile, binary
- Narrative: Next.js standalone output does not include Prisma's native query engine binary
  (libquery_engine-linux-musl-openssl-3.0.x.so.node). The app container starts but every
  database query fails with "Query engine library not found". Fix: in the Dockerfile builder
  stage, after `pnpm build`, add a step to find and copy the engine binary:
  `RUN mkdir -p /prisma-engines && find /app -name "libquery_engine-linux-musl-openssl-3.0.x.so.node" -exec cp {} /prisma-engines/ \;`
  Then in the runner stage, copy to both locations Prisma checks:
  `COPY --from=builder /prisma-engines/ ./node_modules/.prisma/client/`
  `COPY --from=builder /prisma-engines/ ./apps/web/.next/server/`

## 2026-05-05 — 🟡 Prisma CLI on host requires sourcing .env.dev for DATABASE_URL
- Type:      🟡 fix
- Phase:     Phase 6
- Files:     .env.dev
- Concepts:  prisma, env-vars, database-url, source, shell
- Narrative: Prisma CLI (pnpm db:migrate, pnpm db:seed) runs on the host machine, not inside
  Docker containers. It needs DATABASE_URL from .env.dev but pnpm scripts don't auto-load
  env files. Fix: prefix Prisma commands with `set -a && source .env.dev && set +a &&` to
  export all variables from .env.dev into the current shell session before running Prisma.
  Alternative: add dotenv-cli as a dev dependency and prefix scripts with `dotenv -e .env.dev --`.

## 2026-05-06 — 🔴 Docker internal networking: worker containers must NOT use host-mapped ports
- Type:      🔴 gotcha
- Phase:     Phase 6
- Files:     packages/jobs/src/connection.ts, deploy/compose/dev/docker-compose.app.yml, deploy/compose/stage/docker-compose.app.yml, deploy/compose/prod/docker-compose.app.yml
- Concepts:  docker, networking, valkey, redis, bullmq, worker, compose, env-vars
- Narrative: Worker containers crashed with ECONNREFUSED to localhost:45196. Root cause: .env.dev
  sets REDIS_HOST=localhost and REDIS_PORT=45196 (host-mapped port) which is correct for the host
  machine but WRONG inside Docker containers. Inside the Docker network, Valkey is reachable at
  ${COMPOSE_PROJECT_NAME}_valkey:6379 (internal hostname and internal port). Fix: add REDIS_HOST
  and REDIS_PORT overrides in the compose environment: block for the worker service, pointing to
  the Docker internal hostname and port 6379. REDIS_PASSWORD flows correctly from env_file without
  needing an override. IMPORTANT: never reference ${REDIS_PASSWORD} in a compose environment: block
  — Docker Compose interpolates ${VAR} in environment: from the SHELL environment at compose-up
  time, NOT from env_file contents. This causes "variable not set" warnings and blank passwords.
  Keep secrets in env_file only; use environment: overrides only for non-secret values like
  hostnames and ports that differ between host and container contexts.

## 2026-05-08 — 🔴 React.ElementRef deprecated in React 19 — affects every shadcn primitive
- Type:      🔴 gotcha
- Phase:     Phase 7 (Feature Update — alerts/notifications UI)
- Files:     apps/web/src/components/ui/{dialog,dropdown-menu,select,separator,switch,tabs,scroll-area}.tsx
- Concepts:  shadcn/ui, react-19, forwardRef, eslint-no-deprecated, ComponentRef
- Narrative: Every shadcn/ui primitive vendored via `npx shadcn@latest add` uses
  `React.ElementRef<typeof Primitive>` paired with `React.forwardRef`. Under React 19 this is
  deprecated; `@typescript-eslint/no-deprecated` flags every occurrence. One bulk sed fixes all:
  `sed -i 's/React\.ElementRef/React.ComponentRef/g' src/components/ui/*.tsx`
  `ComponentRef<T>` is the drop-in replacement (both come from React core, same generic shape).
  Apply this immediately after any `npx shadcn@latest add` until shadcn updates their templates.
  Already seen with: scroll-area (Event Kanban), dialog/dropdown-menu/select/separator/switch/tabs
  (alerts/notifications). Will recur with any future shadcn add.

## 2026-05-08 — 🟡 vitest expect.objectContaining unsafe-assignment in nested matchers
- Type:      🟡 fix
- Phase:     Phase 7 (alertRule/notification/event tRPC tests)
- Files:     apps/web/src/server/trpc/routers/__tests__/{alertRule,notification,event}.test.ts
- Concepts:  vitest, eslint-no-unsafe-assignment, objectContaining, DeeplyAllowMatchers, type-safety
- Narrative: vitest's `expect.objectContaining(x)` returns `any`. When used as a nested property
  value (`{ where: expect.objectContaining({ tenantId }) }`) the outer object literal triggers
  `@typescript-eslint/no-unsafe-assignment` because the inner result is typed `any`. Naive fix
  with `<T extends object>(obj: Partial<T>): T { return expect.objectContaining(obj) as T; }`
  fails typecheck because `objectContaining` formally takes `DeeplyAllowMatchers<T>` (not exported
  cleanly). Working pattern: define one helper per test file with widened input + narrow
  one-line cast and disable comment, signature `partial<T>(obj: T): T`:
    function partial<T>(obj: T): T {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return expect.objectContaining(obj as any) as T;
    }
  Then call sites become `partial({ where: partial<{ tenantId: string }>({ tenantId: "abc" }) })`
  — fully typed, no lint errors, no typecheck errors. The `as any` is justified: vitest matchers
  ARE inherently dynamic and typing them precisely requires importing internal vitest types that
  are not stable across versions.

## 2026-05-08 — 🟡 shadcn DropdownMenuCheckboxItem violates exactOptionalPropertyTypes
- Type:      🟡 fix
- Phase:     Phase 7 (alerts/notifications UI — dropdown-menu primitive)
- Files:     apps/web/src/components/ui/dropdown-menu.tsx
- Concepts:  shadcn/ui, exactOptionalPropertyTypes, radix-ui, CheckedState, conditional-spread
- Narrative: shadcn's vendored `DropdownMenuCheckboxItem` does
  `<DropdownMenuPrimitive.CheckboxItem checked={checked} {...props}>` after destructuring
  `checked` from optional props. Under our root tsconfig `exactOptionalPropertyTypes: true`,
  `checked` becomes `CheckedState | undefined`, but Radix's prop type is `CheckedState` (no
  undefined). TS errors: `Type 'undefined' is not assignable to type 'CheckedState'`. Fix is to
  conditionally spread instead of always passing the prop:
    {...(checked !== undefined ? { checked } : {})}
  Same pattern applies to any vendored shadcn primitive whose Radix counterpart has a
  non-optional discriminator that shadcn's wrapper exposes as optional. Quick scan after any
  shadcn add: grep for `={[a-zA-Z]+}` after destructured optional props passed straight through
  to Radix primitives. Related: optional booleans like `inset` need explicit `=== true` check
  in conditional class expressions to satisfy strict-boolean-expressions.

## 2026-05-12 — 🟢 Seed passwords moved from hardcoded constants to env vars
- Type:      🟢 change
- Phase:     Phase 8 Batch 2 (post-map-feature-group cleanup — Tier 1 tech debt)
- Files:     packages/db/prisma/seed.ts, .env.dev, .env.staging, .env.prod, .env.example, CREDENTIALS.md
- Concepts:  prisma-seed, upsert, password-rotation, bcrypt, env-vars, idempotent-seed
- Narrative: The seed script previously hardcoded `WEBMASTER_PASSWORD` as a top-level constant AND
  used `update: {}` on the user upsert. Two problems combined: (a) the plaintext password was
  visible in git history forever, and (b) re-running `pnpm db:seed` did nothing to the password
  even if you wanted to rotate it — the upsert took the `update: {}` no-op path on existing users.
  Fix: read both `WEBMASTER_PASSWORD` and `DEMO_SITE_ADMIN_PASSWORD` from `process.env` via a
  `requireEnv()` helper that throws with a remediation message; set `update: { passwordHash }` on
  both user upserts so re-seeding always rotates. Pattern for any seed account: env-var sourced
  + upsert-update-path = rotatable. Plaintext lives only in CREDENTIALS.md (gitignored) and
  .env.{env} (gitignored). Verified with `bcrypt.compare(process.env.X, user.passwordHash)`
  returning true for both accounts after re-seed. Applies to any future seeded account — never
  hardcode credentials in seed scripts again, even for "demo" accounts in dev.

## 2026-05-12 — 🟢 Notification.patrolId nullable FK added; UI click-through prioritizes patrol over event
- Type:      🟢 change
- Phase:     Phase 7 Feature Update (spec deferral #3 from STATE.md)
- Files:     packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260512024505_add_notification_patrol_id/, packages/shared/src/types/notification.ts, apps/web/src/server/trpc/routers/notification.ts, apps/web/src/app/(dashboard)/notifications/page.tsx
- Concepts:  prisma-fk, nullable-relation, click-through, notification-center, exactOptionalPropertyTypes
- Narrative: PRODUCT.md L187 says "Click-through to related event or patrol" — until this change
  only the event path existed. Added `patrolId String? @map("patrol_id")` on Notification with
  `patrol Patrol? @relation(fields: [patrolId], references: [id])`, plus `notifications Notification[]`
  inverse on Patrol, plus `@@index([patrolId])`. Router `list` query now `include`s
  `patrol: { select: { id: true, title: true, serialNumber: true } }` alongside the existing
  event include. UI click-through priority: patrol → event → no-link (patrol wins when both
  present because it's the more specific destination). Metadata row mirrors the priority and
  uses `n.patrol.title ?? n.patrol.serialNumber ?? n.patrol.id` for the label (Patrol.title is
  nullable). Pattern reusable for any "Notification has one of several optional related
  entities" — order the priorities by specificity, compute one `href` variable, conditionally
  wrap Link only when href !== null. Alerts processor untouched — patrolId stays null on
  notifications created from event-only alerts; future patrol-aware rules can populate it.

## 2026-05-12 — 🟡 Subagent thrashing from hook-injection overhead — escalate to Opus-direct, do NOT re-dispatch
- Type:      🟡 fix
- Phase:     Phase 7 Feature Update (Notification.patrolId FK migration)
- Files:     n/a (process gotcha — applies to any Phase 7/8 work)
- Concepts:  subagent, thrashing, hook-injection, vercel-plugin, claude-mem, opus-escalation, memory-governance
- Narrative: Sonnet 4.6 subagent thrashed on a tightly-scoped Tier-2 task that should have fit
  in its 30K budget. Root cause was NOT the task scope — it was the hook-injection overhead.
  Every Read tool call from inside a subagent triggers (a) vercel-plugin auto-suggesters that
  pattern-match on file paths like `prisma/schema.prisma`, `app/**`, `apps/web/**` and inject
  ~1.5K of "use this skill" boilerplate (next-forge, vercel-storage, bootstrap, nextjs,
  next-cache-components — none applicable to this self-hosted Docker project), and (b)
  claude-mem prior-observation context (~500 tokens per Read pointing at past observation IDs).
  10 Read calls = ~20K of pure hook overhead before any real work. The subagent burned its
  budget on the injected context, not on the planned reads. Fix per memory-governance.md §4
  thrashing rule: STOP the agent. DO NOT re-dispatch the same task — it will thrash again the
  same way. Escalate per §2.5b: complete the remaining work as Opus-direct (Opus has 100K
  budget, can absorb the hook overhead) and log the justification in STATE.md. Pattern: if a
  subagent thrashes despite a token estimate well under 30K, check whether hook injection is
  inflating every tool call. If yes → Opus-direct is the right call, not "split the task
  smaller" (which still pays the hook overhead per call). Forward fix on the horizon: hook
  filtering by relevance, or disabling vercel-plugin auto-suggesters for non-Vercel projects.

## 2026-05-12 — 🟡 Pre-existing schema drift sweeps into next migration (SyncStatus.running case)
- Type:      🟡 fix
- Phase:     Phase 7 Feature Update (Notification.patrolId FK migration)
- Files:     packages/db/prisma/schema.prisma (SyncStatus enum line ~60), packages/db/prisma/migrations/20260512024505_add_notification_patrol_id/migration.sql
- Concepts:  prisma-migrate, schema-drift, enum-value, postgres-enum-immutability, migration-hygiene
- Narrative: `prisma migrate dev --create-only` unexpectedly included `ALTER TYPE "SyncStatus"
  ADD VALUE 'running'` alongside the actual Notification.patrolId changes. Investigation showed
  the init migration created SyncStatus with `('success', 'failed', 'partial')` only — but
  schema.prisma had `running` added at some point (almost certainly with the alert engine sync
  wiring on 2026-05-11, see observation 58) without a corresponding migration. The drift sat
  dormant until the next `migrate dev` run. Prisma's drift detector correctly swept the missing
  value into this migration. Decision: KEEP the sweep in this migration (reverting would just
  push the same drift into the NEXT migration — endless punt). Document the sweep in down.sql
  header comment so anyone running a rollback knows why an enum value remains. PostgreSQL note:
  `DROP VALUE` is not a supported operation on enums — the only way to "remove" a value is to
  rename the enum, create a fresh one without the value, alter the column type, drop the old.
  Too heavy for a routine down-migration. So enum value additions are effectively one-way in
  PG; the down.sql cleanly reverses the patrol_id column changes but leaves the enum value as
  a no-op residue. Prevention: every time you edit an enum in schema.prisma, IMMEDIATELY run
  `prisma migrate dev --name <descriptive>` to capture it as its own migration. Don't let enum
  changes sit alongside other in-flight schema work — they pollute the next unrelated migration
  with a confusing extra line.
