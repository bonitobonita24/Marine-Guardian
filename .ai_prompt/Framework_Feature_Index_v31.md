# Spec-Driven Platform — Framework Feature Index

> **Purpose:** Human-readable reference for all framework capabilities.  
> Covers current state, decision rationale, and change history per feature.  
> Updated alongside every version bump. Agents do not read this file — it is for Bonito only.  
> Current framework version: **V32.14** (V31 base + V32 Zero Opus Execution + V32.1 Sonnet context-overhead operational note + V32.1.1/V32.1.2/V32.1.3/V32.1.4/V32.1.5 patches + V32.2 Dispatch Discipline R6-R9 + tightened-DONE + V32.3 Smart Governance Hydration — R6 allow-list size qualifier (>200 lines via Scout with Governance Extraction Schema) + V32.4 react-doctor Phase Integration (per-phase React diagnostics skill at Phase 4 Parts 5-6 / Phase 5 / Phase 7) + V32.4.1 post-ship consistency sweep + V32.5 Designer-Skills Phase Integration (designer-skills bundle prescribed at Phase 2.8 / Phase 4 Parts 5-6 / Phase 7 with INHERIT-not-REPLACE contract over PA's DESIGN.md + MOCKUP.jsx — no count change) + V32.5.1 Designer-Skills Gate-Closure Enforcement + Governance Hook Repair (gate-closure language added to all three V32.5 MODEL HOOKs; memory-governance.md §3 hook template bumped (V32)→(V32.3); §3 enumerates 13 phase hooks; Output Equivalence Guarantee + Prompt 3.19 rescue pointer documented; Prompt_References gains "How the Mega Prompt Works" overview — no count change) + V32.5.2 Prompt_References HTML Parity Fix (HTML "How the Mega Prompt Works" section brought to full content parity with markdown — 3 cosmetic deltas closed, no behavior change) + V32.5.3 Clean-Slate Rebuild Scenario (Prompt 3.23 added — three-stage nuke + rebuild flow preserving docs/ + CREDENTIALS.md + .env*; count bump 60→61 prompts / 37→38 NEW ✨) + V32.5.4 Cosmetic Sweep + Changelog Reorder (3 minor V32.5.3 audit findings closed — HTML callout class parity in 3.23, ChatGPT audit verified-counts heading label bump, Master Prompt V32.4.1 reorder above V32.5; zero count/behavior change) + V32.5.5 DECISIONS_LOG ↔ PRODUCT.md Back-Port Surface Check (non-blocking Phase 7 + Phase 8 pre-flight MODEL HOOK — Sonnet Scout surfaces "📋 Back-Port Candidates" where locked DECISIONS_LOG.md decisions never made it back into PRODUCT.md; surface-and-inform only, Rule 1 unchanged — PRODUCT.md stays human-only; zero count/behavior change) + V32.6 Interactive Prototype & Simulation Phase (new Phase 3.3 between Phase 3 and Phase 3.5 — client-validated interactive prototype with project-defined simulated backend; design-system finalization moved to Phase 3.3; hard gate before Phase 3.5; zero count change) + V32.6.1 Prompt 3.23.C Semantic Shift (auto-rebuild paste-prompt removed; replaced with manual-handoff card pointing at Prompt 1.3.1 Phase 0 Bootstrap + optional Prompt 2.9 pre-check; closes the autopilot/thrashing surface in clean-slate recovery + forces the rebuild back through the V32.6 Phase 3.3 hard gate; zero count/rule/scenario/prompt/bootstrap/phase-hook change) + V32.7 Detail-File Relocation (all 7 detail files relocated from always-on .claude/rules/ to on-demand .ai_prompt/; CLAUDE.md is now the ONLY auto-loaded file; ~24 pre-flight Read-hardening edits in phases.md + memory-governance.md; counts unchanged: 17 deliverable files relocated not added, 30 rules, 35 scenarios, 61 prompts, 14 phase hooks); filenames retain `_v31_` for deploy script backward compatibility — content describes current V32.7 behavior) + V32.7.1 Planning Assistant Dual-Host (Claude Code preferred path + Claude.ai fallback; docs-only patch, zero count change) + V32.7.2 TODO-7a Levers 2-3 (spec-executor.md custom Sonnet executor subagent + settings.json skill-budget caps; deliverable count 17→19) + V32.7.3 Design Baseline Back-Port Surface Check (non-blocking Phase 7 + Phase 8 pre-flight MODEL HOOK — Sonnet Scout diffs live globals.css/Tailwind theme tokens against the docs/DESIGN.md + docs/MOCKUP.jsx baseline and surfaces "🎨 Design Back-Port Candidates" where an owner-approved post-Phase-3.3 design change never made it back into the baseline; INHERIT-not-REPLACE back-port to DESIGN.md + MOCKUP.jsx; closes framework TODO-21; design analogue of V32.5.5, surface-and-inform only, Rule 1 unchanged; zero count change) + V32.7.4 lint-deploy.sh Phase 5/6 Gate Wiring (`scripts/lint-deploy.sh` named as the pre-deploy footgun gate in phases.md Phase 5 OUTPUT CONTRACT + Phase 6 PRE-DEPLOY FOOTGUN GATE — C1–C8 checks; tooling-gate reference, deliverable count unchanged at 19) + V32.7.5 lint-deploy.sh Promoted to Deliverable #20 (deploy-v31.sh now copies lint-deploy.sh to target scripts/lint-deploy.sh with chmod +x so the V32.7.4 gate exists in target apps; deliverable count 19→20; all other counts unchanged) + V32.8 Design-as-Contract + Verifiable-Done + Learning Loop (Rule 31 Style Dictionary v5 compiled token pipeline + Playwright visual-diff gate; Rule 32 evidence-backed DONE + LESSONS_REGISTRY + Stop-hook; Rules 30→32 · Scenarios 35→39 · UI-rules 11→12 · Phase-hooks 14→17 · Bootstrap-steps 19→20 · Deliverables 20→22 · Memory-governance sections 5→6) + V32.8.1 Drop getdesign.md/awesome-design-md (shadcn/ui CSS variables are the only design-token source; PA derives values from named direction, no external catalog; docs-only patch, zero count change) + V32.9 Compliance & Data Privacy Layer (Rule 33 PH Data Privacy Act / RA 10173 + NPC compliance; privacy.md deliverable #23; WCAG 2.2 AA hard-gate for PH gov/LGU apps; ASVS 5.0 + OWASP Top 10:2025 security refresh; ComplianceFooter component; ph-data-privacy + accessibility-agents skills; PA §12 + interview Qs; Hook 18 Compliance/Data-Privacy Gap-Surfacing; PA Rules 11→12; Rules 32→33 · Deliverables 22→23 · UI-rules 12→13 · Phase-hooks 17→18 · Checklist 84→98 items / 13→14 sections · PRODUCT.md 11→12 sections) + V32.10 Mandatory Compose Resource Limits (top-level mem_limit/mem_reservation/cpus on stage/prod services; per-role default table; DB mem_limit must exceed buffer-pool; dev exempt; zero count change; templates.md only) + V32.11 shadcn/studio Pro as Default Design Generator (the owner's licensed shadcn/studio Pro MCP — user-global, build-time, output = plain shadcn/ui — becomes the framework's default design generator, phase-routed: Phase 3.3 /cui→/iui→/rui trio · Parts 5-6 /cui+/rui design-frozen · Phase 7 /cui+/iui+/rui · /ftc Figma-conditional; INHERIT-not-REPLACE over docs/DESIGN.md per Rule 12; fallback = plain shadcn/ui MCP + Blocks; new AI_Tools §2.5; MCP servers 4→5; all other counts unchanged) + V32.12 Design-Principles On-Demand Reference (new on-demand deliverable `.ai_prompt/design-principles.md` — library-agnostic UI/UX principles: hierarchy & layout, spacing, typography, the 9-state control contract, UX laws, WCAG by success-criterion + QA checklist; condensed from typeui.sh fundamentals (MIT); read at design phases 2.8/3.3/Parts5-6/Phase 7 when docs/DESIGN.md / ui-rules.md silent on a pattern, state, or a11y approach; INHERIT-not-REPLACE; PA Step 7b.2 QA gate hardened; Deliverables 23→24; all other counts unchanged) + V32.13 CI → Docker Hub → Komodo-API Auto-Deploy (fleet Watchtower-free standard: push-to-main → build+push image → Komodo API redeploys staging with the exact SHA — UpdateVariableValue pins <APP>_STAGING_TAG → DeployStack → poll GetUpdate; replaces the V27 registry-poll + Watchtower for app deploys, because Komodo's git webhook doesn't fire for files-on-host stacks; proven by fmo-fisherfolk; app-side `deploy/komodo-deploy.sh` + `.github/workflows/docker-publish.yml` vendored from Server-Setups; staging compose image `${STAGING_IMAGE_TAG:-staging-latest}` + Komodo stack env `STAGING_IMAGE_TAG=[[<APP>_STAGING_TAG]]`; prod NEVER auto-deployed — manual promotion only; templates.md Rule 5c + phases.md Phase 6; Phase-6 scaffold templates not deliverables; ZERO count change — 24 deliverables / 33 Rules / 39 Scenarios / 61 Prompts / 18 Phase Hooks / 5 MCP servers all unchanged) + V32.14 Motion Layer (new on-demand deliverable `.ai_prompt/motion.md` — library-agnostic UI/UX motion principles: when/when-not to animate, easing-by-intent, duration budgets, transform+opacity-only performance rule, prefers-reduced-motion first-class + WCAG SC 2.3.3 tie, spring-vs-tween, CSS-vs-JS, Motion+Tailwind appendix; read at design phases 3.3/Parts5-6/Phase 7 when docs/DESIGN.md / ui-rules.md silent on a motion/timing/reduced-motion pattern + new ui-rules.md Rule 14 "Motion & Micro-interactions" — Motion (motion.dev) only prescribed lib, LazyMotion/mini default, mandatory useReducedMotion() ties R13 WCAG gate, transform/opacity only, GSAP opt-in on PRODUCT.md signal, Three.js/R3F parked; INHERIT-not-REPLACE over DESIGN.md motion tokens; motion principles informed by Emil Kowalski's "Animations on the Web" (animations.dev) + MIT emilkowalski/skills + vercel-labs/open-agents; UI rules 13→14 · Deliverables 24→25; all other counts unchanged)

---

## How to Use This Document

- **Scanning:** Jump to any domain section to see what the framework can do in that area.
- **Before adding a feature:** Check the relevant section first — it may already exist or have been tried before.
- **After a version bump:** Add an entry to the Change History block of each affected feature.
- **Status legend:**
  - `ACTIVE` — always-on, generated by default
  - `OPTIONAL` — exists but requires a flag or install step to activate
  - `CONDITIONAL` — generated only if a specific inputs.yml flag is set
  - `DEPRECATED` — replaced by something better, no longer used
  - `LEGACY` — historically documented, no longer part of active system

---

## Table of Contents

1. [Agent Stack](#1-agent-stack)
2. [Dev Environment](#2-dev-environment)
3. [Governance Documents](#3-governance-documents)
4. [Phase System](#4-phase-system)
5. [Infrastructure — Docker Compose Services](#5-infrastructure--docker-compose-services)
6. [Port Strategy](#6-port-strategy)
7. [Secret Generation & Credentials](#7-secret-generation--credentials)
8. [Database Layer](#8-database-layer)
9. [Application Layer](#9-application-layer)
10. [Security Layer](#10-security-layer)
11. [Mobile Support](#11-mobile-support)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Design System](#13-design-system)
14. [Codebase Intelligence](#14-codebase-intelligence)
15. [Change Attribution & Memory](#15-change-attribution--memory)
16. [Multi-Tenancy](#16-multi-tenancy)
17. [Error Triage System](#17-error-triage-system)
18. [Scenarios Index](#18-scenarios-index)
19. [Rules Index](#19-rules-index)
20. [UI Component Ecosystem](#20-ui-component-ecosystem)

---

## 1. Agent Stack

> **Count note:** The official V31 count is **6 in-project agents** (Claude Code, Cline, Copilot, SpecStory, SocratiCode, code-review-graph — entries 1.2 through 1.7 below). **Claude.ai (1.1)** is listed for completeness but is EXTERNAL to the project — the Planning Assistant runs on claude.ai and never touches project files. It is not counted in the 6-agent total.

### 1.1 Claude.ai (Planning Agent — EXTERNAL, not counted in 6-agent stack)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V10 |
| Role | PRODUCT.md planning, Phase 2 spec interview |
| Model | Claude Sonnet (auto — no config needed) |
| File loaded | Planning Assistant prompt (pasted as first message) |

**Decision:** Planning uses Claude Sonnet via claude.ai because product architecture decisions require strong reasoning. Not replaced by cheaper models.

**Change history:**
- V10: Initial role defined
- V12: Planning Assistant updated — Design Identity interview steps added
- V14: Planning Assistant updated — git strategy + model routing questions added to Section I
- V15: Docker Hub publishing question added to Section I
- V16: pgAdmin noted in Infrastructure Notes template
- V17: CREDENTIALS.md noted in Infrastructure Notes template
- V18: Security defaults noted in Infrastructure Notes template

---

### 1.2 Claude Code (Primary Agent — current V32.13 behavior, V31 base)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V10 |
| Role | Primary agent (V31). ALL phases — Bootstrap through Phase 8, Feature Updates, Resume, Gov Sync, Retro. Opus 4.6 = Architect (planning, decomposition, review). Sonnet 4.6 = Executor (implementation, tests, commits). See memory-governance.md Section 4. |
| Model | Claude Opus 4.6 (Architect) + Claude Sonnet 4.6 (Executor) via Claude Code CLI |
| File loaded | Compact CLAUDE.md (~200 lines, auto-loads). Reads `.ai_prompt/` on-demand per task (V32.7 — `.claude/rules/` is intentionally empty) |
| Install | `npm install -g @anthropic-ai/claude-code` in WSL2 terminal |
| Launch | `claude` or `claude --dangerously-skip-permissions` |

**Decision:** CLAUDE.md auto-load eliminates manual pasting. `--dangerously-skip-permissions` flag is safe for solo dev on own machine — backed by Rule 23 git branches as safety net. V30 promotes Claude Code to primary for ALL phases — Cline becomes fallback.

**Change history:**
- V10: Initial role
- V13: WSL2 native (MODE A) confirmed as primary flow — Claude Code runs from WSL2 terminal, not devcontainer
- V14: STATE.md read before 9 governance docs (Rule 24) — Claude Code auto-reads on session start
- V14: Two-stage review (Rule 25) enforced for Feature Updates via Claude Code
- V30: Promoted to primary agent for ALL phases. Claude Sonnet 4.6. Compact CLAUDE.md + .claude/rules/ architecture
- V31.1: Architect-Execute Model — Opus 4.6 plans/decomposes, dispatches Sonnet 4.6 subagents. Memory Governance Layer (`.claude/rules/memory-governance.md`)
- V32: Zero Opus Execution — Opus 4.6 NEVER calls Edit/Write on project files; ≤ 500 line dispatch cap via `wc -l`; Opus executor path REMOVED.
- V31.2: 30K Token Budget Gate — every Sonnet subagent task must estimate ≤30K tokens; split further if over. Opus Escalation for genuinely atomic tasks >30K. THRASHING status detection.

---

### 1.3 Cline (⚠ DEPRECATED — do not use)
| Field | Value |
|---|---|
| Status | ⚠ DEPRECATED (V31) — do not use |
| Added | V10 |
| Role | Deprecated. Claude Code handles all work Cline used to handle. .clinerules still generated by Bootstrap Step 3 but nothing actively reads it. Kept in framework for historical reference only. |
| Default model | N/A — deprecated |
| Config | .clinerules file still generated for historical parity (Bootstrap Step 3) — not actively used |
| Task files | .cline/tasks/ directory created by Bootstrap but unused |

**Why deprecated:** In practice, Claude Code handles all execution reliably. Cline routing added complexity without benefit. Framework retains `.cline/` folder structure because memory files (`lessons.md`, `STATE.md`, `handoffs/`) are still used by Claude Code — those folder names are preserved for historical continuity.

**Change history:**
- V10: Initial role
- V13: MiniMax M1 confirmed as default free-tier model
- V14: MiniMax M1 explicitly named, model routing formalised in inputs.yml
- V14: Fresh context per Phase 4 Part — 8 separate task files replace single autorun
- V19: MiniMax M2.5 confirmed as default (upgraded from M1 — 80.2% SWE-Bench score)
- V30: Demoted to fallback builder. Claude Code became primary for ALL phases.
- V31: ⚠ DEPRECATED — do not use. In-place update (no version bump). Claude Code handles everything. `.clinerules` still generated by Bootstrap but unused in active work.

---

### 1.4 GitHub Copilot (Inline + Fallback Agent)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V10 |
| Role | Inline autocomplete, Copilot Chat for quick fixes, PR review |
| Attribution | SpecStory passive capture + Governance Sync reconciliation |
| Limitation | NEVER use for Phase 4, 5, or 6 — no agentic loop |

**Change history:**
- V10: Initial role
- V11: Attribution via SpecStory history diffs (Rule 19)
- V11: Scenario 18 added — Copilot attribution and governance workflow

---

### 1.5 SocratiCode (Codebase Intelligence MCP)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V10 |
| Role | Semantic codebase search, context-efficient reading |
| Launch | `npx @giancarloerra/socraticode` (not a project dependency) |
| Config | `.socraticodecontextartifacts.json` in project root |
| Rule | Rule 17 — search before reading |

**Decision:** SocratiCode reduces context usage by 61% and tool calls by 84% versus grep. Not a project dependency — runs externally.

**Change history:**
- V10: Initial integration, Rule 17 added
- V12: `.socraticodecontextartifacts.json` MERGE instruction added — never overwrite, preserve design-system entry
- V14: codebase_update called after every Feature Update squash-merge

---

### 1.6 SpecStory (Passive Change Capture)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V11 |
| Role | Passively captures all agent session diffs to `.specstory/history/` |
| Config | `.specstory/config.json` (written by Bootstrap) |
| Rule | Rule 19 — SpecStory is passive change capture layer |

**Decision:** Bridges the attribution gap between what agents built and what governance docs recorded. Append-only history — never delete entries.

**Change history:**
- V11: Elevated from "with Copilot" to dedicated passive capture layer
- V11: Governance Sync reads `.specstory/history/` for reconciliation (Scenario 17)
- V16: Bootstrap writes `v16-master-prompt.md` → bumped each version

---

### 1.7 code-review-graph (Structural Blast-Radius MCP)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V29 |
| Role | Tree-sitter graph + SQLite structural analysis. Answers "what breaks if I change this?" during Phase 7 Feature Updates |
| Config | Claude Code plugin — installed once per machine via `claude plugin add tirth8205/code-review-graph` |
| Phase boundary | Phase 7 (Feature Updates) — called before every implementation |
| Tool | `get_impact_radius_tool` — returns transitive dependencies + test coverage for changed symbols |

**Decision:** Complements SocratiCode (semantic search) with structural precision. SocratiCode answers "where is X used?"; code-review-graph answers "if I change X, what breaks?". Both together make Phase 7 surgical rather than speculative.

**Change history:**
- V29: Added to agent stack as structural blast-radius tool
- V29: Phase 7 Step 3 mandates `get_impact_radius_tool` before implementation

---

## 2. Dev Environment

### 2.1 MODE A — WSL2 Native (Recommended)
| Field | Value |
|---|---|
| Status | ACTIVE — default for solo Windows dev |
| Added | V13 |
| Stack | Node 22 via nvm, pnpm native in WSL2, Docker Desktop for services only |
| Launch | `code .` from WSL2 terminal (Remote-WSL extension) |
| Claude Code | Runs from WSL2 terminal — `claude` |
| Docker | Services only (PostgreSQL, Valkey, MinIO, pgAdmin etc.) |

**Decision:** Eliminates 4 layers of virtualisation. No EACCES errors, no shell server crashes, no devcontainer permission issues. Docker Desktop runs backing services only — never the app.

**Change history:**
- V13: Introduced as default recommended mode after multiple devcontainer failures
- V13: All 88 devcontainer references audited and qualified as MODE A or MODE B
- V25: MODE A is now the ONLY supported dev environment — MODE B fully removed from system

---

### 2.2 MODE B — Devcontainer (LEGACY — removed in V25)
| Field | Value |
|---|---|
| Status | LEGACY — fully removed in V25. Not part of the active system. |
| Was added | V10 (as primary), demoted to optional in V13, removed in V25 |
| Removal reason | WSL2 + Docker Desktop + devcontainer = 4 virtualisation layers causing EACCES, shell server crashes (code 4294967295), and DinD socket failures. WSL2 native eliminates all of this. |

**Historical lessons (kept for reference — not applicable to V25+):**
- `corepack enable` → EACCES error — use `npm install -g pnpm` instead
- `docker-outside-of-docker` feature → incompatible with WSL2 + Docker Desktop
- Shell server terminated code 4294967295 → split postCreateCommand into onCreateCommand + postStartCommand
- node:22-bullseye-slim was the correct base image (not alpine, not fat node:22)

**Change history:**
- V10: Primary dev environment
- V12: Dockerfile with Docker CLI + socket mount added for DinD
- V13: Demoted to optional — MODE A becomes default
- V25: **Fully removed.** All devcontainer/DinD/MODE B references stripped from all 5 framework files.

---

### 2.3 STATE.md — Session Zero Quick-Read
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V14 |
| Location | `.cline/STATE.md` |
| Read order | FIRST — before 9 governance docs |
| Written by | Claude Code after every task (folder path preserved for historical continuity — Cline deprecated V31) |
| Contents | Current phase, last done, next step, blockers, git branch, ports, models |
| Committed | YES — shared project dashboard, not gitignored |

**Decision:** Agents were wasting context reading all 9 docs just to answer "where am I?" STATE.md answers that in 10 lines.

**Change history:**
- V14: Introduced alongside Rule 24

---

## 3. Governance Documents

### 3.1 The 9 Governance Docs
| # | File | Owner | Purpose |
|---|---|---|---|
| 1 | `docs/PRODUCT.md` | HUMAN | Only file humans edit — single source of truth |
| 2 | `inputs.yml` | AGENT | Full app spec derived from PRODUCT.md + Phase 2 |
| 3 | `inputs.schema.json` | AGENT | JSON Schema validation for inputs.yml |
| 4 | `docs/CHANGELOG_AI.md` | AGENT | Every change attributed to agent (Rule 15) |
| 5 | `docs/DECISIONS_LOG.md` | AGENT | All locked architectural decisions |
| 6 | `docs/IMPLEMENTATION_MAP.md` | AGENT | Current build state snapshot |
| 7 | `project.memory.md` | AGENT | Active rules + agent stack summary |
| 8 | `.cline/memory/lessons.md` | CLAUDE_CODE | Typed error learnings (Rule 18) — read FIRST (folder path preserved for historical continuity) |
| 9 | `.cline/memory/agent-log.md` | ALL | All agents append attribution entries |

**Additional:** `.cline/STATE.md` — read before the 9 docs (V14+)

**Lessons.md typed format (Rule 18):**
| Icon | Type | When to use |
|---|---|---|
| 🔴 | CRITICAL | Breaking error, permanent fix needed |
| 🟡 | WARNING | Non-breaking but important |
| 🟤 | CONTEXT | Background knowledge, "why" not "what" |
| ⚖️ | DECISION | Architectural choice with rationale |
| 🟢 | SUCCESS | What worked, repeat this |

**Change history:**
- V10: 9 docs established
- V11: lessons.md typed format introduced (Rule 18)
- V11: Private tag `<private>` support added to PRODUCT.md (Rule 20)
- V14: STATE.md added as pre-read before all 9 docs (Rule 24)
- V14: Log Lesson script added — human can log to lessons.md without agent

---

### 3.2 CREDENTIALS.md
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V17 |
| Generated by | Phase 3 (immediately after env files) |
| Location | Project root |
| Gitignore | MANDATORY — enforced in 4 places |
| Contents | All credentials for all services across dev/staging/prod in one table |
| Agent rule | NEVER read back into context, NEVER in governance docs |

**Services covered:** PostgreSQL, PgBouncer, Valkey, MinIO, pgAdmin, Auth Secret (JWT), SMTP

**4 enforcement points for gitignore:**
1. Bootstrap Step 16 — writes initial .gitignore with CREDENTIALS.md
2. Phase 3 gitignore block — listed alongside .env files
3. Phase 4 Part 1 — idempotent check on every scaffold
4. .clinerules ENV FILE RULES — agents check on every task start

**Hard rules:**
- If not in .gitignore → STOP, add it, log 🔴 gotcha, abort task
- If `git status` shows it tracked → `git rm --cached CREDENTIALS.md` immediately
- Never read file into any LLM context or tool call

**Change history:**
- V17: Introduced — replaced need to open multiple .env files

---

### 3.3 Memory Governance Layer (V31.2)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V31.1 |
| Location | `.ai_prompt/memory-governance.md` (V32.7 — was `.claude/rules/memory-governance.md` in V32.6.1 and earlier) |
| Auto-install | `/scan-project` detects and installs on Spec-Driven projects |
| Applies to | ALL phases — hooks injected into every phase pre-flight |

**What it does:** Prevents context thrashing via 5 integrated systems:
1. **Tiered Decomposition (Section 1)** — 3-tier complexity classifier with scoring formula. Runs at pre-flight before any phase/part/batch.
2. **Smart Checkpoint (Section 2)** — auto-persists progress to STATE.md + Claude Code memory + lessons.md after significant changes. Enables zero-cost session resume.
3. **Phase Hooks (Section 3)** — one-liner hooks in every phase pre-flight (12 injection points).
4. **Architect-Execute Model — Zero Opus Execution (Section 4, V32)** — Opus 4.6 plans/decomposes/reviews ONLY (never Edit/Write on project files); Sonnet 4.6 executes ALL file writes via `Agent(model: "sonnet")` subagents, each task ≤ 500 lines via `wc -l` gate.
5. **30K Token Budget Gate (Step 2.5/2.5b)** — every Sonnet task must estimate ≤30K tokens before dispatch; split further if over. If genuinely atomic and unsplittable, escalate to `Agent(model: "opus")` (100K budget, max 20% of tasks). THRASHING status detected by Opus triggers stop + re-decompose.

**Mid-project adoption:** Section 5 provides a 4-step adoption path for projects already in Phase 7/8, plus an emergency thrashing recovery protocol.

**Decision:** Standalone governance file + phase hooks (not embedded in phases.md). Keeps the module self-contained and referenceable while ensuring every phase enforces it.

**Change history:**
- V31.1: Introduced — designed specifically to solve Phase 7/8 thrashing on mature projects
- V31.2: Added 30K Token Budget Gate (Step 2.5), Opus Escalation (Step 2.5b), and THRASHING status detection

---

## 4. Phase System

### 4.1 Phase Overview
| Phase | Who | When | What |
|---|---|---|---|
| 0 — Bootstrap | Claude Code AUTO | Once per project | Folders, CLAUDE.md, .clinerules, governance templates, STATE.md |
| 1 — Open Dev Env | HUMAN | Once per project | WSL2 native setup (MODE A — only supported mode, V25) |
| 2 — Discovery Interview | Claude Code | Once per project | PRODUCT.md → inputs.yml spec questions |
| 2.5 — Spec Summary | Claude Code | After Phase 2 | Decision summary, confirm before generating |
| 2.6 — Design System | Claude Code AUTO | Optional, after 2.5 | MASTER.md from Design Identity section |
| 3 — Generate Spec Files | Claude Code | Once per project | inputs.yml, env files, CREDENTIALS.md, DECISIONS_LOG |
| 4 — Full Scaffold | Claude Code Part-by-Part | Once per project | Full monorepo across 8 Parts, fresh session each |
| 5 — Validation | Claude Code — human trigger | After Phase 4 | 9 validation commands, self-heal |
| 6 — Docker Start | Claude Code — human trigger | After Phase 5 | Compose up, migrate, seed, Visual QA |
| 6.5 — Error Triage | Claude Code AUTO | On failure | 16-category triage system (V25 — 5 devcontainer-only categories removed) |
| 7 — Feature Update | Claude Code AUTO | Forever loop | Branch → build → 2-stage review → squash-merge |
| 7R — Feature Rollback | Claude Code | On request | Find in CHANGELOG, down-migrate, revert |
| 8 — Iterative Buildout | Claude Code AUTO | After first run | Batch builds with adaptive replanning |

> **Cline deprecated V31 (in-place update):** All phase routing above was Cline in V30. V31 reassigns all phases to Claude Code. Cline extension may remain installed in VS Code as optional emergency fallback but framework itself never routes to it.

**Phase 4 — 8 Parts (V14+, fresh session each):**
| Part | What it builds |
|---|---|
| 1 | Root config (pnpm, turbo, tsconfig, eslint, prettier) |
| 2 | packages/shared + packages/api-client |
| 3 | packages/db (Prisma schema, migrations, RLS, seed) |
| 4 | packages/ui + packages/jobs + packages/storage |
| 5 | apps/[web] (Next.js full scaffold + security layer) |
| 6 | apps/[mobile] (Expo — skip if not declared) |
| 7 | tools/ + deploy/compose/ + K8s scaffold + SocratiCode |
| 8 | CI + governance docs + MANIFEST.txt + SocratiCode index |

**Change history:**
- V10: Phases 0–8 established
- V11: Phase 7 step 6 added — private tag strip before processing
- V12: Phase 2.6 added — automated design system generation
- V13: Phase 6 rewritten — MODE A runs from WSL2, MODE B from devcontainer
- V14: Phase 4 split into 8 fresh-context Parts (Rule 24)
- V14: Phase 7 git branch creation + TDD + two-stage review + squash-merge added (steps renumbered 1→19)
- V14: Phase 8 adaptive replanning block after every batch
- V15: Phase 3 generates docker section in inputs.yml
- V16: Phase 3 generates pgAdmin credentials
- V17: Phase 3 generates CREDENTIALS.md

---

## 5. Infrastructure — Docker Compose Services

### 5.1 Service Registry
| Service | Image | Port (dev) | Port (staging/prod) | Status | Added |
|---|---|---|---|---|---|
| PostgreSQL | postgres:16-alpine | base+0 | 5432 | ACTIVE | V10 |
| PgBouncer | edoburu/pgbouncer:latest | base+1 | 6432 | ACTIVE | V10 |
| Valkey | valkey/valkey:7-alpine | base+2 | 6379 | ACTIVE | V10 |
| MinIO API | minio/minio:latest | base+3 | 9000 | ACTIVE | V10 |
| MinIO Console | minio/minio:latest | base+4 | 9001 | ACTIVE | V10 |
| MailHog SMTP | mailhog/mailhog:latest | base+5 | — | ACTIVE (dev only) | V10 |
| MailHog UI | mailhog/mailhog:latest | base+6 | — | ACTIVE (dev only) | V10 |
| pgAdmin 4 | dpage/pgadmin4:latest | base+7 | 5050 | ACTIVE all envs | V16 |
| App (Next.js) | custom built / Docker Hub | base+10 | 3000 | ACTIVE | V10 |
| Worker (BullMQ) | custom | base+11 | — | CONDITIONAL | V10 |
| Admin app | custom | base+12 | — | CONDITIONAL | V10 |
| Prisma Studio | prisma | base+20 | — | ACTIVE (dev) | V13 |

**Compose file structure:**
| File | Environment | Contains |
|---|---|---|
| `docker-compose.db.yml` | all | PostgreSQL + PgBouncer + shared network (starts first) |
| `docker-compose.cache.yml` | all | Valkey |
| `docker-compose.storage.yml` | all | MinIO |
| `docker-compose.pgadmin.yml` | all | pgAdmin 4 |
| `docker-compose.infra.yml` | dev only | MailHog |
| `docker-compose.app.yml` | all | App + Worker |

**Mono-server default:** All services on same host. To externalize any service: update HOST env var, remove its compose file from startup. Zero code changes.

**Change history:**
- V10: Initial compose stack
- V13: Non-standard ports introduced (Rule 22 Part A)
- V13: COMPOSE_PROJECT_NAME + container_name on every service (prevents conflicts)
- V15: docker-compose.app.yml uses `image:` (Docker Hub pull) instead of `build:` in staging/prod
- V16: pgAdmin added to all environments — always-on

---

### 5.2 pgAdmin 4
| Field | Value |
|---|---|
| Status | ACTIVE — all environments |
| Added | V16 |
| Image | dpage/pgadmin4:latest |
| Port | base+7 (dev), 5050 (staging/prod) |
| Credentials | Auto-generated by Phase 3 — PGADMIN_EMAIL + PGADMIN_PASSWORD |
| Email format | `${app_slug}-{8hexchars}@admin.local` |
| Password | 22-char full ASCII, per-environment, never reused |
| Server config | pgadmin-servers.json (pre-configured, no manual setup) |
| DB connection | Via Docker internal network hostname (not localhost) |
| Volume | `${COMPOSE_PROJECT_NAME}_pgadmin_data` (persists saved queries etc.) |

**Security note:** Never expose port 5050 publicly. Restrict via firewall to your IP only.

**Credential rotation:** Remove pgadmin_data volume → restart container. Does NOT affect PostgreSQL.

**Change history:**
- V16: Introduced — always-on, auto-credentials, pre-configured server connection

---

## 6. Port Strategy

### 6.1 Random Base Port Algorithm
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V13 (Part A), evolved V14 |
| Rule | Rule 22 Part A |
| Range | 40000–49999 (random base, unique per project) |
| Stored | `inputs.yml` under `ports.dev.base` |
| Written to | `.env.dev` and `.env.example` |

**Port offset table:**
| Service | Offset | Example (base=42731) |
|---|---|---|
| PostgreSQL | +0 | 42731 |
| PgBouncer | +1 | 42732 |
| Valkey | +2 | 42733 |
| MinIO API | +3 | 42734 |
| MinIO Console | +4 | 42735 |
| MailHog SMTP | +5 | 42736 |
| MailHog UI | +6 | 42737 |
| pgAdmin | +7 | 42738 |
| App (Next.js) | +10 | 42741 |
| Worker | +11 | 42742 |
| Admin app | +12 | 42743 |
| Prisma Studio | +20 | 42751 |

**Staging/prod use standard ports** — zero code changes on migration.

**Change history:**
- V13: Non-standard ports introduced — prevents conflicts across multiple projects
- V16: pgAdmin offset (+7) added

---

## 7. Secret Generation & Credentials

### 7.1 Generation Commands
| Credential type | Command | Length | Used for |
|---|---|---|---|
| Standard password | `openssl rand -base64 24 \| tr -d '\n' \| head -c 16` | 16 char | DB, Redis, MinIO, PgBouncer, SMTP, pgAdmin |
| High-entropy secret | `openssl rand -base64 48 \| tr -d '\n' \| head -c 32` | 32 char | AUTH_SECRET, JWT signing, webhook secrets |
| DB username suffix | `openssl rand -hex 6` | 12 hex | DB_USER suffix, storage access key suffix |
| pgAdmin email suffix | `openssl rand -hex 4` | 8 hex | `${app_slug}-{8hex}@admin.local` |

**Per-environment rule:** Generated ONCE per environment at Phase 3 time. Never regenerated unless explicitly requested. Never reuse across dev/staging/prod.

### 7.2 What Gets Generated Per Environment
| Credential | dev | staging | prod |
|---|---|---|---|
| DB_USER | `${app_slug}_dev` | `${app_slug}_staging` | `${app_slug}_prod` |
| DB_PASSWORD | 22-char unique | 22-char unique | 22-char unique |
| PGBOUNCER_AUTH_PASSWORD | 22-char unique | 22-char unique | 22-char unique |
| REDIS_PASSWORD | 22-char unique | 22-char unique | 22-char unique |
| STORAGE_ACCESS_KEY | slug+8hex | slug+8hex | slug+8hex |
| STORAGE_SECRET_KEY | 22-char unique | 22-char unique | 22-char unique |
| AUTH_SECRET | 32-char unique | 32-char unique | 32-char unique |
| PGADMIN_EMAIL | slug+8hex@admin.local | slug+8hex@admin.local | slug+8hex@admin.local |
| PGADMIN_PASSWORD | 22-char unique | 22-char unique | 22-char unique |

**Change history:**
- V10: DB, Redis, MinIO, Auth credentials
- V16: pgAdmin credentials added
- V17: CREDENTIALS.md collects all generated values in one table

---

## 8. Database Layer

### 8.1 PostgreSQL + PgBouncer
| Field | Value |
|---|---|
| ORM | Prisma (parameterized queries — SQL injection impossible via standard API) |
| Connection pool | PgBouncer (transaction mode, max 100 clients, pool size 20) |
| Always generated | AuditLog model, tenant-guard.ts, seed script |
| RLS | Row-Level Security helpers in src/rls.ts (active in multi, commented in single) |

**Change history:**
- V10: Initial Prisma + PostgreSQL setup
- V10: PgBouncer introduced as connection pool

---

### 8.2 Multi-Tenancy Modes
| Mode | DB strategy | When |
|---|---|---|
| Single-tenant | Shared schema, no tenant_id | Default for simple apps |
| Multi-tenant | Shared schema + tenant_id on every table | Default for SaaS |
| Isolated | Separate PostgreSQL schema per tenant | Locked exception: payroll/banking/medical only |

**Security layers (multi mode — Rules 7A–7E):**
| Layer | What | Status |
|---|---|---|
| L1 | tRPC tenantId scoping | ACTIVE in multi |
| L2 | PostgreSQL Row-Level Security | ACTIVE in multi |
| L3 | RBAC role guard (rbac.ts) | ALWAYS ACTIVE |
| L4 | Tenant isolation middleware | ACTIVE in multi |
| L5 | AuditLog on every mutation | ALWAYS ACTIVE |
| L6 | Prisma extension guardrails ($allOperations) | ALWAYS ACTIVE |

**Change history:**
- V10: Multi-tenancy model established, L1–L6 security layers defined

---

### 8.3 Valkey (Redis-compatible Cache)
| Field | Value |
|---|---|
| Image | valkey/valkey:7-alpine |
| Use | BullMQ job queues, session cache, rate limiting (future Redis upgrade) |
| Note | MIT-licensed Redis fork — drop-in compatible |

**Change history:**
- V10: Introduced as Redis-compatible cache
- V18: Rate limiter scaffolded — currently in-memory LRU, upgrades to Valkey with 1 line change

---

## 9. Application Layer

### 9.1 Next.js Web App Stack
| Component | Technology | Notes |
|---|---|---|
| Framework | Next.js (App Router) | `output: standalone` required for Docker |
| API | tRPC | Typed end-to-end, routers per entity/module |
| Auth | Auth.js v5 (default) / Keycloak (enterprise SSO — last resort) | Auth.js v5 for all apps — single-org or multi-tenant SaaS. Multi-tenancy via L1-L6 security stack (no external IAM). Keycloak only when client mandates enterprise SSO/SAML. |
| ORM | Prisma | Never use `$queryRaw` with string interpolation |
| Typed env | src/env.ts (Zod) | Validates all env vars at startup — fails fast |
| UI | shadcn/ui + Tailwind | Neutral defaults, overridden by design system if present |
| Tenant middleware | src/middleware.ts | URL path or subdomain resolution + auth guard |

### 9.2 Multi-Stage Dockerfile (V15+)
| Field | Value |
|---|---|
| Status | CONDITIONAL — only if `docker.publish: true` |
| Added | V15 |
| Stages | deps (install) → builder (pnpm build) → runner (minimal alpine) |
| Base image | node:22-alpine |
| Output | `.next/standalone` (requires `output: 'standalone'` in next.config.ts) |
| Non-root user | nextjs user created in runner stage |

**Change history:**
- V15: Introduced alongside Docker Hub pipeline

---

### 9.3 Docker Hub Image Pipeline
| Field | Value |
|---|---|
| Status | CONDITIONAL — requires `docker.publish: true` in inputs.yml |
| Added | V15 |
| Workflow | `.github/workflows/docker-publish.yml` |
| Trigger | Push to main branch only |
| Tags | `:latest` + `:sha-{short}` (immutable per-commit) |
| Platforms | linux/amd64 + linux/arm64 |
| Cache | GitHub Actions layer cache (GHA) |
| Secrets needed | `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` in GitHub repo settings |
| Rollback | Change image tag to previous `:sha-{short}` — zero code change |

**What stays unaffected on deploy:** All PostgreSQL records, Valkey state, MinIO files — only app container restarts.

**Change history:**
- V15: Introduced — replaces git pull + pnpm build on server
- V15: Komodo webhook option documented in Scenario 24

---

## 10. Security Layer

### 10.1 HTTP Security Headers
| Field | Value |
|---|---|
| Status | ACTIVE — always generated |
| Added | V18 |
| Location | `next.config.ts` in every web app |
| Applied to | Every route (`source: '/(.*)'`) |

| Header | Value | Protects against |
|---|---|---|
| X-Frame-Options | SAMEORIGIN | Clickjacking |
| X-Content-Type-Options | nosniff | MIME sniffing |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | HTTP downgrade |
| Content-Security-Policy | default-src 'self' (permissive in dev) | XSS, resource injection |
| Referrer-Policy | strict-origin-when-cross-origin | Information leakage |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Browser API abuse |

**CSP note:** Starts permissive (`unsafe-inline` allowed) for dev. Tighten per Scenario 26 for production.

**Verify:** `curl -I http://localhost:${APP_PORT} | grep -E "x-frame|x-content|strict-transport|content-security"`

**Change history:**
- V18: Introduced — always-on, no flag needed

---

### 10.2 Rate Limiter
| Field | Value |
|---|---|
| Status | ACTIVE — always generated |
| Added | V18 |
| Location | `src/server/lib/rate-limit.ts` in every web app |
| Store | In-memory LRU (single instance) |
| Upgrade path | Swap LRU for Redis/Valkey store — 1 line change |

| Tier | Limit | Target use |
|---|---|---|
| `rateLimiters.public` | 30 req/min | Unauthenticated routes |
| `rateLimiters.auth` | 10 req/min | Login, register, password reset |
| `rateLimiters.api` | 120 req/min | Authenticated API calls |
| `rateLimiters.upload` | 20 req/min | File upload endpoints |

**Error thrown:** `TRPCError({ code: 'TOO_MANY_REQUESTS' })`

**Change history:**
- V18: Introduced — always-on, 4 pre-configured tiers

---

### 10.3 XSS Sanitizer (DOMPurify)
| Field | Value |
|---|---|
| Status | ACTIVE — always generated |
| Added | V18 |
| Location | `src/server/lib/sanitize.ts` in every web app |
| Package | `isomorphic-dompurify` (runtime dependency) |

| Function | Behaviour | Use for |
|---|---|---|
| `sanitize(input)` | Strips dangerous HTML, keeps safe tags | User-submitted rich content |
| `sanitizePlainText(input)` | Strips ALL HTML | Names, titles, plain text fields |

**Rule:** Call before writing any user-submitted content to the database.

**Change history:**
- V18: Introduced — always-on, no flag needed

---

### 10.4 Dependency Vulnerability Audit
| Field | Value |
|---|---|
| Status | ACTIVE — CI gate + Phase 5 command |
| Added | V18 |
| Command | `pnpm audit --audit-level=high` |
| CI job | `security` job in `.github/workflows/ci.yml` |

---

### 10.5 Secure Code Generation Constraints (NEW V25)
| Field | Value |
|---|---|
| Status | ACTIVE — mandatory for all phases |
| Added | V25 |
| Location | SECURE CODE GENERATION section in Master Prompt (between Rules and FILE DELIVERY RULES) |
| Scope | Every generated file — Phase 4 scaffold AND Phase 7 Feature Updates |

**16 sub-sections covering 15+ identified threat scenarios:**

| Sub-section | Items | Covers |
|---|---|---|
| Agent Prohibitions | 13 NEVER rules | Client-trusted roles, skipped tenant scoping, placeholder auth, Route Handlers bypassing tRPC, Server Actions without auth, tenantId in responses |
| Input Validation | 7 rules | Zod strict, IDOR prevention, batch ID verification, pagination |
| Database Safety | 10 rules | Transactions, race conditions, nested relation leaks, seed isolation, migration script safety, export scoping |
| File Upload Safety | 8 rules | MIME validation, tenant-namespaced paths, download endpoint verification |
| Queue/Cache Safety | 7 rules | Tenant-scoped jobs, cron tenant iteration, idempotent workers |
| Production Error Handling | 5 rules | Error masking, auth enumeration prevention |
| Webhook Safety | 3 rules | Signature verification, idempotent handlers |
| SSRF Prevention | 4 rules | Private IP rejection, URL parsing, DNS rebinding prevention, sandboxed fetches (NEW V28) |
| Auth Defaults | 6 rules | Auth.js v5 defaults, password reset tokens, logout invalidation, session invalidation on role change (NEW V28) |
| CSRF Protection | 1 posture doc | tRPC + SameSite inherently resistant, Route Handler exception (NEW V28) |
| Tenant Middleware Safety | 2 rules | URL slug cross-check against session, tenant-switching prevention |
| Superadmin Isolation | 4 rules | Dedicated platformPrisma, separate router, PLATFORM: audit prefix |
| Realtime Connection Safety | 3 rules | Heartbeat re-validation, tenant-scoped channels, force-close on role change |
| Secure Production Defaults | 7 rules | No Prisma Studio in prod, no debug endpoints, CORS restricted, tiered global rate limiting (NEW V28) |

**L6 Prisma extension template updated:** Now uses `$allOperations` instead of listing individual methods. Covers findMany, findFirst, findUnique, create, update, delete, deleteMany, count, aggregate, groupBy — no operation bypasses the tenant guard.

**Change history:**
- V25: Initial — 12 sub-sections, 15 threat scenarios addressed, L6 template upgraded to $allOperations
- V28: 14 → 16 sub-sections (V27 had already added Xendit+Turnstile: 12→14): CSRF Protection (posture doc), SSRF Prevention (4 rules), Auth Defaults item 6 (session invalidation), Secure Production Defaults item 7 (tiered rate limiting)
| Threshold | Blocks on HIGH or CRITICAL severity — MODERATE and LOW pass |
| Phase 5 | 9th validation command (was 8 before V18) |

**Fix:** `pnpm audit --fix` (auto) or update specific package version manually.

**Change history:**
- V18: Introduced as CI gate + Phase 5 command

---

### 10.6 SQL Injection Protection
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V10 (Prisma) |
| Coverage | Prisma parameterized queries — values never interpolated into SQL strings |
| Risk area | `prisma.$queryRaw` with string interpolation — banned by L6 + Rule 12 |

---

### 10.7 RBAC (Role-Based Access Control)
| Field | Value |
|---|---|
| Status | ALWAYS ACTIVE (L3) |
| Added | V10 |
| Location | `src/server/trpc/middleware/rbac.ts` |
| Applied | Before every tRPC resolver |
| Error | `TRPCError({ code: 'FORBIDDEN' })` |

---

## 11. Mobile Support

### 11.1 Expo App Scaffold
| Field | Value |
|---|---|
| Status | CONDITIONAL — only if mobile declared in inputs.yml |
| Added | V10 |
| Router | Expo Router |
| UI | React Native Reusables + NativeWind |
| Local DB | WatermelonDB / AsyncStorage / MMKV |
| Offline | Offline queue + sync logic (only if offline-first declared) |
| Push | Expo Push / FCM+APNs (only if declared) |
| Distribution | EAS Build — App Store + Play Store / internal |
| Rule | NEVER import packages/db in mobile — use packages/api-client only (Rule 13) |

**Change history:**
- V10: Initial Expo scaffold
- V10: WatermelonDB offline-first pattern established

---

## 12. CI/CD Pipeline

### 12.1 GitHub Actions — ci.yml
| Job | Depends on | What it runs |
|---|---|---|
| `governance` | — | validate-inputs, check-env, check-product-sync |
| `quality` (matrix) | governance | lint, typecheck, test, build (via turbo) |
| `security` | governance | `pnpm audit --audit-level=high` |

**Turbo cache:** `.turbo` directory cached per branch + SHA — dramatically speeds up repeat runs.

**Change history:**
- V10: ci.yml with governance + quality jobs
- V18: `security` job added — dependency vulnerability audit

---

### 12.2 GitHub Actions — docker-publish.yml
| Field | Value |
|---|---|
| Status | CONDITIONAL — `docker.publish: true` |
| Added | V15, updated V27 |
| Trigger | Push to main only |
| Multi-platform | linux/amd64 + linux/arm64 (via QEMU) |
| Tags produced | `:latest` + `:staging-latest` + `:sha-{shortSHA}` (V27: staging-latest added) |
| Deployment | V27: Komodo auto-update polls :staging-latest (staging), human clicks Deploy for :latest (prod). No webhook step in GitHub Actions. |

**Change history:**
- V15: Introduced
- V27: `:staging-latest` tag added. Comment header updated. Webhook step not included (auto-update replaces webhooks for recommended path).

---

### 12.3 Git Branching Strategy (Rule 23)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V14 |
| Feature branch | `feat/{slug}` |
| Scaffold branch | `scaffold/part-{N}` |
| Merge strategy | Squash-merge to main |
| Worktrees | Used for Phase 4 Parts (one worktree per Part) |

**Change history:**
- V14: Rule 23 introduced — branch-per-feature enforced

---

## 13. Design System

### 13.1 UI UX Pro Max (design-system/MASTER.md)
| Field | Value |
|---|---|
| Status | OPTIONAL — graceful degradation if absent |
| Added | V12 |
| Rule | Rule 21 |
| Generated by | Phase 2.6 (auto after "confirmed" in Phase 2.5) |
| Skill install | `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` in Claude Code |
| Provides | 161 industry rules, 67 UI styles, 161 palettes, 57 font pairings |
| Read by Claude Code | Automatically before every UI-touching Feature Update (V31 primary; Cline deprecated) |
| Page overrides | `design-system/pages/[page-name].md` — per-page style controls |

**Graceful degradation:** Framework works identically without it. Claude Code uses shadcn/ui neutral defaults.

**Change history:**
- V12: Introduced — Rule 21, Phase 2.6, DESIGN_SYSTEM_MISSING triage category
- V12: Log Lesson command added alongside (scripts/log-lesson.sh)

---

## 14. Codebase Intelligence

### 14.1 code-review-graph (Blast-Radius Analysis)
| Field | Value |
|---|---|
| Status | OPTIONAL — install once per machine |
| Added | V13 |
| Install | `claude plugin add tirth8205/code-review-graph` |
| Prerequisites | Python 3.10+, uv package manager, Claude Code CLI |
| Per-project setup | `code-review-graph build` after Phase 6 |
| Watch mode | `code-review-graph watch` — auto-updates on file save |
| Auto-called by | Claude Code at Phase 7 Step 1c before every Feature Update (V31 primary; Cline deprecated) |
| Environment | Dev/test machine ONLY — never staging or production |

**Key tools:** `get_impact_radius_tool` (blast radius), `get_review_context_tool` (token-efficient context bundle)

**Change history:**
- V13: Introduced as structural blast-radius MCP layer
- V14: Two-stage code review (Rule 25) uses code-review-graph output

---

## 15. Change Attribution & Memory

### 15.1 Attribution Chain
`CLINE → CLAUDE_CODE → COPILOT → HUMAN → UNKNOWN`

Every CHANGELOG_AI.md entry must include `Agent: [one of above]`. Non-blocking — written after implementation, not during (prevents context interruption).

**Change history:**
- V10: CLINE + CLAUDE_CODE attribution
- V11: COPILOT + HUMAN + UNKNOWN added (Rule 3/15 updated)

---

### 15.2 Private Tags (Rule 20)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V11 |
| Syntax | `<private>content</private>` in PRODUCT.md |
| Behaviour | Stripped before processing — never appears in governance docs or source |
| CI gate | check-product-sync.mjs validates no leaked private content |
| Triage | PRIVATE_TAG_LEAKED in Phase 6.5 |

---

## 16. Multi-Tenancy

### 16.1 Tenancy Modes
| Mode | Default | DB approach | Activate |
|---|---|---|---|
| Single-tenant | Yes (most apps) | Shared schema, no tenant_id | Default |
| Multi-tenant | SaaS apps | Shared schema + tenant_id | Phase 2 Section B |
| Isolated | Payroll/banking/medical | Separate PostgreSQL schema | Explicit exception only |

**Upgrade path:** Single → multi is zero-migration. L1/L2/L4 dormant in single mode, activated on upgrade. L3/L5/L6 always active regardless.

**URL routing options:**
- Path-based: `app.com/[org-slug]/...`
- Subdomain: `[org-slug].app.com`

**Change history:**
- V10: Three tenancy modes established, L1–L6 security layers defined
- V10: Upgrade path documented — Scenario 11

---

## 17. Error Triage System

### 17.1 Phase 6.5 — All 16 Categories
| # | Category | Common cause |
|---|---|---|
| 1 | ENV_MISSING | Required env var not in .env.dev |
| 2 | MIGRATION_FAILED | Schema conflict or DB not running |
| 3 | PORT_CONFLICT | Another process on that port |
| 4 | IMAGE_BUILD_FAILED | Dockerfile error or missing dependency |
| 5 | DEPENDENCY_NOT_INSTALLED | pnpm install not run or frozen lockfile conflict |
| 6 | TYPECHECK_FAILED | TypeScript error in generated code |
| 7 | SERVICE_UNHEALTHY | Container started but healthcheck failing |
| 8 | AUTH_MISCONFIGURED | AUTH_SECRET missing or NEXTAUTH_URL wrong |
| 9 | DB_CONNECTION_REFUSED | PostgreSQL not started or wrong port |
| 10 | CORS_ERROR | Allowed origins not configured |
| 11 | VISUAL_QA_FAILED | UI rendering error after scaffold |
| 12 | SOCRATICODE_NOT_INDEXED | codebase_index not run after Phase 4 |
| 13 | PRIVATE_TAG_LEAKED | `<private>` content in governance docs |
| 14 | DESIGN_SYSTEM_MISSING | Phase 2.6 ran but MASTER.md missing |
| 15 | PORT_ALREADY_BOUND | Dev port in use — update inputs.yml |
| 16 | PGADMIN_UNREACHABLE | pgadmin_data volume permissions or pgadmin-servers.json missing |

**Output format (MiniMax-friendly):**
```
CATEGORY: [name]
ROOT CAUSE: [one sentence]
FIX: [exact command or file change]
VERIFY: [how to confirm it's fixed]
```

**Change history:**
- V10: Initial 12 categories
- V11: PRIVATE_TAG_LEAKED added (13th)
- V12: DESIGN_SYSTEM_MISSING added (14th)
- V13: DOCKER_SOCKET_PERMISSION, PORT_ALREADY_BOUND, POSTCREATECMD_EACCES, DOCKER_OUTSIDE_OF_DOCKER_INCOMPATIBLE, HOME_DIR_PERMISSION added (15th–19th)
- V16: PGADMIN_UNREACHABLE added (20th)
- V25: 5 devcontainer-only categories removed (DOCKER_SOCKET_PERMISSION, POSTCREATECMD_EACCES, SHELL_SERVER_TERMINATED_4294967295, DOCKER_OUTSIDE_OF_DOCKER_INCOMPATIBLE, HOME_DIR_PERMISSION) — 20 → 16 → renumbered to 16 active categories

---

## 20. Skills & Plugin Architecture

### 20.1 Skill Standard (.github/skills/)
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V19 |
| Rule | Rule 26 |
| Bootstrap step | Step 17 |

**What it is:** Every project gets a `.github/skills/` directory with a `spec-driven-core/SKILL.md` — a compact rules card read by Claude Code, GitHub Copilot, and VS Code equally. (Cline deprecated V31 but still reads the same format if re-enabled as emergency fallback.)

**Design decision:** `.github/skills/` chosen over `.claude/skills/` because it is the cross-agent standard recognised by all compatible agents as of 2025. Legacy `.claude/skills/` path still supported.

**Key constraint:** SKILL.md must stay under 500 lines. Longer files degrade model output quality because they consume too much of the context window on task start. (Applies to Claude Sonnet 4.6 V31 primary and any emergency fallback model.)

**Activation mechanism:** Agents scan `.github/skills/` at task start, read the `description:` frontmatter line only, then load the full file only when the description matches the current task. Never globally injected.

| Field | Detail |
|---|---|
| Location | `.github/skills/[name]/SKILL.md` |
| Required frontmatter | `name:` + `description:` |
| Line limit | 500 lines |
| Helper scripts | `.github/skills/[name]/scripts/` |
| Ownership | spec-driven-core = AGENT (Bootstrap Step 17). User packs = HUMAN. |

**Change history:**
- V19: Added. Bootstrap Step 17 writes spec-driven-core/SKILL.md + .gitkeep. .clinerules SKILLS CHECK block added.
- V20: Rule 28 (Global Priority Ladder) added — SKILL.md instructions explicitly placed at priority 7, always below CLAUDE.md.

---

### 20.2 Plugin Format (Domain Skill Packs)
| Field | Value |
|---|---|
| Status | OPTIONAL |
| Added | V19 |
| Rule | Rule 27 |

**What it is:** Domain skill packs bundle a SKILL.md plus optional MCP server configs into an installable unit. Installed via `/plugin install [id]@[repo]` from Claude Code terminal.

**Framework-native packs:**

| Pack ID | Domain | Key patterns |
|---|---|---|
| spec-driven-aws | AWS infrastructure | CDK, cost optimisation, Serverless/EDA, Bedrock AgentCore |
| spec-driven-payments | Payments | Stripe webhooks, idempotency keys, PCI scope isolation |
| spec-driven-govt | Government | DICT compliance, fisherfolk/MPA domain, multi-level governance |
| spec-driven-erp | ERP | Payroll tax, AP/AR double-entry, POS sessions, separate-schema isolation |

**Design decision:** Plugin packs are strictly additive. They add `.github/skills/[id]/SKILL.md` and optionally MCP configs. They never modify governance docs or source files. Core framework rules always override domain pack instructions on conflict.

**Change history:**
- V19: Added. Plugin manifest format defined. 4 framework-native packs specified.

---

## 21. V20 Reliability & Determinism Changes

### 21.1 Phase Output Contracts
| Field | Value |
|---|---|
| Status | ACTIVE |
| Added | V20 |
| Applies to | Phase 2.7, Phase 3, Phase 4 (per Part), Phase 5, Phase 7 |

Every critical phase now ends with an OUTPUT CONTRACT block. Agent verifies every expected artifact exists and every governance doc is updated before reporting complete. If any item fails → phase = INCOMPLETE → write HANDOFF_OUTPUT.

### 21.2 Global Instruction Priority Ladder (Rule 28)
| Priority | Source | Role |
|---|---|---|
| 1 | Safety constraints | Never exposed credentials, never delete without confirm |
| 2 | CLAUDE.md rules | This file — all 33 rules |
| 3 | Active phase rules | Current phase numbered steps |
| 4 | docs/PRODUCT.md | Feature intent |
| 5 | docs/DECISIONS_LOG.md | Locked decisions |
| 6 | inputs.yml | Tech stack config |
| 7 | .github/skills/SKILL.md | Domain knowledge only |
| 8 | User instructions | Current message |

### 21.3 Phase 7 Step 11 Linear Sub-Steps
| Sub-step | Action | Gate |
|---|---|---|
| 11a | Write failing test | Confirm RED before 11b |
| 11b | Implement code (blast-radius only) | Confirm GREEN before 11c |
| 11c | Update inputs.yml + types (if changed) | CONDITIONAL |
| 11d | Write Prisma migration (if model changed) | CONDITIONAL |
| 11e | Atomic conventional commit | MANDATORY |

### 21.4 Four-Type Recovery Model
| Type | Trigger | Response |
|---|---|---|
| 1 — Hard Failure | Execution error | 2-strike pivot (not 3 retries), then HANDOFF_OUTPUT |
| 2 — Partial Success | Some files written, phase incomplete | STATE.md PARTIAL, HANDOFF_OUTPUT with manifest |
| 3 — Stale State | Governance docs behind code | Stop, run Governance Sync, do not proceed |
| 4 — Resume After Interruption | Session ended mid-phase | Read STATE.md only, never assume from history |

### 21.5 Standard Output Types
| Type | Used when |
|---|---|
| SUCCESS_OUTPUT | Phase/task completed, all contracts met |
| GAP_REPORT | Gaps found (SECTION/PROBLEM/FIX format) |
| HANDOFF_OUTPUT | Agent stuck after 2 attempts |
| PHASE_COMPLETE | Phase done, governance verified, next phase stated |

**Change history:**
- V20: All items above added as part of CHANGE-01 through CHANGE-14.

---

## 22. V21 Edge Cases + No Fuzzy Reasoning

### 22.1 Rule 29 — No Fuzzy Reasoning
| Banned Phrase | Why |
|---|---|
| "seems like" | Interpretation — not a declared fact |
| "probably" | Inference — not confirmed |
| "typically" | Pattern assumption — this app may differ |
| "I assume" | Explicit guessing — prohibited |
| "usually" | Default-filling — inputs.yml defines defaults |
| "most apps like this" | Context hallucination |
| "standard setup" | Vague — all defaults are in inputs.yml |

**Enforcement:** If agent would use any banned phrase → STOP → ask for specific missing info → wait → proceed.

**Change history:** V21: Rule 29 added to WHO YOU ARE bullets, Rule 29 body after Rule 28, NO FUZZY REASONING block in .clinerules.

### 22.2 Scenario 29 — Edge Case Recovery
| Edge Case | Recovery Procedure |
|---|---|
| Mid-Part interruption | git status → commit/restart → remove PARTIAL from STATE.md |
| inputs.yml missing | GAP_REPORT → stop → restore from git or re-run Phase 3 |
| feat/[slug] branch exists | git checkout feat/[slug] → log resumption → continue from step 4 |
| HIGH CVE no fix | 3-step: audit --fix → upgrade → mitigate + document in DECISIONS_LOG |
| STATE.md vs DECISIONS_LOG | STATE.md = phase authority, governance = content authority |

### 22.3 Phase 7 Pre-Flight Check
Three checks before every Feature Update: (1) inputs.yml exists, (2) inputs.yml passes schema validation, (3) existing branch detection. All handled automatically.

### 22.4 CVE Decision Tree (Phase 5)
Step 1: pnpm audit --fix. Step 2: upgrade to latest major. Step 3: document + downgrade threshold + proceed with mitigation. CRITICAL CVE: always HANDOFF_OUTPUT to human.

**Change history:** V21: All items in section 22 added.

---

## 23. V22 Docker Image Pipeline

### 23.1 Image Promotion Flow
```
Local Dev (build from source)
    ↓ bash deploy/compose/push.sh dev (build + test + push)
Docker Hub :dev-latest / :dev-sha-{hash}
    ↓ bash deploy/compose/push.sh staging (re-tag, no rebuild)
Docker Hub :staging-latest / :staging-sha-{hash}
    ↓ Staging server: docker compose pull + up -d
Staging Environment
    ↓ bash deploy/compose/push.sh prod (re-tag, no rebuild)
Docker Hub :latest / :prod-sha-{hash}
    ↓ Production server: docker compose pull + up -d
Production Environment
```

### 23.2 docker-compose.app.yml Per Environment
| Environment | Key | Source |
|---|---|---|
| dev | `build:` + `image:` | Builds from source, tags locally |
| staging | `image:` only | Pulls :staging-latest from Docker Hub |
| prod | `image:` only | Pulls :latest from Docker Hub |

### 23.3 push.sh Commands
| Command | Action |
|---|---|
| `bash deploy/compose/push.sh dev` | Build from source → run full-stack tests → push :dev-latest + :dev-sha |
| `bash deploy/compose/push.sh staging` | Re-tag dev → :staging-latest + :staging-sha → push |
| `bash deploy/compose/push.sh prod` | Re-tag staging → :latest + :prod-sha → push |

### 23.4 GitHub Actions Coexistence
`docker-publish.yml` (V15, updated V27) auto-pushes `:latest`, `:staging-latest`, and `:sha-{hash}` on every push to main. Manual `push.sh` and GitHub Actions use the same Docker Hub repo — no conflict. Komodo staging auto-update watches `:staging-latest` — either path keeps staging current. Production servers pull `:latest` on manual deploy from Komodo UI.

### 23.5 COMMANDS.md
Generated at project root by Phase 4 Part 7 (conditional: docker.publish: true). Sections: Docker start/stop/rebuild, image push pipeline, database, testing, code quality, governance, git workflow, AI agent triggers, dev service URLs.

### 23.6 First Admin Account (webmaster) + Strong Passwords
Every app seeds a first admin account: username `webmaster`, password system-generated (22-char, generated during Bootstrap Step 18 via terminal — never hardcoded, stored only in CREDENTIALS.md under "First Admin Account", bcrypt-hashed before DB insert). All other seeded accounts and service passwords (PostgreSQL, Valkey, MinIO, pgAdmin) are AI-generated strong passwords (minimum 22 chars, mixed case/digits/symbols, unique per environment, never reused). All stored in CREDENTIALS.md (gitignored — never committed). CREDENTIALS.md contains 11 sections including GitHub Secrets reminder and third-party API keys.

**Change history:** V22: All items in section 23 added.

---

## 24. V23 Context7 + Design Quality

### 24.1 Rule 30 — Context7 Live Docs
Append `"use context7"` to any Claude Code task involving external libraries. Context7 MCP fetches current version-specific documentation from source repositories before generating code, preventing deprecated API hallucinations.

**Priority libraries:**
| Library | Context7 ID |
|---|---|
| Next.js | /vercel/next.js |
| Prisma | /prisma/prisma |
| Auth.js v5 | /nextauthjs/next-auth |
| tRPC | /trpc/trpc |
| shadcn/ui | /shadcn-ui/ui |
| BullMQ | /taskforcesh/bullmq |
| Expo | /expo/expo |
| WatermelonDB | /nozbe/watermelondb |

### 24.2 Bootstrap Step 10 Updated
`.vscode/mcp.json` now includes both SocratiCode and Context7 MCP entries. Context7 requires Node.js 18+, no API key, free.

### 24.3 Phase 2.6 Enhancements
- Vercel Web Interface Guidelines embedded in `design-system/MASTER.md` (interactions, forms, animations, dark mode, keyboard nav, performance perception)
- shadcnblocks catalog registered if skill installed (2500+ pre-built blocks)
- WCAG AA enforcement block generated when `accessibility: wcag_aa` declared in PRODUCT.md Non-functional Requirements
- V23 prerequisite check for frontend-design plugin + a11y skill

### 24.4 Bootstrap Step 17 New Plugins
- Anthropic `frontend-design` plugin (official): auto-activates for all UI work
- `a11y` skill: conditional on `accessibility: wcag_aa` in PRODUCT.md

### 24.5 Phase 7 Stage 2 Code Simplifier
SIMPLIFY checklist added to Stage 2 quality check:
- No function does more than one thing
- No repeated logic ≥2 occurrences without helper extraction
- No wrapper functions that add zero value
- No single-use variables that obscure rather than clarify

### 24.6 Scenario 31
Full Context7 usage walkthrough: invocation pattern, worked examples for Auth.js v5/Prisma/tRPC/BullMQ/Expo+WatermelonDB, SocratiCode pairing, library-not-found fallback.

### 24.7 inputs.yml New Fields
```yaml
context7:
  enabled: true   # Context7 MCP for live library docs (Rule 30)
accessibility:
  level: none     # none | wcag_aa | wcag_aaa
```

### 24.8 Bootstrap Step 18 — Credential Collection Gate
New BLOCKING step after Bootstrap Step 17. Claude Code outputs a 5-section questionnaire to human (GitHub PAT, Docker Hub token, SMTP credentials, Komodo webhook URLs, third-party API keys). Waits for all answers, generates all service passwords at 22-char minimum via openssl terminal commands, writes complete CREDENTIALS.md, then outputs "Bootstrap complete." Phase 1 cannot begin until CREDENTIALS.md is fully populated. Bootstrap step count: 17 → 18.

**Credentials collected from human:** GitHub username + PAT (repo+workflow scope), Docker Hub username + access token, SMTP host/port/user/password/from, Komodo webhook secret + staging + prod URLs, third-party API keys.

**Credentials AI-generates (22-char minimum, openssl only):** PostgreSQL password × 3 envs, DB username suffix (11-char hex) × 3, PgBouncer password × 3, Valkey/Redis password × 3, MinIO access key suffix × 3, MinIO secret key (48-char) × 3, pgAdmin password × 3, AUTH_SECRET (48-char) × 3, webmaster app password.

**CREDENTIALS.md sections (13 total):** 🔑 First Admin, 🐙 GitHub, ⚙️ GitHub Actions Secrets, 🐳 Docker Hub, 🗄️ PostgreSQL, 🔀 PgBouncer, ⚡ Valkey, 🗂️ MinIO, 🖥️ pgAdmin, 🔐 Auth Secrets, 📧 SMTP, 🦎 Komodo, 🔑 Third-Party API Keys, 📋 Where Each File Lives.

### 24.9 Scenario 32 — Komodo Staging + Production Deployment
Full deployment guide for teams using Komodo (already installed). V27: Staging uses Komodo auto_update: true (polls Docker Hub for new :staging-latest digests, auto-redeploys). Production uses manual deploy from Komodo UI (auto_update: false — human clicks Deploy after verifying staging). Docker Hub is the handoff point — GitHub Actions never contacts Komodo. Webhook path preserved as optional legacy option. Key principle: staging and prod use the identical compose YAML but different COMPOSE_PROJECT_NAME values — this namespaces all containers, volumes, and networks so they never share services. App services use Traefik labels for HTTPS routing — no host port exposure (V27). Parts A (credentials — webhooks optional), B (staging Stack — auto_update: true, Traefik labels), C (prod Stack — auto_update: false, Traefik labels), D (V27 deployment flow + optional webhook path), E (verification — curl through Traefik), F (rollback), G (Traefik reference).

**Change history:** V23: All items in section 24 added. Rule count 29→30. Scenario count 30→32. Bootstrap step count 17→18. V27: Deployment model changed to auto-update (staging) + manual deploy (prod). Webhook path optional. Traefik labels added. Part D rewritten. Part G added.

---

## 18. Scenarios Index

| # | Title | Added | Domain |
|---|---|---|---|
| 1 | Add a feature to an existing module | V10 | Daily workflow |
| 2 | Add a brand new module | V10 | Daily workflow |
| 3 | Change an existing entity | V10 | Daily workflow |
| 4 | Remove a feature or module | V10 | Daily workflow |
| 5 | Change a tech stack decision | V10 | Architecture |
| 6 | Enable an optional toggle | V10 | Infrastructure |
| 7 | Add a mobile app to existing project | V10 | Mobile |
| 8 | Change tenant URL routing | V10 | Multi-tenancy |
| 9 | Audit multi-tenant security layers | V10 | Security |
| 10 | Migrate a service to AWS | V10 | Infrastructure |
| 11 | Upgrade single-tenant to multi-tenant | V10 | Multi-tenancy |
| 12 | Governance Sync: code drifted, docs stale | V10 | Governance |
| 13 | Cline wrote a handoff file | V10 | Recovery |
| 14 | Visual QA failed | V10 | QA |
| 15 | Run a Governance Retro | V10 | Governance |
| 16 | SocratiCode: setup, indexing, usage | V10 | Intelligence |
| 17 | SpecStory captured unattributed changes | V11 | Attribution |
| 18 | Copilot made inline changes | V11 | Attribution |
| 19 | Cline deprecated — use Claude Code (Copilot emergency fallback) | V11 (rewritten V31) | Agent routing |
| 20 | UI UX Pro Max: design system | V12 | Design |
| 21 | code-review-graph: setup and usage | V13 | Intelligence |
| 22 | Git branching and two-stage review | V14 | Git |
| 23 | Fresh context session management for Phase 4 | V14 | Context |
| 24 | Docker Hub pipeline + Komodo deployment | V15 | CI/CD |
| 25 | pgAdmin: access, manage, troubleshoot | V16 | Infrastructure |
| 26 | Security hardening: headers, rate limiting, XSS, audit | V18 | Security |
| 27 | Installing and using framework skill packs | V19 | Skills |
| 28 | Spec stress-test: running and re-running Phase 2.7 | V19 | Spec integrity |
| 29 | Edge case recovery: 5 failure modes with exact procedures | V21 | Recovery |
| 30 | Manual image promotion pipeline (push.sh dev→staging→prod) | V22 | CI/CD |
| 31 | Context7 live docs usage guide with worked examples | V23 | Intelligence |
| 32 | Komodo staging+production deployment with auto-update + Traefik | V23/V27 | Infrastructure |

---

## 19. Rules Index

| # | Title | Added | Summary |
|---|---|---|---|
| 1 | PRODUCT.md is sole source of truth | V10 | Only file humans edit |
| 2 | Agents own spec files | V10 | Everything else is agent-owned |
| 3 | Log every change with attribution | V10 | CHANGELOG_AI.md every time |
| 4 | Read all 9 docs before changing anything | V10 | STATE.md first (orientation), then lessons.md 🔴 first, then remaining 8 docs |
| 5 | Compose-first, AWS-ready | V10 | Mono-server default, externalize via env var |
| 6 | K8s scaffold inactive by default | V10 | Scaffolded but dormant |
| 7 | Multi-tenant DB strategy + security stack | V10 | L1–L6, 3 tenancy modes |
| 8 | WSL2 native is the only supported dev environment | V10/V25 | No devcontainer, no DinD — fully removed in V25 |
| 9 | Bidirectional governance | V10 | Code and docs always in sync |
| 10 | Never infer missing information | V10 | Always ask — except if in DECISIONS_LOG |
| 11 | Feature removal requires full cleanup | V10 | No orphaned code |
| 12 | TypeScript everywhere, always | V10 | Strict mode, no `any` |
| 13 | Multi-app monorepo support | V10 | Mobile never imports packages/db |
| 14 | OSS-first stack by default | V10 | No proprietary paid services |
| 15 | Agent attribution in every CHANGELOG entry | V10 | CLINE/CLAUDE_CODE/COPILOT/HUMAN/UNKNOWN |
| 16 | Visual QA after every Phase 6 and major Phase 7 | V10 | 5-check visual validation |
| 17 | Search before reading (SocratiCode) | V10 | Use codebase_search before file reads |
| 18 | Structured lessons.md with typed entries | V11 | 🔴/🟡/🟤/⚖️/🟢 format |
| 19 | SpecStory is passive change capture layer | V11 | Append-only history, never delete |
| 20 | Private tag support in PRODUCT.md | V11 | `<private>` stripped before processing |
| 21 | Design system as UI governance artifact | V12 | MASTER.md, graceful degradation |
| 22 | Unique random ports + container naming | V13 | base+offset algorithm, COMPOSE_PROJECT_NAME isolation — V25: DinD (Part B) removed |
| 23 | Git branching strategy | V14 | feat/{slug}, squash-merge to main |
| 24 | Fresh context per Phase 4 Part + STATE.md | V14 | 8 separate sessions, STATE.md read first |
| 25 | Two-stage code review + TDD | V14 | Spec compliance → code quality, test first |
| 26 | Skills in .github/skills/ | V19 | Cross-agent standard, SKILL.md ≤500 lines, contextual load |
| 27 | Plugin format for domain skill packs | V19 | /plugin install, MCP bundling, framework-native packs |
| 28 | Global instruction priority order | V20 | 8-level conflict resolution, Safety→CLAUDE.md→Phase→PRODUCT.md→DECISIONS→inputs→SKILL→User |
| 29 | No fuzzy reasoning — deterministic decision engine | V21 | Banned: seems like/probably/typically/I assume/usually/most apps/standard setup. Always ask — never guess. |
| 30 | Context7 live docs for library work | V23 | Append "use context7" to any Claude Code task involving an external library — Context7 MCP fetches current version-specific docs from source repos. Prevents deprecated API hallucinations. |

---

## UI Component Ecosystem (NEW V29)

### shadcn/ui — Locked Default
| Field | Value |
|---|---|
| Status | ACTIVE — always generated, no alternatives |
| Added | V10 (implicit), V29 (explicitly enforced via UI COMPONENT RULES) |
| License | MIT — 100% free, open source |
| Install | `npx shadcn@latest add [component]` or via shadcn MCP server |
| Components | 57+ Radix-based primitives (Button, Dialog, Card, Table, Sidebar, etc.) |
| MCP server | Bootstrap Step 10 wires `shadcn` MCP — agents install by natural language |

**Decision:** shadcn/ui is the only permitted component library. MUI, Ant Design, Chakra UI, Mantine, DaisyUI are all banned. This eliminates dependency conflicts, ensures consistent theming via CSS variables, and keeps bundle size minimal.

**Phase 4 Part 5:** runs `npx shadcn@latest init` + installs base set (button, card, dialog, input, label, select, textarea, toast, sonner) before any UI generation.

**Change history:**
- V10: shadcn/ui used as default (not enforced)
- V29: Explicitly enforced — UI COMPONENT RULES section (10 rules), shadcn MCP in Bootstrap Step 10, Phase 4 Part 5 init step

---

### Charts — shadcn/ui Chart (Recharts)
| Field | Value |
|---|---|
| Status | CONDITIONAL — installed if PRODUCT.md declares dashboards/analytics |
| Added | V29 (explicitly documented) |
| License | MIT |
| Install | `npx shadcn@latest add chart` |
| Underlying | Recharts (already a shadcn/ui dependency) |

**Decision:** Recharts via shadcn/ui Chart is the only permitted charting library for standard dashboards. Chart.js, Nivo, Victory, ApexCharts are banned. D3.js allowed only for custom visualizations not possible with Recharts (force graphs, geo projections) — must be locked in DECISIONS_LOG.md.

---

### Maps
| Field | Value |
|---|---|
| Default | Leaflet.js + OpenStreetMap (simple pins/markers, zero API cost) |
| Advanced | mapcn — MapLibre GL, shadcn-native, MIT, zero API key |
| Install (mapcn) | `npx shadcn@latest add https://mapcn.dev/maps/map.json` |
| Added | V10 (Leaflet), V29 (mapcn as conditional alternative) |

**Decision:** Leaflet for simple map display (store locations, GPS clock-in). mapcn for advanced features (routes, vector tiles, 3D terrain, auto dark-mode theming). Decision locked in Phase 2 interview (Planning Assistant Step 6b) and written to DECISIONS_LOG.md.

---

### Complex Components — Kibo UI
| Field | Value |
|---|---|
| Status | OPTIONAL — installed if PRODUCT.md declares Kanban/Gantt/Editor/Dropzone |
| Added | V29 |
| License | MIT — free forever |
| GitHub stars | 3.6K+ |
| Install | `npx kibo-ui add [component]` |
| Components | Kanban, Gantt, Editor, Color Picker, Dropzone, Code Block, QR Code, Image Zoom |

**Decision:** Check Kibo UI before building custom. If Kibo UI doesn't have it, build from shadcn/ui primitives. Never import a standalone npm package for a pattern Kibo UI covers.

---

### Icons — lucide-react
| Field | Value |
|---|---|
| Status | ACTIVE — always present (shadcn/ui dependency) |
| License | ISC (MIT-compatible) |
| Banned alternatives | heroicons, react-icons, font-awesome, phosphor-icons |

---

## Appendix — Framework Version Timeline

| Version | Theme | Key additions |
|---|---|---|
| V10 | Foundation | All phases, 9 docs, 16 scenarios, SocratiCode, 4-agent stack |
| V11 | Memory & Attribution | Rule 18 typed lessons, Rule 19 SpecStory, Rule 20 private tags, Scenarios 17+18 |
| V12 | Design System | Rule 21, Phase 2.6, MASTER.md, Log Lesson command, Scenario 20 |
| V13 | WSL2 & Ports | MODE A default, Rule 22 random ports + DinD, code-review-graph, Scenario 21 |
| V14 | Git & Context | Rule 23 branching, Rule 24 STATE.md + fresh context, Rule 25 TDD + 2-stage review, Scenarios 22+23 |
| V15 | Docker Hub | Dockerfile per app, docker-publish.yml CI, inputs.yml docker section, Scenario 24 |
| V16 | pgAdmin | Always-on pgAdmin all envs, auto-credentials, pgadmin-servers.json, Scenario 25 |
| V17 | Credentials | CREDENTIALS.md master list, strict gitignore enforcement in 4 places |
| V18 | Security Hardening | Security headers, rate limiter, DOMPurify sanitizer, pnpm audit CI gate, Scenario 26 |
| V19 | Skills Architecture | Rule 26 (.github/skills/), Rule 27 (plugin packs), Phase 2.7 (spec stress-test), Bootstrap Step 17, Scenarios 27+28, MiniMax M2.5 default |
| V20 | Determinism & Reliability | Rule 28 (priority ladder), Phase output contracts, Phase 7 Step 11a–11e, 4-type recovery, secret guard, standard output types, CHANGE-01–14 |
| V21 | Edge Cases + No Fuzzy | Rule 29 (no fuzzy reasoning), Scenario 29 (5 edge case procedures), Phase 7 pre-flight check, CVE decision tree, STATE.md conflict resolution, mid-Part interruption recovery |
| V22 | Docker Pipeline + COMMANDS | push.sh (dev→hub→staging→prod), COMMANDS.md, docker-compose.app.yml split (dev=build, stage/prod=pull), Scenario 30, start.sh updated, inputs.yml dev_build flag |
| V23 | Context7 + Design Quality + a11y + Komodo + Credential Gate | Rule 30 (Context7), Scenario 31 (Context7 guide), Scenario 32 (Komodo isolation), Bootstrap Step 18 (Credential Collection Gate — blocks until CREDENTIALS.md complete, 22-char passwords), Vercel UI Guidelines in Phase 2.6, frontend-design plugin, a11y skill, shadcnblocks, code-simplifier Stage 2 |
| V25 | WSL2 Native Only + Auth Stack Hardening + Credential Policy + Secure Code Generation | **Devcontainer (MODE B) fully removed** — WSL2 native is the only supported dev environment. Rule 8 rewritten. Rule 22 Part B (DinD) removed. **Logto removed entirely** — Auth stack locked: Auth.js v5 (default, all cases) + Keycloak (conditional: enterprise SSO/SAML only when client mandates it). Multi-tenancy is a data isolation problem, not an auth provider decision. **Credential policy unified to 22-char minimum** across all 6 files (was inconsistently 16/20/22). **Webmaster password now system-generated** — no hardcoded default, generated via openssl during Bootstrap Step 18, stored only in CREDENTIALS.md. **NEXTAUTH_URL** `.env.example` fixed — was hardcoded `localhost:3000`, now `${APP_PORT}`. **Rule 7A** clarified — explicit exception clause for payroll/banking/medical. **Phase flow reordered** — Phase 1 optional, credential gate blocks Phase 2. Phase 6.5 trimmed: 19→16 categories. System Hardening H1–H4 added. **SECURE CODE GENERATION section added** — 12 sub-sections addressing 15 threat scenarios: L6 Prisma extension upgraded to `$allOperations` (covers delete/count/aggregate), Agent Prohibitions expanded to 13 items (Route Handlers, Server Actions, tenantId in responses), Tenant Middleware Safety (URL cross-check), Superadmin Isolation (dedicated platformPrisma), Realtime Connection Safety (heartbeat, force-close), nested relation warnings, seed isolation, cron tenant iteration, export scoping, auth enumeration prevention, file download verification, batch ID verification, migration script safety. |
| V26 | Cross-Alignment Audit Fixes + Staging Domain Convention | **V25 audit: 11 FAILs fixed** — Phase 5 command count "8→9" in embedded .clinerules, Phase 4 stale sequential instruction, `.env.local`→`.env.dev` (4 locations), Phase 6.5 category count (14→16 in Quick Start, 20→16 in Feature Index header), deliverable set 6→7 files, "stage."→"staging" normalized. **Staging domain convention** — Phase 2 Section A now asks production domain + staging domain as two explicit questions. Human provides both URLs. Phase 3 writes to .env.staging/.env.prod NEXTAUTH_URL, CORS origins, SMTP_FROM. Komodo Scenario 32 env vars updated. No TLD/subdomain detection logic — human knows their own domains. |
| V27 | Komodo Auto-Update + Traefik Reverse Proxy + Xendit Payment Gateway + Cloudflare Turnstile | **Komodo deployment model**: staging=auto_update: true (polls Docker Hub for :staging-latest), prod=manual deploy from Komodo UI (auto_update: false). Docker Hub is the handoff — GitHub Actions never contacts Komodo. Webhook path preserved as optional. **Traefik reverse proxy**: staging+prod app services use Traefik labels for HTTPS routing — no host port exposure. Dev compose unchanged. TRAEFIK_NETWORK=proxy locked decision. **Xendit payment gateway**: framework default for SEA markets. Phase 2 Section G2 added. Bootstrap Step 18 Section 4.5 collects API keys. CREDENTIALS.md Xendit section. Secure Code Generation: x-callback-token webhook verification, idempotency, payload validation. **Cloudflare Turnstile**: framework default bot protection on all public forms (login, register, password reset, contact, payment). Managed mode. FREE tier: 1 widget/app, 3 hostnames. Phase 2 Section H. Bootstrap Step 18 Section 4.6. Dev uses official test keys. Server-side siteverify mandatory. CSP updated for challenges.cloudflare.com. **docker-publish.yml**: :staging-latest tag added. **Bootstrap Step 18**: webhook fields OPTIONAL, Xendit section added, Turnstile section added. |
| V28 | Security Hardening: CSRF + SSRF + Session Invalidation + Global Rate Limiting | **Secure Code Generation expanded from 14 to 16 sub-sections (V27 had added Xendit+Turnstile: 12→14).** CSRF Protection posture documented (tRPC + SameSite inherently resistant, Route Handlers need manual CSRF validation). SSRF Prevention added (4 rules: private IP range rejection, URL parsing via new URL(), DNS rebinding prevention, sandboxed user-URL fetches). Auth Defaults item 6: session invalidation on role/tenant change via securityVersion field. Secure Production Defaults item 7: tiered global rate limiting (auth ≤10/min, API ≤100/min, public ≤300/min). Security Checklist: 83 → 84 items (9.8 non-auth rate limiting). **Stale reference fixes**: Security Checklist footer v26→v28, Quick Start copy commands v25→v28, AI Tools Reference checklist ref v26→v28, Quick Start FV_LOWER v25→v28. |
| V29 | shadcn/ui Ecosystem Enforcement | **UI COMPONENT RULES section added** — 10 mandatory rules enforcing shadcn/ui as the ONLY component library. Covers components, charts (Recharts via shadcn/ui Chart), theming (CSS variables), forms (React Hook Form + Zod), data tables (TanStack Table via shadcn), maps (Leaflet default + mapcn conditional), complex components (Kibo UI first), blocks, icons (lucide-react only), monorepo integration. **shadcn MCP server** added to Bootstrap Step 10 — agents search + install components via natural language. **Phase 4 Part 5** runs shadcn init + base component install before UI generation. **Planning Assistant Step 6b** adds charts/maps/complex UI questions. **PRODUCT.md template** expanded with chart library, map library, complex components, icon set fields. **Community registries** documented: Kibo UI (MIT), mapcn (MIT), awesome-shadcn-ui, shadcnregistry.com. **Feature Index Section 20** added — full UI ecosystem documentation. |
| V30 | Compact CLAUDE.md Architecture + Claude Sonnet 4.6 Primary | **CLAUDE.md split from ~8000 lines to ~200 lines.** Full details moved to `.claude/rules/` with 6 contextual files: phases.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md. Claude Code auto-loads compact CLAUDE.md (~2.3K tokens) every turn instead of ~100K tokens — eliminates context window thrashing. **Claude Sonnet 4.6** promoted to primary execution model for ALL phases. Claude Code handles Bootstrap through Phase 8. Cline demoted to fallback builder. **Dual architecture:** compact CLAUDE.md (Claude Code) + full monolithic Master Prompt (Cline/paste workflows). Both contain identical rules. Model routing: primary=claude-sonnet-4.6, fallback=minimax-m2.5, governance=gemini-2.5-flash-lite, escalation=claude-opus-4.6. |
| V32.7 | Detail-File Relocation: All 7 Files Out of .claude/rules/ → .ai_prompt/ On-Demand | **Closes the subagent dispatch blocker (canary finding #22): `.claude/rules/` loads in full into every non-Explore subagent at startup, and deploying 7 detail files there (~10,176 lines, ~100–130K tokens) consumed 50–65% of Sonnet's 200K window before any task prompt was read. Even a 1-word dispatch prompt was rejected with "Prompt is too long" in fresh sessions.** Fix: all 7 detail files (phases.md · memory-governance.md · security.md · ui-rules.md · bootstrap.md · scenarios.md · templates.md) now deploy to `.ai_prompt/` only. `.claude/rules/` is intentionally empty. CLAUDE.md (~277 lines) remains the ONLY auto-loaded file. The CONTEXTUAL FILE LOADING table in CLAUDE.md already contained explicit `Read .ai_prompt/<file>` imperatives per task — the "must-remember-to-load" risk was resolved before this patch. **~24 pre-flight Read-hardening edits:** `phases.md` gains a V32.7 LOAD INSTRUCTION header + MANDATORY PRE-FLIGHT step 0 with explicit `Read .ai_prompt/phases.md` + `Read .ai_prompt/memory-governance.md` imperatives; TOKEN BUDGET REFERENCE updated. `memory-governance.md §3` gains a V32.7 load-mechanism callout; `§5` Mid-Project Adoption Steps 1–2 updated from `.claude/rules/` to `.ai_prompt/` paths. **Levers 2 (spec-executor subagent) and 3 (settings.json skill budget) deferred** — Lever 1 alone is the primary fix. **Files changed:** `deploy-v31.sh` (PRE-FLIGHT list · GROUP 2 consolidated to 7-file .ai_prompt/ block, GROUP 2b removed · SUMMARY updated · no .claude/rules/ mkdir), `CLAUDE_v31_compact.md` (title V32.6.1→V32.7 · WHAT THIS FILE IS blurb · GLOBAL PRIORITY ORDER item 3 · THE 30 RULES heading · CONTEXTUAL FILE LOADING table rows for phases.md + memory-governance.md · V32.7 STRICTEST clause), `Master_Prompt_v31.md` (V32.7 changelog + VERSION+FILENAME POLICY active-version bump + HOW TO USE IT prose + DUAL ARCHITECTURE paths), `CLAUDE_framework_repo.md` (17-files block + Always-On→On-Demand section restructure), `phases.md` (header + MANDATORY PRE-FLIGHT step 0 + TOKEN BUDGET REFERENCE), `memory-governance.md` (§3 V32.7 load-mechanism callout + §5 path references), this file (V32.7 row + header + footer + deliverable-set V32.6.1→V32.7). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files (relocated, not added) · 9 V32 Dispatch Rules · 14 Phase Hooks. **Migration:** run `deploy-v31.sh` / `spec-update` on target projects; `.claude/rules/` left from prior deploy is harmless but unused — delete manually. Restart Claude Code after deploy. **Validation:** dispatch `general-purpose` with a 1-word prompt in a fresh session — must succeed (inverts canary finding #22). |

| 2026-06-18 | Governance-Core Provenance Registration — AIEF Registered as Tier-0 Origin | **AIEF registered as the Tier-0 origin of the shared [Governance-Core](../Governance-Core/) sibling repo.** The governance disciplines pioneered in AIEF (`memory-governance.md` anti-thrashing + Architect-Execute model, V32.8 Rule 32 Learning Loop) were extracted into 7 model-agnostic primitives (§1 Autonomy · §2 Memory & Token · §3 Swarm Dispatch · §4 Status Handover · §5 Context Safety · §6 Token Metering · §7 Learning Loop) plus SHARED/COMPARTMENTALIZED memory-scope modes and a seeded fleet lessons registry. AIEF adopts these by reference via `Governance-Core/adapters/aief.adapter.md`. Provenance flows AIEF → Core (AIEF leads). Provenance note added to `CLAUDE_framework_repo.md`. **No AIEF rule/scenario/prompt/deliverable counts change** — Governance-Core is an external sibling repo. |

| V32.14 | Motion Layer — Prescribed Web-Animation Layer (`.ai_prompt/motion.md` #25 + ui-rules.md R14) | **Adds a library-agnostic UI/UX motion-principles on-demand reference as deliverable #25 + a new UI Component Rule 14.** `motion.md` covers: when-to / when-not-to animate (skip motion on high-frequency repeated actions); easing by intent (ease-out entrances/exits, ease-in-out on-screen movement, never `linear` for UI); duration budgets by element type; the **performance hard rule — animate `transform` + `opacity` ONLY, never layout props** (width/height/margin/top/left); **accessibility first-class** — `prefers-reduced-motion` mandatory, reduced-motion is a design decision not a global kill-switch, ties to WCAG 2.2 AA + SC 2.3.3; spring-vs-tween, gesture interruptibility, CSS-vs-JS as engineering decisions; and a Motion+Tailwind appendix. **Prescribed stack:** Motion (motion.dev) is the only prescribed React animation library (the same primitive shadcn/ui builds on — shadcn-only preserved), LazyMotion/mini import default (~4.6KB), **mandatory `useReducedMotion()` guard** on every animation. GSAP is opt-in only on a PRODUCT.md marketing/scroll-storytelling signal (now fully free incl. all plugins; requires `@gsap/react` + a hand-written `gsap.matchMedia()` reduced-motion guard). Three.js / React Three Fiber (R3F) are PARKED-AVAILABLE for a future 3D PRODUCT.md requirement only (R3F is the entry point, not raw Three.js). **ui-rules.md Rule 14 "Motion & Micro-interactions"** is the enforcement summary; full principles live in `motion.md`. **When to read:** at design phases 3.3 / Phase 4 Parts 5-6 / Phase 7 when `docs/DESIGN.md` or `ui-rules.md` are silent on a motion/timing/reduced-motion pattern. **INHERIT-not-REPLACE:** principles govern timing/structural decisions; the design system (`docs/DESIGN.md` motion tokens) governs values; conflicts logged to `DECISIONS_LOG.md`. Motion principles informed by Emil Kowalski's "Animations on the Web" (animations.dev) + the MIT-licensed emilkowalski/skills + vercel-labs/open-agents skill files (restated in the framework's own words). **Wired in:** `deploy-v31.sh` (copies to `.ai_prompt/motion.md`, GROUP 8, overwrite-with-backup), `sync-to-project.sh` (whitelist 24→25), `ui-rules.md` (Rule 14 + cross-ref note), `phases.md` (MODEL HOOK Read cues at the design phases), project `src/data/libraries.js` (GSAP + Magic UI specDrivenFit notes reconciled to Rule 14), project + repo CLAUDE.md (/scan-project rows + Skills note). **Counts:** UI Rules **13 → 14**, deliverable files **24 → 25**; all other canonical counts unchanged: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 9 V32 Dispatch Rules · 18 Phase Hooks · 5 MCP servers. **Migration:** re-run `deploy-v31.sh` / `spec-update` to deploy `motion.md`; restart Claude Code after deploy. |
| V32.13 | CI → Docker Hub → Komodo-API Auto-Deploy — Fleet Watchtower-Free Standard | **Every framework-scaffolded app now inherits a push-to-main → build+push image → Komodo-API staging redeploy pipeline at its Docker/deploy phase.** GitHub Actions builds + pushes `bonitobonita24/<app>:sha-XXXXXXX` + `:staging-latest` (multi-arch) to Docker Hub, then `deploy/komodo-deploy.sh` calls the Komodo API: `UpdateVariableValue` pins `<APP>_STAGING_TAG` to the exact SHA → `DeployStack` → poll `GetUpdate` (CI fails on a real deploy failure). **Replaces the V27 Komodo registry-poll (hourly, too slow) + Watchtower for app deploys** — Komodo's git-listener webhook does NOT fire for `files_on_host` stacks, so the API DeployStack call is the mechanism (proven in production by the `fmo-fisherfolk` stack). `kmd.powerbyte.app` is Cloudflare-fronted, so the helper sends a browser `User-Agent`. **Tag-variable contract:** staging compose image = `${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${STAGING_IMAGE_TAG:-staging-latest}`; Komodo staging stack env `STAGING_IMAGE_TAG = [[<APP>_STAGING_TAG]]` — deterministic SHA-pinned deploys + one-command rollback. **Repo Actions secrets:** `DOCKERHUB_USERNAME/TOKEN` + `KOMODO_API_KEY/SECRET` (dedicated `github-actions-ci` key, never the master key). **Production is NEVER auto-deployed — manual promotion only** (fleet prod-gating policy). **Canonical source of truth (vendor + point, do not reinvent):** `Server-Setups/Powerbyte-Hostinger/runbooks/komodo-ci-deploy.md` + `komodo/ci-deploy/{komodo-deploy.sh,docker-publish.template.yml}`. **NO count change** — the app-side workflow + helper are Phase-6 scaffold templates (like the existing `start.sh` / `push.sh`), NOT deploy-v31.sh deliverables. Canonical counts unchanged: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 13 UI Rules · 9 V32 Dispatch Rules · 18 Phase Hooks · **24 deliverable files** · 5 MCP servers. **Files changed:** `templates.md` (new Rule 5c — full templates + compose tag-variable contract + per-app enable checklist + manual-prod gate), `phases.md` (Phase 4 Part 8 `docker-publish.yml` V32.13 variant + `.env.staging` tag-variable note + Phase 6 staging-auto-deploy enable checklist), `Master_Prompt_v31.md` (V32.13 changelog + active-version bump + VERSION+FILENAME POLICY layer note), `Framework_Feature_Index_v31.md` (this row + header + §1.2 title + footer), `CLAUDE_v31_compact.md` (version marker + deploy pointer), `ChatGPT_V31_Cross_Audit_Prompt.md` (verification item + version markers). **Migration:** re-run `deploy-v31.sh` / `spec-update` to pick up the updated `templates.md` + `phases.md`; enable per app via the Rule 5c checklist. |
| V32.12 | Design-Principles On-Demand Reference — New Deliverable `.ai_prompt/design-principles.md` | **Adds a library-agnostic UI/UX design-principles on-demand reference as deliverable #24.** The file (`design-principles.md`) covers: hierarchy & layout, spacing, typography, the **9-state control contract** (default · hover · focus · active · disabled · loading · empty · error · success), UX laws (Fitts, Hick, Miller, Jakob's Law), WCAG by success-criterion + a QA checklist. Condensed from typeui.sh fundamentals (MIT license). **When to read:** at design phases 2.8 / 3.3 / Phase 4 Parts 5-6 / Phase 7 when `docs/DESIGN.md` or `ui-rules.md` are silent on a structural pattern, component state, or accessibility approach. **INHERIT-not-REPLACE:** principles govern structural decisions; the design system (`docs/DESIGN.md` tokens + shadcn/ui rules) governs token values; any conflict is logged to `DECISIONS_LOG.md`. **PA hardening:** Planning Assistant Step 7b.2 QA gate now requires all submitted `docs/DESIGN.md` to enumerate required component states + interactive patterns + anti-patterns + the QA checklist. **Wired in:** `deploy-v31.sh` (copies to `.ai_prompt/design-principles.md`, overwrite-with-backup), `phases.md` MODEL HOOK Read cues at all 4 design phases, `ui-rules.md` cross-reference as fallback for uncovered patterns/states/a11y, `CLAUDE_v31_compact.md` file-loading table, `Product_md_Planning_Assistant_v31.md` Step 7b.2 QA gate. **Count change: deliverable files 23 → 24** (18 files now in `.ai_prompt/`). All other canonical counts unchanged: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 13 UI Rules · 9 V32 Dispatch Rules · 18 Phase Hooks · 5 MCP servers. **Files changed:** `specdrivenprompt/design-principles.md` (new file), `deploy-v31.sh` (V32.12 group), `phases.md` (Read cues at 4 design phases), `ui-rules.md` (cross-ref note), `Product_md_Planning_Assistant_v31.md` (Step 7b.2 QA gate), `CLAUDE_v31_compact.md` (title + STRICTEST line + file-loading table), `Master_Prompt_v31.md` (V32.12 changelog + active-version bump), `Framework_Feature_Index_v31.md` (this row + header + footer), `AI_Tools_Skills_MCPs_Reference_v31.md` (deliverable set note), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.68-K.73 + verified-counts block), `CLAUDE.md` (deliverable list item #24 + counts), `CLAUDE_framework_repo.md` (counts), `public/documentation-hub.html` (counts). **Migration:** run `deploy-v31.sh` / `spec-update` on target projects to deploy `design-principles.md` to `.ai_prompt/`. |
| V32.11 | shadcn/studio Pro as the Default Design Generator — Phase-Routed /cui /iui /rui /ftc | **Adopts the owner's licensed shadcn/studio Pro MCP as the framework's DEFAULT design-generation path.** A user-global, BUILD-TIME generator built on shadcn/ui — output is plain shadcn/ui + Tailwind (MIT-compatible), so target apps carry NO runtime dependency on the Pro account. **Phase routing** so the build session never has to be told which command to use: **Phase 3.3** (design finalization) = `/cui` (Create-UI, page/section structure from Pro blocks) → `/iui` (Inspire-UI, per-section distinctiveness, ONE section at a time, Pro-only) → `/rui` (Refine-UI, polish), then compile tokens → `/design-refine` → sign off → capture DESIGN baseline; **Phase 4 Parts 5-6** = `/cui` + `/rui` only (design FROZEN at 3.3 — no `/iui`); **Phase 7** = `/cui` new pages, `/iui` new distinctive sections only, `/rui` polish; **`/ftc`** (Figma→Code) CONDITIONAL on a Figma source + the Figma MCP. **INHERIT-not-REPLACE (HARD):** generated blocks carry their own tokens and reconcile to `docs/DESIGN.md` / compiled tokens (ui-rules.md Rule 12) — never override the design system. **Fallback** when the Pro MCP is unreachable: the plain shadcn/ui MCP + Blocks gallery. Reconciles the two prior stale "shadcn-studio = not recommended (paid)" notes (`ui-rules.md` + `Master_Prompt_v31.md`) into a "sanctioned design generator" block now that the owner holds a Pro license. **Count change: MCP servers 4 → 5** (3 project-wired + 1 user-global + 1 plugin). All other canonical counts unchanged: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 13 UI Rules · 9 V32 Dispatch Rules · 18 Phase Hooks · 23 deliverable files. **Files changed:** `Master_Prompt_v31.md` (sanctioned-generator note + V32.11 changelog + active-version bump), `ui-rules.md` (sanctioned-generator subsection replacing the not-recommended note), `phases.md` (MODEL HOOKs at Phase 2.8→3.3 / Parts 5-6 / Phase 7), `CLAUDE_v31_compact.md` (title + STRICTEST line + MCP block 4→5), `AI_Tools_Skills_MCPs_Reference_v31.md` (new §2.5), repo root `CLAUDE.md` (phase-table generator row + V32.11 note + counts 4→5), `CLAUDE_framework_repo.md` (MCP roster + counts 4→5), this file (V32.11 row + header + footer + Note), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.67 + E.11 4→5). **Migration:** run `deploy-v31.sh` / `spec-update` on target projects; restart Claude Code after deploy. |
| V32.10 | Mandatory Compose Resource Limits — Top-Level mem_limit/mem_reservation/cpus on Stage/Prod Services | **Mandates per-service Docker resource caps in all framework app stage/prod compose files using top-level keys** (`mem_limit`, `mem_reservation`, `cpus`) **rather than a `deploy:` block** (Komodo / `docker compose up` run non-swarm; `deploy.resources` is silently ignored). Provides a per-service-role default table (app 640m/192m/1.0 · worker 512m/128m/1.0 · postgres 512m/128m/1.0). Critical caveat: a DB's `mem_limit` MUST exceed its buffer-pool size (e.g. `innodb_buffer_pool_size=512M` → cap ≥ 768m) or the container OOM-kills under load. Dev compose is exempt. Already committed in `templates.md` (commit b1415d9). **Zero count change — templates.md behavior addition only; no new rule/scenario/prompt/deliverable/file.** |
| V32.9 | Compliance & Data Privacy Layer — Rule 33 + privacy.md Deliverable #23 + WCAG 2.2 AA Gov/LGU Hard Gate + ASVS 5.0 Refresh | **Adds the PH Data Privacy Act (RA 10173 / NPC) as a first-class framework concern.** **Rule 33 — Compliance & Data Privacy:** every app built with the framework must surface its data-privacy and accessibility posture; for PH government/LGU apps WCAG 2.2 AA is a hard gate (DICT MC 004); `ph-data-privacy` skill generates DPA-compliant notices, data-flow maps, NPC breach-notification templates; `accessibility-agents` skill drives automated a11y checks. **New deliverable #23 — `privacy.md`** (`→ .ai_prompt/privacy.md`): PH Data Privacy Act compliance rules, WCAG 2.2 AA gate, ComplianceFooter component guidance, honest badge policy (design-claims on, cert-badges off unless real). **Hook 18 — Compliance/Data-Privacy Gap-Surfacing:** injected at Phase 5 OUTPUT CONTRACT pre-flight — Sonnet Scout checks for missing DPA notices, absent WCAG gate, or stale ComplianceFooter badge claims. **Security refresh:** `security.md` updated to ASVS 5.0 + OWASP Top 10:2025 (84→98 checklist items across 13→14 sections; §14 Compliance & Privacy added). **PA expansion:** Planning Assistant gains §12 Compliance & Data Privacy (PA Rules 11→12) + 4 new interview Qs in Step 5 that surface DPA scope, PH gov/LGU status, and WCAG obligation. **PRODUCT.md gains §12 Compliance & Privacy** (11→12 sections). **Count changes:** Rules 32→33 · Deliverables 22→23 · UI-rules 12→13 · Phase-hooks 17→18 · Checklist 84→98 items / 13→14 sections · PRODUCT.md sections 11→12 · PA Rules 11→12. Scenarios and Prompts unchanged (39 · 61). **Files changed:** `Master_Prompt_v31.md` (Rule 33 + V32.9 changelog), `CLAUDE_v31_compact.md` (rules header + counts), `privacy.md` (new deliverable #23), `ui-rules.md` (Rule 13 WCAG 2.2 AA), `phases.md` (Hook 18 + Phase 5 OUTPUT CONTRACT), `memory-governance.md` (§3 Hook 18 entry), `security.md` (ASVS 5.0 + §14 + item total 84→98), `bootstrap.md` (Step 11 privacy scaffold), `scenarios.md` (Scenario 40 placeholder — NOT added; scenarios stay 39), `templates.md` (ComplianceFooter template), `Product_md_Planning_Assistant_v31.md` (PA §12 + Rule 12 gap-reminder + interview Qs), `deploy-v31.sh` (privacy.md → deliverable #23), this file (V32.9 row + header + footer + counts), `CLAUDE.md` (counts update). |
| V32.8 | Design-as-Contract — Rule 31 + Rule 32 Verifiable-Done + Learning Loop | **Two new rules closing the UI-drift and done-definition gaps.** **Rule 31 — Design-as-Contract:** Style Dictionary v5 compiles `docs/design-tokens.json` (DTCG format) into CSS variables, Tailwind config, and Expo tokens from the same source-of-truth; a Playwright `toHaveScreenshot` visual-regression gate runs on every Phase 5 build and blocks merge on pixel diff. Phase 3.3 now emits a compiled token set instead of hand-authored CSS; Phase 5 gains a visual-diff step in its OUTPUT CONTRACT; Bootstrap gains Step 20 (token-pipeline init). **Rule 32 — Verifiable-Done + Learning Loop:** every DONE claim must be backed by three evidence types (automated test passing, human-visible screen at the correct URL, and log/metric confirming the feature path executed); a LESSONS_REGISTRY (`docs/LESSONS_REGISTRY.md`) accumulates per-session findings; a Claude Code Stop-hook auto-appends the session's lessons to the registry so findings survive context resets; `superpowers:verification-before-completion` skill drives the verifiable-done loop. **Count changes:** Rules 30→32 · Scenarios 35→39 · UI-rules 11→12 · Phase-hooks 14→17 · Bootstrap-steps 19→20 · Deliverable-files 20→22 · Memory-governance sections 5→6. **Spike:** `14a1813`. **Files changed:** `Master_Prompt_v31.md` (Rule 31 + Rule 32 + V32.8 changelog), `CLAUDE_v31_compact.md` (rules header + phase menu), `phases.md` (Phase 3.3 token-pipeline step + Phase 5 visual-diff OUTPUT CONTRACT + Bootstrap Step 20), `ui-rules.md` (Rule 12 Style Dictionary token source-of-truth), `scenarios.md` (Scenarios 36-39), `memory-governance.md` (§6 LESSONS_REGISTRY + Stop-hook), `bootstrap.md` (Step 20 token-pipeline init), `deploy-v31.sh` (deliverables 20→22 + new token pipeline + LESSONS_REGISTRY files), this file (V32.8 row + header + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.51-K.52 verification items), `AI_Tools_Skills_MCPs_Reference_v31.md` (Style Dictionary v5 + Playwright visual gate + LESSONS_REGISTRY + Stop-hook + verification-before-completion). |
| V32.8.1 | Drop getdesign.md / awesome-design-md — shadcn/ui CSS Variables Are the Only Design Source | **Removes all references to the external design catalogs `getdesign.md` and `VoltAgent/awesome-design-md` from live/instructional framework text. shadcn/ui has always been the only UI implementation system; this patch makes it the only design-token SOURCE as well.** Previously, Planning Assistant Phase 2.8 Step 0 directed users to browse `https://getdesign.md/` to pick an aesthetic, and Prompt 4.8 fetched raw DESIGN.md files from `github.com/VoltAgent/awesome-design-md`. Neither external dependency is necessary: the Planning Assistant can derive accurate shadcn/ui CSS custom property values (HSL colors, font stack, radius, spacing) for any well-known visual direction (Linear, Stripe, Vercel, Supabase, etc.) from its own knowledge. The names ("Linear-style", "Stripe-style") are now treated as shorthand visual directions, not catalog lookup keys. **What changed:** (1) `Product_md_Planning_Assistant_v31.md` Phase 2.8 Step 0 prompt rewritten — no catalog URL, no external fetch; user names a direction, PA derives CSS variables. Step 1 output line updated. Step 7b DESIGN.md header updated (source → theme direction). Step 7c PRODUCT.md pointer updated. (2) `scenarios.md` Scenario 33 CONTEXT block updated (4 sections derived from theme direction, not extracted from awesome-design-md). WHAT AGENTS DO NOT DO block updated (no external CSS copy). LEGAL POSTURE block rewritten (shadcn variables only, no third-party catalog). (3) `Prompt_References.md` — changelog line 19, Prerequisites line, Starting State diagram DESIGN.md annotation, Phase 2.8 description, Prompt 4.8 full rewrite (title, summary, what-it-does, 4.8.1, 4.8.2 prompt body, 4.8.4 re-skin prompt, integration table), index entry at 4.8 and Scenario 33. (4) `Prompt_References.html` — full parity mirror of all .md changes (title, summary, 4.8.1 heading+table header, 4.8.2 code body, 4.8.4 code body, integration table, DESIGN.md diagram line, 1.3.1 bullet). **No count changes** — no rules/scenarios/prompts/bootstrap steps added or removed. The 39 scenarios, 32 rules, 61 prompts, 20 bootstrap steps, 22 deliverable files, 12 UI rules, 17 phase hooks are all unchanged. **Files changed:** `Product_md_Planning_Assistant_v31.md`, `scenarios.md`, `Prompt_References.md`, `Prompt_References.html`, `Framework_Feature_Index_v31.md` (this file), `ChatGPT_V31_Cross_Audit_Prompt.md`. **Migration:** no deploy-script change; restart Claude Code + re-run `spec-update` on target projects to pick up updated `.ai_prompt/` files. |
| V32.7.5 | lint-deploy.sh Promoted to Deliverable #20 — Pre-Deploy Footgun Gate Now Shipped | **Promotes `lint-deploy.sh` (the pre-deploy static footgun linter wired into phases.md at V32.7.4) from a referenced-but-unshipped tool to framework deliverable #20.** Before this patch, phases.md Phase 5 OUTPUT CONTRACT + Phase 6 PRE-DEPLOY FOOTGUN GATE instructed `bash scripts/lint-deploy.sh deploy/compose`, but `deploy-v31.sh` never copied the script to target apps — the gate referenced a file that did not exist there. V32.7.5 closes that gap: `deploy-v31.sh` GROUP 6 now copies `lint-deploy.sh` to target `scripts/lint-deploy.sh` (overwrite-with-backup + `chmod +x`). The script encodes the 8 recurring Traefik/compose/shell footguns (C1 compose parse · C2 certresolver lowercase · C3 websecure tls=true label · C4 127.0.0.1 healthcheck · C5 no build: in stage/prod · C6 push.sh login guard · C7 start.sh COMPOSE_PROJECT_NAME · C8 shellcheck all *.sh). **Deliverable count: 19 → 20.** **Files changed:** `deploy-v31.sh` (header banner V32.7.2→V32.7.5 + GROUP 6 copy block + PRE-FLIGHT/SUMMARY listings + expected-layout), `lint-deploy.sh` (added to `/specdrivenprompt/` as the deliverable source), `Master_Prompt_v31.md` (V32.7.4 + V32.7.5 changelog + VERSION+FILENAME POLICY active-version bump V32.7.3→V32.7.5), `CLAUDE_v31_compact.md` (title + STRICTEST line), `Framework_Feature_Index_v31.md` (V32.7.4 + V32.7.5 rows + header + footer + deliverable-set 19→20), repo root `CLAUDE.md` (deliverable count 19→20 + file #20 in the enumerated list + Canonical Counts), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.49 supersession note + K.50 verification item). All other canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 9 V32 Dispatch Rules · 14 Phase Hooks. **Migration:** run `deploy-v31.sh` / `spec-update` on target projects — the script lands at `scripts/lint-deploy.sh`, executable. |
| V32.7.4 | lint-deploy.sh Phase 5/6 Gate Wiring — Pre-Deploy Footgun Linter Referenced | **Names `scripts/lint-deploy.sh` as the pre-deploy validation gate in `phases.md`.** Phase 5 OUTPUT CONTRACT gains a `□ lint-deploy.sh: exit 0` checklist item (`bash scripts/lint-deploy.sh deploy/compose` before any staging/prod push); Phase 6 opening gains a `PRE-DEPLOY FOOTGUN GATE` block with the same command + the C1–C8 check summary (dev compose excluded from TLS/build: checks). Tooling-gate reference only — NOT a new framework rule, scenario, or prompt. At this version the script was referenced but not yet shipped by `deploy-v31.sh` (closed at V32.7.5). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 19 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks. |
| V32.7.3 | Design Baseline Back-Port Surface Check — Post-Gate Design-Drift Reconciliation | **Closes the gap V32.5/V32.6 left open: those prevent mockup→app design drift DURING the build (INHERIT-not-REPLACE + the Phase 3.3 hard gate), but nothing required an owner-approved design change (palette/theme/layout) landing AFTER the Phase 3.3 gate closes — during Phase 4 Parts 5-6, Phase 7, or Phase 8 — to be back-ported into the `docs/DESIGN.md` + `docs/MOCKUP.jsx` baseline.** Result: the mockup goes stale and the app diverges — the Marine-Guardian failure mode (Meta-Dark mockup frozen 2026-05-05, shadcn-neutral re-skin shipped 2026-06-15, baseline never updated). Mirrors V32.5.5 EXACTLY in posture: adds a **non-blocking Phase 7 + Phase 8 pre-flight MODEL HOOK** that dispatches a Sonnet Scout to diff the app's live theme tokens (`apps/[web]/src/app/globals.css` CSS variables + Tailwind theme config) against the `docs/DESIGN.md` / `docs/MOCKUP.jsx` baseline tokens and surfaces a **"🎨 Design Back-Port Candidates"** report. **This token-diff is the detection mechanism that CLOSES framework TODO-21** (per-wave `globals.css` ↔ `MOCKUP.jsx` token diff). On an owner-approved divergence: **INHERIT-not-REPLACE back-port** — update `docs/DESIGN.md` tokens AND annotate/expand `docs/MOCKUP.jsx` (annotate/expand the existing mockup; full regenerate ONLY on a wholesale change — the mockup stays the UI source of truth). Unlike PRODUCT.md, `docs/DESIGN.md`/`docs/MOCKUP.jsx` are NOT human-only — Claude Code MAY write the back-port to mirror an already-approved change, never to invent design intent (Rule 1 preserved). Human logs `design-divergent: <reason>` in DECISIONS_LOG.md to suppress. Surface-and-inform only — NEVER gates phase closure. **Files changed:** `Master_Prompt_v31.md` (V32.7.3 changelog entry + VERSION+FILENAME POLICY active-version bump V32.7.2→V32.7.3), `phases.md` (V32.7.3 Design Baseline Back-Port MODEL HOOK added to both the Phase 7 and Phase 8 pre-flight blocks, alongside the V32.5.5 spec check), `memory-governance.md` (§3 closing note documents the V32.7.3 design check layering on the Phase 7/8 governance hook — NOT a new injection point), this file (V32.7.3 row + header + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.48 verification item + purpose paragraph range K.1-K.47→K.1-K.48). **Counts unchanged** (mirrors V32.5.5: a non-blocking pre-flight MODEL HOOK is not a new §3 phase-hook injection point): 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 19 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks. **Migration:** no deploy-script change; restart Claude Code after `deploy-v31.sh` / `spec-update`. |
| V32.7.2 | TODO-7a Levers 2-3 — spec-executor Subagent + settings.json Skill-Budget Caps | **Ships the two deferred levers from the V32.7 TODO-7a dispatch-blocker fix.** Lever 2: `spec-executor.md` added as deliverable #18 — deploys to `.claude/agents/spec-executor.md` on target projects; defines a custom Sonnet executor subagent with restricted tools (Read/Write/Edit/Bash/Grep/Glob), no MCP servers, and minimal baseline so Sonnet executes reliably without inheriting the full skill-listing context; framework executor dispatch rules R1/R5/R7 now target this named subagent. Lever 3: `settings.json` added as deliverable #19 — jq-merged into `.claude/settings.json` on target projects; sets `skillListingBudgetFraction: 0.01` and `maxSkillDescriptionChars: 1024` to cap the skill-listing context overhead that triggered "Prompt is too long" on fresh subagent dispatches (the root cause V32.7 Lever 1 addressed architecturally; Levers 2-3 add defense-in-depth). **Deliverable count: 17 → 19.** All other canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 9 V32 Dispatch Rules · 14 Phase Hooks. |
| V32.7.1 | Planning Assistant Dual-Host — Additive Docs-Only Patch | **Blesses running the Planning Assistant interviewer role in a dedicated Claude Code session opened in the project folder (preferred) in addition to the existing Claude.ai path.** The Claude Code path is now preferred because it gains access to the installed skills library. The Claude.ai path remains fully valid. No behavior change, no count change, no deploy-behavior change. **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks. |
| V32.6.1 | Prompt 3.23.C Semantic Shift — Auto-rebuild → Manual Handoff | **Replaces the original V32.5.3 paste-able "3.23.C — Full Rebuild from PRODUCT.md" mega-prompt (a single 50+-line REBUILD SEQUENCE block driving Phase 0 → 6.5 in one Claude Code session) with a "3.23.C — Resume the rebuild manually" handoff card that routes the human back to Prompt 1.3.1 (Phase 0 Bootstrap) with an optional Prompt 2.9 (Validate Spec Consistency) pre-check.** Two problems closed in one patch: (1) the original 3.23.C was the exact autopilot/thrashing surface the framework was built to prevent — a single context driving the whole rebuild is the failure mode V32 ZOE, V32.2 R7 Parallel Fan-Out, V32.3 R6 Smart Hydration, and V32.6 Phase 3.3 were each designed to eliminate; (2) the auto-rebuild routed straight from Phase 3 to Phase 4 Parts 1-8, silently SKIPPING the V32.6 Phase 3.3 hard gate (a project rebuilt via the original 3.23.C would lose the behavioral-blueprint validation Phase 3.3 was added to enforce). Manual phase-by-phase rebuild gets fresh dispatch context + explicit human gate at every boundary — the same loop a brand-new project follows. **Why route to Prompt 1.3.1 instead of Prompt 1.2 Universal Analyzer?** After 3.23.B the project state is *known* (clean app dirs + preserved spec + redeployed framework); the analyzer exists to detect *unknown* state, and its routing logic has no clean branch for "clean-slate-with-preserved-spec" — it could mis-route to Path A (regenerate PRODUCT.md) or Path B (brownfield adopt). Direct routing to Phase 0 Bootstrap is more honest. **Files changed:** `Prompt_References.md` (3.23.C section rewritten — paste-prompt code block deleted, replaced with two bold anchor-link CTAs + 4-row resume table + "Why skip Prompt 1.2" rationale + "No autopilot" warning; 3.23.B tail line + sanity-check row + "Manual rebuild runs over many sessions" warning aligned), `Prompt_References.html` (3.23.C `<div class="code-body">` REBUILD SEQUENCE deleted, replaced with `<div class="resume-card">` containing two `<a class="resume-cta">` links to `#p-2-9` and `#p-1-3` + 4-step ordered list + two `<div class="resume-rule">` blocks; 3.23.B tail line + sanity-check row + multi-session warning aligned; new `<style>` block scoped to `.resume-*` classes; hero eyebrow V32.6→V32.6.1), `Master_Prompt_v31.md` (V32.6.1 changelog above V32.5.5 + VERSION+FILENAME POLICY V32.6→V32.6.1), `CLAUDE_v31_compact.md` (title + STRICTEST line V32.6→V32.6.1), this file (V32.6.1 row + header + §1.2 title + footer + deliverable-set V32.6→V32.6.1), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.44 verification item + K.40 V32.6.1 supersession note + K.43 V32.6.1 supersession note + K.40 LOOK-FOR (c)/(i) annotation + FAIL trigger update + Rationale update + purpose paragraph K.1-K.43→K.1-K.44 and version list adds V32.6.1), `deploy-v31.sh` (cosmetic header V32.6→V32.6.1). **Historical preservation:** V32.5.3 changelog row in this file (line below) and V32.5.3 entry in Master_Prompt that describe "3.23.C Full rebuild from PRODUCT.md" are NOT modified — they accurately describe what shipped at V32.5.3 and remain frozen per Rule 4. **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks. **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` / `spec-update`. **Verification:** full grep sweep across 17 framework files for stale "Full Rebuild from PRODUCT.md" / "paste Prompt 3.23.C" / "REBUILD SEQUENCE" / "auto-rebuild" references — only historical V32.5.3 changelog entries match (intentionally preserved). |
| V32.6 | Interactive Prototype & Simulation Phase (Phase 3.3) | **Adds Phase 3.3 — Interactive Prototype & Simulation — as a new sub-phase between Phase 3 (spec generation) and Phase 3.5 (execution plan). Born from the "Orqafy lesson": spec completion ≠ a working app; wiring breakage found at Phase 8 is the costliest to fix, so behavior/wiring validation is pulled forward before scaffolding. Phase 3.3 builds a durable, client-validated interactive prototype with a project-defined simulated backend (browser-storage / in-memory mock service / static fixtures — chosen per app, always mirroring the Phase 3 schema shape) from the Planning Assistant baseline (`docs/DESIGN.md` + `docs/MOCKUP.jsx`) + the Phase 3 spec. The validated prototype becomes the behavioral blueprint that Phase 4 wires the production backend to (swap simulated→real behind the same interface boundary). **Design-system finalization MOVED** from Phase 4 Parts 5-6 to Phase 3.3: designer-skills `/design-tokens` EXPAND, `/design-review`, `/design-refine` now run at 3.3. Phase 4 Parts 5-6 becomes "wire validated prototype to production backend + regression `/design-review` only." **Hard gate-closure** (mirrors V32.5.1): `/design-review` green + every Core User Flow walked + client sign-off, before Phase 3.5 begins. **New outputs:** `docs/PROTOTYPE.md` (durable blueprint) + `prototype/` dir + client sign-off logged to `docs/DECISIONS_LOG.md`. **Rule 1 unchanged** (PRODUCT.md stays human-only). **Top-level phases stay 0–8** (3.3 is a sub-phase). **Phase Hooks 13 → 14** — Phase 3.3 adds a memory-governance pre-flight, so `memory-governance.md §3` enumerates 14 injection points (was 13). All other canonical counts unchanged — 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · **14 Phase Hooks**. **Files changed:** `Master_Prompt_v31.md` (Phase 3.3 definition + V32.6 changelog), `phases.md` (Phase 3.3 full execution steps + MODEL hooks), `CLAUDE_v31_compact.md` (title + STRICTEST line + Phase 3.3 phase menu entry + Phase 3.5 "auto after Phase 3.3"), this file (V32.6 row + header + §1.2 title + footer), `deploy-v31.sh` (cosmetic header), `CLAUDE.md` (Phase 3.3 row in skills table + V32.6 clause in designer-skills paragraph). **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` / `spec-update` — existing apps insert Phase 3.3 before their next Phase 4 (or before the next time they revisit spec). |
| V32.5.5 | DECISIONS_LOG ↔ PRODUCT.md Back-Port Surface Check | **Closes the single largest documented unenforced governance surface — answered clarifications drift between `docs/DECISIONS_LOG.md` and `docs/PRODUCT.md`. Zero count / rule / scenario / prompt change — pure additive MODEL-hook language.** Locked decisions captured in DECISIONS_LOG.md are never automatically back-ported into PRODUCT.md (Rule 1 forbids AI writes to PRODUCT.md, so the spec silently falls behind the decision log). Phase 8's existing completeness check catches *structural* gaps (declared-but-unbuilt sections) but NOT *answered-clarification* drift. V32.5.5 adds a **Back-Port Surface Check** to the Phase 7 (Feature Update) + Phase 8 (Buildout) pre-flight in `phases.md`: before the phase body, Opus dispatches a Sonnet Scout to compare every locked decision in DECISIONS_LOG.md against PRODUCT.md and surfaces a **"📋 Back-Port Candidates"** report (entity · decision value · log timestamp · suggested PRODUCT.md section) at the top of phase output. **Non-blocking — NEVER gates phase closure; surface-and-inform only.** Rule 1 unchanged: PRODUCT.md edits remain human-only — Claude Code MUST NOT write to PRODUCT.md. Human back-ports, defers, or logs `spec-divergent: <reason>` in DECISIONS_LOG.md to suppress on the next run. Scout runs conditionally (only when DECISIONS_LOG.md mtime is newer than the last Back-Port report); clean state emits a single collapsed `✅ no back-port candidates` line. **Files changed:** `phases.md` (2 MODEL HOOK insertions — Phase 7 + Phase 8 pre-flight), `Master_Prompt_v31.md` (V32.5.5 changelog above V32.5.4 + VERSION+FILENAME POLICY V32.5.4→V32.5.5), `CLAUDE_v31_compact.md` (title + STRICTEST line), this file (V32.5.5 row + header + §1.2 title + footer + deliverable-set V32.5.4→V32.5.5), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.42 audit item + V32.5.4→V32.5.5 markers + purpose paragraph K-range), `deploy-v31.sh` (cosmetic header V32.5.4→V32.5.5). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 13 Phase Hooks. **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` / `spec-update` — existing apps gain the check at their next Phase 7 or Phase 8. **Verification:** 4-Scout pre-ship + 5-Scout post-ship audit. |
| V32.5.4 | Cosmetic Sweep + Changelog Reorder | **Closes 3 minor findings from V32.5.3 5-Scout post-ship audit. Zero count/behavior change.** (1) Prompt_References.html warning #4 in 3.23 card uses `<div class="callout warning">` (was plain `callout` — Scout 1 finding CP16); now visually parity with the other three warnings in the card. (2) ChatGPT cross-audit `### V32.5 verified counts` heading bumped to `### V32.5.3 verified counts` to label-match the version that last set the canonical Prompts count (Scout 3 advisory); block contents were already correct. (3) Master_Prompt_v31.md V32.4.1 changelog entry reordered above V32.5 — was sitting below V32.5, chronologically incorrect (V32.4.1=2026-06-03 predates V32.5=2026-06-04) and semantically incorrect (V32.4.1 is a V32.4 patch); now sits between V32.4 and V32.5.3 at the top of the V32.5.x newest-first block. Scout 4 finding (pre-existing defect not introduced by V32.5.3). **Files changed:** `Prompt_References.html` (callout class fix + hero eyebrow V32.5.3→V32.5.4), `ChatGPT_V31_Cross_Audit_Prompt.md` (verified-counts heading + title + K.41 audit item + K.40 supersession note + count-diff line + K.1-K.40→K.1-K.41), `Master_Prompt_v31.md` (this changelog + V32.4.1 reorder + VERSION+FILENAME POLICY V32.5.3→V32.5.4), `CLAUDE_v31_compact.md` (title + STRICTEST line), this file (V32.5.4 row + header + footer + §1.2 + deliverable-set V32.5.3→V32.5.4), `deploy-v31.sh` (cosmetic header). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 13 Phase Hooks. **Migration:** no deploy script change. |
| V32.5.3 | Clean-Slate Rebuild Scenario (Prompt 3.23) | **Adds Prompt 3.23 — Clean-Slate Rebuild from Preserved Spec — to `Prompt_References.md` and `Prompt_References.html` in Scenario Group 3 (Maintenance).** Three-stage paste-ready recovery flow for systemically-glitchy Phase 8 projects where `docs/PRODUCT.md` is still trustworthy: (Pre-flight) shell `spec-update .` + git snapshot tag → (3.23.A) Claude Code dispatches Sonnet to preserve `docs/` + `CREDENTIALS.md` + `.env*` + `.ai_prompt/` + `.git` + README, tar-snapshots the preserve set to `~/clean-slate-backup-<timestamp>.tar.gz`, awaits explicit "proceed" before any rm, verifies `ls -la` after deletion → (3.23.B) `bash deploy-v31.sh` re-deploys framework, restart Claude Code → (3.23.C) Full rebuild from PRODUCT.md following Phase 0 → 3 → 3.5 → 4 (Parts 1-8 with V32.5.1 design-gate-closure at Parts 5-6) → 5 → 6 → 6.5, one phase per fresh dispatch, V32.x ZOE discipline throughout. Includes sanity-check checklist, "when to use this vs lighter alternatives" decision table (Phase 7 / 7R / 3.14 / 3.19 / 2.9 / 3.13 / 3.23), and 4 critical warnings (verify PRODUCT.md is current; do NOT delete lessons.md; runs over multiple sessions; keep backup tar until Phase 6.5 passes). **Count changes:** 60 → 61 Prompts; 37 → 38 NEW ✨. All other canonical counts unchanged. **Files changed:** `Prompt_References.md` (Prompt 3.23 inserted after 3.22), `Prompt_References.html` (full prompt card + sidebar nav-link `3.23 Clean-Slate Rebuild ✨` + hero stats 60→61 / 37→38 + hero eyebrow V32.5.2→V32.5.3), `Master_Prompt_v31.md` (V32.5.3 changelog above V32.5.2 + VERSION+FILENAME POLICY V32.5.2→V32.5.3), `CLAUDE_v31_compact.md` (title + STRICTEST line extended + "60 prompts total" → "61 prompts total"), this file (V32.5.3 row + header + §1.2 title + footer count bump + deliverable-set note V32.5.2→V32.5.3), `ChatGPT_V31_Cross_Audit_Prompt.md` (V32.5.3 markers + verified counts block 60→61/37→38 + K.40 audit item + K.39 supersession note + K.1-K.39→K.1-K.40), `deploy-v31.sh` (cosmetic header V32.5.2→V32.5.3). **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh`. The new Prompt 3.23 is paste-ready for any glitchy project with a trustworthy `docs/PRODUCT.md`. **Verification:** 5-Scout post-ship audit planned (HTML parity / counts integrity / version markers / changelog ordering / deploy structure). |
| V32.5.2 | Prompt_References HTML Parity Fix | **Post-V32.5.1 5-Scout audit fixup. Zero count/behavior change.** Scout 4 found three cosmetic HTML-only divergences in the new "How the Spec-Driven AI Mega Prompt Works" section (the MD had richer detail than the HTML rendering). V32.5.2 brings the HTML to full content parity. **Fixes:** (a) HTML Gate-keepers row Model cell `designer-skills` → `designer-skills (Phase 2.8 / 4.5-6 / 7)` — phase annotation restored; (b) HTML Memory row Model cell `Smart Checkpoint Protocol` → `Smart Checkpoint Protocol (V31.1 → V32.3)` — version range restored; (c) HTML "Why this prevents thrashing" callout expanded from single paragraph back to 4-bullet list matching the MD structure, restoring the lost phrase "Each Sonnet gets a slice it can hold whole." **Files changed:** `Prompt_References.html` (3 cosmetic content fixes + hero eyebrow V32.5.1→V32.5.2), `Master_Prompt_v31.md` (V32.5.2 changelog + VERSION+FILENAME POLICY V32.5.1→V32.5.2), `CLAUDE_v31_compact.md` (title + STRICTEST line extended), this file (V32.5.2 row + header + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (V32.5.1→V32.5.2 markers + K.38 supersession note), `deploy-v31.sh` (cosmetic header V32.5.1→V32.5.2). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1–R9) · 13 Phase Hooks. **Migration:** no deploy script change; restart Claude Code if HTML view is open. The markdown was always canonical — V32.5.2 just brings the HTML rendering to match. |
| V32.5.1 | Designer-Skills Gate-Closure + Governance Hook Repair | **Post-V32.5 4-Scout audit fixup. Zero count/rule/behavior change beyond gate-closure clarification.** Scout A found V32.5 wiring solid but **gate-closure language was missing** from all three `phases.md` MODEL HOOKs — "cannot close until gate is green" only lived in `Prompt_References.md` Appendix B (human-facing), not in the agent-loaded execution file. V32.5.1 adds explicit gate-closure to: Phase 2.8 ("cannot close until `/design-review` returns green OR every flag resolved by `/design-refine`"), Phase 4 Parts 5-6 ("cannot close until `/design-review` returns green against scaffolded components; flags MUST be resolved before Part 7"), Phase 7 ("UI Feature Update cannot mark DONE until `/design-review` returns green; CHANGELOG_AI.md MUST record `design-review: green` or `green-after-refine` per Rule 15"). Scout B nit: `memory-governance.md §3` hook template bumped `ZERO OPUS EXECUTION (V32)` → `(V32.3)` and extended with the R6 size-qualifier sentence. Scout C defects: (a) §3 **Injection Points** enumerated as **13 hooks** (was 10 with Phase 4 collapsed) — Phase 4 expanded to four Part-pair hooks (1-2 / 3-4 / 5-6 / 7-8) matching the canonical "13" cited everywhere; (b) **Output Equivalence Guarantee** documented as new §3 subsection — Tiered Decomposition is result-preserving (Tier-3 N sub-batches produce the same final state as single-context); (c) **Mid-Session Thrash Rescue** subsection added pointing to Prompt 3.19 — clarifies Opus-executor escalation violates R1. Scout D defect: `Prompt_References.html` hero eyebrow bumped `v31 locked` → `v32.5.1 locked` (silent drift through every V32.x ship). **Also new:** `Prompt_References.md` + `.html` gain "**How the Spec-Driven AI Mega Prompt Works**" overview — visual presentation of the three skill-gated activation windows (Phase 2.8 / Phase 4 Parts 5-6 / Phase 7) + architectural-contract table (Architect / Executor swarm / Gate-keepers / Memory with token-discipline column) + sidebar nav-group `00 Overview`. **Files changed:** `phases.md` (3 MODEL HOOK gate-closure sentences), `memory-governance.md` (§3 template + 13-hook enumeration + Output Equivalence + Prompt 3.19 pointer), `Prompt_References.md`/`.html` (new "How it Works" section + sidebar nav + hero eyebrow), `Master_Prompt_v31.md` (V32.5.1 changelog + VERSION+FILENAME POLICY V32.5→V32.5.1), `CLAUDE_v31_compact.md` (title + STRICTEST extended), this file (row + header + §1.2 title + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.38 + V32.5→V32.5.1 markers), `deploy-v31.sh` (cosmetic header). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1–R9) · 13 Phase Hooks (now enumerated). **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` — existing apps gain stricter design-gate enforcement starting at next Phase 4 Parts 5-6 close or next UI-touching Feature Update. **Verification:** 4-Scout pre-ship audit (activation windows / Opus-Sonnet contract / context budget / cross-file consistency) — all 6 defects closed. K.38 added. |
| V32.5 | Designer-Skills Phase Integration | **Framework prescription of the `julianoczkowski/designer-skills` bundle at design-touching phases — no canonical count changes.** Phase A (shipped 2026-06-03) made the bundle discoverable + installable via `/scan-project` (approval-gated, frontend+styling signal); V32.5 makes them *prescribed by the framework* at Phase 2.8 hand-off, Phase 4 Parts 5-6 (Web UI), and Phase 7 (Feature Update UI-delta). **NOT a Primary Group slot.** **INHERIT-not-REPLACE contract** — Planning Assistant Step 7 emits `docs/DESIGN.md` (token baseline) + `docs/MOCKUP.jsx` (visual baseline) as the human-verified design contract; Claude Code's designer-skills MUST inherit: `/design-tokens` EXPANDS the DESIGN.md token table (never regenerates), `/design-review` audits MOCKUP.jsx against the expanded tokens, `/design-refine` runs ONLY on flagged components. Preserves Rule 1 (human owns PA artifacts). If PA Step 7 was skipped (no DESIGN.md), Phase 4 may invoke `/design-aesthetic` once to establish a baseline + log to PRODUCT.md Section 10 (Scenario 33 path). **Three MODEL hooks added** to `phases.md`: Phase 2.8 reference paragraph (hand-off contract), Phase 4 Parts 5-6 (EXPAND-not-replace + `/design-review` audit), Phase 7 (UI-delta `/design-review` + `/design-refine` flagged-only). **Files changed:** `Master_Prompt_v31.md` (changelog + VERSION+FILENAME POLICY V32.4.1→V32.5), `phases.md` (3 MODEL hooks + 2 supplementary-skill table rows at Phase 4 Parts 5-6 and Phase 7), `Product_md_Planning_Assistant_v31.md` (Step 7 hand-off note: DESIGN.md is baseline, designer-skills EXPAND not regenerate), `CLAUDE_v31_compact.md` (title V32.4.1→V32.5, STRICTEST line extended, Phase 2.8 menu line annotated), `CLAUDE.md` (Skills Library Awareness table — `†` advisory marker removed from 3 designer-skills entries; V32.5 deferral footnote replaced by INHERIT-not-REPLACE one-liner), this file (this row + header version + §1.2 title + footer feature-bullet), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.37 verification item + V32.4.1→V32.5 markers), `deploy-v31.sh` (cosmetic header V32.4.1→V32.5). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1-R9). **Verification:** 5-Scout post-ship audit (counts / propagation / patch-adversarial / HTML+SPA-parity / deploy+structure); K.37 added. **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` / `spec-update`. Existing apps with `docs/DESIGN.md` will start seeing designer-skills sharpening at next Phase 7 UI-delta. |
| V32.4 | react-doctor Phase Integration | **Per-phase supplementary skill — no canonical count changes.** Adds `react-doctor` (deterministic, oxlint-based React diagnostics by Aiden Bai / Million.js — state/effects, performance, architecture, security, a11y, bundle size) at the three React-touching phases in `phases.md` Step 6 Skill Activation Plan: Phase 4 Parts 5-6 (Web UI), Phase 5 (Validation), Phase 7 (Feature Updates). **NOT a Primary Group slot.** **Surfaced by `/scan-project`:** a React signal (react/next/react-native dep or `.tsx`/`.jsx` files) → one-shot read-only `npx react-doctor@latest` audit → recommended by actual issue count → installed only on explicit approval via `npx react-doctor@latest install` (**approval-gated external install** — distinct from ktx's signal-gated auto-install; ktx remains the only *unattended* auto-install). **Files changed:** `phases.md` (3 supplementary-skill table rows), `CLAUDE.md` (repo phase→skill table), `AI_Tools_Skills_MCPs_Reference_v31.md` (new §3.7 react-doctor + renumber Domain Packs→3.8 / Memory Governance→3.9 + last-updated V32.4), `CLAUDE_v31_compact.md` (title + STRICTEST line V32.3→V32.4), this file (row + header + §1.2 title + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.35 verification item + V32.3→V32.4 markers + verified-counts header), `deploy-v31.sh` (cosmetic header bump). Also: React SPA catalog (`src/data/skills.js` + 8 presets), `~/.claude/skills-library/SKILLS-INDEX.md`, and the `/scan-project` command (React diagnostics signal + Phase 2 audit gate + Phase 4 step 3c approval-gated install). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules. **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` — react-doctor surfaces in the next `/scan-project` on React projects. |
| V32.4.1 | Post-Ship Consistency Sweep | **No count / rule / behavior change.** A full 5-Scout cross-reference audit of V32.4 surfaced stale "Phase 4 Part 2" UI references and version-marker drift. Fixes: (1) ~18 LIVE "Phase 4 Part 2" UI/shadcn/loading-state references renumbered to Part 5 / Parts 5-6 (root cause — the V31.3 loading-state feature predated the Phase 4 expansion to Parts 5-6; V31.3 changelog entries preserved per Rule 4); (2) `CLAUDE_framework_repo.md` skill table gained react-doctor at Phase 4 Parts 5-6 / Phase 5 / Phase 7; (3) `deploy-v31.sh` Group 2 label "6 modular files" → "7"; (4) `Master_Prompt` VERSION+FILENAME POLICY block V32.1 → V32.4.1 (was 3 versions stale); (5) A.9 Chronological Adoption Playbook made version-agnostic + 2 silently-broken grep checks fixed. K.36 added. **Counts unchanged.** |
| V32.3 | Smart Governance Hydration — R6 allow-list size qualifier (>200 lines → Scout with Governance Extraction Schema) · Rule 4 reframed from "read" to "hydrate" | **R6 extension, not a new rule. No canonical count changes.** Production observation: V32.2 R6 explicitly exempted 5 governance docs (`PRODUCT.md`, `DECISIONS_LOG.md`, `CHANGELOG_AI.md`, `IMPLEMENTATION_MAP.md`, `STATE.md`) from Scout via the architect-read allow-list ("any size"). As those docs grow past 200 lines over a project's lifetime, R6 silently inverts — the very files V32.2 was designed to keep out of Opus context become the largest Opus reads in every Phase 7 / Feature Update. **Fix:** R6 allow-list gets a size qualifier — files ≤ 200 lines direct read (unchanged); files > 200 lines route through Scout-Sonnet with the new **Governance Extraction Schema** (`memory-governance.md §4`). Opus consumes the hydration brief, not the full file. **Rule 4 reframed:** 9-file list stays (provenance + integrity + audit trail), each doc declares its hydration mode — keyword-filtered (`lessons.md`, the prototype), domain-section-filtered (`PRODUCT.md`), recency+flag-filtered (`CHANGELOG_AI.md`), keyword+unresolved-filtered (`DECISIONS_LOG.md`), area-status-filtered (`IMPLEMENTATION_MAP.md`), session/task-scoped (`agent-log.md`), direct read for small/structural (`inputs.yml`, `inputs.schema.json`, `project.memory.md`). **Governance Extraction Schema** (new in `memory-governance.md §4`): per-doc YAML-shaped contract specifying what Scout returns (e.g., 🔴 gotchas verbatim, matched decisions verbatim, BLOCKED/PARTIAL areas regardless of domain). Dispatch template included. **Size threshold:** 200 lines via `wc -l` (same instrument R2/R3/R5 use). Why 200 not 100: allow-list governance docs are higher-signal-per-line than arbitrary source files (R6's 100-line threshold), so doubled. **R9 interaction:** direct Opus read of a >200-line allow-list governance doc counts as `opus_writes` for `dispatch_ratio` purposes — Opus context burn = same failure mode as Opus Edit/Write. **Files changed:** `Master_Prompt_v31.md` (Rule 4 amendment + R6 size qualifier + V32.3 changelog), `memory-governance.md` (R6 block updated + Governance Extraction Schema added before R7), `CLAUDE_v31_compact.md` (header V32.2→V32.3, STRICTEST line extended, Rule 4 one-liner, R6 size-qualified, 9 GOVERNANCE DOCS section hydration note, non-negotiable behavior hydrate-wording), `Framework_Feature_Index_v31.md` (this row + §1.2 title + footer + deliverable count), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.34 verification item + verified counts header bump + count diffs vs V32.2), `phases.md` (Phase 7 MODEL hook addendum), `deploy-v31.sh` (header cosmetic V32.2→V32.3). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files. V32 Dispatch Rule count: 9 (R1-R9) — V32.3 is an R6 *extension*, not R10. **New V32.3 invariant:** Architect-read allow-list size threshold = 200 lines. **Migration:** no deploy script change; restart Claude Code after `deploy-v31.sh` to pick up updated `memory-governance.md` + compact `CLAUDE.md`. Existing apps whose `DECISIONS_LOG.md` / `CHANGELOG_AI.md` already exceed 200 lines will start seeing Scout hydration in their next Phase 7. |
| V32.2 | Dispatch Discipline Expansion — R6 Scout-Before-Plan · R7 Parallel Fan-Out · R8 Opus Write Allow-List · R9 Dispatch Ratio Metric · DONE-status tightened | **Behavioral patch to V32, no canonical count changes.** Production diagnosis 2026-06-01: total model usage ~35%, Sonnet only ~10% — Opus burning ~71% on exploratory reads + serial dispatch turns. V32 R1-R5 enforced *who writes files* (Sonnet only) but left Opus's *reading cadence and dispatch parallelism* unconstrained. **Four new rules close the leak:** **R6 Scout-Before-Plan** (Opus reads of non-allow-list files >100 lines MUST go through Scout-Sonnet — no direct Opus reads of large files), **R7 Default Parallel Fan-Out** (≥2 independent Sonnet dispatches MUST be parallel in one Opus response — serial dispatch FORBIDDEN unless explicit data dependency), **R8 Opus Write Allow-List** (closes R1 ambiguity with enumerated CLOSED list of 5 files: `docs/STATE.md`, `docs/DECISIONS_LOG.md`, `docs/CHANGELOG_AI.md`, `docs/IMPLEMENTATION_MAP.md`, `.cline/STATE.md`; any other Opus Edit/Write is a R8 violation), **R9 Dispatch Ratio Metric** (Smart Checkpoint logs `dispatch_ratio = sonnet_writes / opus_writes`; target ≥ 3.0; < 1.0 triggers mandatory `lessons.md` drift review). **Sonnet Status Handling tightened:** DONE now requires Opus to read full git diff (or full file diff) before accepting — review-by-summary FORBIDDEN. **Dogfooded:** Phase 1 commit (e080115) used R7 (3 parallel Sonnet dispatches in one Opus response) and tightened-DONE (Opus read full git diff before commit). **Files changed:** `Master_Prompt_v31.md` (V32.2 changelog entry between V32.1.5 and `---`), `memory-governance.md` (Sonnet Status DONE tightened in §3; new §4 Dispatch Discipline Rules subsection with R6-R9 code examples + allow-lists; §2 Smart Checkpoint `dispatch_ratio` YAML field + cross-reference), `CLAUDE_v31_compact.md` (title bumped V32.1.5→V32.2, STRICTEST line extended, compact R6-R9 block in CONTEXT BUDGET section), `Framework_Feature_Index_v31.md` (this row + §1.2 subsection + footer), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.29-K.33 verification items + V32.2 verified-counts header + dispatch-rule-count 5→9 line), `phases.md` (5 MODEL hooks rewritten to reference R6 Scout + R8 Allow-List + R7 parallel + R9 ratio + tightened DONE). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 84 Security Checklist items · 16 Secure Code Gen sub-sections. **V32 Dispatch Rule count: 5 (R1-R5) → 9 (R1-R9).** Migration: no deploy script change required; restart Claude Code in target projects after `deploy-v31.sh` to pick up updated `memory-governance.md` + compact `CLAUDE.md`. R6-R9 activate automatically on next session. |
| V32.1.5 | Prompt 4.14 — Brownfield PA Adoption: Existing App / Mockup → Reverse-Extract PRODUCT.md | **First count change since V31.3.** Adds prompt 4.14 to fill a long-standing native-mode gap in `Product_md_Planning_Assistant_v31.md`. PA natively supports Situation A (blank interview), B (paste existing PRODUCT.md), and C (resume chat) — but has no native mode for *"reverse-extract PRODUCT.md from existing app artifacts."* Prompt 4.14 injects this as **Situation D** for the chat session: user uploads PA template + project artifacts (source code, screenshots, mockup, partial notes); PA produces a 3-column triage per required section (✅ CONFIRMED / 🟡 INFERRED / ❓ MISSING), walks gaps one at a time per Rule 7 pacing, runs Rule 5 quality verification, then writes the final PRODUCT.md. Phase 2.8 mockup conditionally skipped when a working UI artifact was uploaded. Final routing: working code → 1.5 (Brownfield Adoption), mockup only → 1.3, partial → 1.6, ambiguous → 1.2. **Files changed:** `Prompt_References.html` (new card p-4-14, nav link, hero stats 59→60 / 36→37, decision-tree), `Prompt_References.md` (mirror ## 4.14 + decision tree + What's New), `Master_Prompt_v31.md` (V32.1.5 changelog entry), `Framework_Feature_Index_v31.md` (this row + footer count bump), `CLAUDE_v31_compact.md` (title + count + STRICTEST line bumped to V32.1.5), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.28 verification item + verified counts block 59→60 / 36→37). **Counts changed:** Prompts 59 → 60 (NEW ✨ 36 → 37). All other counts unchanged. PA file itself unmodified — Situation D is injected at runtime via the kickoff prompt. |
| V32.1.4 | Deploy Script Post-Install Routing — PA Artifact Detection | **Resolves contradiction between deploy script and V32.1.1 Planning Assistant Step 7d.** Previously, `deploy-v31.sh` "Next steps" message always recommended pasting prompt 1.2 (Universal Analyzer), but V32.1.1 Step 7d told fresh-from-Planning-Assistant users to "type Bootstrap" instead. Users got two contradictory entry-point instructions. **New behavior:** deploy script checks for Planning Assistant artifacts in target — if `docs/PRODUCT.md` exists AND (`docs/DESIGN.md` exists OR `docs/MOCKUP.jsx` exists), the script prints the V32.1.1 Bootstrap → Phase 2 (operational interview) → Phase 3 sequence with explicit "Phase 2.8 SKIPPED" note. Otherwise (no PA signal — could be upgrade, brownfield, or hand-written PRODUCT.md case), keeps current prompt 1.2 Universal Analyzer guidance. Both paths remain valid; deploy script now picks the right one from observable state. PA-detected path also surfaces "If you'd rather auto-detect, paste prompt 1.2 instead" as a fallback. **Files changed:** `deploy-v31.sh` (Next steps block becomes conditional), `Master_Prompt_v31.md` (V32.1.4 changelog + V32.1.2/V32.1.3 retroactive entries), `Framework_Feature_Index_v31.md` (this row + footer), `CLAUDE_v31_compact.md` (title + STRICTEST line bumped to V32.1.4), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.27 verification item). **Counts unchanged.** |
| V32.1 | Sonnet Subagent Context Overhead — Operational Note | **Operational guidance, no rule changes.** Production finding from Yelli Phase 8 Task 3 (2026-05-27): Sonnet subagents dispatched via `Agent(model: "sonnet")` inherit ~30–50K tokens of baseline context (auto-loaded skills + MCP server descriptions) BEFORE any task work, triggering "Autocompact is thrashing" *earlier* than V32 R2's 500-line file-size gate alone predicts. **Mitigation (added to `memory-governance.md` §1 "Operational Note — Sonnet Subagent Context Overhead (V32.1)"):** dispatch prompts ≤ ~1K tokens; per-dispatch tool-use budget ≤ 5; verification runs on Opus side via `ctx_execute`; decompose by surface (file/import/test block) not by feature. **R4 relationship:** if thrash persists after re-decomposition, shrink scope further — never retry the same scope. **Prompt 3.21 (Opus Planning)** gets a new "V32.1 Dispatch Sizing Tip" callout in `Prompt_References.md` + `.html` linking back to the governance note. **Rules unchanged** — R1–R5 remain authoritative; R2's 500-line gate is still the primary dispatch check. **Files changed:** `memory-governance.md` (§1 subsection), `Prompt_References.md`/`.html` (3.21 callout), `Master_Prompt_v31.md` (V32.1 changelog), `Framework_Feature_Index_v31.md` (this row + footer), `CLAUDE_v31_compact.md` (title + one-line reference), `ChatGPT_V31_Cross_Audit_Prompt.md` (K.11–K.15 + verified counts header + footer). **Counts unchanged.** |
| V32 | Zero Opus Execution Dispatch System | **Mechanical replacement of behavioral rules.** Token estimation (Step 2.5 30K gate) REPLACED by `wc -l` file-size checks. Opus executor escalation (Step 2.5b) DELETED — that code path is removed entirely. **Five V32 Rules formalized:** R1 Zero Opus Execution (Opus never Edit/Write on project files; STATE.md exception only), R2 File-Size Dispatch (≤ 500 total lines per Sonnet task), R3 Large-File Guard (files > 300 lines need explicit line ranges), R4 Failure = Split (BLOCKED/thrash → re-decompose max 3 → defer; NEVER escalate to Opus), R5 Scout-Before-Edit (files > 200 lines → Sonnet Scout extracts context first). **Tier classification changed:** Tier 1 ≤ 500 lines + ≤ 4 files + 1 module; Tier 2 = 501-1500; Tier 3 > 1500. All mechanically verifiable. **Phase MODEL hooks rewritten** across `phases.md` (5 hooks) to state "ZERO OPUS EXECUTION (V32)" and reference the 500-line gate explicitly. **Why V32 was needed:** V31.4 failed in production (Yelli, 2026-05-26) — Sonnet plan write consumed 164.5K tokens vs 30K "limit" because the limit was just a prompt rule, never mechanically checked; Step 2.5b was used as a routine shortcut; behavioral prompt rules cannot fix structural design flaws. **Files changed:** memory-governance.md (§1+§3+§4 rewritten), CLAUDE_v31_compact.md (budget gate + agent stack), phases.md (5 MODEL hooks), Master_Prompt_v31.md (changelog + scope updates), Framework_Feature_Index_v31.md (this row + footer), ChatGPT_V31_Cross_Audit_Prompt.md (K.1-K.10 verification block + verified counts header), deploy-v31.sh (version refs), AI_Tools_Skills_MCPs_Reference_v31.md (Step 2.5b tombstone), Prompt_References.md (prompt 3.21 Step 2.5b tombstone). **Counts unchanged:** 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 59 Prompts · 11 UI Rules · 17 deliverable files. |
| V31.4 | Dispatch Discipline Patch — Architect-Execute Model extended to ALL phases + ad-hoc edits | **Extended scope:** Architect-Execute Model (previously Phase 4/7/8 only) now applies to ALL phases and ad-hoc edits. **Sonnet Scout sub-step (§4 step 1.5):** when Opus's initial discovery read is itself large (>30K tokens), dispatch a dedicated Sonnet subagent to do the read and return a structured summary — Opus never reads large files directly. **Tier 1 disambiguation:** Tier 1 action rewritten to explicitly mandate dispatch to `Agent(model: "sonnet")` rather than implying Opus may execute directly. **Phase hook MODEL lines rewritten in imperative form** across all phases in phases.md — replaced advisory "Use Architect-Execute Model (§4) — …" with the hard-stop directive: "STOP before executing. Opus's only allowed actions in this session are: read context, plan, decompose, review Sonnet output. All file writes MUST be dispatched via Agent(model: "sonnet") per §4." **Files changed:** Master_Prompt_v31.md (line 150 scope fix + V31.4 changelog block), memory-governance.md (Tier 1 wording + §4 Sonnet Scout step), CLAUDE_v31_compact.md (scope header), phases.md (5 MODEL lines rewritten), AI_Tools_Skills_MCPs_Reference_v31.md (line 358 scope fix), Framework_Feature_Index_v31.md (this row). Rule count: 30 (unchanged). Scenario count: 35 (unchanged). Bootstrap: 19 steps (unchanged). Prompts: 59 (unchanged). |
| V31.3 | UI Loading-State Dual-Path (Rule 11) + phantom-ui Integration | **NEW ui-rules.md Rule 11** mandates dual-path loading states: PATH A = shadcn `<Skeleton>` for shadcn-composed UI (RSC-safe, default); PATH B = `<phantom-ui>` wrapper from `@aejkatappaja/phantom-ui` (MIT, Lit Web Component, ~8KB gzip) for bespoke / non-shadcn UI. Structure-aware: phantom-ui measures real DOM at runtime — no skeleton twin to maintain. **HARD CONSTRAINT:** NEVER hand-roll a `*Skeleton.tsx` twin file for a custom component. **NEW Scenario 35** — Loading state for a custom (non-shadcn) component. Full step-by-step procedure for applying Rule 11 PATH B (classify component, install + pin phantom-ui, add JSX intrinsic declaration, wrap with phantom-ui, verify SSR pre-hydration CSS wiring). **NEW Bootstrap Step 19 — Loading Library Lock**. Records the dual-path policy + pin policy + classification source in DECISIONS_LOG.md. NO npm install at Bootstrap — actual installs happen in Phase 4 Part 2. **Phase 4 Part 2 update:** `npx shadcn@latest add skeleton` added to default shadcn add list. `npm i @aejkatappaja/phantom-ui` runs after; postinstall auto-wires `import "@aejkatappaja/phantom-ui/ssr.css"` into `app/layout.tsx`. Pin policy: accept `^0.10.1` initial, then pin to resolved exact version in package.json (overrides caret until explicit Phase 7 bump). **Planning Assistant update:** Phase 2.8 mockup now tags every rendered component with `data-loading-path="shadcn"` or `data-loading-path="custom"` on its outer wrapper. Phase 4 Part 2 reads these tags to pick the correct loading path per component automatically. **templates.md update:** new "UI LOADING STATE TEMPLATES" section with canonical snippets for Card/TableRow/FormField (PATH A) + basic wrapper + repeated rows + per-element opt-outs (PATH B) + JSX intrinsic declaration + pin policy. **Surface Additions Policy compliance:** `@aejkatappaja/phantom-ui` added to `src/data/` LIBRARIES_DB with match signal (project has shadcn deps AND custom components outside `components/ui/`). `/scan-project` Phase 2.6 surfaces it under "Loading States / Structure-Aware Skeletons"; Phase 1.5 Part C (Spec-Driven Fit) recommends during Phase 4 Part 2 and Phase 7 Feature Update. Rule count: 30 (unchanged). Scenario count: 34 → 35. Bootstrap: 18 → 19 steps. **UI Component Rules: 10 → 11.** Security Checklist, Secure Code Gen, Prompts, Phase count — all unchanged. |
| V31 | Phase 2.8 — Visual Alignment Checkpoint (Planning Assistant) + Interactive Prompt References UI | **Phase 2.8 added to Planning Assistant** (the Claude.ai chat that produces PRODUCT.md). Between Phase 2 Alignment Check and Phase 3 handoff, Claude now generates a clickable React (.jsx) mockup with industry-appropriate realistic dummy data using shadcn/ui conventions (Tailwind + Inter font + shadcn color tokens). User verifies Claude's interpretation of their spec BEFORE Phase 3 locks the architecture. HTML archive version generated after user confirmation (Step 7a). **Tiered rendering:** 5-8 critical screens at full fidelity, remaining screens as navigable placeholders. **Industry dummy data** mapped across 7 domains (ERP, Fisheries, Inventory, Healthcare, Education, Fintech, Government) — never Lorem ipsum. **Default-on-but-skippable:** `skip mockup` bypass, auto-skipped for apps with <2 screens. **Budget enforcement:** 3 full regens + 5 single-screen expansions max per project. **Ephemeral:** mockup is never committed to project repo. **WHO YOU ARE (AGENT ROLE)** in Planning Assistant expanded to "Product Specification Writer + Visual Design Preview Generator" with full DESIGN CAPABILITY DECLARATION. **In-place Cline deprecation** — Cline marked ⚠ DEPRECATED across all files. Claude Code (Claude Sonnet 4.6) handles everything Cline used to handle. `.cline/` folder structure preserved for historical continuity. **Prompt References additions** — 8 new prompts in original V31 lock (2.9 Validate Spec Consistency, 2.10 Pause/Resume Mid-Part, 3.12 Lessons Audit, 3.13 Dependency Health Check, 3.14 Rollback Safely, 4.1-4.5 Planning Assistant prompts). New scenario Group 4 (Planning Assistant Prompts) added. **Additive updates post-lock (documentation + 1 scenario + 1 planning step):** prompts 1.1.5, 1.2.5, 1.2.6, 1.2.7, 1.4.0, 1.7, **1.8**, 2.11, 2.12, 3.15, 3.16, 3.17, 3.18, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12 added; prompt 3.11 expanded. **Step 8b added to Planning Assistant interview** — per-page Mobile First / Mobile Ready auto-classification with heuristics-based suggestions, user review table, written into PRODUCT.md Mobile Needs section. Phase 2.8 mockup now renders mobile strategy badge on every screen. **Two sidebar decision-tree menus:** "🆕 New Planning Assistant arrived?" (4.6 / 4.9-4.12) and "🔀 Two upgrades pending?" (1.8 combined upgrade). Current total: 59 prompts, 36 New ✨. **Scenario 33 added** — DESIGN.md integration with shadcn/ui (maps VoltAgent/awesome-design-md catalog tokens into CSS variables). **Interactive HTML UI** — `Prompt_References.html` added as browser-friendly alternative to markdown: live search, expandable prompt cards, one-click copy, sidebar navigation, mobile-responsive. Same content as markdown — no behavioral change, additive deliverable only. **Deliverable count:** 13 → 16 files (added ChatGPT_V31_Cross_Audit_Prompt.md, Prompt_References.md, Prompt_References.html in .ai_prompt/ + deploy-v31.sh at project root). No PRODUCT.md format changes. No new rules. Adds 2 new scenarios (Scenario 33 DESIGN.md integration, Scenario 34 CREDENTIALS.md Agent-Proof Upgrade; count 32 → 34). No new bootstrap steps. V31 is additive to the Planning Assistant + documentation layer only. **Further post-lock additions (phases.md + Prompt_References.md):** Phase 3.5 — Execution Plan Generation (auto after Phase 3: complexity scan, context cost estimation with 120K budget, task decomposition, dependency ordering, skill activation, human review). Anti-thrashing rule added to Phase 4 (mandatory scope assessment, auto-subdivide if >12 files, Part 8 always subdivides). Skill Installer integration (Primary Group 6 slots, per-phase supplementary skills). code-review-graph setup signal (Phase 6 completion + Phase 7 pre-flight). Prompt 4.13 added — Add Automation to Existing Project (n8n / OpenClaw / Hybrid, 7-step flow). **Phase 8 anti-thrashing rule** added — same 12-file threshold as Phase 4, per-feature sub-batches, mandatory completeness check before committing (verifies every user flow, data field, permission guard, validation rule, and UI element from PRODUCT.md is implemented), STATE.md progress tracking with dependencies. |

---

*Last updated: V32.14 (33 rules · 39 scenarios · 20 bootstrap steps · 61 prompts (38 NEW ✨) · WSL2 native only · 25-file deliverable set · 98 security checklist items / 14 sections · 14 UI component rules · compact CLAUDE.md (ONLY auto-loaded file, V32.7) + 7 detail files in .ai_prompt/ (all on-demand, V32.7) · interactive HTML prompt references · DESIGN.md integration · Phase 3.3 interactive prototype + Phase 3.5 execution plan · Phase 4 + Phase 8 anti-thrashing rules · Skill Installer integration · Memory Governance Layer (6 sections, 18 phase hooks) · Architect-Execute Model — Zero Opus Execution (V32 — ALL phases + ad-hoc edits) · 500-Line Dispatch Gate (`wc -l` file-size checks) · Nine V32 Dispatch Rules (R1-R5 file-size mechanics + R6-R9 dispatch discipline) · R6 Scout-Before-Plan (non-allow-list reads > 100 lines via Scout-Sonnet) · R7 Default Parallel Fan-Out (≥2 independent dispatches MUST be parallel) · R8 Opus Write Allow-List (5 files: STATE.md, DECISIONS_LOG.md, CHANGELOG_AI.md, IMPLEMENTATION_MAP.md, .cline/STATE.md) · R9 Dispatch Ratio Metric (sonnet_writes / opus_writes ≥ 3.0) · Sonnet Status DONE tightened (full diff review mandatory — review-by-summary FORBIDDEN) · Sonnet Scout (R5 — files > 200 lines; R6 — non-allow-list reads > 100 lines) · **V32.3 Smart Governance Hydration** — R6 architect-read allow-list size qualifier (≤200 lines direct read; >200 lines route through Scout-Sonnet with Governance Extraction Schema in `memory-governance.md §4`); Rule 4 reframed from "read" to "hydrate"; per-doc hydration modes (keyword-filtered, domain-section-filtered, recency+flag-filtered, keyword+unresolved-filtered, area-status-filtered, session/task-scoped); R9 interaction — >200-line allow-list governance doc direct read counts as `opus_writes` for `dispatch_ratio` · UI loading-state dual-path with shadcn `<Skeleton>` + `<phantom-ui>` for custom components · Deploy-script PA-artifact detection routes fresh projects to Bootstrap, others to prompt 1.2 · Brownfield PA reverse-extraction via prompt 4.14 — Situation D injects PRODUCT.md generation from existing app/mockup artifacts) · **V32.4 react-doctor Phase Integration** — react-doctor (deterministic React diagnostics by Aiden Bai/Million.js) added as a per-phase supplementary skill at Phase 4 Parts 5-6 / Phase 5 / Phase 7; surfaced by /scan-project audit-driven recommendation + approval-gated install · **V32.5 Designer-Skills Phase Integration** — `julianoczkowski/designer-skills` bundle (8 children) prescribed at Phase 2.8 / Phase 4 Parts 5-6 / Phase 7 with INHERIT-not-REPLACE contract over PA's `docs/DESIGN.md` + `docs/MOCKUP.jsx`; `/design-tokens` expands, `/design-review` audits, `/design-refine` only on flagged components · **V32.5.1 Designer-Skills Gate-Closure Enforcement + Governance Hook Repair** — all three V32.5 MODEL HOOKs now block phase close until `/design-review` returns green; `memory-governance.md §3` hook template bumped (V32)→(V32.3); §3 enumerates 13 phase hooks · **V32.5.2** HTML parity fix · **V32.5.3** Prompt 3.23 Clean-Slate Rebuild (count 60→61 / 37→38 NEW ✨) · **V32.5.4** cosmetic sweep · **V32.5.5** DECISIONS_LOG↔PRODUCT.md back-port surface check · **V32.6 Interactive Prototype & Simulation Phase** — Phase 3.3; Phase Hooks 13→14 · **V32.6.1** Prompt 3.23.C manual-handoff · **V32.7 Detail-File Relocation** — all 7 detail files relocated from always-on .claude/rules/ to on-demand .ai_prompt/; CLAUDE.md is now the ONLY auto-loaded file; ~24 pre-flight Read-hardening edits; counts unchanged (17 files relocated not added) · **V32.7.1** PA dual-host · **V32.7.2** spec-executor subagent + settings.json caps (deliverable 17→19) · **V32.7.3** Design Baseline Back-Port Surface Check (non-blocking Phase 7/8 pre-flight token-diff against DESIGN.md/MOCKUP.jsx baseline; INHERIT-not-REPLACE back-port; closes TODO-21; design analogue of V32.5.5; zero count change) · **V32.7.4** lint-deploy.sh Phase 5/6 gate wiring (pre-deploy footgun gate named in phases.md; tooling reference, no count change) · **V32.7.5** lint-deploy.sh promoted to deliverable #20 (deploy-v31.sh ships it to target scripts/lint-deploy.sh; deliverable 19→20) · **V32.8 Design-as-Contract + Verifiable-Done + Learning Loop** — Rule 31 Style Dictionary v5 compiled token pipeline (DTCG `docs/design-tokens.json` → CSS variables + Tailwind + Expo) + Playwright `toHaveScreenshot` visual-diff gate; Rule 32 evidence-backed DONE (test + screen + log) + LESSONS_REGISTRY + Stop-hook auto-append; `superpowers:verification-before-completion` driver skill; Rules 30→32 · Scenarios 35→39 · UI-rules 11→12 · Phase-hooks 14→17 · Bootstrap-steps 19→20 · Deliverables 20→22 · Memory-governance sections 5→6 · **V32.8.1** Drop getdesign.md/awesome-design-md — shadcn/ui CSS variables are the only design-token source; PA derives values from named direction, no external catalog; docs-only patch, zero count change · **V32.11 shadcn/studio Pro as Default Design Generator** — phase-routed /cui /iui /rui /ftc (3.3 trio · Parts 5-6 /cui+/rui · Phase 7 /cui+/iui+/rui · /ftc Figma-conditional); INHERIT-not-REPLACE over docs/DESIGN.md (Rule 12); fallback = plain shadcn/ui MCP + Blocks; MCP servers 4→5; all other counts unchanged · **V32.12 Design-Principles On-Demand Reference** — new `.ai_prompt/design-principles.md` deliverable #24 (library-agnostic UI/UX principles: hierarchy, spacing, type, 9-state control contract, UX laws, WCAG by success-criterion + QA checklist); INHERIT-not-REPLACE; deliverable count 23→24; all other counts unchanged · **V32.13 CI → Docker Hub → Komodo-API Auto-Deploy** — fleet Watchtower-free staging deploy: push-to-main → build+push image → Komodo API redeploys staging with the exact SHA (UpdateVariableValue → DeployStack → poll); app-side `deploy/komodo-deploy.sh` + `.github/workflows/docker-publish.yml` (Phase-6 scaffold templates, vendored from Server-Setups, NOT deliverables); prod NEVER auto-deployed; templates.md Rule 5c; zero count change · **V32.14 Motion Layer** — new `.ai_prompt/motion.md` deliverable #25 (library-agnostic UI/UX motion principles: when/when-not, easing-by-intent, duration budgets, transform+opacity-only performance rule, prefers-reduced-motion first-class + WCAG SC 2.3.3, spring-vs-tween, CSS-vs-JS, Motion+Tailwind appendix) + ui-rules.md Rule 14 "Motion & Micro-interactions" (Motion (motion.dev) only prescribed lib · LazyMotion/mini default · mandatory useReducedMotion() ties R13 WCAG gate · transform/opacity only · GSAP opt-in on PRODUCT.md signal · Three.js/R3F parked); INHERIT-not-REPLACE over DESIGN.md motion tokens; UI rules 13→14 · deliverable count 24→25; all other counts unchanged · Maintained by Claude on behalf of Bonito — Powerbyte IT Solutions, Lipa City, Philippines*

> **Note:** This file is updated by Claude alongside every version bump. You never edit it manually. It is part of the 25-file V32.14 deliverable set — 19 files in `.ai_prompt/`: CLAUDE_v31_compact.md · Master_Prompt_v31.md · bootstrap.md · phases.md · security.md · ui-rules.md · scenarios.md · templates.md · memory-governance.md · Product_md_Planning_Assistant_v31.md · Framework_Feature_Index_v31.md · AI_Tools_Skills_MCPs_Reference_v31.md · Post_Generation_Security_Checklist_v31.md · ChatGPT_V31_Cross_Audit_Prompt.md · Prompt_References.md · Prompt_References.html · privacy.md · design-principles.md · motion.md — plus `deploy-v31.sh` at project root — plus `spec-executor.md` (→ `.claude/agents/`) and `settings.json` (→ `.claude/settings.json` merged) added at V32.7.2 — plus `lint-deploy.sh` (→ `scripts/lint-deploy.sh`, chmod +x) added at V32.7.5 — plus `design-tokens.json` (→ `docs/design-tokens.json`, DTCG token source-of-truth) and `LESSONS_REGISTRY.md` (→ `docs/LESSONS_REGISTRY.md`, per-project learning log) added at V32.8 — plus `privacy.md` (→ `.ai_prompt/privacy.md`, PH Data Privacy Act + WCAG 2.2 AA compliance rules) added at V32.9 — plus `design-principles.md` (→ `.ai_prompt/design-principles.md`, library-agnostic UI/UX design principles) added at V32.12 — plus `motion.md` (→ `.ai_prompt/motion.md`, library-agnostic UI/UX motion principles + ui-rules.md Rule 14) added at V32.14. V32.7: all 7 detail files (phases.md through templates.md) are in `.ai_prompt/` only — `.claude/rules/` is intentionally empty.
>
