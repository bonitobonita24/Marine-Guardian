# LESSONS_REGISTRY.md — Framework Lessons Registry (V32.8)

**Canonical, append-only. One entry per promoted lesson.**
Part of the Spec-Driven Platform Framework. Seeded 2026-06-17.

---

## Overview

This registry is the single consult surface for the Rule 32 learning loop. Every promoted
lesson earns an entry here. Entries are **never edited** — if a standing check is strengthened,
append a new entry referencing the prior one.

Mirrored to a `/memory` index entry (one-line summary per fingerprint) so the conductor can
consult without loading this file.

---

## Entry Schema

```yaml
- fingerprint:
    tuple: "<scope>.<category>.<surface>"
    machine_signature: "<CVE-ID | error-code | normalized-regex>"  # optional
  scope: project | framework | conductor
  failure: "<plain-language description of what broke>"
  standing_check: "<imperative: run X against Y; expect Z>"
  check_location: "<lint-deploy.sh C<N> | phases.md Phase N pre-flight | /memory feedback_*.md | …>"
```

**Scope routes the check, not the index:**

| Scope | Check destination | Reaches new apps via |
|---|---|---|
| `project` | `lessons.md` (in-repo, project-local) | n/a |
| `framework` | a deliverable (`lint-deploy.sh`, `templates.md` rule, phase output contract) | `deploy.sh` |
| `conductor` | a `/memory` feedback file | auto-loads each session |

---

## Two-Part Fingerprint

Every entry has a two-part fingerprint:

1. **Coarse structured tuple** `{scope.category.surface}` — always present; AI-matchable even
   without a machine signature.
2. **Optional machine-signature** — CVE-ID, error-code, or regex-normalized error string (strip
   paths/timestamps/line-numbers for a stable signature). Present only when the failure is
   machine-emitted (build error, test failure, CVE scanner output).

Matching: machine-signature = exact fast path; tuple only = AI-judged similarity scan.

---

## Three Mandatory Consult Points

| Point | When | Action |
|---|---|---|
| **Work-start** (Hook 15) | Before any task or wave begins | Scan for fingerprints matching the target surface; surface matches before proceeding |
| **Done-claim** (Hook 16) | Before marking any task done | Run contract check + scan for surface-relevant fingerprints; evidence block required |
| **Failure-time** (Hook 17) | Whenever a build/test/gate/report fails | Fingerprint → scan → if match + check should have caught it → STRENGTHEN; if novel → promote |

---

## Promotion Routing

- **`project`** → entry added to `lessons.md` in the target app repo (project-local).
- **`framework`** → edit the relevant deliverable (e.g. `lint-deploy.sh`, `templates.md`, phase
  output contract); verify `deploy.sh` ships it to new apps; append entry here.
- **`conductor`** → write `/memory` feedback file (auto-loads each session); append entry here.

After promotion: update the `/memory` mirror index (one-line summary per fingerprint).

---

## Entries

<!-- APPEND NEW ENTRIES BELOW THIS LINE. Never edit existing entries. -->

---

## framework.docker-build.worker-image

