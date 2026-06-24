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
| `framework` | a deliverable (`lint-deploy.sh`, `templates.md` rule, phase output contract) | `deploy-v31.sh` |
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
  output contract); verify `deploy-v31.sh` ships it to new apps; append entry here.
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
| **check_location** | `ui-rules.md` "Design Generation Decision Tree" + `phases.md` Phase 3.3 / Parts 5-6 / Phase 7 MODEL HOOKs + `AI_Tools_Skills_MCPs_Reference_v31.md §2.5` |

_Promoted: 2026-06-23_

---
