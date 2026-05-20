# Lessons Memory — Spec-Driven Platform V31
# Entry format: ## YYYY-MM-DD — [ICON] [Title]
# Types: 🔴 gotcha | 🟡 fix | 🟤 decision | ⚖️ trade-off | 🟢 change
# READ ORDER: 🔴 first → 🟤 second → rest by relevance
# ---

## 2026-05-19 — 🔴 `pnpm prisma migrate dev` hangs on stale advisory locks from backgrounded prior runs
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     packages/db/prisma/migrations/20260519233500_add_notification_recipient_split/
- Concepts:  prisma migrate dev, pg_advisory_lock, schema-engine, stale process, kill PID, dev DB
- Narrative: While applying 4.1d's migration, `pnpm prisma migrate dev` hung indefinitely at the `pg_advisory_lock` step.
  Cause: a previous `prisma migrate dev` invocation from an earlier session was backgrounded (probably via Ctrl+Z or a parent shell exit) and its schema-engine subprocess still held the migration advisory lock against the dev DB.
  Diagnosis: `ps aux | grep prisma` showed multiple stale schema-engine PIDs lingering from earlier sessions; `SELECT * FROM pg_locks WHERE locktype='advisory';` against the dev DB confirmed the lock holders matched those PIDs.
  Fix: kill the stale PIDs (`kill <pid>` for each schema-engine in the ps output — they release the advisory lock on exit). Then re-run `pnpm prisma migrate dev` and it completes normally.
  Rule of thumb: when migrate dev hangs >30s with no output, suspect a stale lock holder. Don't kill --9 the foreground prisma — kill the background schema-engine process(es) instead. The foreground command resumes once locks free up.
  Preventative: in future sessions, always foreground prisma migrate dev (don't background or pipe to nohup). If a migrate dev is interrupted, run `ps aux | grep prisma` immediately and kill any leftover schema-engine PIDs before retrying.

## 2026-05-19 — 🟤 Backfill SQL inside Prisma migrations should use deterministic IDs for idempotency
- Type:      🟤 decision
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     packages/db/prisma/migrations/20260519233500_add_notification_recipient_split/migration.sql
- Concepts:  prisma migrations, data migration, backfill, idempotency, cuid vs uuid vs md5, staging/prod recovery
- Narrative: 4.1d's migration creates a new table (notification_recipients) and back-fills 1 row per existing Notification.
  Question: what ID strategy for the backfilled rows? Prisma's `@id @default(cuid())` only fires when no ID is supplied to INSERT; direct SQL INSERT must supply IDs.
  **Decision**: use a deterministic md5-derived ID: `'c' || substring(md5('nr_' || id || '_' || user_id) FROM 1 FOR 24)`. Format matches cuid shape (25 chars, starts with 'c') so the column type is honest; same inputs always produce the same ID.
  **Why**: idempotent re-run. If a DBA needs to re-execute the backfill by hand during staging/prod recovery (e.g., partial migration failure, accidental table truncation), the same source rows produce the same target IDs — no duplicate-key risk, no data divergence between recovery attempts. Alternatives rejected: `gen_random_uuid()::text` (non-deterministic, re-run produces fresh IDs); generating IDs in app code via Prisma (would require a separate migration script outside the prisma migrate flow, breaking the atomic-migration property).
  **Trade-off**: mixed-inventory IDs across the table — backfilled rows have md5-derived IDs while new rows (created via Prisma client) have true cuid IDs. Acceptable since IDs are opaque strings everywhere they're consumed. No ID-format-validation code anywhere assumes pure cuid format.
  **When to apply**: any future migration that backfills a new table from an existing one. Default to deterministic md5(constants || source_id || ...) over gen_random_uuid().

## 2026-05-19 — 🟤 v2 spec is the authoritative source — verify against PRODUCT.md before trusting STATE.md plan text
- Type:      🟤 decision
- Phase:     Phase 8 Batch 4 Sub-batch 4.1d (NotificationRecipient split with data migration)
- Files:     docs/v2/PRODUCT.md (L480-484), .cline/STATE.md (4.1d plan section), project_marine_guardian_phase8_batch4.md memory file
- Concepts:  governance hierarchy, plan vs spec, PRODUCT.md priority 4, decision verification
- Narrative: The STATE.md plan text for 4.1d had 3 errors that would have shipped wrong v2 schema if executed verbatim:
  (1) Plan said move `notificationType` from Notification to NotificationRecipient. v2 spec L480 keeps it on Notification (alert type doesn't vary per recipient).
  (2) Plan omitted the `read_at` field on NotificationRecipient. v2 spec L483 includes it (per-user read timestamp).
  (3) Plan implied `email_status` was just a default-string field. v2 spec L483 defines it as a 5-value enum (`pending|sent|suppressed_by_cooldown|digested|failed`).
  Caught during main-session pre-flight inspection (grep docs/v2/PRODUCT.md for "NotificationRecipient" + "Notification (Command Center"). Fixed in the dispatched subagent's task brief BEFORE the work was dispatched.
  **Rule**: BEFORE executing any sub-batch plan, grep the authoritative spec (docs/v2/PRODUCT.md for v2 work; docs/PRODUCT.md for v1) for the relevant model section. Compare each field listed in the plan against the spec. If the plan deviates, the spec wins (priority 4 in CLAUDE.md hierarchy) — update the plan BEFORE dispatching execution. Treat STATE.md plan text as a starting hypothesis, not a contract.
  This is especially load-bearing for v2 work where the plan was written from a draft entity-vs-schema diff that may not have captured every field per the final v2 spec.

## 2026-05-19 — 🔴 Prisma migrate dev sweeps multiple new models into ONE migration — --name does NOT split
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1c (FuelEntry + ReportExport scaffolds)
- Files:     packages/db/prisma/migrations/20260519231300_add_fuel_entry/, packages/db/prisma/migrations/20260519231301_add_report_export/, packages/db/prisma/schema.prisma
- Concepts:  prisma-migrate, migrate-dev, multi-model-sweep, --create-only, --name flag, migration-splitting
- Narrative: When a task spec demands "one migration per table" and you add MULTIPLE new models to schema.prisma BEFORE running migrate-dev, Prisma sweeps ALL pending model additions into a SINGLE migration regardless of `--name`. The `--name` flag only controls the directory name — it does NOT scope which schema changes land in the migration. The Sub-batch 4.1c agent ran `prisma migrate dev --create-only --name add_fuel_entry` with both FuelEntry AND ReportExport already in schema.prisma; Prisma generated one migration containing both tables. Two workarounds: (a) PREFERRED — add models to schema.prisma INCREMENTALLY: add model 1 → run migrate-dev with name1 → add model 2 → run migrate-dev with name2; (b) ACCEPTED HERE — let the sweep happen, then hand-split the SQL: keep the first table's SQL in the original migration directory (rename the directory if needed for ordering) and write the second table's SQL into a fresh migration directory with a timestamp 1 second later (matching format: `YYYYMMDDHHMMSS+1_add_X`). The hand-split path is fine for additive scaffolds but riskier when migrations have ordering dependencies — the (a) path is safer. Related: the 2026-05-12 🟡 "enum drift sweeps into next migration" lesson is the same family of issue. Pattern recognition: if `prisma migrate dev --create-only --name X` produces a migration containing changes you didn't expect → check schema.prisma for ALL pending model/enum/index changes; the migration is a snapshot of the current schema-vs-DB delta, not a snapshot of what `--name X` semantically describes.

## 2026-05-19 — 🟡 Zod .cuid() strict format check rejects synthetic short strings in test fixtures
- Type:      🟡 fix
- Phase:     Phase 8 Batch 4 Sub-batch 4.1c (FuelEntry + ReportExport scaffold tests)
- Files:     apps/web/src/server/trpc/routers/__tests__/fuelEntry.test.ts, apps/web/src/server/trpc/routers/__tests__/reportExport.test.ts
- Concepts:  zod, cuid, test-fixtures, schema-validation, vitest, mock-data
- Narrative: When a Zod input schema uses `.cuid()` to validate an ID field, test fixtures using short strings like `"ab-1"` or `"user-1"` fail validation with "Invalid cuid" at the input-parsing stage — BEFORE the procedure body runs. The Sub-batch 4.1c tests hit this when writing the first happy-path test for fuelEntry.update: `{ id: "fe-1" }` failed `.parse()` immediately. Cuid format spec: ~25 lowercase alphanumeric chars starting with 'c'. Fix: use a synthetic 25-char cuid-shaped string in test fixtures: `"c000000000000000000000001"` (starts with c, all valid chars, exactly 25 chars). Increment the trailing digits for unique IDs across the test file: `"c000000000000000000000002"`, etc. Define a fixture helper at the top of the test file to keep this DRY:
    `const cuid = (n: number) => 'c' + n.toString(36).padStart(24, '0');`
  Then call sites: `cuid(1)`, `cuid(42)`, etc. Same pattern needed for any procedure whose input schema validates `.cuid()` — areaBoundary (4.1a) and patrolTrack (4.1b) test files used the same synthetic-cuid pattern but the helper was inlined per-test; the helper extraction is cleaner. Note: Zod's `.cuid()` also accepts `cuid2` format if the schema uses `.cuid2()` — different format (lowercase letters + digits, 24 chars by default, no starting-letter constraint). Marine-Guardian uses Prisma's `@default(cuid())` which is the original cuid spec.

## 2026-05-12 — 🟡 Response.text() strips UTF-8 BOM during decoding — assert BOM via arrayBuffer()
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 Item 4 SS-1 (events export Route Handler tests)
- Files:     apps/web/src/app/api/exports/events/__tests__/route.test.ts
- Concepts:  utf-8, bom, response, fetch-spec, text-decoder, vitest, route-handler, csv
- Narrative: A test that asserted `(await res.text()).charCodeAt(0) === 0xFEFF` failed even though
  the CSV body definitely starts with the BOM. Root cause: per the Fetch spec, `Response.text()`
  runs UTF-8 decoding via TextDecoder which strips a leading BOM by default
  (https://encoding.spec.whatwg.org/#utf-8-decode). The BOM IS on the wire — just gone after decoding.
  Fix: read the response as bytes and check the raw three-byte sequence:
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const bodyText = new TextDecoder("utf-8").decode(buf);  // explicit decode preserves BOM if needed
  Note: `TextDecoder("utf-8", { ignoreBOM: true })` is the default; pass `{ ignoreBOM: false }` only
  if you need to surface the BOM as U+FEFF in the decoded string. Excel still detects the encoding
  fine because it reads the raw bytes — only JavaScript decoders strip it.
  Applies to: SS-2/SS-3/SS-4 (patrols / alert-rules / notifications + alert-history) — every export
  Route Handler test should follow this pattern when verifying CSV BOM presence.

## 2026-05-12 — 🟡 Vitest needs @vitejs/plugin-react when tsconfig sets jsx:preserve
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 Item 4 SS-0 (exports foundation)
- Files:     apps/web/vitest.config.ts, apps/web/package.json (devDependencies)
- Concepts:  vitest, vite, jsx, tsconfig, @vitejs/plugin-react, @react-pdf/renderer, test-setup
- Narrative: First time the repo introduced a server-side `.tsx` source file (apps/web/src/server/lib/export-pdf.tsx for
  @react-pdf/renderer) and tried to test it with vitest. Tests failed with "Failed to parse source for import analysis
  because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve."
  Root cause: tsconfig.base.json has `"jsx": "preserve"` (the Next.js default — Next handles the JSX transform during
  its own build, so tsc emits JSX unchanged). Vite 8 / vitest 4 honor that setting during the import-analysis pass on
  `.tsx` files. Two fix attempts that DID NOT work: (a) `esbuild.jsx: "automatic"` in vitest.config.ts — vite still
  reads the disk tsconfig for the parse pass; (b) `esbuild.tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } }` —
  same result, the override is applied to esbuild but vite's import-analysis runs first. The fix that works:
  `pnpm --filter @marine-guardian/web add -D @vitejs/plugin-react`, then in vitest.config.ts add
  `plugins: [react()]` to the defineConfig. The plugin transforms JSX before vite's import-analysis sees it, so the
  tsconfig.json's `jsx: "preserve"` setting becomes a no-op for tests (Next.js's own build still respects it). This
  is now baked in for any future server-side `.tsx` file the project adds (PDF templates, MJML email templates, etc.).
  Apply when: adding any new `.tsx` source file outside `apps/web/src/app/**` or `apps/web/src/components/**` and
  writing a vitest test for it. NOT needed for `.ts` tests that only import `.tsx` indirectly via type — only the
  direct `.tsx` import (source or test) triggers the parse failure.

## 2026-05-12 — 🟢 AlertHistory immutable audit trail added (Phase 8 Batch 2 Item 3)
- Type:      🟢 change
- Phase:     Phase 8 Batch 2 — alert engine hardening
- Files:     packages/db/prisma/schema.prisma, packages/jobs/src/processors/alerts.processor.ts, apps/web/src/server/trpc/routers/alertHistory.ts, apps/web/src/app/(dashboard)/alerts/history/page.tsx
- Concepts:  alert-engine, audit-trail, snapshot-fields, transaction-atomicity, prisma
- Narrative: AlertHistory model holds one row per (rule × event) match — NOT per recipient. Grain choice matters:
  per-recipient would conflate "rule fired once for 5 admins" with "rule fired 5 times" in reports. The processor
  writes the history row INSIDE the same `$transaction` as the per-recipient notification + audit log writes,
  so if history.create fails the whole alert rolls back atomically (no notifications without history). Snapshot
  fields `ruleNameSnapshot` and `eventTitleSnapshot` preserve display strings even after the parent rule or event
  is later deleted — FK constraints use `ON DELETE SET NULL` so history rows survive deletion with the snapshot
  taking over for display ("Rule Name (deleted)" italic in the UI). Lessons for future audit-trail work in this
  codebase: (a) bake the snapshot column in from migration #1 — backfilling snapshots later is expensive;
  (b) write inside the same transaction as the side-effects you're auditing, never in a follow-up step.
# ---

## 2026-05-12 — 🟡 shadcn Table primitive missing — install via shadcn CLI, not by hand
- Type:      🟡 fix
- Phase:     Phase 8 Batch 2 — alert history UI page
- Files:     apps/web/src/components/ui/table.tsx
- Concepts:  shadcn, ui-primitives, missing-component, dlx
- Narrative: Marine-Guardian was scaffolded with a minimal shadcn footprint — only button, card, dialog, badge,
  input, label, select, switch, separator were installed initially. Table is NOT among them. First time something
  needs a `<Table>` (here: alert history list), the import fails with `Cannot find module '@/components/ui/table'`.
  Fix: `cd apps/web && pnpm dlx shadcn@latest add table --yes`. Same pattern applies for any other shadcn primitive
  not yet installed (data-table, accordion, sheet, tabs, etc.). Do NOT hand-write a Table component — the shadcn
  one has the correct CSS variable + Tailwind class composition for dark mode + the rest of the design system.
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

## 2026-05-20 — 🔴 Opus 4.7 executor subagent can silently drop mid-brief while reporting "completed"
- Type:      🔴 gotcha
- Phase:     Phase 8 Batch 4 Sub-batch 4.1e (and applies to any future Architect-Execute dispatch on this codebase)
- Files:     N/A — process/orchestration lesson
- Concepts:  architect-execute, subagent-dispatch, opus-executor, partial-completion, status-trust, git-verify
- Narrative: Dispatched Opus 4.7 executor subagent in background for Tier-2 ~30K-token sub-batch (11-file brief: schema edit + migration + 6 shared package files + 2 test files + branch + commit). Subagent reported `STATUS: completed` after 6.6 min / 35 tool uses / 269K tokens consumed. But final visible result text was truncated mid-sentence: `"Client generated. Now read shared package files to match prevailing style:"` — clearly stopped at step 7 of 11. Git inspection confirmed: branch created + schema.prisma edited + migration directory created (both .sql files) + prisma generate + prisma migrate dev all completed correctly. But the 6 shared package edits + 2 test files were NOT done. NO commit on the branch. NEVER trust the verbal "completed" status without verifying actual repo state via git status + git diff + git log. Lesson confirmed previously for Sonnet executors ([[feedback_sonnet_thrash_inspect_before_redispatch]]) — now confirmed for Opus too. The salvage protocol is identical regardless of which model dropped: (1) git status to see uncommitted modifications + untracked files, (2) git diff to verify partial work matches the brief's prescription, (3) git stash list for any escape-hatch stashes, (4) if partial work is correct → continue from interrupted step in main session OR re-dispatch with narrower scope, (5) if partial work is wrong → reset + re-dispatch. For 4.1e the salvage continuation in main session cost ~15K extra tokens vs an additional ~25K for a re-dispatch — Architect time was cheaper. Token usage 269K with only 35 tool uses suggests the subagent spent most of its budget on reasoning/planning rather than execution, possibly hitting an internal context wall during step 7's pre-edit shared file analysis. Future mitigation: for Tier-2 dispatches with many small file edits at the tail, consider splitting into "schema + migration" subagent + "shared package + tests" subagent rather than a single 11-file dispatch — keeps each agent's working set under a single concept.

## 2026-05-20 — 🟢 Sub-batch 4.1e shipped — 🎯 Phase 8 Batch 4 v2 Foundation Tables COMPLETE
- Type:      🟢 change
- Phase:     Phase 8 Batch 4 (closes the batch)
- Files:     packages/db/prisma/schema.prisma (Tenant + Event + Patrol + AreaBoundary edits), packages/db/prisma/migrations/20260520010000_add_area_attribution_and_tenant_arcgis/{migration,down}.sql, packages/shared/src/types/{event,patrol,tenant}.ts, packages/shared/src/schemas/{event,patrol,tenant}.ts, apps/web/src/server/trpc/routers/__tests__/patrol.test.ts (NEW)
- Concepts:  v2-foundation, area-attribution, arcgis, additive-schema, batch-complete, milestone
- Narrative: 4.1e adds the final v2 foundation wiring: area attribution columns on Event/Patrol (areaName + areaBoundaryId FK SET NULL + areaDerivedAt — all nullable, all stay NULL until Batch 5+ derivation algorithm lands) + Tenant ArcGIS reference fields (arcgisBoundaryUrl + arcgisBoundaryOutfields, encrypted at app layer per earthrangerUrl precedent). 7-step additive DDL with lossless reverse. Routers untouched (include-based queries auto-surface new fields). New patrol.test.ts closes the only v2-foundation router-test gap (6 cases — list happy + populated + getById + cross-tenant isolation + FORBIDDEN guard + stats). 268 tests passing across 38 files (was 262/37). Squash-merged as commit 6687112 on main. 🎯 All 5 Batch 4 sub-batches now shipped: 4.1a AreaBoundary 56fb3fa → 4.1b PatrolTrack cfe9195 → 4.1c FuelEntry+ReportExport e972d82 → 4.1d NotificationRecipient split d32e618 → 4.1e Event/Patrol/Tenant area attribution 6687112. v2 foundation tables in place for Batch 5+ work. Plan-correction-vs-v2-spec pattern confirmed twice now (4.1d notificationType + 4.1e area_name) — the lesson 🟤 "v2 spec is authoritative — verify against PRODUCT.md before trusting STATE.md plan text" continues to pay dividends. Deferred to Batch 5+: AreaBoundary derivation algorithm (event area_boundary_id+area_derived_at set by sync job from area_name match OR nearest-boundary; patrol from start_location nearestBoundary), Patrol Track Materialization job, ReportExport pdf-render queue, Notification fan-out flow, Tenant sync-engine fields (15 fields), Event/Patrol enum changes (priority+state), AlertRule restructure, AuditLog impersonation fields. Once all deferred work ships: mechanical `mv docs/v2/PRODUCT.md docs/PRODUCT.md` swap.