| Field | Value |
|---|---|
| **fingerprint** | `framework.docker-build.worker-image` |
| **machine_signature** | Trivy HIGH/CRITICAL on a dependency absent from the runtime `package.json` (transitive/dev dep dragged in via `COPY . .`) |
| **scope** | `framework` |
| **failure** | `COPY . .` in a worker/runtime Docker stage drags sibling `node_modules` (including dev-only packages such as `lefthook`) into the image → phantom CVEs that block the Trivy gate. First observed 2026-06-17 (Yelli COPY . . incident). |
| **standing_check** | Run `bash scripts/lint-deploy.sh deploy/compose` against the project's compose files; expect zero `COPY . .` findings in worker/runtime stages (scoped copies only). |
| **check_location** | `scripts/lint-deploy.sh` (deliverable #20) |

_Promoted: 2026-06-17_

---

## conductor.ci-verification.turbo-cache-masked-green

| Field | Value |
|---|---|
| **fingerprint** | `conductor.ci-verification.turbo-cache-masked-green` |
| **machine_signature** | A turbo `lint`/`typecheck`/`build` task reports `Cached: N cached` GREEN for a commit whose true result is RED — exposed only when an input (lockfile / `package.json`) changes and busts the cache |
| **scope** | `conductor` |
| **failure** | Orqafy `main` showed CI `Turbo typecheck`/`Turbo build` GREEN while actually carrying ~33 web lint errors + an `ioredis` dual-version typecheck conflict. The pass was a STALE turbo cache result: type-aware `@typescript-eslint` rules (`strict-boolean-expressions`, `no-unsafe-*`, `no-unnecessary-type-assertion`) and `tsc` depend on cross-package type info the lint/typecheck cache key doesn't fully capture, so previously-cached green survives even after sibling changes make the code red. A CVE-override lockfile change busted the cache and surfaced the real red. First observed 2026-06-18. |
| **standing_check** | When verifying a framework app's `main` CI is "green," do NOT trust a cached pass for `lint`/`typecheck`/`build` gates — confirm true state with a cache-busted run (`pnpm turbo run lint typecheck build test --force`) before declaring green, merging, or promoting an image. |
| **check_location** | `/memory feedback_ci_verify_cache_busted.md` |
| **framework follow-up (backlog)** | Harden the framework CI template to run lint/typecheck gates cache-busted (or declare correct turbo `inputs`/`dependsOn` so type-aware results invalidate on cross-package change). Not yet implemented. |

_Promoted: 2026-06-18_

---

## framework.design-generation.routing

| Field | Value |
|---|---|
| **fingerprint** | `framework.design-generation.routing` |
| **machine_signature** | (none — AI-judged: a UI surface added without routing through the shadcn/studio Pro decision tree, or a generated block whose tokens override `docs/DESIGN.md` / compiled tokens instead of reconciling) |
| **scope** | `framework` |
| **failure** | UI built off-routing once shadcn/studio Pro is the default generator (V32.11): a component hand-written when a Pro block covers it · `/iui` used to re-explore design AFTER the Phase 3.3 freeze · a Pro block's own tokens left overriding `docs/DESIGN.md` instead of reconciling to compiled tokens (Rule 12). Result = design-contract drift + wasted effort. Codified with V32.11 adoption (no single dated incident — preventive, generalized from the recurring mockup→app drift failure mode that motivated Rules 31 & 12). |
| **standing_check** | At work-start before any UI-generation task (Phase 3.3 / 4 Parts 5-6 / 7) AND at done-claim: confirm the surface was routed through the **Design Generation Decision Tree** (`ui-rules.md`) — `/cui` for new pages/sections · `/iui` for a distinctive section (Phase 3.3 ONLY) · `/rui` to tweak · `/ftc` only with a Figma source + the Figma MCP — and that every generated block's tokens were reconciled to `docs/DESIGN.md` / compiled tokens, never overriding (Rule 12). Fallback = plain shadcn/ui MCP + Blocks when the Pro MCP is unreachable. |
| **check_location** | `ui-rules.md` "Design Generation Decision Tree" + `phases.md` Phase 3.3 / Parts 5-6 / Phase 7 MODEL HOOKs + `AI_Tools_Reference.md §2.5` |

_Promoted: 2026-06-23_

---

## framework.adoptability-assessment.client-vs-server-and-test-count

| Field | Value |
|---|---|
| **fingerprint** | `framework.adoptability-assessment.client-vs-server-and-test-count` |
| **machine_signature** | (AI-judged: a `register-to-aief` / `prep-sync` stack cross-reference flags a 🔴 "violation" that dissolves on one verification step) |
| **scope** | `framework` |
| **failure** | During the FRMS (V31) alignment check on 2026-06-25, the Explore-agent stack fingerprint produced TWO false-positive "violations": (1) flagged `ioredis` as a Valkey/Rule-14 violation ("Valkey missing") — but `ioredis` is the **client driver** BullMQ requires; the **server** is `valkey/valkey:7-alpine` in `deploy/compose/*/docker-compose.cache.yml`, connected via `REDIS_URL`. Rule 14 was satisfied. (2) Reported "147 test files exist but no runner" — it counted `node_modules/**/*.test.*`; git-tracked test files = 0 (`git ls-files '*.test.*' | grep -v node_modules`). The real state (zero test infra) was already a documented decision, not new drift. Both would have produced a wrong "blocking violation" verdict if reported unverified. |
| **standing_check** | Before reporting ANY 🔴 stack violation from an adoptability/alignment assessment: (a) for a "missing OSS service" (Valkey/MinIO/Postgres) check the **compose image** (the server), not just the Node deps (the client) — a client driver like `ioredis`/`pg`/`@aws-sdk/client-s3` connecting to the locked server is alignment, not violation; (b) count test/source files with `git ls-files <glob> \| grep -v node_modules \| wc -l`, NEVER a raw filesystem walk that includes `node_modules`. Treat a sub-agent's 🔴 as a hypothesis to verify, not a verdict. |
| **check_location** | `register-to-aief/SKILL.md` "Verify technicalities" step + `prep-sync` stack-diff step + `/memory reference_lessons_registry.md` |

_Promoted: 2026-06-25_

---

## framework.sync-tooling.whitelist-lags-new-deliverable

| Field | Value |
|---|---|
| **fingerprint** | `framework.sync-tooling.whitelist-lags-new-deliverable` |
| **machine_signature** | `grep -c '' <(comm -23 <(ls specdrivenprompt/ | sort) <(printf '%s\n' "${AI_PROMPT_FILES[@]}" deploy.sh | sort))` > 0 — a deliverable exists in source + is referenced by deploy.sh but is absent from sync-to-project.sh's AI_PROMPT_FILES whitelist |
| **scope** | `framework` |
| **failure** | RECURRING: `sync-to-project.sh`'s hardcoded `AI_PROMPT_FILES` whitelist lags when a new deliverable is added to the framework. `deploy.sh` (Group N) copies the file from `.ai_prompt/<file>` → its final home, but if `sync-to-project.sh` never STAGED it into `.ai_prompt/`, the deploy step silently no-ops and the app misses the deliverable. Hit 2026-06-18 (V32.7.2–V32.8 deliverables missing) and AGAIN 2026-06-30 (V32.17 `lint-design.sh` #26 missing → an FRMS V32.14→V32.18 sync would have shipped V32.18 security but no design anti-slop gate) and a THIRD time 2026-07-08 (`sync-context.sh` #27 (V32.20) + `spec-gap-check.sh` #28 (V32.21) BOTH absent → a CueLane V32.18→V32.24 sync bumped the version but `deploy.sh` Group 10 tried to place `sync-context.sh` and no-op'd because it was never staged). And a FOURTH time 2026-07-17 (`notifications.md` #30 (V32.28) absent from the array — caught DURING a full-fleet V32.28 sync of all 8 apps; had it not been caught, every app would have bumped to V32.28 but shipped no `notifications.md`). FOUR recurrences = the "add-to-whitelist" step keeps being skipped at deliverable-ship time; treat adding to the whitelist as a NON-OPTIONAL step of shipping any `.ai_prompt/`-staged deliverable. **✅ ENGINEERED OUT 2026-07-17 (permanent fix, owner-approved):** `sync-to-project.sh` now has **Gate 2b** — it parses the SOURCE `deploy.sh` for every `"$AI_PROMPT/<file>"` redistribution reference and HARD-FAILS (exit 3, names the missing file) if any is absent from `AI_PROMPT_FILES`. The requirement is now DERIVED from the actual consumer (deploy.sh), so a lagging array can no longer silently ship a version bump with a missing deliverable — it aborts the sync loudly instead. Verified with a positive (pass) + negative (removed `notifications.md` → exit 3) test. Adding a new `.ai_prompt/`-staged deliverable + its `deploy.sh` Group WITHOUT the array entry will now be caught automatically on the next sync. The dry-run "files → .ai_prompt/" count and the "All N whitelisted files present" string still drift cosmetically (26 → 30) but are no longer a correctness risk. |
| **standing_check** | When adding ANY new deliverable that deploys via `.ai_prompt/` staging, in the SAME change add its filename to `sync-to-project.sh` `AI_PROMPT_FILES` (or `ROOT_FILES`) AND bump the "All N whitelisted files present" message. Before any `prep-sync`/`register-to-aief` sync: run `bash sync-to-project.sh <APP> --dry-run` and confirm the staged-file list matches the current deliverable count (26 as of V32.18) — cross-check against `deploy.sh`'s GROUP copies. A deploy.sh Group that references `$AI_PROMPT/<file>` with no matching whitelist entry = the bug. |
| **check_location** | `sync-to-project.sh` `AI_PROMPT_FILES` array + the Gate-2 "All N whitelisted" message + `deploy.sh` GROUP copy blocks |

_Promoted: 2026-06-30_

---

## framework.auth.l6-guarded-prisma-in-authorize

| Field | Value |
|---|---|
| **fingerprint** | `framework.auth.l6-guarded-prisma-in-authorize` |
| **machine_signature** | Auth.js v5 `CallbackRouteError` whose cause is `Error: [L6 tenant-guard] No tenant context active. Wrap the call in withTenantContext(tenantId, fn).` — thrown from a credentials-provider `authorize()`; surfaces to the user as a generic "Invalid credentials". |
| **scope** | `framework` |
| **failure** | The framework's L6 Prisma guardrail (`tenantGuardExtension` via AsyncLocalStorage) requires every tenant-scoped query to run inside `withTenantContext()`. But Auth.js `authorize()` runs BEFORE any session/tenant context exists (login is what establishes it), so a tenant/username login that queries `prisma.tenant`/`prisma.user` via the L6-guarded client throws and every such login fails. Env-based providers (platform super-admin) never touch Prisma, so the bug stays LATENT until tenant login is exercised — Phase 5 validation that only tests super-admin login will pass while tenant login is silently broken. Hit on CueLane 2026-07-08 (Phase-4 scaffold shipped it; surfaced at Phase-7 first real login). |
| **standing_check** | Any Prisma call on a pre-session/bootstrap path — a credentials `authorize()`, edge/middleware pre-auth resolution, or tenant-provisioning bootstrap — MUST use the UNGUARDED client (`prismaRaw`, the pre-`$extends` `PrismaClient`), NOT the L6-guarded `prisma`. Keep the query manually scoped (`where: { tenantId: resolvedTenant.id }`) so isolation is preserved. `withTenantContext()` cannot wrap the tenant-resolution query itself (you resolve tenant-by-slug before you have its id), so `prismaRaw` is the correct tool. Phase 5 validation MUST exercise BOTH a super-admin login AND a tenant/username login end-to-end, not just super-admin. |
| **check_location** | `apps/web/src/server/auth/config.ts` credentials `authorize()` — grep `prisma\.` (a guarded `prisma.` rather than `prismaRaw.` inside authorize is the bug); Phase 5 validation login E2E; `security.md` L6 section |

_Promoted: 2026-07-08_

---

## framework.deploy.compose-envfile-bcrypt-dollar-interpolation

| Field | Value |
|---|---|
| **fingerprint** | `framework.deploy.compose-envfile-bcrypt-dollar-interpolation` |
| **machine_signature** | `docker exec <app> printenv SUPER_ADMIN_PASSWORD_HASH \| wc -c` returns far short of ~60 (e.g. 6: `$2a$10`), while the same key in the gitignored `.env.*` is a full 60-char `$2a$10$…` hash. Credentials login fails ("Invalid credentials") though the file hash is correct. |
| **scope** | `framework` |
| **failure** | Docker Compose INTERPOLATES `env_file` values. A bcrypt hash `$2a$10$<salt><digest>` contains `$`-sequences; compose expands `$2a`,`$10`,`$<salt…>` as (undefined) variables and drops them, so the container receives a TRUNCATED/mangled hash and every credential login against it fails. NON-DETERMINISTIC: a hash survives only when the char right after a `$` cannot start a variable name (e.g. `$/`, `$.`), so a previously-seeded hash can work by luck while a freshly-generated one silently breaks — making it look like a password mismatch rather than an escaping bug. Hit on CueLane 2026-07-10 re-seeding `SUPER_ADMIN_PASSWORD_HASH`. |
| **standing_check** | Any bcrypt/argon secret written into a `.env.*` that is consumed by docker-compose `env_file:` MUST `$$`-escape every `$` (compose unescapes `$$`→`$`). Seeders/deploy templates that emit a hash into `.env` should `$$`-escape by default. ALWAYS verify at the container, not just the file: `docker exec <app> printenv <HASH_KEY> \| wc -c` ≈ 60 AND `bcryptjs.compareSync(password, <container-hash>)===true`. Comparing the in-file value vs the in-container `printenv` value is the direct tell (differ ⇒ interpolation ate the `$`). |
| **check_location** | `deploy/compose/*/docker-compose.app.yml` (`env_file:` services) + `.env.*` `*_PASSWORD_HASH` keys + any seeder that writes a bcrypt hash into an env file consumed by compose |

_Promoted: 2026-07-10_

---

## framework.rbac.tenant-3tier-and-custom-role-matrix

| Field | Value |
|---|---|
| **fingerprint** | `framework.rbac.tenant-3tier-and-custom-role-matrix` |
| **machine_signature** | (AI-judged: a tenant app whose `UserRole` was DROP/CREATE-renamed; a `tenant_superadmin` uniqueness enforced by a NON-partial index (breaks the tenant_id-NULL platform manager) or not at all; a custom role that grants Billing/User-Management or exceeds the tenant_admin ceiling; RBAC enforced from client-supplied role/permission or from a hardcoded enum switch instead of the matrix) |
| **scope** | `framework` |
| **failure** | Ad-hoc per-app RBAC diverges from the fleet standard and repeats avoidable defects: (1) renaming a tenant role enum via DROP/CREATE loses every existing user's role; (2) a non-partial unique index on `(tenant_id) WHERE role='tenant_superadmin'` either blocks the platform `tenant_manager` (tenant_id NULL) or, if omitted, lets two owners exist per tenant; (3) an owner-transfer done as a naive double-write trips the one-owner index mid-swap; (4) a custom sub-role silently granted Billing or User Management, or enforcement read from client input / a hardcoded nav switch, escalates privilege. Codified 2026-07-10 with the V32.25 Tenant RBAC Standard (MG `feat/tenant-rbac-3tier` reference impl). |
| **standing_check** | At work-start before any auth/RBAC/user-management/role-builder task AND at done-claim: (a) any tenant-role rename uses `ALTER TYPE … RENAME VALUE` (data-preserving), NEVER DROP/CREATE; (b) exactly one owner per tenant is enforced by a PARTIAL unique index `unique(tenant_id) WHERE role='tenant_superadmin' AND tenant_id IS NOT NULL` (platform tenant_manager exempt); (c) succession (platform reassign + owner transfer) is mediated **promote-then-demote inside one transaction** so the index is never violated; (d) custom roles are tenant-scoped, strictly ≤ the tenant_admin ceiling, and NEVER grant Billing or User Management; (e) enforcement is matrix-driven **deny-by-default** at tRPC + route middleware + sidebar nav, derived from the session — never from client input or a hardcoded enum. |
| **check_location** | `.ai_prompt/rbac.md` (Parts A–C) + `scenarios.md` Scenario 42 + `phases.md` Phase 4 Part 3 seed/RBAC MODEL HOOK + `security.md` L3 RBAC block + `Security_Checklist.md` §21 |

_Promoted: 2026-07-10_

---
