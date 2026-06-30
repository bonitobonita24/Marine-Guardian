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
| **failure** | RECURRING: `sync-to-project.sh`'s hardcoded `AI_PROMPT_FILES` whitelist lags when a new deliverable is added to the framework. `deploy.sh` (Group N) copies the file from `.ai_prompt/<file>` → its final home, but if `sync-to-project.sh` never STAGED it into `.ai_prompt/`, the deploy step silently no-ops and the app misses the deliverable. Hit 2026-06-18 (V32.7.2–V32.8 deliverables missing) and AGAIN 2026-06-30 (V32.17 `lint-design.sh` #26 missing → an FRMS V32.14→V32.18 sync would have shipped V32.18 security but no design anti-slop gate). The dry-run "files → .ai_prompt/" count and the "All N whitelisted files present" string also drift. |
| **standing_check** | When adding ANY new deliverable that deploys via `.ai_prompt/` staging, in the SAME change add its filename to `sync-to-project.sh` `AI_PROMPT_FILES` (or `ROOT_FILES`) AND bump the "All N whitelisted files present" message. Before any `prep-sync`/`register-to-aief` sync: run `bash sync-to-project.sh <APP> --dry-run` and confirm the staged-file list matches the current deliverable count (26 as of V32.18) — cross-check against `deploy.sh`'s GROUP copies. A deploy.sh Group that references `$AI_PROMPT/<file>` with no matching whitelist entry = the bug. |
| **check_location** | `sync-to-project.sh` `AI_PROMPT_FILES` array + the Gate-2 "All N whitelisted" message + `deploy.sh` GROUP copy blocks |

_Promoted: 2026-06-30_

---
