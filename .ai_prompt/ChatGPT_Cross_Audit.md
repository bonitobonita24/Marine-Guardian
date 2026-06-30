# Spec-Driven Platform V32.18 — Cross-AI Audit Prompt (for ChatGPT)

> **Purpose:** Hand this prompt to ChatGPT along with the 26 V32.18 framework files. ChatGPT independently audits V32.18 to verify the framework remains internally consistent across all canonical files. Items 1-7 below are historical V31-era audit goals (still verified as baseline); V32 / V32.1 / V32.2 / V32.3 / V32.4 / V32.4.1 / V32.5 / V32.5.1 / V32.5.2 / V32.5.3 / V32.5.4 / V32.5.5 / V32.6 / V32.6.1 / V32.7 / V32.7.1 / V32.7.2 / V32.7.3 / V32.7.4 / V32.7.5 / V32.8 / V32.8.1 / V32.9 / V32.10 / V32.11 / V32.12 / V32.13 / V32.14 / V32.16 / V32.17 / V32.18 verification items live in **Section K (K.1-K.78)** with the V32.18 verified counts block (V32.5.3 bumps Prompts 60→61 and NEW 37→38; V32.5.4 / V32.5.5 / V32.6 / V32.6.1 / V32.7 / V32.7.1 / V32.7.3 / V32.7.4 are no-count-change patches; deliverable files changed twice: 17→19 at V32.7.2 and 19→20 at V32.7.5; **V32.8 bumps Rules 30→32, Scenarios 35→39, UI Rules 11→12, Phase Hooks 14→17, Bootstrap Steps 19→20, memory-gov sections 5→6, deliverable files 20→22**; **V32.8.1 is a docs-only patch — zero count change**; **V32.9 bumps Rules 32→33, UI Rules 12→13, Phase Hooks 17→18, deliverables 22→23, Security Checklist 84→98 items / 13→14 sections, PRODUCT.md 11→12 sections, PA Rules 11→12**; **V32.10 is a zero-count-change templates-only patch — no rule/scenario/prompt/deliverable/file added**; **V32.11 bumps MCP servers 4→5 — adds shadcn/studio Pro as the framework's default design generator (user-global MCP, phase-routed /cui /iui /rui /ftc); no rule/scenario/prompt/deliverable/file added**; **V32.12 bumps deliverable files 23→24 — adds design-principles.md on-demand reference to .ai_prompt/; no rule/scenario/prompt/phase-hook/MCP count change**; **V32.13 is a zero-count-change deploy-mechanism patch — adds the CI→Docker Hub→Komodo-API auto-deploy pipeline as Phase-6 scaffold templates (templates.md Rule 5c + phases.md); the app-side workflow + helper are NOT new deliverables, so deliverable files stay 24 and no rule/scenario/prompt/phase-hook/MCP count changes**; **V32.14 bumps UI Rules 13→14 and deliverable files 24→25 — adds motion.md on-demand reference to .ai_prompt/ + ui-rules.md Rule 14 "Motion & Micro-interactions"; no rule/scenario/prompt/phase-hook/MCP count change**; **V32.16 is a zero-count storage-default patch — MinIO stays the staging/prod default; Cloudflare R2 demoted to budget-gated OPT-IN (V32.15 reverted before rollout); ZERO count change vs V32.14**; **V32.17 bumps deliverable files 25→26 — adds scripts/lint-design.sh design anti-slop gate (D1–D7 seven cardinal sins + P1a advisory warning); no rule/scenario/prompt/phase-hook/MCP count change**; **V32.18 bumps Security Checklist 98→114 items / 14→16 sections — adds §15 AI/LLM/MCP Security + §16 API Authorization & Injection Family (harvested from the curated Anthropic-Cybersecurity-Skills bundle; OWASP LLM/API Top 10 + MITRE ATLAS mapped); no rule/scenario/prompt/deliverable/MCP count change**):
> 1. Phase 2.8 (Clickable Mockup Review — added V31) is correctly documented
> 2. Cline deprecation (in-place V31 update) is consistent across all files
> 3. Historical V30 changelog references are preserved
> 4. Memory system (Resume Session, Governance Sync, Feature Update, Log Lesson, Governance Retro) still works with Claude Code as primary
> 5. Foundation intact: L1-L6 security stack, 9 governance docs, Rule 24 fresh context, file ownership model
> 6. No regressions introduced during the updates
> 7. Post-lock additive patches: Phase 3.5, Phase 4+8 anti-thrashing, Skill Installer, Prompt 4.13, attribution cleanup, prompt count 55 (V31 era — V32.5.3 current: **61 prompts (38 NEW ✨)**, **35 scenarios**, **19 bootstrap steps**, **9 V32 Dispatch Rules (R1-R9) + V32.3 R6 size qualifier (allow-list >200 lines via Scout with Governance Extraction Schema)**)
>
> **How to interpret counts:** The **V32.18 verified counts block** (around line 87 below) is authoritative for current totals. Historical changelog entries and items 1-7 above may reference older totals reflecting their version-at-time-of-writing (e.g., 55 prompts, 34 scenarios, 18 bootstrap steps for V31 lock; 30 rules / 35 scenarios / 14 phase hooks for V32.7.5; 32 rules / 22 deliverables / 17 phase hooks for V32.8.1; 23 deliverables for V32.11; 13 UI rules / 24 deliverables for V32.13; 14 UI rules / 25 deliverables for V32.14) — those are correct for their version and **MUST NOT be treated as current**. (V32.15 — R2 as staging/prod storage default — was reverted before rollout; V32.16 keeps MinIO default + R2 as a budget-gated opt-in, ZERO count change vs V32.14; V32.17 bumps deliverable files 25→26 — scripts/lint-design.sh #26 added.) When a count appears without a V32.18 annotation, cross-check against the verified counts block before reporting.
>
> **Use case:** Run this after every major framework update to catch mistakes Claude missed.
>
> **Maintained by:** Bonito — Powerbyte IT Solutions, Lipa City, Philippines.

---

## INSTRUCTIONS FOR CHATGPT

You are an independent auditor reviewing the **Spec-Driven Platform V31** framework. This version has the following changes from V30:

**Original V31 lock (two changes from V30):**
1. **Phase 2.8 — Clickable Mockup Review** added to the Planning Assistant chat
2. **Cline deprecated in-place** — Cline is no longer the fallback builder. Claude Code handles ALL work. Cline infrastructure (`.cline/` folders, `.clinerules` file) is RETAINED but marked unused.

**Post-lock additive patches (no version bump — still V31):**
3. **Phase 3.5 — Execution Plan Generation** — auto-runs after Phase 3 (context cost estimation, task decomposition, Skill Installer activation)
4. **Phase 4 anti-thrashing rule** — mandatory scope assessment, 12-file threshold, module-by-module sub-sessions
5. **Phase 8 anti-thrashing rule** — same 12-file threshold, per-feature sub-batches, mandatory completeness check before committing
6. **Skill Installer integration** — Primary Group 6 slots, per-phase supplementary skills
7. **Prompt 4.13** — Add Automation to Existing Project (n8n / OpenClaw / Hybrid, 7-step flow)
8. **Attribution cleanup** — CLAUDE_CODE first, CLINE removed from active attribution chain
9. **Prompt count** updated from 54 → 59 (36 NEW ✨)
10. **code-review-graph setup signal** — Phase 6 completion + Phase 7 pre-flight
11. **Context Budget — Global Principle** — Sonnet 4.6 model-aware task sizing added to CLAUDE_compact.md and Master_Prompt.md. Every task must be scoped to ≤80K tokens SAFE zone.
12. **Prompt 3.19** — Emergency Anti-Thrashing for any phase (Sonnet 4.6 calibrated, 3 variants)
13. **Memory Governance Layer (V31.1)** — new file `memory-governance.md` with 5 sections: Tiered Decomposition Engine, Smart Checkpoint Protocol, Phase Hooks (14 hooks across all phases — 13 pre-V32.6 + Phase 3.3), Architect-Execute Model (Opus 4.6 plans → Sonnet 4.6 executes), Mid-Project Adoption
14. **Prompts 3.20 + 3.21** — Memory Governance Baseline + Opus Planning Session
15. **Dispatch Discipline Patch (V31.4)** — Architect-Execute Model extended to ALL phases + ad-hoc edits; Sonnet Scout sub-step added (§4 step 1.5); Tier 1 rewritten to mandate Sonnet dispatch; §3 hook MODEL line and phases.md MODEL: lines rewritten in imperative form

I am attaching 16 V31 framework files. Your job is to verify ALL changes were implemented correctly AND that the foundational Spec-Driven Platform architecture remains intact.

**Do NOT suggest new features.** Do NOT recommend changes to the framework's philosophy. Your job is ONLY to verify:

1. Phase 2.8 is correctly documented wherever it appears
2. Cline is consistently marked deprecated across all files
3. Historical V30 references preserved (changelog entries describing what V30 did must STILL say V30)
4. Cross-file references (filenames, phase counts, agent routing) are internally consistent
5. Memory system commands all still function (Resume Session, Governance Sync, Feature Update, Governance Retro, Log Lesson, Resume from handoff)
6. Foundation intact: L1-L6 security stack, 9 governance docs, Rule 24 fresh context, file ownership model
7. Post-lock patches are present in the correct files (Phase 3.5, anti-thrashing rules, Skill Installer, Prompt 4.13, attribution, prompt count)
8. V31.4 Dispatch Discipline Patch present: universal Architect-Execute scope, Sonnet Scout step 1.5, Tier 1 dispatch mandate, imperative MODEL lines in §3 and phases.md
9. No regressions

---

## V31 ARCHITECTURE — UNDERSTAND THIS BEFORE AUDITING

### What V31 IS (Two-Part Change)

**PART A — Phase 2.8 Addition**
Runs in the **Planning Assistant session** — a Claude Code PA session in the project folder (preferred) or a Claude.ai chat (V31 original: Claude.ai only; V32.7.1: dual-host). Generates a clickable React (.jsx) mockup with realistic industry-appropriate data using shadcn/ui conventions. After user confirms, Step 7a generates an HTML archive version (in Claude.ai: interactive artifact; in Claude Code PA: written `docs/MOCKUP.jsx` + Vite dev server preview). User verifies spec interpretation BEFORE Phase 3 locks the architecture.

**PART B — Cline Deprecation (In-Place V31 Update)**
Cline was the fallback builder in V30. In V31 in-place update, Cline is marked **⚠ DEPRECATED — do not use** across all framework files. Claude Code handles everything Cline used to handle. The `.cline/` folder structure AND `.clinerules` file are **retained** because:
- `.cline/memory/lessons.md`, `.cline/STATE.md`, `.cline/memory/agent-log.md`, `.cline/handoffs/` are still actively written by Claude Code (file paths preserved for historical continuity)
- `.clinerules` file is still generated by Bootstrap Step 3 (framework structure preserved) but nothing actively reads it

Bonito's user preference: keep Cline extension installed in VS Code as emergency fallback option; framework itself never routes to Cline.

### What V31 IS NOT

- V31 does NOT add new framework rules (Master Prompt count stays at 30). Planning Assistant has its own Rule 11 (Automation Opt-In) — this is a Planning Assistant rule, not a framework rule.
- V31 adds 2 new scenarios (Scenario 33 — DESIGN.md integration with shadcn/ui; Scenario 34 — CREDENTIALS.md Agent-Proof Upgrade; count 32 → 34)
- V31 does NOT add new bootstrap steps (count stays at 18)
- V31 does NOT change the PRODUCT.md required sections (automation sections in Integrations are CONDITIONAL — only appear when user opts in)
- V31 does NOT change security, UI rules, or deployment procedures
- V31 does NOT affect Claude Code behavior during Phase 3+ (Phase 2.8 is Planning Assistant only)
- V31 does NOT delete `.cline/` folders or `.clinerules` (Cline is deprecated, not removed)
- V31 does NOT introduce new MCP servers or agents
- V31 adds n8n + OpenClaw automation signal detection to Planning Assistant (Rule 11, Step 5 signal check, Step 7 conditional infra question, conditional Integrations template). This is opt-in only — zero footprint when not used.
- Post-lock patches add Phase 3.5 as a NEW phase (between Phase 3 and Phase 4) and anti-thrashing rules to Phase 4 and Phase 8. These are in phases.md and Master_Prompt.md. They do NOT change the framework rule count, scenario count, or bootstrap step count.
- Post-lock patches add a **Context Budget — Global Principle** to CLAUDE_compact.md and Master_Prompt.md. This is a Sonnet 4.6 model-aware task sizing principle (200K window, 120K practical, ≤80K SAFE zone, 12-file threshold). It governs how ALL work is scoped — not a new rule, but a non-negotiable behavioral principle.

### V32.18 verified counts (must match in every file that quotes them)

```
33 Rules · 39 Scenarios · 20 Bootstrap Steps · 8 Phase 4 Parts
9 Phase 5 Commands · 16 Phase 6.5 Categories · 16 Secure Code Gen sub-sections
14 UI Component Rules · 114 Security Checklist items (16 sections)
61 Prompts (38 NEW ✨) in Prompt_References.md and Prompt_References.html
26 deliverable files (19 in .ai_prompt/ + deploy.sh at project root + spec-executor.md → .claude/agents/ + settings.json → .claude/settings.json + lint-deploy.sh → scripts/lint-deploy.sh + design-stop-hook.sh → scripts/ + LESSONS_REGISTRY.md → .ai_prompt/ + privacy.md → .ai_prompt/ + design-principles.md → .ai_prompt/ + motion.md → .ai_prompt/ + lint-design.sh → scripts/lint-design.sh) · 5 MCP servers (3 wired + 1 user-global + 1 plugin) · Node v22 · pnpm@10
Phase count: 8 main phases + 2.5 + 2.6 + 2.7 + 2.8 (V31) + 3.3 (V32.6) + 3.5 (POST-LOCK) + 6.5
6 agents (Claude Code primary: Opus 4.6 Architect + Sonnet 4.6 Executor · Cline ⚠ DEPRECATED · Copilot · SpecStory · SocratiCode · code-review-graph)
9 governance docs (unchanged)
Planning Assistant: 12 rules (Rule 11 = n8n+OpenClaw automation opt-in; Rule 12 = Compliance gap-reminder)
PRODUCT.md required sections: 12 (§1-§11 unchanged + §12 Compliance & Privacy — V32.9)
V32 Dispatch Rules: 9 total (R1-R5 file-size mechanics + R6-R9 dispatch discipline) — was 5 in V32 / V32.1 / V32.1.x. **V32.3 is an R6 extension (size qualifier on allow-list), NOT a new rule** — count stays at 9.
Opus Write Allow-List (R8): 5 files (docs/STATE.md · docs/DECISIONS_LOG.md · docs/CHANGELOG_AI.md · docs/IMPLEMENTATION_MAP.md · .cline/STATE.md)
Dispatch Ratio target (R9): sonnet_writes / opus_writes ≥ 3.0 (< 1.0 triggers lessons.md drift review). **V32.3:** direct Opus read of a >200-line allow-list governance doc counts as `opus_writes` for ratio purposes.
**V32.3 Architect-Read Allow-List size threshold:** 200 lines (≤200 direct read; >200 via Scout with Governance Extraction Schema in `memory-governance.md §4`). **New V32.3 invariant.**
Memory Governance sections: 6 (§1 Tiered Decomposition · §2 Smart Checkpoint · §3 Phase Hooks · §4 Governance Extraction Schema · §5 Architect-Execute Model · §6 Mid-Project Adoption) — V32.8 bumped from 5 to 6.
Phase Hooks (memory-governance.md §3): 18 — V32.9 bumped from 17 (Hook 18 = Compliance/Data-Privacy Gap-Surfacing added by Rule 33).
```

Count diffs vs V32.2: all canonical counts unchanged. New invariant added (allow-list size threshold = 200 lines). V32.3 is an R6 extension, not a new rule. K.34 added (V32.3 verification).
Count diffs vs V32.3: all canonical counts unchanged. V32.4 adds react-doctor as a per-phase supplementary skill (not a Primary Group slot, not a rule/scenario/prompt) at Phase 4 Parts 5-6 / Phase 5 / Phase 7. K.35 added (V32.4 verification). V32.4.1: post-ship consistency sweep — all canonical counts unchanged; no rule/scenario/prompt change. K.36 added (V32.4.1 verification).
Count diffs vs V32.4.1: all canonical counts unchanged. V32.5 prescribes the `julianoczkowski/designer-skills` bundle at Phase 2.8 / Phase 4 Parts 5-6 / Phase 7 with INHERIT-not-REPLACE contract over PA's `docs/DESIGN.md` + `docs/MOCKUP.jsx`. Not a Primary Group slot; not a rule/scenario/prompt/bootstrap change. K.37 added (V32.5 verification).

Count diffs vs V32.5: all canonical counts unchanged. V32.5.1 adds gate-closure language to the three V32.5 MODEL HOOKs (Phase 2.8 / Phase 4 Parts 5-6 / Phase 7) — phase close is now blocked until `/design-review` returns green. `memory-governance.md §3` hook template bumped (V32)→(V32.3); §3 enumerates 13 phase hooks (was 10 with Phase 4 collapsed); Output Equivalence Guarantee and Prompt 3.19 mid-session-rescue pointer documented. `Prompt_References.md`/`.html` gain a "How the Spec-Driven AI Mega Prompt Works" overview section (three activation windows + architectural-contract table) with sidebar nav-group `00 Overview`; HTML hero eyebrow bumped v31→v32.5.1. K.38 added (V32.5.1 verification).

Count diffs vs V32.5.1: all canonical counts unchanged. V32.5.2 brings the `Prompt_References.html` "How the Spec-Driven AI Mega Prompt Works" section to full content parity with the markdown (HTML Gate-keepers/Memory Model cells regain annotations; "Why this prevents thrashing" callout restored to 4-bullet structure). No behavior change. K.39 added (V32.5.2 verification).

Count diffs vs V32.5.2: Prompts 60 → 61; NEW ✨ 37 → 38; all other canonical counts unchanged (30 Rules · 35 Scenarios · 19 Bootstrap Steps · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules R1-R9 · 13 Phase Hooks). V32.5.3 adds Prompt 3.23 (Clean-Slate Rebuild from Preserved Spec) to Prompt_References Scenario Group 3 — three-stage paste-ready recovery flow for systemically-glitchy Phase 8 projects. K.40 added (V32.5.3 verification).

Count diffs vs V32.5.3: all canonical counts unchanged (V32.5.4 is cosmetic-only). V32.5.4 closes 3 minor findings from the V32.5.3 5-Scout post-ship audit: (1) Prompt_References.html callout class parity for warning #4 in the 3.23 card, (2) this file's `### V32.5 verified counts` heading bumped to `### V32.5.3 verified counts` to label-match the version that last set the counts, (3) Master_Prompt.md V32.4.1 changelog reordered above V32.5 (was below). K.41 added (V32.5.4 verification).

Count diffs vs V32.5.4: all canonical counts unchanged (V32.5.5 is additive MODEL-hook language only — no count/rule/scenario/prompt change). V32.5.5 adds the DECISIONS_LOG ↔ PRODUCT.md Back-Port Surface Check — a non-blocking Sonnet-Scout pre-flight at Phase 7 + Phase 8 that surfaces "📋 Back-Port Candidates" (decisions locked in DECISIONS_LOG.md but never written back into PRODUCT.md). Surface-and-inform only; Rule 1 unchanged (PRODUCT.md stays human-only). K.42 added (V32.5.5 verification).

Count diffs vs V32.5.5: **Phase Hooks 13 → 14** (Phase 3.3 adds a memory-governance pre-flight, so `memory-governance.md §3` now enumerates 14 injection points); all other canonical counts unchanged (V32.6 adds a sub-phase, not a rule/scenario/prompt/bootstrap). V32.6 adds **Phase 3.3 — Interactive Prototype & Simulation** (runs in Claude Code, between Phase 3 and Phase 3.5): builds a durable, client-validated interactive prototype with a project-defined simulated backend (browser-storage / in-memory mock service / static fixtures, mirroring the Phase 3 schema) from the PA baseline + Phase 3 spec; the prototype becomes the blueprint Phase 4 wires the production backend to. **Design-system finalization (designer-skills `/design-tokens` EXPAND, `/design-review`, `/design-refine`) MOVES from Phase 4 Parts 5-6 to Phase 3.3**; Phase 4 Parts 5-6 becomes wire-to-production-backend + regression `/design-review`. New outputs: `docs/PROTOTYPE.md` + `prototype/` + client sign-off in `docs/DECISIONS_LOG.md`. Hard gate-closure (mirrors V32.5.1): `/design-review` green + every Core User Flow walked + client sign-off before Phase 3.5. Rule 1 unchanged; top-level phases stay 0–8 (3.3 is a sub-phase). K.43 added (V32.6 verification). **V32.6.1** = Prompt 3.23.C Semantic Shift — replaces the original V32.5.3 paste-able "3.23.C — Full Rebuild from PRODUCT.md" mega-prompt with a "3.23.C — Resume the rebuild manually" handoff card that routes the human to Prompt 1.3.1 (Phase 0 Bootstrap) + optional Prompt 2.9 (Validate Spec Consistency) pre-check. Closes the autopilot/thrashing surface in clean-slate recovery + forces the rebuild back through the V32.6 Phase 3.3 hard gate. Zero count/rule/scenario/prompt/bootstrap/phase-hook change — Prompt 3.23 still occupies its catalog slot; only stage C's body shape changed (paste-able prompt → resume-card). K.44 added (V32.6.1 verification).

Count diffs vs V32.6.1 → V32.7: **counts unchanged (deploy-location change only)**. V32.7 moves all 7 detail files (phases.md, memory-governance.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md) from `.claude/rules/` to `.ai_prompt/` (read on-demand). Only `CLAUDE_compact.md` auto-loads (deployed to app root as `CLAUDE.md`). `.claude/rules/` is intentionally empty after a V32.7 deploy. Root cause: subagent baseline-context inheritance was injecting ~100-130K tokens into every worker session — the 7 detail files (~130K tokens combined) were loaded unconditionally via `.claude/rules/` auto-injection. Counts: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks — all unchanged. K.45 added (V32.7 verification).

Count diffs vs V32.7.1 → V32.7.2: **deliverable files 17 → 19** (added `spec-executor.md` → `.claude/agents/` and `settings.json` → jq-merged into `.claude/settings.json`); all other canonical counts unchanged (30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 9 V32 Dispatch Rules · 14 Phase Hooks). V32.7.2 adds a custom Sonnet executor subagent (`spec-executor.md`, frontmatter `tools: Read,Write,Edit,Bash,Grep,Glob` + `model: sonnet` + `mcpServers: []`) and a `settings.json` with skill-listing context caps (`skillListingBudgetFraction: 0.01` + `maxSkillDescriptionChars: 1024`); framework executor dispatch (R1/R5/R7) now targets `Agent(subagent_type: "spec-executor")` with `Agent(model: "sonnet")` fallback. K.47 added (V32.7.2 verification). **NOTE: V32.7.2 re-bumped version markers V32.7.1 → V32.7.2 and the deliverable count 17 → 19 — supersedes K.45/K.46 count references.**

Count diffs vs V32.16 → V32.17: **deliverable files 25 → 26** (lint-design.sh → scripts/lint-design.sh); all other canonical counts unchanged. V32.17 adds the **Design Anti-Slop Gate**: scripts/lint-design.sh #26 (D1–D7 seven cardinal sins + P1a advisory; --report-only at design phases); design-principles.md (#24) gains Pillar 8 Anti-AI-Slop + letter-spacing table + five-state render contract. Idea source: nexu-io/open-design craft/ axis (Apache-2.0). Counts: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 14 UI Rules · 9 V32 Dispatch Rules · 18 Phase Hooks · **26 deliverable files** · 5 MCP servers. K.77 added (V32.17 verification).

Count diffs vs V32.13 → V32.14: **UI Component Rules 13 → 14; deliverable files 24 → 25** (motion.md → .ai_prompt/, so .ai_prompt/ files 18 → 19); all other canonical counts unchanged. V32.14 adds the **Motion Layer**: a new on-demand deliverable `.ai_prompt/motion.md` (#25) — library-agnostic UI/UX motion principles (when/when-not to animate, easing-by-intent ease-out entrances / ease-in-out moves / no linear, duration budgets, the `transform`+`opacity`-only performance rule, `prefers-reduced-motion` first-class + WCAG SC 2.3.3, spring-vs-tween, gesture interruptibility, CSS-vs-JS, Motion+Tailwind appendix) — and a new `ui-rules.md` **Rule 14 "Motion & Micro-interactions"** (Motion (motion.dev) the only prescribed React animation lib via LazyMotion/mini ~4.6KB; mandatory `useReducedMotion()` guard ties R13 WCAG gate; `transform`/`opacity` only; GSAP opt-in on a PRODUCT.md marketing/scroll signal with `@gsap/react` + `gsap.matchMedia()` guard; Three.js/R3F parked for 3D-flagged apps only). Read at design phases 3.3 / Parts 5-6 / Phase 7 when docs/DESIGN.md / ui-rules.md are silent on a motion/timing/reduced-motion pattern. INHERIT-not-REPLACE over docs/DESIGN.md motion tokens. Motion principles informed by Emil Kowalski's "Animations on the Web" (animations.dev) + the MIT-licensed emilkowalski/skills + vercel-labs/open-agents skill files (restated in the framework's own words). Wired: `deploy.sh` GROUP 8 copy + `sync-to-project.sh` whitelist (24→25) + `ui-rules.md` Rule 14 + cross-ref + `phases.md` MODEL HOOK cues + `src/data/libraries.js` GSAP/Magic UI specDrivenFit notes + project + repo CLAUDE.md + documentation-hub.html. Counts: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · **14 UI Rules** · 9 V32 Dispatch Rules · 18 Phase Hooks · **25 deliverable files** · 5 MCP servers. K.75 added (V32.14 verification).

Count diffs vs V32.12 → V32.13: **all canonical counts unchanged.** V32.13 adds the CI → Docker Hub → Komodo-API auto-deploy pipeline (the fleet's Watchtower-free staging deploy standard) as **Phase-6 scaffold templates** — `templates.md` Rule 5c (full templates + compose tag-variable contract + per-app enable checklist + manual-prod gate) and `phases.md` (Phase 4 Part 8 `docker-publish.yml` V32.13 variant + `.env.staging` tag-variable note + Phase 6 staging-auto-deploy enable checklist). The app-side `deploy/komodo-deploy.sh` + `.github/workflows/docker-publish.yml` are **vendored from `Server-Setups/Powerbyte-Hostinger/komodo/ci-deploy/`** (canonical source), exactly like the existing `start.sh` / `push.sh` scaffold scripts — they are NOT new `deploy.sh` deliverables, so **deliverable files stay 24**. Production is NEVER auto-deployed (manual promotion only). Counts: 33 Rules · 39 Scenarios · 20 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 13 UI Rules · 9 V32 Dispatch Rules · 18 Phase Hooks · 24 deliverable files · 5 MCP servers — all unchanged. K.74 added (V32.13 verification).

Count diffs vs V32.1.5:
- All canonical counts unchanged (Rules, Scenarios, Bootstrap, Prompts, UI Rules, deliverable files, Security Checklist).
- **V32 Dispatch Rule count: 5 → 9** (R6 Scout-Before-Plan + R7 Default Parallel Fan-Out + R8 Opus Write Allow-List + R9 Dispatch Ratio Metric added).
- Sonnet Status DONE protocol tightened: full diff review mandatory; review-by-summary FORBIDDEN.

Count diffs vs V31.3 (historical):
- All counts unchanged. V31.4 was a behavioral/governance patch only (no new scenarios, bootstrap steps, rules, or prompts).

Count diffs V31.2 → V31.3 (preserved for historical reference):
- Scenarios: 34 → 35 (added Scenario 35 — Loading state for a custom (non-shadcn) component)
- Bootstrap Steps: 18 → 19 (added Step 19 — Loading Library Lock)
- UI Component Rules: 10 → 11 (added Rule 11 — Loading states dual-path)

### V31 post-lock additive patches (must be present in the files listed)

These were added after V31 was locked. No version bump — they are additive patches.
ChatGPT MUST verify each patch is present in the specified file(s):

```
1. Phase 3.5 — Execution Plan Generation
   MUST BE IN: phases.md (full section), Master_Prompt.md (summary + phase menu),
   CLAUDE_compact.md (phase menu), Framework_Feature_Index.md (V31 row + footer)

2. Phase 4 anti-thrashing rule
   MUST BE IN: phases.md (full section), Master_Prompt.md (in Phase 4 section)

3. Phase 8 anti-thrashing rule (with completeness check)
   MUST BE IN: phases.md (full section after batch confirmation),
   Master_Prompt.md (summary in Phase 8 section)

4. Skill Installer integration
   MUST BE IN: phases.md (Phase 3.5 section), Framework_Feature_Index.md

5. Prompt 4.13 — Add Automation to Existing Project
   MUST BE IN: Prompt_References.md (7-step flow), Prompt_References.html (card p-4-13)

6. code-review-graph setup signal
   MUST BE IN: phases.md (Phase 6 completion + Phase 7 pre-flight Step 0)

7. Attribution order: CLAUDE_CODE first, CLINE removed from active chain
   MUST BE IN: templates.md (Rule 15 template), Master_Prompt.md (Rule 3 attribution)
   CLAUDE_compact.md Rule 15 line must NOT list CLINE

8. **Attribution cleanup** — CLAUDE_CODE first, CLINE removed from active attribution chain
   MUST BE IN: Master_Prompt.md (changelog), CLAUDE_compact.md (header),
   Framework_Feature_Index.md (V31 row + footer), Prompt_References.html (hero stat)
   MUST NOT appear as "54 prompts" or "55 prompts" or "31 New" or "32 New" anywhere

9. Context Budget — Global Principle (Sonnet 4.6 model-aware task sizing)
   MUST BE IN: CLAUDE_compact.md (NON-NEGOTIABLE BEHAVIORS section — auto-loaded every session),
   Master_Prompt.md (after GLOBAL INSTRUCTION PRIORITY ORDER section)
   Must include: "Claude Sonnet 4.6", "200K token context window", "≤80K SAFE zone",
   TOKEN BUDGET REFERENCE table, 12-file threshold explanation, codebase_search (Rule 17),
   exact autocompact error message quoted, mid-session recovery steps
   ALSO IN: phases.md Phase 4 + Phase 8 anti-thrashing sections (model context block)

10. Prompt 3.19 — Emergency Anti-Thrashing (any phase)
    MUST BE IN: Prompt_References.md (3 variants: mid-session rescue, proactive scope assessment,
    quick version — all Sonnet 4.6 calibrated), Prompt_References.html (card p-3-19)

11. Memory Governance Layer (V31.1) — new file memory-governance.md
    MUST BE IN: .ai_prompt/memory-governance.md (5 sections: §1-§5)
    MUST BE REFERENCED IN: CLAUDE_compact.md (contextual file loading table + agent stack),
    Master_Prompt.md (context budget section + Rule 24), phases.md (14 memory governance hooks),
    Framework_Feature_Index.md (feature domain entry), AI_Tools_Reference.md
    deploy.sh MUST copy memory-governance.md to .ai_prompt/

12. Architect-Execute Model (Opus 4.6 → Sonnet 4.6)
    MUST BE IN: memory-governance.md §4, CLAUDE_compact.md (agent stack + context budget),
    Master_Prompt.md (context budget + agent description)

13. Prompts 3.20 + 3.21 (Memory Governance Baseline + Opus Planning Session)
    MUST BE IN: Prompt_References.md, Prompt_References.html (cards p-3-20, p-3-21)

14. Prompt count: 61 prompts, 38 NEW ✨
    MUST BE IN: Master_Prompt.md (changelog), CLAUDE_compact.md (header),
    Framework_Feature_Index.md (V31 row + footer), Prompt_References.html (hero stat)
    MUST NOT appear as "54 prompts" or "55 prompts" or "56 prompts" or "31 New" or "32 New" or "33 New" anywhere

15. UI Loading-State Dual-Path (V31.3) — Rule 11 + Scenario 35 + Bootstrap Step 19 + phantom-ui integration
    MUST BE IN:
      - ui-rules.md (Rule 11 — Loading states dual-path; PATH A shadcn <Skeleton>, PATH B <phantom-ui>;
        hard constraint forbidding hand-rolled *Skeleton.tsx twin files; classification source =
        Phase 2.8 mockup tags)
      - scenarios.md (Scenario 35 — Loading state for a custom (non-shadcn) component)
      - bootstrap.md (Step 19 — Loading Library Lock; appends LOCKED entry to DECISIONS_LOG.md +
        lessons.md typed entry + agent-log.md; NO npm install at Bootstrap)
      - templates.md (UI LOADING STATE TEMPLATES section with PATH A snippets — Card/TableRow/
        FormField — and PATH B snippets — basic wrapper / repeated rows / per-element opt-outs /
        JSX intrinsic declaration / pin policy)
      - Master_Prompt.md (V31.2 → V31.3 changelog block; count refs "all 19 bootstrap steps"
        and "all 19 steps")
      - CLAUDE_compact.md (NON-NEGOTIABLE BEHAVIORS — loading-state dual-path bullet)
      - Planning_Assistant.md (Phase 2.8 mockup MUST tag every component with
        data-loading-path="shadcn" or data-loading-path="custom" on its outer wrapper)
      - Framework_Feature_Index.md (V31.3 row + footer count updates: 35 scenarios · 19
        bootstrap steps · 11 UI component rules · loading-state dual-path mention)

    MUST NOT appear:
      - "10 UI Component Rules" (now 11)
      - "18 Bootstrap Steps" or "all 18 steps" or "all 18 bootstrap steps" (now 19)
      - "34 Scenarios" (now 35)
      - any "MyComponentSkeleton.tsx" twin file pattern recommended in templates or scenarios

    PHANTOM-UI PACKAGE REFERENCE (must be consistent across all files):
      - Package name: @aejkatappaja/phantom-ui (MIT, Lit Web Component)
      - Initial install: ^0.10.1 — then pin resolved exact version after install
      - Bundle: ~22KB / ~8KB gzip (CDN); ESM externalises Lit
      - Post-install: auto-detects Next.js/Nuxt/SvelteKit/Remix/Qwik and wires
        `import "@aejkatappaja/phantom-ui/ssr.css"` into the layout file
      - Required: "use client" boundary; JSX intrinsic element declaration for React + TS

    LIBRARIES_DB / SCAN-PROJECT SURFACE ADDITION (must exist):
      - `src/data/` LIBRARIES_DB entry for @aejkatappaja/phantom-ui under category
        "Loading States / Structure-Aware Skeletons"
      - Match signal: project package.json has shadcn deps AND custom components outside
        `components/ui/`
      - /scan-project Phase 2.6 surfaces it
      - /scan-project Phase 1.5 Part C (Spec-Driven Fit) recommends during Phase 4 Part 5 +
        Phase 7 Feature Update
```

---

## THE 16 V31 FILES (attached with this prompt)

```
1.  CLAUDE_compact.md              — compact rules card (~200 lines)
2.  Master_Prompt.md               — full monolithic prompt (~8000 lines)
3.  bootstrap.md                       — Phase 0 Bootstrap (19 steps; Step 19 = Loading Library Lock V31.3)
4.  phases.md                          — All phase details (Phases 1–8 + 2.5, 2.6, 2.7, 2.8, 3.5, 6.5 + anti-thrashing rules)
5.  security.md                        — Secure Code Generation (16 sub-sections)
6.  ui-rules.md                        — UI Component Rules (11 rules, shadcn/ui enforced; Rule 11 = loading-state dual-path V31.3)
7.  scenarios.md                       — Scenarios 1–35 (Scenario 33: DESIGN.md integration; Scenario 34: CREDENTIALS.md Agent-Proof Upgrade; Scenario 35: Loading state for a custom (non-shadcn) component V31.3)
8.  templates.md                       — Output types, .clinerules template, file ownership
9.  Planning_Assistant.md — Planning interview + Phase 2.8 (biggest V31 change)
10. Framework_Feature_Index.md     — Feature + version history reference
11. AI_Tools_Reference.md — Tools + model routing reference
12. Security_Checklist.md — 84 items across 13 sections
13. Prompt_References.md               — Scenario-based prompt guide (markdown, authoritative)
14. Prompt_References.html             — Scenario-based prompt guide (interactive HTML UI, same content)
15. deploy.sh                      — Deployment script
16. ChatGPT_Cross_Audit.md  — This audit prompt (don't audit the audit prompt itself)
```

---

## AUDIT CHECKLIST — Report PASS / FAIL per item

### SECTION A — Phase 2.8 Implementation (9 items)

```
□ A.1  Planning_Assistant.md contains a complete Phase 2.8 section
       LOOK FOR: "## 🟦 PHASE 2.8 — CLICKABLE MOCKUP REVIEW (NEW V31)"
       Must include: trigger logic, Step 1-6 execution, industry dummy data theme table,
                     HTML structure spec, Tier 1 fidelity checklist, user response handling,
                     output contract, MUST/MUST NOT rules

□ A.2  Phase 2.8 tier rules: exactly 5-8 Tier 1 screens at full fidelity

□ A.3  Phase 2.8 skip mechanism: "skip mockup" trigger + auto-skip for <2 screens

□ A.4  Phase 2.8 budget limits: Max 3 full regenerations + 5 single-screen expansions

□ A.5  Phase 2.8 ephemeral: NEVER committed to repo, NEVER logged in governance docs

□ A.6  Industry dummy data themes: ERP, Fisheries, Inventory, Healthcare, Education,
       Fintech, Government + Other fallback

□ A.7  shadcn/ui DESIGN CAPABILITY DECLARATION present with HSL color tokens

□ A.8  Planning Assistant WHO YOU ARE: "Product Specification Writer + Visual Design
       Preview Generator"

□ A.9  Master_Prompt.md, phases.md, CLAUDE_compact.md all reference Phase 2.8
       consistently as the Planning Assistant ROLE — a Claude Code PA session (preferred) or a
       Claude.ai chat — NOT the Phase 3+ Claude Code build session, NOT Cline (V32.7.1 dual-host)
```

### SECTION B — Cline Deprecation Consistency (15 items — NEW, verify carefully)

```
□ B.1  CLAUDE_compact.md agent stack table shows Cline as ⚠ DEPRECATED
       LOOK FOR: "Cline             ⚠ DEPRECATED — do not use. Kept for historical reference only."

□ B.2  Master_Prompt.md HOW TO USE section explicitly marks Cline deprecated
       LOOK FOR: "Cline → ⚠ DEPRECATED — do not use. Kept in framework for historical reference only."

□ B.3  Master_Prompt.md H4 agent table Cline entry rewritten as DEPRECATED
       LOOK FOR table row: "Cline | ⚠ DEPRECATED (V31)"

□ B.4  Master_Prompt.md session banner agent mode shows Cline deprecated
       LOOK FOR: "Cline → ⚠ DEPRECATED"

□ B.5  AI_Tools_Reference.md agent stack table: Cline marked ⚠ DEPRECATED

□ B.6  Framework_Feature_Index.md Section 1.3 Cline: rewritten as ⚠ DEPRECATED
       Must include V31 change history entry documenting the in-place deprecation

□ B.7  Scenario 19 rewritten: title is "Cline is deprecated — use Claude Code (with Copilot
       as emergency fallback)" — polarity inverted vs V30 which called it "No Cline credits"

□ B.8  Every Phase "Who:" line in Master_Prompt.md and phases.md routes to Claude Code
       Check Phase 2.6, 3, 4, 5, 6, 7, 8 — NONE should say "Who: Cline" as active routing

□ B.9  No active-routing Cline verbs anywhere — "Cline runs", "Cline writes", "Cline reads",
       "Cline handles", etc. should all be "Claude Code runs/writes/reads/handles"

□ B.10 No "Open Cline" or "in Cline panel" routing instructions — should be
       "Open Claude Code" / "in Claude Code terminal"

□ B.11 `.cline/` folder structure PRESERVED in Bootstrap (Step 1 folder creation) AND
       .clinerules file STILL GENERATED by Bootstrap Step 3 (marked unused)

□ B.12 Every `.cline/memory/lessons.md`, `.cline/STATE.md`, `.cline/memory/agent-log.md`
       file-path reference still intact — these are PATHS, not routing to Cline

□ B.13 Governance Sync trigger: "Via Claude Code" as primary, Copilot as emergency fallback
       (previously was "Via Cline" as primary)

□ B.14 Feature Update trigger: "Via Claude Code" as primary, Copilot as emergency fallback

□ B.15 Feature Rollback trigger: "Via Claude Code" as primary, Copilot as emergency fallback
```

### SECTION C — Historical V30 Reference Preservation (7 items)

These items MUST remain as "V30" because they describe what V30 did historically.

```
□ C.1  Framework_Feature_Index.md V30 row "Compact CLAUDE.md Architecture
       + Claude Sonnet 4.6 Primary" — MUST say V30

□ C.2  V30 changelog entries describing promotion/demotion of agents preserved as V30

□ C.3  Master_Prompt.md v29 → v30 changelog block describes V30 features as V30

□ C.4  Bootstrap Step 18 credential scaffold marked "(V30 — non-blocking — no interview)"
       because scaffold was introduced in V30

□ C.5  (NEW V28), (NEW V29), (NEW V30) markers on historical features unchanged

□ C.6  Version history tables V10 through V30 intact in all files

□ C.7  Cline historical changelog in Feature Index (V10, V13, V14, V19, V30 entries) intact
       IMPORTANT: V30 row in Cline history says "Demoted to fallback builder" — this
       should stay because Cline was demoted in V30. V31 added "⚠ DEPRECATED" as a
       NEW history row — both should coexist.
```

### SECTION D — Current-Version Reference Consistency (14 items)

```
□ D.1  CLAUDE_compact.md header: "# SPEC-DRIVEN PLATFORM — V31"
□ D.2  CLAUDE_compact.md session start: "✅ Spec-Driven Platform V31 loaded"
□ D.3  Master_Prompt.md header: "# SPEC-DRIVEN PLATFORM — V31"
□ D.4  Master_Prompt.md agent role: "V31 STRICTEST discipline"
□ D.5  Framework_Feature_Index.md header: "Current framework version: V31"
□ D.6  Framework_Feature_Index.md footer 16-file list: ALL versioned files have _v31 suffix
□ D.7  AI_Tools_Reference.md agent table: Claude Code shows "V31 primary"
□ D.8  Security_Checklist.md header: "— V31"
□ D.9  Security_Checklist.md Section 13: "V31 VALIDATION"
□ D.10 Prompt_References.md header: "Prompt References — Spec-Driven Platform V31"
□ D.11 Prompt_References.md deploy command: "bash deploy.sh"
□ D.12 deploy.sh header references V31 throughout
□ D.13 Planning Assistant file version: "PRODUCT.md Planning Assistant — v31"
□ D.14 Planning Assistant greeting: "PRODUCT.md Planning Assistant v31 loaded"
```

### SECTION E — Count Preservation (13 items)

```
□ E.1  Rule count = 30 in all files that mention it
□ E.2  Scenario count = 34 in all files that mention it
□ E.3  Bootstrap steps = 18 in all files that mention it
□ E.4  Security Checklist items = 84 across 13 sections
□ E.5  Phase 4 Parts = 8 in all files
□ E.6  Phase 5 Commands = 9 in all files
□ E.7  Phase 6.5 Categories = 16 in all files
□ E.8  Secure Code Gen sub-sections = 16 in all files
□ E.9  UI Component Rules = 10 in all files
□ E.10 Deliverable file count = 16 in all files that mention it (15 in .ai_prompt/ + deploy.sh at project root)
□ E.11 MCP servers = 5 (3 wired + 1 user-global [shadcn/studio Pro, V32.11] + 1 plugin)
□ E.12 Node v22, pnpm@10 referenced consistently
□ E.13 6 agents still listed (Cline remains as 6th but marked deprecated — count stays 6)
```

### SECTION F — Foundational Architecture Intact (10 items — NEW, verify carefully)

These MUST remain intact post-Cline-deprecation. If any are broken, the Spec-Driven
Platform foundation is compromised.

```
□ F.1  Governance docs read order preserved

       PRE-READ (per Rule 24 — NOT part of the numbered 9):
         .cline/STATE.md — FIRST thing every session, fresh-start safety

       THE 9 GOVERNANCE DOCS (numbered 1-9):
       1. .cline/memory/lessons.md (🔴 gotchas then 🟤 decisions first)
       2. docs/PRODUCT.md
       3. inputs.yml
       4. inputs.schema.json
       5. docs/CHANGELOG_AI.md
       6. docs/DECISIONS_LOG.md
       7. docs/IMPLEMENTATION_MAP.md
       8. project.memory.md
       9. .cline/memory/agent-log.md

       NOTE: CLAUDE_compact.md lists only the 9 (STATE.md covered in Rule 24).
       Master_Prompt.md lists STATE.md as "0" (pre-read) then 1-9.
       Both representations are valid — verify that BOTH patterns appear where
       expected (compact = 9 only; Master = 0 + 9). Do NOT flag either as FAIL.

□ F.2  File ownership model intact
       HUMAN-OWNED: docs/PRODUCT.md · CLAUDE.md · .clinerules · .vscode/mcp.json
       AGENT-OWNED: everything else
       NEVER COMMIT: CREDENTIALS.md · .env.dev · .env.staging · .env.prod

□ F.3  L1-L6 security stack preserved (canonical definitions — match files exactly)
       L1 — tRPC tenantId scoping (app layer)  [DEFERRED in single-tenant, activated 2+ tenants]
       L2 — PostgreSQL RLS (database layer — written as comments, enabled on multi-tenant upgrade)
       L3 — RBAC middleware (ACTIVE — prevents privilege escalation in any app)
       L4 — PgBouncer pool limits (DEFERRED — only meaningful with 2+ tenants)
       L5 — Immutable AuditLog (ACTIVE — every mutation logged for privacy + traceability)
       L6 — Prisma extension ($allOperations) — auto-injects tenantId on every query

       NOTE: DB isolation strategy (shared schema + tenant_id vs separate schema for
       payroll/banking/medical) is an ARCHITECTURAL decision documented in PRODUCT.md
       and DECISIONS_LOG.md — NOT part of the L1-L6 security stack itself. Do not
       conflate them.

□ F.4  Rule 24 (Fresh context per Phase 4 Part + STATE.md) preserved
       Description now attributes work to Claude Code, not Cline

□ F.5  Rule 18 (Structured lessons.md typed entries) preserved
       Claude Code writes typed entries; 🔴 gotchas, 🟤 decisions, 🟡 fixes

□ F.6  SpecStory passive capture preserved
       Auto-saves every Claude Code session to .specstory/history/

□ F.7  Memory commands all still function:
       "Resume Session" + 3 docs → Claude Code restores context ✓
       "Governance Sync" + 9 docs → Claude Code reconciles docs ✓
       "Feature Update" → Claude Code reads 9 docs + implements + attributes ✓
       "Governance Retro" → Claude Code outputs structured retrospective ✓
       "Log Lesson" script → adds typed entry to lessons.md ✓
       "Resume from handoff: [file]" → Claude Code recovers from error state ✓

□ F.8  6 agents still listed (Cline counted but deprecated):
       1. Claude Code (primary V31)
       2. Cline (⚠ DEPRECATED V31)
       3. Copilot (inline autocomplete + emergency fallback)
       4. SpecStory (passive capture)
       5. SocratiCode (MCP semantic search)
       6. code-review-graph (MCP blast-radius)

□ F.9  Phase 2.8 does not affect the Phase 3+ Claude Code build session / Cline behavior
       Phase 2.8 runs in the PA session (Claude Code PA or Claude.ai) — NOT the Phase 3+ build session
       Zero Phase 3+ build-session impact

□ F.10 Bootstrap Step 3 still writes .clinerules (even though Cline deprecated)
       File marked "⚠ Cline DEPRECATED V31 — file still generated for historical parity but unused"
```

### SECTION G — Regression Checks (8 items)

```
□ G.1  No active routing to Cline anywhere — no Phase "Who: Cline" lines,
       no "Open Cline" instructions, no "Cline runs/writes/reads" statements

□ G.2  No orphaned features — every phase still has an active owning agent
       (Claude Code for all Phase 0-8 work)

□ G.3  No conflicting agent stack language — everywhere that lists agents,
       Cline is shown consistently as ⚠ DEPRECATED

□ G.4  No "Cline as primary" or "Cline is the primary" claims anywhere

□ G.5  No stale "use Cline fallback when Claude Code is unavailable" instructions —
       should now say "use Copilot as emergency fallback" (or similar)

□ G.6  Phase 2.8 correctly scoped to the PA session (Claude Code PA preferred, or Claude.ai) — NOT the Phase 3+ build session (V32.7.1 dual-host)

□ G.7  No claim that V31 added rules / bootstrap steps / agents / MCP servers
       (post-lock additive scenarios ARE valid — current count: 34. Verify changelog documents them.)

□ G.8  No stale v27/v28/v29/v30 filename references in adoption instructions
       (should say v31 as current version)
```

### SECTION H — Phase 2.8 Technical Correctness (10 items)

```
□ H.1  Mockup is React (.jsx) primary format (shadcn/ui + Tailwind + Inter font).
       HTML archive generated in Step 7a after user confirmation.
□ H.2  shadcn/ui color tokens in HSL format
□ H.3  Inter font from rsms.me CDN
□ H.4  showScreen(id) JS function for client-side navigation
□ H.5  Tier 2 placeholder screens still navigable
□ H.6  Dummy data 15-25 rows per table
□ H.7  PH-grounded examples (Filipino business names, PHP currency)
□ H.8  Banner: "📐 PHASE 2.8 MOCKUP" identifier
□ H.9  No live functionality (forms don't submit, data doesn't save)
□ H.10 Icons restricted to lucide-react only
```

---

### SECTION I — Automation Integration: n8n + OpenClaw (7 items)

```
□ I.1  Planning Assistant Rule 11 exists and defines opt-in automation posture
       (n8n signals, OpenClaw signals, hybrid signals, ask-once behavior, defer to user)

□ I.2  Step 5 contains "Automation signal check" sub-step that runs SILENTLY
       after conditional features — does NOT ask unprompted if no signals detected

□ I.3  Step 7 contains CONDITIONAL automation infrastructure question
       that ONLY fires when Step 5 accepted a workflow — never asks otherwise

□ I.4  PRODUCT.md Integrations template has conditional "External Automation —
       n8n + OpenClaw" sub-section with workflow table (name, type, trigger,
       endpoint, handoff doc, fallback) — marked CONDITIONAL, omitted when not used

□ I.5  Infrastructure Notes template references n8n-handoff.md and
       openclaw-handoff.md as conditional gitignored entries

□ I.6  n8n-handoff.md and openclaw-handoff.md are in .gitignore across all
       three sources: bootstrap.md Step 8, Master_Prompt.md Step 8,
       deploy.sh GITIGNORE_ENTRIES

□ I.7  Zero automation footprint when not used: if no workflow accepted in
       Step 5, the output PRODUCT.md must contain NO mention of n8n, OpenClaw,
       handoff docs, or automation webhook endpoints
```

---

### SECTION J — Post-Lock Additive Patches (22 items)

These patches were applied after V31 was locked. They do NOT trigger a version bump.
Verify each is present in the specified locations.

```
□ J.1  Phase 3.5 — Execution Plan Generation section exists in phases.md
       LOOK FOR: "## PHASE 3.5 — EXECUTION PLAN GENERATION"
       Must include: 7 steps, output contract, Skill Installer integration

□ J.2  Phase 3.5 summary exists in Master_Prompt.md
       LOOK FOR: "## PHASE 3.5" between Phase 3 and Phase 4 sections
       Must include: cross-reference to phases.md, output contract

□ J.3  Phase 3.5 appears in CLAUDE_compact.md phase menu
       LOOK FOR: "Phase 3.5" line between Phase 3 and Phase 4

□ J.4  Phase 4 anti-thrashing rule exists in phases.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
       Must include: 12-file threshold, module-by-module sub-sessions, Part 8 always subdivides

□ J.5  Phase 4 anti-thrashing rule exists in Master_Prompt.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE" inside Phase 4 section

□ J.6  Phase 8 anti-thrashing rule exists in phases.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Phase 8 Batches)"
       Must include: 12-file threshold, per-feature sub-batches, CRITICAL PRINCIPLE,
       completeness check (verifies every user flow, data field, permission guard,
       validation rule, UI element from PRODUCT.md), STATE.md progress tracking

□ J.7  Phase 8 anti-thrashing summary exists in Master_Prompt.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE" inside Phase 8 section
       Must include: CRITICAL PRINCIPLE about protecting the build

□ J.8  Prompt 4.13 — Add Automation to Existing Project exists in Prompt_References.md
       LOOK FOR: "## 4.13 — Add Automation to Existing Project"
       Must include: 7 sub-steps (4.13.1 through 4.13.7)

□ J.9  Prompt 4.13 card exists in Prompt_References.html
       LOOK FOR: id="p-4-13"

□ J.10 Prompt count is 59 (not 54, 55, or 56) across all files that state a count:
       Master_Prompt.md, CLAUDE_compact.md, Framework_Feature_Index.md,
       Prompt_References.html hero stat
       MUST NOT find "54 prompts" or "55 prompts" or "56 prompts" or "31 New" or "32 New" or "33 New" anywhere

□ J.11 Attribution order: CLAUDE_CODE first, CLINE removed from active chain
       templates.md Rule 15: must show CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN
       CLAUDE_compact.md Rule 15: must NOT list CLINE
       Master_Prompt.md Rule 3: CLAUDE_CODE → self-reported first

□ J.12 Framework_Feature_Index.md V31 row mentions Phase 3.5, anti-thrashing,
       Skill Installer, Prompt 4.13, and Phase 8 anti-thrashing

□ J.13 Context Budget — Global Principle exists in CLAUDE_compact.md
       LOOK FOR: "### ⚠ CONTEXT BUDGET — GLOBAL PRINCIPLE" in NON-NEGOTIABLE BEHAVIORS
       Must include: "Claude Sonnet 4.6", "200K token context window", "≤80K SAFE zone",
       TOKEN BUDGET REFERENCE table (with ~5-8K, ~2-4K, ~1-3K, ~10-15K, ~2-5K estimates),
       12-file threshold explanation, codebase_search (Rule 17) directive,
       exact autocompact error message: "Autocompact is thrashing: the context refilled
       to the limit within 3 turns"

□ J.14 Context Budget — Global Principle exists in Master_Prompt.md
       LOOK FOR: "### ⚠ CONTEXT BUDGET — GLOBAL PRINCIPLE" after priority order section
       Must include: same elements as J.13 + mid-session recovery steps (5 steps:
       STOP, /clear, STATE.md, handoff, commit)

□ J.15 Phase 4 and Phase 8 anti-thrashing sections both have "Model context:" block
       LOOK FOR in phases.md: "**Model context:** Claude Sonnet 4.6" within 5 lines of
       each "### ⚠ ANTI-THRASHING RULE" heading. Must include "80K SAFE zone".
       Same check in Master_Prompt.md for both Phase 4 and Phase 8 summaries.

□ J.16 Prompt 3.19 — Emergency Anti-Thrashing exists in Prompt_References.md
       LOOK FOR: "## 3.19 — Emergency Anti-Thrashing"
       Must include: 3 variants (mid-session rescue, proactive scope assessment, quick version),
       "Claude Sonnet 4.6" model reference, "200K token context window", "≤80K SAFE zone",
       TOKEN BUDGET estimation step, codebase_search directive, /clear command
       Card p-3-19 must exist in Prompt_References.html

□ J.17 memory-governance.md exists with 5 sections (§1-§5)
       LOOK FOR: file memory-governance.md with headings:
       "## §1 — TIERED DECOMPOSITION ENGINE"
       "## §2 — SMART CHECKPOINT PROTOCOL"
       "## §3 — PHASE HOOKS"
       "## §4 — ARCHITECT-EXECUTE MODEL (Opus 4.6 → Sonnet 4.6)"
       "## §5 — MID-PROJECT ADOPTION"

□ J.18 Memory governance hooks in phases.md (should be 14 hooks — Phase 3.3 governance pre-flight added V32.6; was 13)
       LOOK FOR: "> **⚠ MEMORY GOVERNANCE**" blockquotes across phases.
       Must exist in: Phase 2, 2.5, 2.6, 2.7, 3, 3.5, 4, 5, 6, 6.5, 7, 7R, 8
       Phase 4/7/8 hooks must include "Architect-Execute Model (§4)"

□ J.19 Architect-Execute Model referenced in CLAUDE_compact.md
       LOOK FOR: "Opus 4.6 = Architect" and "Sonnet 4.6 = Executor" in Agent Stack
       Also: "Architect-Execute Model" in Context Budget section

□ J.20 deploy.sh deploys memory-governance.md
       LOOK FOR: overwrite_with_backup line for memory-governance.md → .ai_prompt/
       File count should say 19 deliverable files (not 16 or 17) — V32.7.2 added spec-executor.md + settings.json

□ J.21 [V31.2 historical — SUPERSEDED by V32 K.2/K.3] memory-governance.md originally added (V31.2) Step 2.5
       (30K token budget gate) and Step 2.5b (Opus escalation). V32 has SUPERSEDED both: token estimation
       replaced by `wc -l` file-size checks (Step 2.5 gone, see K.2); Step 2.5b deleted entirely (see K.3).
       For V32 verification, use K.2 and K.3 instead. This item is retained for V31.2-history audits only.
       LOOK FOR: V32 changelog block in Master_Prompt.md explaining the supersession of Step 2.5 and Step 2.5b.
       PASS if K.2 and K.3 both pass. Do NOT fail V32 for the absence of Step 2.5b — its removal is intentional.

□ J.22 Prompts 3.20 + 3.21 exist in Prompt_References.md and .html
       LOOK FOR: "## 3.20 — Memory Governance Baseline" and "## 3.21 — Opus Planning Session"
       Cards p-3-20 and p-3-21 must exist in HTML

□ J.23 Prompt count is 59 (not 54, 55, or 56) across all files that state a count
       MUST NOT find "54 prompts" or "55 prompts" or "56 prompts" or
       "31 New" or "32 New" or "33 New" anywhere

□ J.24 (V31.4) Architect-Execute Model scope universality — ALL phases + ad-hoc edits
       LOOK FOR in memory-governance.md §4: language that says the model applies to
       ALL phases AND ad-hoc edits — NOT limited to Phase 4/7/8 only.
       Grep across all 19 files: zero matches for scope-limiting phrase "Phase 4/7/8"
       OUTSIDE of historical changelog blocks. Any such match outside a changelog is a FAIL.
       ALSO CHECK: CLAUDE_compact.md and AI_Tools_Reference.md
       must NOT contain scope-limiting "Phase 4/7/8" language in the Architect-Execute description.

□ J.25 (V31.4) Sonnet Scout sub-step exists in §4 Execution Flow
       LOOK FOR in memory-governance.md §4 Execution Flow: a step 1.5 (or equivalent
       numbered sub-step) that mandates dispatching a Sonnet "scout" subagent
       BEFORE the main decomposition when ANY of these thresholds are met:
         - reading >2 PRODUCT.md sections, OR
         - reading >2 governance docs, OR
         - touching >5 source files.
       The scout's job: read and summarize, then return results to Opus for decomposition.
       FAIL if step 1.5 is absent, or if the thresholds listed above are not present.

□ J.26 (V31.4) Tier 1 mandates Sonnet dispatch — NOT "proceed directly"
       LOOK FOR in memory-governance.md §1 Tiered Decomposition Engine:
       Tier 1 action text MUST read "Dispatch to single Sonnet subagent..." (or equivalent
       imperative dispatch language). It MUST NOT say "Proceed directly."
       ALSO CHECK Tier 2: must explicitly mandate Sonnet dispatch with a planned split
       (not merely "consider splitting" or advisory language).
       FAIL if either Tier 1 says "proceed directly" OR Tier 2 lacks a dispatch mandate.

□ J.27 (V31.4) Phase hook MODEL line uses imperative "STOP" language
       LOOK FOR in memory-governance.md §3 Phase Hooks: the MODEL line (or MODEL block)
       MUST use imperative form — specifically "STOP before executing..." and MUST include
       the restriction: "Opus's only allowed actions: read, plan, decompose, review."
       And MUST state: "All file writes MUST be dispatched [to Sonnet]."
       FAIL if MODEL line is advisory ("Use Architect-Execute Model...") rather than imperative.
       FAIL if Opus write restriction is absent.

□ J.28 (V31.4) phases.md MODEL: lines use imperative form — no advisory wording remaining
       LOOK FOR in phases.md: ALL occurrences of "MODEL:" lines.
       Each MUST match the imperative form from §3 (e.g., "STOP before executing...").
       MUST NOT contain advisory phrases like "Use Architect-Execute Model for this phase"
       or "Architect-Execute Model recommended."
       MUST NOT contain phase-specific scope language like "for Phase X work" that would
       imply the model only applies to that phase.
       FAIL if any single MODEL: line in phases.md remains in advisory form.

□ J.29 (V31.4) Framework_Feature_Index.md V31.4 row exists + footer bumped
       LOOK FOR: a V31.4 row in the version table of Framework_Feature_Index.md
       describing the Dispatch Discipline Patch (universal scope, Sonnet Scout, Tier 1
       mandate, imperative hook MODEL line, phases.md MODEL line alignment).
       ALSO CHECK: the footer / "current version" marker in Framework_Feature_Index.md
       must show V31.4 as the latest version — NOT V31.3.
       FAIL if V31.4 row is missing. FAIL if footer still says V31.3.
```

---

### Section K — V32 / V32.1 / V32.2 Verification (Zero Opus Execution Dispatch System + Sonnet Subagent Context Overhead + Dispatch Discipline)

□ K.1 (V32) — Zero Opus Execution rule (R1) is documented in memory-governance.md §4
       LOOK FOR in `memory-governance.md` §4 "Opus Role (strictly limited — V32 R1)": an explicit
       "OPUS MAY NOT" block listing: Edit on project files, Write on project files (except STATE.md),
       "small justified escalation" (banned phrase), Agent(model: "opus") for execution.
       FAIL if Opus is allowed to call Edit/Write on project files for any reason.

□ K.2 (V32) — File-Size Dispatch (R2) replaces token estimation
       LOOK FOR in `memory-governance.md` §1: tier classification based on `wc -l` line counts,
       NOT estimated tokens. Tier 1 ≤ 500 total lines AND ≤ 4 files AND 1 module.
       Tier 2 = 501-1500. Tier 3 > 1500.
       FAIL if §1 still references "30K token budget" or "Step 2.5" token estimation.

□ K.3 (V32) — Step 2.5b deleted
       LOOK FOR: `memory-governance.md` should NOT have a "Step 2.5b" subsection.
       The Opus executor escalation path is REMOVED in V32.
       Historical mentions in changelog blocks (explaining what was removed) are acceptable.
       FAIL if §1 or §4 still describes Opus escalation as an operational path.

□ K.4 (V32) — Large-File Guard (R3) — files > 300 lines need line ranges
       LOOK FOR in `memory-governance.md` §1 Step 4 and §4 Task Scope Format:
       Files > 300 lines MUST have explicit line ranges in the task scope.
       FAIL if Task Scope Format does not mention line ranges for large files.

□ K.5 (V32) — Failure = Split (R4) — no Opus fallback
       LOOK FOR in `memory-governance.md` §1 "Failure Protocol" and §4 "BLOCKED" / "THRASHING":
       3 re-decomposition attempts → defer to next session. NEVER fall back to Opus execution.
       FAIL if BLOCKED handling allows Opus to take over implementation.

□ K.6 (V32) — Scout-Before-Edit (R5) — files > 200 lines
       LOOK FOR in `memory-governance.md` §4 step 1.5: Sonnet Scout is mandatory (not just optional)
       for files > 200 lines, > 2 PRODUCT.md sections, > 2 governance docs, OR > 5 source files.
       FAIL if Scout is described as fully optional or limited to "large reads" without size threshold.

□ K.7 (V32) — All 5 MODEL hooks in phases.md updated to V32 form
       LOOK FOR in `phases.md`: 5 MODEL hooks (Phase 2, 3.5, 4, 7, 8) all begin
       "MODEL: ZERO OPUS EXECUTION (V32)." and reference the 500-line `wc -l` gate explicitly.
       FAIL if any of the 5 still uses pre-V32 language ("STOP before executing" without "ZERO OPUS EXECUTION").

□ K.8 (V32) — CLAUDE_compact.md Agent Stack reflects V32
       LOOK FOR in `CLAUDE_compact.md` Agent Stack: Opus 4.6 = Architect ONLY (planning,
       decomposition, review, STATE.md checkpoint), NEVER calls Edit/Write on project files.
       FAIL if there is still a line listing "Opus 4.6 = Executor (last resort)" or Step 2.5b.

□ K.9 (V32) — Framework_Feature_Index.md V32 row exists + footer bumped
       LOOK FOR: a V32 row in the version table above the V31.4 row, describing the
       Zero Opus Execution Dispatch System. Footer reads "Last updated: V32 (...)".
       FAIL if V32 row is missing. FAIL if footer still says V31.4.

□ K.10 (V32) — Master_Prompt.md V32 changelog block present
       LOOK FOR: a `### V32 (2026-05-27) — Zero Opus Execution Dispatch System` section in
       the changelog, appearing BEFORE the V31.4 entry. Contains: WHY (V31.4 failed in Yelli),
       WHAT V32 CHANGES (5 rules R1-R5), Files changed, Counts unchanged.
       FAIL if no V32 changelog block exists.
□ K.11 (V32.1) — memory-governance.md §1 contains "Operational Note — Sonnet Subagent Context Overhead (V32.1)" subsection (symptoms, mitigation, R4 relationship, when-it-matters)
□ K.12 (V32.1) — Prompt 3.21 (Opus Planning) in Prompt_References.md AND Prompt_References.html contains "V32.1 Dispatch Sizing Tip" callout linking to memory-governance.md V32.1 note
□ K.13 (V32.1) — Master_Prompt.md changelog contains V32.1 entry positioned above the V32 entry
□ K.14 (V32.1) — Framework_Feature_Index.md contains V32.1 table row above V32 row, footer bumped to "Last updated: V32.1"
□ K.15 (V32.1) — CLAUDE_compact.md title bumped to "V32.1", and V32.1 Operational Note paragraph present after the dispatch gate paragraph
□ K.16 (V32.1.1) — Planning_Assistant.md Step 7d (Final handoff) routes Bootstrap FIRST → "Start Phase 2" → "Start Phase 3"
       LOOK FOR in `Planning_Assistant.md` Step 7d Final handoff Output text:
       the phrase "run 'Bootstrap' FIRST (creates CREDENTIALS.md — required gate for Phase 2)"
       followed by "THEN 'Start Phase 2'" and the operational-questions list (Docker Hub credentials,
       model routing, dev port ranges, git strategy, CORS origins), and finally
       "After Phase 2 confirms, type 'Start Phase 3' to generate inputs.yml".
       FAIL if Step 7d still tells users to run "Start Phase 3" directly without Bootstrap + Phase 2 first.
       FAIL if Step 7d does not mention CREDENTIALS.md as the Phase 2 gate.
□ K.17 (V32.1.1) — Prompt_References.md Prerequisites lists 17 V32 framework files + Planning Assistant deliverables include DESIGN.md + mockup HTML
       LOOK FOR in `Prompt_References.md` Prerequisites section: a bullet stating
       "17 V32 framework files (16 in `.ai_prompt/` + `deploy.sh` at project root)"
       AND a bullet mentioning DESIGN.md + mockup HTML archive as optional Planning Assistant deliverables
       AND a cross-reference to Appendix A for the V32 `spec-update` workflow.
       FAIL if Prereqs still says "16 V31 files" or omits DESIGN.md/mockup mention.
□ K.18 (V32.1.1) — Prompt_References.md Starting State diagram contains memory-governance.md AND docs/DESIGN.md AND docs/mockups/
       LOOK FOR in `Prompt_References.md` "## The Starting State" ascii block:
       row for `memory-governance.md` inside `.ai_prompt/`, AND
       row for `docs/DESIGN.md` with annotation "from Planning Assistant Step 7b — if you chose a shadcn/ui theme direction in Phase 2.8", AND
       row for `docs/mockups/` with annotation "from prompt 4.7 — if you saved the Phase 2.8 mockup HTML archive".
       FAIL if any of the three rows is missing.
       FAIL if the diagram still says "15 V31 reference files".
□ K.19 (V32.1.1) — Prompt_References.md 1.3.2 renamed "Phase 2 operational interview" + 1.3.3 contains Phase 2.8 SKIPPED note
       LOOK FOR in `Prompt_References.md`:
       (a) `### 1.3.2 — Phase 2 operational interview` (NOT "Phase 2 discovery") followed by body text explaining
           Phase 2 is NOT a duplicate of Planning Assistant and listing the operational questions it asks
           (Docker Hub, model routing, dev ports, git, CORS, Komodo, Turnstile).
       (b) Section 1.3.3 auto-chain line acknowledges Phase 2.8 is SKIPPED in the Phase 3+ build session — already completed in the PA session (Claude Code PA or Claude.ai) (V32.7.1 dual-host).
       FAIL if 1.3.2 still says "Phase 2 discovery" or "Claude only asks remaining open questions".
       FAIL if 1.3.3 does not explicitly say Phase 2.8 is skipped in Claude Code.
□ K.20 (V32.1.1) — Master_Prompt.md changelog contains V32.1.1 entry dated 2026-05-28
       LOOK FOR in `Master_Prompt.md` changelog: a bullet beginning
       "**V32.1.1 (2026-05-28):** Planning Assistant Step 7d corrected." inside the V32.1 changelog section
       (positioned after the V32.1 entries, before the V32 entry).
       The bullet must describe: old behavior (skipped Bootstrap + Phase 2), new behavior
       (Bootstrap → Phase 2 → Phase 3), propagation to Prompt_References.md + .html, and rationale
       (Master Prompt = sole authority, Planning Assistant must match).
       FAIL if V32.1.1 entry is absent or dated differently.
□ K.21 (V32.1.2) — AI_Tools_Reference.md Claude Code agent row describes V32 Zero Opus Execution
       LOOK FOR in `AI_Tools_Reference.md` the Claude Code row of the agent table:
       row must say "Opus 4.6 = Architect ONLY", "NEVER calls Edit/Write on project files",
       "Sonnet 4.6 = Sole Executor", "`wc -l` ≤ 500 total lines per task", and explicitly call out
       that "Step 2.5/2.5b (30K token budget gate + Opus executor escalation) was the V31.2-era model
       and is REMOVED in V32" as a historical note.
       FAIL if active row still describes "fallback Executor" or "30K token budget" as live behavior.
□ K.22 (V32.1.2; V32.2 note; V32.4-bumped — file re-edited) — AI_Tools_Reference.md footer says 17-file deliverable set (V32.4 marker — file genuinely re-edited in V32.4: new §3.7 react-doctor)
       LOOK FOR: footer line "*This reference is part of the 17-file V32.4 deliverable set (16 files placed in `.ai_prompt/` + deploy script at project root):*"
       followed by file listing that includes memory-governance.md and ChatGPT_Cross_Audit.md and Prompt_References.html.
       V32.2 NOTE: This file is intentionally untouched in V32.2 (R6-R9 do not change MCP/tools/skills set), so the V32.1 marker is the correct last-modified version. Bumping to V32.2 only when AI_Tools is genuinely re-edited.
       V32.3 NOTE: Also untouched in V32.3 (Smart Governance Hydration changes Rule 4 / R6 allow-list — does not change MCP/tools/skills set). V32.1 marker remained correct as last-modified version at that time.
       V32.4 NOTE: AI_Tools IS genuinely re-edited in V32.4 — new §3.7 react-doctor subsection (with Domain Packs renumbered →3.8 and Memory Governance →3.9) + last-updated marker bumped V31→V32.4. The deliverable-set footer marker is therefore now V32.4 (no longer V32.1/V32.3).
       FAIL if footer still says "13-file V31 deliverable set" OR if the file listing is missing memory-governance.md / ChatGPT_Cross_Audit.md / Prompt_References.html.
□ K.23 (V32.1.2; V32.2 bumped; V32.3-bumped; V32.4-bumped) — Framework_Feature_Index.md header says current version V32.4
       LOOK FOR near top: "> Current framework version: **V32.4**" with explanation that
       filenames retain `_v31_` for deploy backward compatibility, and that content describes current V32.4 behavior.
       The explanation must mention the V32.4 patch chain (react-doctor Phase Integration — per-phase React diagnostics skill at Phase 4 Parts 5-6 / Phase 5 / Phase 7) layered on top of V32.3 (Smart Governance Hydration — R6 allow-list size qualifier) and V32.2 (R6-R9 Dispatch Discipline + tightened-DONE) over V32 base.
       FAIL if header still says "Current framework version: **V31**" or "**V32**" or "**V32.1**" or any V32.1.x or "**V32.2**" or "**V32.3**" marker — current state must be V32.4.
□ K.24 (V32.1.2; V32.2 bumped; V32.3-bumped; V32.4-bumped) — Framework_Feature_Index.md Note line at end says 17-file V32.4 deliverable set + memory-governance.md
       LOOK FOR the "**Note:** This file is updated by Claude alongside every version bump..." paragraph
       near the file end: must say "17-file V32.4 deliverable set — 16 files in `.ai_prompt/`"
       and the file listing must include memory-governance.md.
       FAIL if Note still says "16-file V31 deliverable set", "17-file V32.1 deliverable set", "17-file V32.1.5 deliverable set", "17-file V32.2 deliverable set", "17-file V32.3 deliverable set", or any pre-V32.4 marker. FAIL if memory-governance.md is missing from the listing.
□ K.25 (V32.1.2; V32.2 bumped; V32.3-bumped; V32.4-bumped) — CLAUDE_compact.md role block says V32.4 STRICTEST + Master_Prompt header has V32.1.2 naming-policy note
       LOOK FOR in `CLAUDE_compact.md` near top: "operating under **V32.4 STRICTEST** discipline"
       (NOT "V31 STRICTEST" / "V32 STRICTEST" / "V32.1 STRICTEST" / any V32.1.x STRICTEST / "V32.2 STRICTEST" / "V32.3 STRICTEST"). The role-block parenthetical
       must include the patch chain through V32.4 — V31 base + V32 ZOE + V32.1 + V32.1.4 + V32.1.5 + V32.2 Dispatch Discipline R6-R9 + V32.3 Smart Governance Hydration (R6 allow-list size qualifier) + V32.4 react-doctor Phase Integration.
       AND in `Master_Prompt.md` header area: a block titled
       "**VERSION + FILENAME POLICY (added V32.1.2 — 2026-05-28)**" explaining that body labels saying
       "V31 primary" / "V31 STRICTEST" should be interpreted as base-V31 with V32/V32.1/V32.2/V32.3/V32.4 patches layered on.
       FAIL if STRICTEST line is at any version below V32.4 or if naming-policy block is absent.
□ K.26 (V32.1.3) — deploy.sh count messages consistent with 17-file canonical (16 in .ai_prompt/ + 1 deploy script)
       LOOK FOR in `deploy.sh`:
       (a) Header layout block (around line 49) says "put all 16 V32 reference files in here".
       (b) Footer comment (around line 66) says "this script at project root (17th file — total deliverable set)".
       (c) Missing-folder error path says "put the 16 V32 reference files in it" — NOT "15 V32 reference files".
       FAIL if any of the three messages uses 13, 14, 15, or 17 in the .ai_prompt/ reference count
       (the .ai_prompt/ folder always holds 16 files; deploy.sh is the 17th = total set).
□ K.27 (V32.1.4) — deploy.sh "Next steps" message conditionally routes based on Planning Assistant artifact detection
       LOOK FOR in `deploy.sh` (around the post-deploy "Next steps" block):
       (a) A `pa_signal` variable initialized to 0 and set to 1 when
           `[ -f "$PROJECT/docs/PRODUCT.md" ] && { [ -f "$PROJECT/docs/DESIGN.md" ] || [ -f "$PROJECT/docs/MOCKUP.jsx" ]; }` is true.
       (b) An `if [ "$pa_signal" -eq 1 ]; then ... else ... fi` branch around the "Next steps" echo lines.
       (c) PA-branch output mentions "Bootstrap" (Phase 0), "Start Phase 2" (operational interview), "Start Phase 3" (inputs.yml from PRODUCT.md),
           AND explicitly states "Phase 2.8 is SKIPPED in Claude Code" (because the mockup already ran in Planning Assistant).
       (d) PA-branch output offers prompt 1.2 (Universal Analyzer) as a fallback for users who'd rather auto-detect.
       (e) Non-PA branch retains the previous behavior (recommend pasting prompt 1.2 from Prompt References).
       FAIL if the Next-steps message is unconditional (always recommends 1.2 OR always recommends Bootstrap).
       FAIL if PA-branch does not mention Bootstrap → Phase 2 → Phase 3 in that order.
       FAIL if PA-branch does not mention "Phase 2.8 is SKIPPED" explicitly.
       Rationale: deploy script now resolves the V32.1.1 (Planning Assistant "type Bootstrap") vs prior deploy-script
       ("paste prompt 1.2") contradiction by picking the right entry point from observable target state.
□ K.28 (V32.1.5) — Prompt 4.14 (Brownfield PA Adoption — Reverse-Extract PRODUCT.md) is present in Prompt_References.html AND Prompt_References.md, and counts are bumped 59→60 / 36→37 in every file that quotes them
       LOOK FOR in `Prompt_References.html`:
       (a) A prompt card `<div class="prompt-card group-4 new-badge" id="p-4-14" ...>` after `id="p-4-13"`
           with title containing "Brownfield PA Adoption" and "Reverse-Extract PRODUCT.md"
       (b) A nav-link `<a class="nav-link" href="#p-4-14">` inside the Planning Assistant nav-group
       (c) Hero stats `<div class="stat-num">60</div>` (Prompts) and `<div class="stat-num">37</div>` (New ✨)
           — NOT 59 and 36
       LOOK FOR in `Prompt_References.md`:
       (d) A `## 4.14 — Brownfield PA Adoption: Existing App / Mockup → Reverse-Extract PRODUCT.md (NEW)` heading
       (e) The decision tree contains the line `"I have an existing app/mockup but no PRODUCT.md yet"       → 4.14`
       (f) The "What's New in This Edition" summary lists `- 4.14: Brownfield PA Adoption — ...`
       LOOK FOR in `Master_Prompt.md`:
       (g) A changelog entry beginning `- **V32.1.5 (2026-05-29):** Prompt 4.14 added — **Brownfield PA Adoption`
       LOOK FOR in `Framework_Feature_Index.md`:
       (h) A row beginning `| V32.1.5 | Prompt 4.14 — Brownfield PA Adoption` (preserved as historical row, no longer the latest)
       (i) Current footer reads `*Last updated: V32.4 (30 rules · 35 scenarios · 19 bootstrap steps · 60 prompts (37 New ✨)` — V32.3 footer marker superseded by V32.4 per K.35 bump
       (j) Current note line reads `17-file V32.4 deliverable set` — V32.3 marker superseded
       LOOK FOR in `CLAUDE_compact.md`:
       (k) Title/header line says `V32.4` (was V32.3 — superseded by V32.4)
       (l) The "60 prompts total" string in the FOR HUMANS line
       (m) STRICTEST role line contains `V32.4 STRICTEST` (was V32.3 — superseded by V32.4) and still references prompt 4.14 in the historical-chain parenthetical
       LOOK FOR in this file (ChatGPT_Cross_Audit.md):
       (n) Verified counts block has `60 Prompts (37 NEW ✨)` — NOT `59 Prompts (36 NEW ✨)`
       (o) Header item 7 says `V32.4 current: **60 prompts (37 NEW ✨)**` (was V32.3 current — superseded by V32.4)
       (p) Header line 1 says `Spec-Driven Platform V32.4 — Cross-AI Audit Prompt` (was V32.3)
       FAIL if any of (a)-(p) is missing or shows the old 59/36 values, or if (i)/(j)/(k)/(m)/(o)/(p) still show V32.1.5 / V32.1 / V32.2 / V32.3 as the current-state marker.
       Rationale: V32.1.5 was the first count change since V31.3 — V32.1.5 changelog rows and changelog entries remain as historical record; current-state markers (footer, note, header lines) bump forward with each release (now V32.2). Every count reference across the 17-file deliverable set must be in sync.

□ K.29 (V32.2) — Rule R6 "Scout-Before-Plan" is documented in `memory-governance.md` §4 AND surfaced in `CLAUDE_compact.md` CONTEXT BUDGET section
       LOOK FOR in `memory-governance.md`:
       (a) A subsection in §4 with heading containing "R6" and "Scout-Before-Plan"
       (b) Text stating that Opus reads of non-allow-list files exceeding 100 lines MUST go through Scout-Sonnet
       (c) Rationale tying R6 to the 71% Opus-burn diagnosis (exploratory reads + serial dispatch)
       LOOK FOR in `CLAUDE_compact.md`:
       (d) A compact R6 line in the CONTEXT BUDGET section referencing Scout-Sonnet for non-allow-list reads > 100 lines
       FAIL if R6 appears only as a one-liner with no code example or threshold definition.
       FAIL if the 100-line threshold is missing or inconsistent between memory-governance.md and CLAUDE_compact.md.
       Rationale: R6 is the dispatch-discipline rule that prevents Opus from burning context on exploratory reads; threshold must be mechanical, not advisory.

□ K.30 (V32.2) — Rule R7 "Default Parallel Fan-Out" is documented in `memory-governance.md` §4 AND surfaced in `CLAUDE_compact.md`
       LOOK FOR in `memory-governance.md`:
       (a) A subsection in §4 with heading containing "R7" and "Parallel Fan-Out"
       (b) Rule text stating ≥ 2 independent Sonnet dispatches MUST be parallel in one Opus response (single message, multiple tool-use blocks)
       (c) Explicit exception clause: serial dispatch ALLOWED only when there is a real data dependency between dispatches
       (d) A code example or pseudo-code showing the parallel-dispatch pattern
       LOOK FOR in `CLAUDE_compact.md`:
       (e) A compact R7 line referencing parallel fan-out as the default for ≥ 2 independent dispatches
       FAIL if R7 phrases parallelism as a preference instead of a requirement.
       FAIL if no "serial only with data dependency" exception is documented.
       Rationale: R7 closes serial-dispatch wall-clock waste; must be the default, not advisory.

□ K.31 (V32.2) — Rule R8 "Opus Write Allow-List" enumerates exactly 5 files as a CLOSED list in `memory-governance.md` §4 AND `CLAUDE_compact.md`
       LOOK FOR in `memory-governance.md`:
       (a) A subsection in §4 with heading containing "R8" and "Allow-List"
       (b) The literal 5-file CLOSED list: `docs/STATE.md`, `docs/DECISIONS_LOG.md`, `docs/CHANGELOG_AI.md`, `docs/IMPLEMENTATION_MAP.md`, `.cline/STATE.md`
       (c) Statement that any other Opus Edit/Write is a R8 violation
       (d) Relationship to R1 (R8 closes R1 ambiguity by enumerating the allowed set)
       LOOK FOR in `CLAUDE_compact.md`:
       (e) The same 5-file allow-list, identical wording
       FAIL if the allow-list contains more or fewer than 5 files.
       FAIL if the lists in memory-governance.md and CLAUDE_compact.md disagree.
       FAIL if R8 is phrased as an open-ended "things like" list instead of a CLOSED enumeration.
       Rationale: R1 said "Opus never writes project files" but in practice required exceptions for governance docs; R8 makes the exception list explicit and bounded.

□ K.32 (V32.2) — Rule R9 "Dispatch Ratio Metric" is added to `memory-governance.md` §2 Smart Checkpoint YAML AND §4 Dispatch Discipline subsection
       LOOK FOR in `memory-governance.md`:
       (a) A `dispatch_ratio:` field in the §2 Smart Checkpoint YAML example, computed as `sonnet_writes / opus_writes`
       (b) Target threshold `≥ 3.0` stated explicitly
       (c) Drift-review trigger when ratio `< 1.0` → mandatory `lessons.md` entry
       (d) A subsection in §4 with heading containing "R9" and "Dispatch Ratio"
       (e) Cross-reference between §2 (where the field is captured) and §4 (where the rule is defined)
       FAIL if the field name is not `dispatch_ratio` (must be machine-greppable, exact).
       FAIL if the 3.0 target or 1.0 drift threshold is missing or inconsistent.
       FAIL if the field is added to §2 but R9 is not defined in §4 (orphaned metric).
       Rationale: R9 makes dispatch discipline measurable; without the metric, R6-R8 are aspirational.

□ K.33 (V32.2) — Sonnet Status Handling: DONE protocol tightened to require full diff review; review-by-summary FORBIDDEN
       LOOK FOR in `memory-governance.md`:
       (a) Sonnet Status section (or §3 equivalent) where DONE handling is defined
       (b) Explicit text: when Sonnet returns DONE, Opus MUST read the full git diff (or full file diff) before accepting
       (c) Explicit text marking "review-by-summary FORBIDDEN" (or equivalent prohibition language)
       (d) Rationale tying the change to the V32.2 dogfooding observation that summary-only review hides drift
       LOOK FOR in `CLAUDE_compact.md`:
       (e) The STRICTEST line (or equivalent header line) extended to mention "full diff review mandatory on DONE"
       FAIL if the tightening is documented in only one of the two files.
       FAIL if "review-by-summary FORBIDDEN" (or equivalent) is missing — soft language defeats the rule.
       Rationale: review-by-summary was the failure mode that masked V32 R1 violations in earlier sessions; this audit item is the structural fix.

□ K.34 (V32.3) — Smart Governance Hydration: R6 architect-read allow-list gets a size qualifier (≤200 lines direct; >200 lines via Scout with Governance Extraction Schema); Rule 4 reframed from "read" to "hydrate"
       NOTE (V32.4 supersession): sub-items (p)/(q)/(s)/(t) below assert the V32.3-era current-state version markers (header version, §1.2 title, footer "Last updated:", deliverable-set note). V32.4 has since re-bumped each of these to V32.4 — verify their CURRENT values against K.35, not this item. K.34 otherwise verifies the V32.3 Smart Governance Hydration mechanics (Rule 4 hydrate-reframe, R6 size qualifier, Governance Extraction Schema), which remain in force unchanged.
       LOOK FOR in `Master_Prompt.md`:
       (a) Rule 4 title bumped from "Read all 9 context documents" to "Hydrate the 9 governance docs" (with "(V32.3)" annotation)
       (b) Rule 4 body declares per-doc hydration modes (keyword-filtered for lessons.md, domain-section-filtered for PRODUCT.md, recency+flag-filtered for CHANGELOG_AI.md, keyword+unresolved-filtered for DECISIONS_LOG.md, area-status-filtered for IMPLEMENTATION_MAP.md, session/task-scoped for agent-log.md, direct read for inputs.yml/inputs.schema.json/project.memory.md)
       (c) R6 body in V32.2 changelog block updated to include the "≤ 200 lines direct; > 200 lines via Scout with Governance Extraction Schema" size qualifier with explicit `memory-governance.md §4` cross-reference
       (d) New V32.3 changelog entry (2026-06-02) below V32.2 entry and above the V32 entry's `---` divider — states it is an R6 extension, NOT a new rule; declares counts unchanged; declares the new invariant (allow-list size threshold = 200 lines)
       LOOK FOR in `memory-governance.md`:
       (e) R6 block "Architect-read allow-list" line updated from "any size — no scout required" to "≤ 200 lines direct read; > 200 lines route through Scout-Sonnet with the Governance Extraction Schema below (V32.3)"
       (f) New "**Governance Extraction Schema (V32.3 — Smart Governance Hydration)**" sub-section between R6 and R7, containing: per-doc YAML-shaped extraction contract for all 9 governance docs; dispatch template using `Agent(model: "sonnet", subagent_type: "Explore")`; explicit size threshold (200 lines) with `wc -l` rationale; explicit rationale for "200 not 100"; explicit "Why Rule 4 reframed from 'read' to 'hydrate'" paragraph
       (g) Explicit R9 interaction text: direct Opus read of a >200-line allow-list governance doc counts as `opus_writes` for `dispatch_ratio`
       LOOK FOR in `CLAUDE_compact.md`:
       (h) File header `V32.2 → V32.3`
       (i) STRICTEST line extended with "V32.3 Smart Governance Hydration (R6 allow-list size qualifier: files > 200 lines route through Scout with the Governance Extraction Schema; Rule 4 reframed from 'read' to 'hydrate')"
       (j) Rule 4 one-liner row reads "Hydrate 9 governance docs before changing anything — Scout if >200 lines (V32.3); lessons.md FIRST (🔴 then 🟤)" (was "Read 9 governance docs before changing anything")
       (k) R6 line in the V32.2 Dispatch Discipline compact block extended with "(V32.3: ≤200 lines direct; >200 lines → Scout with Governance Extraction Schema)" — must NOT be a standalone new rule line
       (l) R9 line in the same block extended with the V32.3 `opus_writes` count rule (>200-line allow-list direct read = `opus_writes`)
       (m) New "**V32.3 Smart Governance Hydration**" bullet appended to the V32.2 block (NOT a new top-level section — it's a sub-bullet documenting per-doc hydration modes)
       (n) `## 9 GOVERNANCE DOCS` section title bumped to "hydrate before any action — Rule 4 / V32.3 Smart Hydration" and per-doc table updated to declare each doc's hydration mode (Scout-if-> 200-lines vs. direct read)
       (o) Non-negotiable behavior line: "Never generate files without reading 9 governance docs first" rewritten to "...without hydrating 9 governance docs first (Rule 4 — V32.3 Smart Hydration: Scout if >200 lines)"
       LOOK FOR in `Framework_Feature_Index.md`:
       (p) Header version line bumped to V32.3 with V32.3 description appended
       (q) §1.2 subsection title: "Claude Code (Primary Agent — current V32.3 behavior, V31 base)"
       (r) New V32.3 row in the version timeline (just above the V32.2 row) — covers Smart Governance Hydration, R6 size qualifier, Rule 4 reframe, Governance Extraction Schema, 200-line threshold, R9 interaction, files changed, counts unchanged
       (s) Footer "Last updated:" line bumped V32.2 → V32.3 with V32.3 features added to the feature-bullet train
       (t) Deliverable set note bumped "17-file V32.2 deliverable set" → "17-file V32.3 deliverable set"
       LOOK FOR in `phases.md`:
       (u) Phase 7 MODEL hook updated (V32.2 → V32.3) with explicit governance-hydration guidance: when reading the 9 governance docs at Phase 7 start, files >200 lines route through Scout-Sonnet with Governance Extraction Schema; direct Opus read of a >200-line allow-list governance doc counts as `opus_writes` for R9
       LOOK FOR in `deploy.sh`:
       (v) Line 3 header bumped V32.2 → V32.3 (cosmetic self-ID only)
       FAIL if the new V32.3 changelog entry is missing from Master_Prompt.md.
       FAIL if memory-governance.md still says "any size — no scout required" anywhere in the R6 block.
       FAIL if the Governance Extraction Schema sub-section is missing from memory-governance.md §4.
       FAIL if any of the 7 files still references V32.2 as the current version in its header/title block.
       FAIL if Rule 4 in Master_Prompt.md still says "Read 9 context documents" (must be "Hydrate the 9 governance docs").
       FAIL if the V32.3 row in Framework_Feature_Index.md is placed above any V32 row other than V32.4 (chronological order matters — V32.4 is now the newest row; V32.3 must sit directly below V32.4 and above V32.2).
       FAIL if V32 Dispatch Rule count changed from 9 to 10 anywhere — V32.3 is an R6 extension, not R10.
       Rationale: V32.2's R6 allow-list said "any size" — that exemption inverts as governance docs grow past 200 lines, recreating the very Opus-burn V32.2 was designed to fight. V32.3 closes the loophole by routing large allow-list docs through Scout with a domain-aware extraction schema. This audit item verifies the closure is documented consistently across all 7 canonical files.

□ K.35 (V32.4) — react-doctor Phase Integration: react-doctor added as a per-phase **supplementary** skill (NOT a Primary Group slot) at Phase 4 Parts 5-6, Phase 5, and Phase 7
       LOOK FOR in `phases.md` Step 6 Skill Activation Plan:
       (a) A `| react-doctor | React diagnostics | … |` row in the Phase 4 Parts 5-6 (Web UI) supplementary-skill table
       (b) A `| react-doctor | React diagnostics | … |` row in the Phase 5 (Validation) table
       (c) A `| react-doctor | React diagnostics | … |` row in the Phase 7 (Feature Updates) table
       (d) A Note clarifying react-doctor is supplementary (NOT a Primary Group slot), surfaced by /scan-project after a read-only audit, installed only on approval
       LOOK FOR in `CLAUDE.md` (repo root) "Skills Library Awareness" phase→skill table: `react-doctor` appended to the Phase 4 Parts 5-6 (UI), Phase 5 (validation), and Phase 7 (feature update) rows.
       LOOK FOR in `AI_Tools_Reference.md`: a new `### 3.7 react-doctor` subsection (install `npx react-doctor@latest install`; loaded Phase 4 Parts 5-6 / Phase 5 / Phase 7; surfaced by /scan-project audit-driven recommendation); Domain Plugin Packs renumbered to §3.8 and Memory Governance Layer to §3.9; "Last updated:" bumped to V32.4.
       LOOK FOR in `Master_Prompt.md`: a `- **V32.4 (2026-06-02) — react-doctor Phase Integration:**` changelog entry below the V32.3 entry and above the V32 entry's `---` divider — states it is a per-phase supplementary skill, NOT a Primary Group slot, NOT a rule/scenario/prompt; declares counts unchanged.
       LOOK FOR in `Framework_Feature_Index.md`: a `| V32.4 | react-doctor Phase Integration |` row as the NEWEST row (directly above the V32.3 row); header version, §1.2 title, and footer all bumped to V32.4.
       LOOK FOR in `deploy.sh`: header comment (line ~3) and the echo banner (line ~103) read `Spec-Driven Platform V32.4` (cosmetic bump from V32.3).
       FAIL if react-doctor is described as a Primary Group slot anywhere — it is supplementary only.
       FAIL if /scan-project install is described as unattended/auto — react-doctor is an **approval-gated** external install (installs only on explicit "yes"); ktx remains the only signal-gated unattended auto-install.
       FAIL if any canonical count changed — V32.4 adds a phase-contextual skill recommendation, NOT a rule/scenario/prompt. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules.
       Rationale: react-doctor is a deterministic React diagnostics linter wired at the three React-touching phases so framework-built apps catch AI-generated React anti-patterns (state/effects, perf, security, a11y, bundle size) before delivery. It rides as a supplementary skill surfaced by /scan-project, not a behavioral-contract change — hence no count movement.

□ K.36 (V32.4.1) — Post-Ship Consistency Sweep: (a) no LIVE (non-changelog) "Phase 4 Part 2" reference ties UI / shadcn / loading-state work to Part 2 — only Part 2 = Shared-packages session headings + V31.3 historical changelog entries remain; (b) `CLAUDE_framework_repo.md` skill table lists react-doctor at Phase 4 Parts 5-6 / Phase 5 / Phase 7 (matches `CLAUDE.md`); (c) `deploy.sh` Group 2 label reads "7 modular files"; (d) `Master_Prompt` VERSION+FILENAME POLICY block states active version V32.4.1 with the V32.2/V32.3/V32.4 decode; (e) `Prompt_References.md`/`.html` Appendix A.8/A.9 contain no hard-coded "V32.3.1"/"2106b5a" except the single labelled "as of this writing" snapshot, and the verification greps use sub-version-robust patterns; (f) current-version markers (compact title + STRICTEST line, Feature_Index header + footer, this audit header + verified-counts block, deploy.sh header) all read V32.4.1, while historical V32.4 references (V32.4 changelog entry, K.35, Feature_Index V32.4 row) correctly remain V32.4.
       NOTE (V32.5 supersession): the current-version markers asserted in sub-item (f) have been re-bumped V32.4.1 → V32.5 by K.37. Verify the CURRENT values against K.37, not this item. K.36 otherwise verifies the V32.4.1 sweep mechanics (Phase 4 part-numbering, CLAUDE_framework_repo react-doctor row, deploy Group 2 label "7", A.9 durability), which remain in force unchanged.

□ K.37 (V32.5) — Designer-Skills Phase Integration: the `julianoczkowski/designer-skills` bundle is prescribed at Phase 2.8 (hand-off), Phase 4 Parts 5-6 (Web UI), and Phase 7 (Feature Update UI-delta) under an INHERIT-not-REPLACE contract over PA's `docs/DESIGN.md` + `docs/MOCKUP.jsx`.
       LOOK FOR in `Master_Prompt.md`: a `- **V32.5 (2026-06-04) — Designer-Skills Phase Integration:**` changelog entry placed ABOVE the V32.4.1 entry (chronological newest-first); VERSION+FILENAME POLICY block (line ~28) states active version V32.5 with the V32.5 decode appended after the V32.4.1 decode.
       LOOK FOR in `phases.md`: (a) the Phase 2.8 reference paragraph (near the existing `See Planning_Assistant.md — Phase 2.8 section` line) gains a `**MODEL HOOK (V32.5 — Phase 2.8 → Phase 4 designer-skills hand-off):**` paragraph stating DESIGN.md + MOCKUP.jsx are the human-verified baseline; (b) the Phase 4 Parts 5-6 supplementary-skill table gains a `| designer-skills | Design system (V32.5) | ... |` row plus a `**MODEL HOOK (V32.5 — designer-skills, Phase 4 Parts 5-6):**` paragraph stating `/design-tokens` EXPANDS and never regenerates; (c) the Phase 7 supplementary-skill table gains a `| designer-skills | Design system (V32.5) | ... |` row plus a `**MODEL HOOK (V32.5 — designer-skills, Phase 7 UI-delta):**` paragraph stating `/design-refine` runs only on flagged components.
       LOOK FOR in `Planning_Assistant.md`: Step 7b text ending in `apply the tokens automatically.` is followed by a `(V32.5: docs/DESIGN.md is the human-verified BASELINE. ... /design-tokens will EXPAND this token table — never regenerate it ...)` parenthetical.
       LOOK FOR in `CLAUDE_compact.md`: (a) title line reads `# SPEC-DRIVEN PLATFORM — V32.5`; (b) STRICTEST line is extended with `V32.5 Designer-Skills Phase Integration (... INHERIT-not-REPLACE ...)`; (c) Phase 2.8 menu line is annotated `V32.5: PA Step 7 emits docs/DESIGN.md + docs/MOCKUP.jsx as baseline — designer-skills INHERIT-not-REPLACE in later phases`.
       LOOK FOR in `CLAUDE.md` (repo root): the Skills Library Awareness table has had the `†` advisory marker REMOVED from `designer-skills` in all three rows (Phase 2.8 / Phase 4 Parts 5-6 / Phase 7); the V32.5 deferral footnote is REPLACED by a `V32.5 — designer-skills is **framework-prescribed** ...` INHERIT-not-REPLACE one-liner.
       LOOK FOR in `Framework_Feature_Index.md`: a `| V32.5 | Designer-Skills Phase Integration |` row placed ABOVE the V32.4 row (the file's convention is parent-version-then-its-patches, so V32.5 sits above V32.4 which is followed by V32.4.1, then V32.3, etc.); header version line reads `Current framework version: **V32.5**` with the V32.5 decode appended; §1.2 subsection title reads `### 1.2 Claude Code (Primary Agent — current V32.5 behavior, V31 base)`; footer "Last updated:" reads `V32.5` and the feature-bullet train includes a V32.5 Designer-Skills Phase Integration bullet; deliverable-set note reads `17-file V32.5 deliverable set`.
       LOOK FOR in `deploy.sh`: header comment (line ~3) reads `Spec-Driven Platform V32.5 — File Deployment Script`; the echo banner (line ~103) reads `Spec-Driven Platform V32.5 — Deployment`.
       LOOK FOR in this file (`ChatGPT_Cross_Audit.md`): header title line 1 reads `Spec-Driven Platform V32.5`; the purpose paragraph (line 3) references `17 V32.5 framework files`, audits `V32.5`, includes `V32.5` in the verification version list, and quotes Section K range as `K.1-K.37` with `V32.5 verified counts block`; the V32.5 verified counts heading is renamed accordingly; a `Count diffs vs V32.4.1:` line is appended below the existing V32.4.1 diff line.
       FAIL if designer-skills is described as a Primary Group slot anywhere — it is supplementary only (V32.5 explicitly inherits the V32.4 react-doctor pattern: per-phase supplementary, NOT a Primary Group slot).
       FAIL if any phases.md MODEL hook authorizes designer-skills to REGENERATE `docs/DESIGN.md` or `docs/MOCKUP.jsx` — the INHERIT-not-REPLACE contract is the V32.5 invariant; PA artifacts are the human-verified baseline and are owned by Rule 1.
       FAIL if any canonical count changed — V32.5 adds a phase-contextual skill recommendation, NOT a rule/scenario/prompt/bootstrap. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1–R9).
       FAIL if the V32.5 row in Framework_Feature_Index.md is placed below the V32.4 row — V32.5 is newest and must sit at the top of the version timeline. (Note: the file's row order is parent-then-patch, so the sequence below V32.5 is V32.4 → V32.4.1 → V32.3 → V32.2 …; do NOT reorder V32.4 and V32.4.1.)
       FAIL if any of the 7 canonical files still references V32.4.1 as the current version in its header/title block (current-version markers in compact title + STRICTEST line, Feature_Index header + §1.2 + footer + deliverable-set note, this audit header + verified-counts block, deploy.sh header must read V32.5; historical V32.4.1 references — V32.4.1 changelog entry, K.36 item, Feature_Index V32.4.1 row — correctly remain V32.4.1).
       FAIL if the `†` advisory marker remains on any designer-skills entry in `CLAUDE.md` Skills Library Awareness table.
       NOTE (V32.5.1 supersession): the current-version markers asserted by K.37 have been re-bumped V32.5 → V32.5.1 by K.38. Verify the CURRENT values against K.38, not this item. K.37 otherwise verifies the V32.5 prescription mechanics (designer-skills bundle at the three phase entry points, INHERIT-not-REPLACE contract, three MODEL hooks in phases.md), which remain in force unchanged.
       Rationale: V32.5 closes the discoverability → prescription gap. Phase A (2026-06-03) shipped designer-skills as an installable Phase A skill bundle — discoverable via /scan-project, displayed in the React SPA catalog, documented in Prompt_References Appendix B. But the framework did NOT auto-invoke them. V32.5 wires them into phases.md MODEL hooks so Claude Code is prescribed (not just permitted) to invoke `/design-tokens` / `/design-review` / `/design-refine` at Phase 4 Parts 5-6 and Phase 7. The INHERIT-not-REPLACE contract over PA's DESIGN.md + MOCKUP.jsx preserves Rule 1 (human owns PA artifacts) and the layered design model (PA establishes aesthetic → designer-skills sharpen). No new behavior contract — just three MODEL hooks pointing existing skills at existing phase entry points.

□ K.38 (V32.5.1) — Designer-Skills Gate-Closure Enforcement + Governance Hook Repair: V32.5 wiring is structurally sound but lacked explicit gate-closure language in the three `phases.md` MODEL HOOKs. V32.5.1 fixes this and closes five other defects surfaced by the 4-Scout pre-ship audit (Scout A activation windows / Scout B Opus-Sonnet contract / Scout C context budget / Scout D cross-file consistency).
       LOOK FOR in `phases.md`:
         (a) Phase 2.8 MODEL HOOK (after the V32.5 paragraph) ends with `**Gate-closure (V32.5.1):** Phase 2.8 cannot close until `/design-review` returns green OR every flag has been resolved by `/design-refine`.`
         (b) Phase 4 Parts 5-6 MODEL HOOK ends with `**Gate-closure (V32.5.1):** Phase 4 Parts 5-6 cannot close until `/design-review` returns green against the scaffolded components. Any flag MUST be resolved via `/design-refine` (surgical, flagged-only) before Part 7 (background jobs) begins.`
         (c) Phase 7 MODEL HOOK ends with `**Gate-closure (V32.5.1):** A UI-touching Feature Update cannot be marked DONE until `/design-review` returns green against the delta. ... CHANGELOG_AI.md MUST record the gate verdict (`design-review: green` or `design-review: green-after-refine`) per Rule 15.`
       LOOK FOR in `memory-governance.md §3`:
         (d) Hook Text heading reads `### Hook Text (V32.3 — injected into each phase)` (was V32) and the `MODEL:` line reads `ZERO OPUS EXECUTION (V32.3)` with the R6 size-qualifier sentence about >200-line allow-list docs routing through Scout-Sonnet with the Governance Extraction Schema.
         (e) Injection Points subsection header reads `### Injection Points (14 hooks total)` (was 13 at V32.5.1; bumped to 14 at V32.6 when Phase 3.3 added its governance pre-flight) and the list enumerates 14 entries: Phase 2, Phase 3, Phase 3.3, Phase 3.5, Phase 4 Parts 1-2, Phase 4 Parts 3-4, Phase 4 Parts 5-6, Phase 4 Parts 7-8, Phase 5, Phase 6, Phase 6.5, Phase 7, Phase 7R, Phase 8.
         (f) New subsection `### Output Equivalence Guarantee (V32.5.1)` documents that Tiered Decomposition is result-preserving — N sub-batches produce the same final committed state as single-context.
         (g) New subsection `### Mid-Session Thrash Rescue` references Prompt 3.19 (Emergency Anti-Thrashing) in `.ai_prompt/Prompt_References.md` and forbids Opus-executor escalation as workaround (R1 violation).
       LOOK FOR in `Prompt_References.md`:
         (h) New section `## How the Spec-Driven AI Mega Prompt Works` between the "What's new" block and `## Prerequisites` — contains the three activation windows ASCII diagram (Phase 2.8 / Phase 4 Parts 5-6 / Phase 7) with `cannot close until gate is green` language for each window, plus the architectural-contract table (Architect / Executor swarm / Gate-keepers / Memory roles with token-discipline column).
       LOOK FOR in `Prompt_References.html`:
         (i) New `<div class="section" id="how-it-works">` immediately before the Prerequisites section, mirroring the .md content with section-eyebrow `Mental model`, the three-window code-block, and the contract `<table>`.
         (j) Sidebar contains a new nav-group `00 Overview` with one nav-link `★ How the Mega Prompt Works` pointing to `#how-it-works`, placed above the `01 Setup` group.
         (k) Hero eyebrow reads `v32.5.1 locked · release ready` (was `v31 locked · release ready` — silently carried through every V32.x ship).
       LOOK FOR current-version markers V32.5.1 in: `Master_Prompt.md` VERSION+FILENAME POLICY block + V32.5.1 changelog entry, `CLAUDE_compact.md` title + STRICTEST line, `Framework_Feature_Index.md` header + §1.2 title + V32.5.1 row above V32.5 + footer "Last updated: V32.5.1" + "17-file V32.5.1 deliverable set" note, this file's header (title + purpose paragraph + version list + K.1-K.38 range), `deploy.sh` header.
       FAIL if any of the three `phases.md` MODEL HOOKs lacks the gate-closure sentence — the Scout A finding was that gate language existed only in user-facing Prompt_References, not in agent-loaded phases.md; this is the V32.5.1 invariant.
       FAIL if `memory-governance.md §3` hook template still says `ZERO OPUS EXECUTION (V32)` without the `.3` — Scout B nit.
       FAIL if `memory-governance.md §3` Injection Points list enumerates fewer than 13 entries or does not split Phase 4 into Part-pairs — Scout C count reconciliation.
       FAIL if Output Equivalence Guarantee or Prompt 3.19 rescue pointer is absent from `memory-governance.md §3` — Scout C defects 2 and 3.
       FAIL if `Prompt_References.html` hero eyebrow still reads `v31 locked` — Scout D cosmetic.
       FAIL if any canonical count changed — V32.5.1 is a doc-clarity + enforcement patch. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1–R9) · 13 Phase Hooks (now enumerated, was previously stated).
       FAIL if the V32.5.1 row in Framework_Feature_Index.md is placed below the V32.5 row — V32.5.1 is newest and must sit at the top (parent-then-patch convention).
       NOTE (V32.5.2 supersession): the current-version markers asserted by K.38 have been re-bumped V32.5.1 → V32.5.2 by K.39. Verify the CURRENT values against K.39, not this item. K.38 otherwise verifies the V32.5.1 gate-closure mechanics (3 phases.md MODEL HOOK gate-closure sentences, memory-governance.md §3 template bump, 13-hook enumeration, Output Equivalence Guarantee, Prompt 3.19 pointer, "How it Works" section), which remain in force unchanged.
       Rationale: V32.5.1 makes the framework's design-gate contract enforceable by Claude Code at execution time, not just readable by humans in reference docs. Pre-V32.5.1, a Claude Code session running Phase 4 Parts 5-6 would read the designer-skills MODEL HOOK as conditional guidance ("when DESIGN.md is present, Opus dispatches..."), see no blocking language, and could complete the phase without invoking the audit gate at all. V32.5.1 closes that loophole by adding "cannot close until" sentences directly to the auto-loaded `phases.md` hooks. Companion fixes (§3 hook template version bump, 13-hook enumeration, Output Equivalence, Prompt 3.19 pointer, HTML hero) clean up the smaller drifts the same 4-Scout audit surfaced.

□ K.39 (V32.5.2) — Prompt_References HTML Parity Fix: V32.5.1's 5-Scout post-ship audit (Scout 4) found three cosmetic HTML-only divergences in the new "How the Spec-Driven AI Mega Prompt Works" section — the markdown carried richer annotation than the HTML rendering. V32.5.2 brings the HTML to full content parity. Zero count/behavior change.
       LOOK FOR in `Prompt_References.html` (around lines 1284-1304):
         (a) Gate-keepers table row Model cell reads `designer-skills (Phase 2.8 / 4.5-6 / 7)` (not just `designer-skills`). The phase annotation is restored to match the .md.
         (b) Memory table row Model cell reads `Smart Checkpoint Protocol (V31.1 → V32.3)` (not just `Smart Checkpoint Protocol`). The version range is restored to match the .md.
         (c) "Why this prevents thrashing" callout uses a `<ul>` with 4 list items (Opus stays in window / Sonnet swarms parallelize + "Each Sonnet gets a slice it can hold whole" / Gate-keepers stop half-finished UI / Memory governance auto-persists). NOT a single paragraph.
       LOOK FOR current-version markers V32.5.2 in: `Master_Prompt.md` VERSION+FILENAME POLICY block + V32.5.2 changelog entry above V32.5.1, `CLAUDE_compact.md` title + STRICTEST line extended, `Framework_Feature_Index.md` header + §1.2 title + V32.5.2 row above V32.5.1 + footer "Last updated: V32.5.2" + "17-file V32.5.2 deliverable set" note, this file's header (title + purpose paragraph + version list + K.1-K.39 range), `deploy.sh` header.
       FAIL if any of the three HTML cells/callouts still shows the pre-V32.5.2 collapsed form — the .md was already canonical; this patch only catches the HTML up.
       FAIL if `Prompt_References.html` hero eyebrow still reads `v32.5.1 locked` — must read `v32.5.2 locked · release ready`.
       FAIL if any canonical count changed — V32.5.2 is HTML-only cosmetic parity. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 60 Prompts (37 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules (R1–R9) · 13 Phase Hooks.
       FAIL if the V32.5.2 row in Framework_Feature_Index.md is placed below the V32.5.1 row — V32.5.2 is newest and must sit at the top (parent-then-patch convention).
       FAIL if the historical V32.5.1 row/changelog entry has been overwritten or renamed to V32.5.2 — V32.5.1 remains as a historical row, V32.5.2 is added above it as a new row.
       NOTE (V32.5.3 supersession): the current-version markers asserted by K.39 have been re-bumped V32.5.2 → V32.5.3 by K.40. Verify the CURRENT values against K.40, not this item. K.39 otherwise verifies the V32.5.2 HTML parity mechanics (3 cell/callout fixes in the "How the Mega Prompt Works" section), which remain in force unchanged.
       Rationale: V32.5.2 is the cleanest possible "the human-facing docs match each other" patch. The Scout 4 finding was that daily readers comparing the markdown reference to the HTML reference would see slightly different detail levels — not a defect that affects Claude Code's execution (it reads neither file at runtime) but a defect that affects the user's mental model of the framework. Bringing them to parity preserves the "Prompt_References.md is authoritative; HTML is derived" rule from CLAUDE.md.

□ K.40 (V32.5.3) — Clean-Slate Rebuild Scenario (Prompt 3.23): V32.5.3 adds **Prompt 3.23 — Clean-Slate Rebuild from Preserved Spec** to Prompt_References.md and Prompt_References.html in Scenario Group 3 (Maintenance). This is the first canonical-count change since V32.1.5: Prompts 60 → 61, NEW ✨ 37 → 38. All other counts unchanged.
       LOOK FOR in `Prompt_References.md`:
         (a) Prompt 3.23 exists between Prompt 3.22 (Thrashing Recovery) and the SCENARIO GROUP 4 header.
         (b) Title reads `## 3.23 — Clean-Slate Rebuild from Preserved Spec (NEW ✨ V32.5.3)`.
         (c) Three numbered sub-prompts present: `3.23.A — Preserve + Nuke`, `3.23.B — Re-deploy Framework + Bootstrap Prep`, `3.23.C — Resume the rebuild manually` (renamed at V32.6.1 from `3.23.C — Full Rebuild from PRODUCT.md`; the auto-rebuild paste-prompt is intentionally removed — see K.44).
         (d) Pre-flight bash block exists before 3.23.A (with `spec-update .` + `git tag pre-clean-slate-$(date +%Y%m%d-%H%M%S)`).
         (e) "When to use this vs lighter alternatives" decision table present (references prompts 7 / 7R / 3.14 / 3.19 / 2.9 / 3.13 / 3.23).
         (f) Four critical warnings present (verify PRODUCT.md is current; do NOT delete lessons.md; runs over multiple sessions; keep backup tar until Phase 6.5 passes).
       LOOK FOR in `Prompt_References.html`:
         (g) `<div class="prompt-card group-3 new-badge" id="p-3-23">` exists after the 3.22 card.
         (h) Card title reads `Clean-Slate Rebuild from Preserved Spec (V32.5.3)`.
         (i) Three `<h4>` sections for 3.23.A / 3.23.B / 3.23.C. 3.23.A + 3.23.B have code-block prompts inside; **3.23.C has a resume-card (no paste-able body) — V32.6.1**. See K.44 for the resume-card structure.
         (j) Sidebar contains a new nav-link `<a class="nav-link" href="#p-3-23"><span class="nav-num">3.23</span>Clean-Slate Rebuild ✨</a>` directly after the 3.22 nav-link.
         (k) Hero stats: `<div class="stat-num">61</div>` for Prompts (was 60) and `<div class="stat-num">38</div>` for New (was 37).
         (l) Hero eyebrow reads `v32.5.3 locked · release ready`.
       LOOK FOR current-version markers V32.5.3 in: `Master_Prompt.md` VERSION+FILENAME POLICY block + V32.5.3 changelog entry above V32.5.2, `CLAUDE_compact.md` title + STRICTEST line extended + "61 prompts total", `Framework_Feature_Index.md` header + §1.2 title + V32.5.3 row above V32.5.2 + footer "Last updated: V32.5.3 (...61 prompts (38 New ✨)...)" + "17-file V32.5.3 deliverable set" note, this file's header (title + purpose paragraph + version list + K.1-K.40 range), `deploy.sh` header.
       LOOK FOR count propagation 60 → 61 and 37 → 38 in: CLAUDE_compact.md FOR HUMANS line ("61 prompts total"); ChatGPT_Cross_Audit.md header item 7 ("V32.5.3 current: 61 prompts (38 NEW ✨)"); verified counts block ("61 Prompts (38 NEW ✨)"); checklist item 14 ("Prompt count: 61 prompts, 38 NEW ✨"); Prompt_References.html hero stats; Framework_Feature_Index.md footer.
       FAIL if any of the three stages (3.23.A / 3.23.B / 3.23.C) is missing from either the .md or .html — the three-stage flow is the V32.5.3 invariant. (V32.6.1: 3.23.A and 3.23.B remain paste-able prompts; 3.23.C is a manual-handoff section, NOT a paste-able prompt. See K.44.)
       FAIL if Prompt_References.html sidebar lacks the 3.23 nav-link or it points to a `#p-3-23` anchor that does not exist.
       FAIL if hero stats still show `60` or `37` — the count bump is the V32.5.3 visible signal.
       FAIL if the V32.5.3 row in Framework_Feature_Index.md is placed below the V32.5.2 row.
       FAIL if the historical V32.5.2 row/changelog entry has been overwritten or renamed to V32.5.3.
       FAIL if scenarios count was bumped (Prompt 3.23 is a PROMPT, NOT a new framework Scenario — scenarios.md is unchanged; scenarios count stays 35).
       FAIL if any other canonical count changed (30 Rules · 35 Scenarios · 19 Bootstrap Steps · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 13 Phase Hooks — all stay).
       NOTE (V32.5.4 supersession): the current-version markers asserted by K.40 have been re-bumped V32.5.3 → V32.5.4 by K.41. Verify the CURRENT values against K.41, not this item. K.40 otherwise verifies the V32.5.3 Clean-Slate Rebuild Scenario mechanics (Prompt 3.23 in .md and .html, sub-prompts A/B/C, sidebar nav, hero stats 61/38), which remain in force unchanged.
       NOTE (V32.6.1 supersession — 3.23.C semantic shift): the 3.23.C **content** asserted by K.40 LOOK-FOR (c)/(i) has been replaced by V32.6.1 — 3.23.C is no longer a paste-able mega-prompt; it is a "Resume the rebuild manually" handoff card pointing at Prompt 1.3.1 (Phase 0 Bootstrap) with an optional Prompt 2.9 pre-check. Verify 3.23.C content per K.44, not the original K.40 (c)/(i) expectations. The three-stage A/B/C structural invariant + 60→61/37→38 count bump asserted by K.40 still hold; only stage C's body shape changed.
       Rationale: V32.5.3 gives users a paste-ready, documented recovery path for the "Phase 8 project is glitchy across modules" failure mode. Before V32.5.3, the closest documented recovery was Prompt 3.19 (Emergency Anti-Thrashing — addresses Claude Code's own thrashing, not the app's systemic rot) or the Phase 7R Feature Rollback (surgical, not systemic). Prompt 3.23 fills the gap with a deliberate three-stage flow: shell pre-flight (snapshot tag + spec-update) → Claude Code preserve + nuke + ls verification → deploy + restart → manual phase-by-phase rebuild from PRODUCT.md (per V32.6.1 — see K.44; original V32.5.3 ship had 3.23.C as an auto-rebuild paste-prompt, replaced at V32.6.1 with a manual handoff). The flow is explicitly NOT optimized for speed — it's optimized for **certainty of recovery**, which is what the user needs when a project is genuinely broken.

□ K.41 (V32.5.4) — Cosmetic Sweep + Changelog Reorder: V32.5.4 closes three minor findings from the V32.5.3 5-Scout post-ship audit. Zero count/behavior change.
       LOOK FOR in `Prompt_References.html`:
         (a) In the 3.23 prompt card, warning #4 ("The `~/clean-slate-backup-*.tar.gz` snapshot is your insurance.") now uses `<div class="callout warning">` (NOT plain `<div class="callout">`). All four warnings in the 3.23 card share the same `callout warning` CSS class for visual parity.
         (b) Hero eyebrow reads `v32.5.4 locked · release ready`.
       LOOK FOR in this file (`ChatGPT_Cross_Audit.md`):
         (c) The verified-counts section heading reads `### V32.5.3 verified counts (must match in every file that quotes them)` (NOT `### V32.5 verified counts`). The block CONTENTS remain unchanged (61 / 38 / 30 / 35 / 19 / 11 / 17 / 9 / 13).
       LOOK FOR in `Master_Prompt.md` changelog ordering:
         (d) V32.4.1 entry sits IMMEDIATELY AFTER V32.4 and BEFORE V32.5.3 (the top of the V32.5.x newest-first block). Order is: V32.4 → V32.4.1 → V32.5.5 → V32.5.4 → V32.5.3 → V32.5.2 → V32.5.1 → V32.5 → V32 base section header.
         (e) NO V32.4.1 entry sits between V32.5 and the V32 base section header (the previous incorrect position).
       LOOK FOR current-version markers V32.5.4 in: Master_Prompt.md VERSION+FILENAME POLICY block + V32.5.4 changelog entry above V32.5.3, CLAUDE_compact.md title + STRICTEST line, Framework_Feature_Index.md header + §1.2 title + V32.5.4 row above V32.5.3 + footer "Last updated: V32.5.4" + "17-file V32.5.4 deliverable set", this file's header (title + purpose paragraph + K.1-K.41 range), deploy.sh header.
       FAIL if HTML warning #4 in the 3.23 card still uses plain `<div class="callout">` without `warning` — Scout 1 finding CP16.
       FAIL if this file's verified-counts heading still reads `### V32.5 verified counts` — Scout 3 advisory.
       FAIL if Master Prompt's V32.4.1 entry still sits below V32.5 or above V32.4 — Scout 4 finding (the chronologically/semantically correct slot is between V32.4 and the V32.5.x block).
       FAIL if any canonical count changed — V32.5.4 is cosmetic-only. Counts stay at V32.5.3 values: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 13 Phase Hooks.
       FAIL if the V32.5.4 row in Framework_Feature_Index.md is placed below the V32.5.3 row.
       FAIL if the historical V32.5.3 row/changelog entry has been overwritten or renamed to V32.5.4.
       Rationale: V32.5.4 is the smallest possible patch — three findings from V32.5.3's own post-ship audit, all cosmetic, all closeable with a single edit each. The HTML callout class brings the 3.23 card to visual parity. The verified-counts heading label keeps the audit cross-references coherent. The V32.4.1 reorder cleans up a pre-existing changelog inversion that predates V32.5.3 (the patch did not introduce it, but the V32.5.3 audit surfaced it). None of the three changes affect Claude Code's runtime behavior or the canonical count contract.
       NOTE (V32.5.5 supersession): the current-version markers asserted by K.41 have been re-bumped V32.5.4 → V32.5.5 by K.42. Verify the CURRENT values against K.42, not this item. K.41 otherwise verifies the V32.5.4 cosmetic-sweep mechanics (HTML callout class parity, verified-counts heading label, Master Prompt V32.4.1 reorder), which remain in force unchanged.

□ K.42 (V32.5.5) — DECISIONS_LOG ↔ PRODUCT.md Back-Port Surface Check: V32.5.5 adds a non-blocking pre-flight MODEL HOOK at Phase 7 and Phase 8 that surfaces decisions answered in `docs/DECISIONS_LOG.md` but never back-ported into `docs/PRODUCT.md`. Zero count / rule / scenario / prompt / behavior change beyond the new informational surface.
       LOOK FOR in `phases.md`:
         (a) A `**MODEL HOOK (V32.5.5 — Back-Port Surface Check, Phase 7 pre-flight):**` block immediately after the Phase 7 `⚠ MEMORY GOVERNANCE` pre-flight block (before the `**Trigger:**` line). It dispatches a Sonnet Scout to compare locked DECISIONS_LOG.md decisions against PRODUCT.md and surfaces a "📋 Back-Port Candidates" report.
         (b) A near-identical `**MODEL HOOK (V32.5.5 — Back-Port Surface Check, Phase 8 pre-flight):**` block immediately after the Phase 8 `⚠ MEMORY GOVERNANCE` pre-flight block (before "Cross-references PRODUCT.md vs IMPLEMENTATION_MAP.md").
         (c) Both hooks state the check is **non-blocking** (NEVER gates phase closure), **surface-and-inform only**, and that **Rule 1 is unchanged — Claude Code MUST NOT write to `docs/PRODUCT.md`**.
         (d) Both hooks describe the `spec-divergent: <reason>` suppression escape valve and the conditional run (only when DECISIONS_LOG.md mtime is newer than the last report) with a collapsed `✅ no back-port candidates` clean-state line.
       LOOK FOR current-version markers V32.5.5 in: Master_Prompt.md VERSION+FILENAME POLICY block + V32.5.5 changelog entry above V32.5.4, CLAUDE_compact.md title + STRICTEST line, Framework_Feature_Index.md header + §1.2 title + V32.5.5 row above V32.5.4 + footer "Last updated: V32.5.5" + "17-file V32.5.5 deliverable set", this file's header (title + purpose paragraph + K.1-K.42 range), deploy.sh header.
       FAIL if either Phase 7 or Phase 8 MODEL HOOK is missing from `phases.md`.
       FAIL if either hook implies Claude Code may edit PRODUCT.md, or makes the check blocking / gating (it must be non-blocking — Rule 1 invariance is the whole point).
       FAIL if any canonical count changed — V32.5.5 is additive MODEL-hook language only. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 13 Phase Hooks.
       FAIL if the V32.5.5 row in Framework_Feature_Index.md is placed below the V32.5.4 row, or if the historical V32.5.4 row/changelog entry has been overwritten or renamed to V32.5.5.
       Rationale: clarifications get answered in DECISIONS_LOG.md but Rule 1 forbids AI from writing them back into PRODUCT.md, so the spec silently drifts behind the decision log. Phase 8's completeness check catches declared-but-unbuilt sections, not answered-but-unspecced decisions. V32.5.5 closes that gap with a surface-only Scout report that respects human authorship of PRODUCT.md — the human decides whether to back-port, defer, or mark a decision deliberately spec-divergent.

□ K.43 (V32.6) — Interactive Prototype & Simulation Phase (Phase 3.3): V32.6 adds a new sub-phase between Phase 3 and Phase 3.5 that builds a durable, client-validated interactive prototype with a project-defined simulated backend, and MOVES design-system finalization out of Phase 4 Parts 5-6. Zero count / rule / scenario / prompt / bootstrap change (3.3 is a sub-phase).
       LOOK FOR in `phases.md`:
         (a) A `## PHASE 3.3 — INTERACTIVE PROTOTYPE & SIMULATION (NEW V32.6)` section positioned BETWEEN the Phase 3 Output Contract block and the `## PHASE 3.5` header.
         (b) The section has a `⚠ MEMORY GOVERNANCE` pre-flight (ZERO OPUS EXECUTION — prototype + simulated layer + docs/PROTOTYPE.md dispatched via Sonnet), an 8-step build sequence, a `PHASE 3.3 GATE-CLOSURE — MANDATORY` block, and a `MODEL HOOK (V32.6 — designer-skills moves to Phase 3.3)`.
         (c) Gate-closure requires ALL of: `/design-review` green (or flags resolved via `/design-refine`), every Core User Flow in PRODUCT.md §3 walkable, client sign-off logged to `docs/DECISIONS_LOG.md`, and `docs/PROTOTYPE.md` exists with the simulated→production swap boundary per screen.
         (d) The Phase 3 completion pointer reads "Next: Phase 3.3 ... then Phase 3.5 ..."; the `## PHASE 3.5` header reads "(AUTO — runs at end of Phase 3.3)".
         (e) The Phase 2.8 hand-off MODEL HOOK retargets design-system inheritance to "Phase 3.3" (moved from Phase 4 Parts 5-6); the Phase 4 Parts 5-6 MODEL HOOK now reads "WIRE + REGRESSION" — wire the validated prototype to the production backend + regression `/design-review` only, with a fallback to the full V32.5 design pass if no `prototype/` exists.
       LOOK FOR in `Master_Prompt.md`: a `## PHASE 3.3 — INTERACTIVE PROTOTYPE & SIMULATION (NEW V32.6)` section; a `→ Phase 3.3` line in the "Which phase are you starting from?" menu between Phase 3 and Phase 3.5; a V32.6 clause in the VERSION+FILENAME POLICY changelog paragraph; active-version marker reads **V32.6**.
       LOOK FOR current-version markers V32.6 in: CLAUDE_compact.md title + STRICTEST line + phase menu (Phase 3.3 between Phase 3 and Phase 3.5), Framework_Feature_Index.md header + §1.2 title + V32.6 row above V32.5.5 + footer "Last updated: V32.6" + "17-file V32.6 deliverable set", this file's header (title + purpose paragraph + K.1-K.43 range + Phase count line includes "+ 3.3 (V32.6)"), deploy.sh header, repo CLAUDE.md designer-skills phase-mapping table (Phase 3.3 row).
       FAIL if the Phase 3.3 section is missing from `phases.md` or `Master_Prompt.md`, or placed anywhere other than between Phase 3 and Phase 3.5.
       FAIL if any hook implies Claude Code may write to PRODUCT.md (client sign-off goes to DECISIONS_LOG.md — Rule 1 unchanged).
       FAIL if Phase 4 Parts 5-6 still describes running the FULL design-system pass as primary (it must be wire + regression, with the full pass only as the no-prototype fallback).
       LOOK FOR in `memory-governance.md`: §3 "Injection Points" header reads "(14 hooks total)" and the numbered list includes "3. Phase 3.3 (Interactive Prototype & Simulation — NEW V32.6)" before Phase 3.5, renumbering through Phase 8 (14 total). Present-tense "phase hooks" facts in Prompt_References.md/.html ("How the Mega Prompt Works" memory row) and CLAUDE_framework_repo.md read 14, not 13.
       FAIL if any count OTHER than Phase Hooks changed — V32.6 adds a sub-phase plus its governance pre-flight (**Phase Hooks 13 → 14**). Current counts: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · **14 Phase Hooks** (was 13).
       FAIL if any HISTORICAL changelog entry's "13 phase hooks" (e.g. the V32.5.1 decode) was bumped to 14 — only the live/current count + the V32.6 entry move to 14; pre-V32.6 snapshots stay 13 (Rule 4).
       FAIL if the historical V32.5.x rows/changelog entries have been overwritten or renamed to V32.6 (V32.6 content is ADDED above them, not substituted).
       Rationale: the Orqafy lesson — spec completion ≠ a working app; large builds discovered wiring breakage (HTTP 500s, un-wired components) only at Phase 8, the costliest moment to fix. Phase 3.3 pulls behavior + wiring validation forward so Phase 4 builds from a validated blueprint, and consolidates design-system finalization into the one place the prototype is built.
       NOTE (V32.6.1 supersession): the current-version markers asserted by K.43 have been re-bumped V32.6 → V32.6.1 by K.44. Verify the CURRENT values against K.44, not this item. K.43 otherwise verifies the V32.6 Phase 3.3 mechanics (Phase 3.3 section in phases.md + Master_Prompt, MODEL hooks, gate-closure, 14 phase hooks), which remain in force unchanged.

□ K.44 (V32.6.1) — Prompt 3.23.C Semantic Shift — Auto-rebuild → Manual Handoff: V32.6.1 replaces the original V32.5.3 paste-able "3.23.C — Full Rebuild from PRODUCT.md" mega-prompt with a "3.23.C — Resume the rebuild manually" handoff card that points the human at Prompt 1.3.1 (Phase 0 Bootstrap) with an optional Prompt 2.9 (Validate Spec Consistency) pre-check. **Rationale:** a single paste-prompt driving Phase 0 → 6.5 is exactly the autopilot/thrashing surface the framework was built to prevent; it also recreates the integration-bug risk Phase 3.3 was added to eliminate. Manual phase-by-phase rebuild gets fresh context + explicit human gate at every boundary, which is faster AND safer. Also, after 3.23.B the project state is known (clean app dirs + preserved spec + redeployed framework) — there is no need for Prompt 1.2 Universal Analyzer detection; routing directly to Phase 0 Bootstrap is more honest. **Zero count / rule / scenario / prompt count / bootstrap / phase-hook change** — Prompt 3.23 still occupies its catalog slot; only stage C's body shape changed.
       LOOK FOR in `Prompt_References.md`:
         (a) `### 3.23.C — Resume the rebuild manually` heading (NOT "Full Rebuild from PRODUCT.md").
         (b) Two bold anchor-link CTAs: `**Optional pre-check → [Prompt 2.9 — Validate Spec Consistency](#29--validate-spec-consistency-new--pre-feature-update-sanity-check)**` AND `**Next step (start here) → [Prompt 1.3.1 — Phase 0 Bootstrap](#131--place-productmd--designmd--mockup--run-bootstrap)**`.
         (c) 4-row resume table (optional 2.9 → run 1.3.1 Bootstrap → continue Phase 2 → 3 → 3.3 → 3.5 → 4 → 5 → 6 → 6.5 → human authorizes each boundary).
         (d) "Why skip Prompt 1.2 (Universal Analyzer)?" rationale blockquote present.
         (e) "No autopilot" warning blockquote present.
         (f) The 3.23.B tail line reads `(Close and reopen Claude Code, then resume MANUALLY at Phase 0 Bootstrap — see 3.23.C below.)` (NOT "paste Prompt 3.23.C").
         (g) Sanity-check table row for 3.23.C reads "manual resume" naming Prompt 1.3.1 Phase 0 Bootstrap (optionally preceded by Prompt 2.9) — NOT a phase-by-phase row enumeration.
         (h) "Manual rebuild runs over many sessions" warning blockquote present (replaces pre-V32.6.1 "3.23.C runs over multiple sessions" wording).
         (i) NO `REBUILD SEQUENCE` mega-prompt code block exists anywhere in the 3.23 section.
       LOOK FOR in `Prompt_References.html`:
         (j) `<h4>3.23.C — Resume the rebuild manually</h4>` inside the `#p-3-23` card.
         (k) A `<div class="resume-card">` containing TWO `<a class="resume-cta">` links: `href="#p-2-9"` (Prompt 2.9 — Validate Spec Consistency, blue-styled) AND `href="#p-1-3"` (Prompt 1.3.1 — Phase 0 Bootstrap, accent-styled).
         (l) `<ol class="resume-steps">` with 4 numbered steps.
         (m) Two `<div class="resume-rule">` blocks (1: "Why skip Prompt 1.2", 2: "No autopilot").
         (n) The 3.23.B tail line reads "Close and reopen Claude Code, then resume the project MANUALLY at Phase 0 Bootstrap — see 3.23.C below."
         (o) NO `<div class="code-body">` containing the REBUILD SEQUENCE mega-prompt inside the 3.23.C section.
         (p) Hero eyebrow reads `v32.6.1 locked · release ready`.
       LOOK FOR current-version markers V32.6.1 in: Master_Prompt.md VERSION+FILENAME POLICY block + V32.6.1 changelog entry above V32.5.5 (V32.6 has no separate bullet — its definition is inline in the VERSION+FILENAME POLICY paragraph), CLAUDE_compact.md title + STRICTEST line, Framework_Feature_Index.md header + §1.2 title + V32.6.1 row above V32.6 + footer "Last updated: V32.6.1" + "17-file V32.6.1 deliverable set", this file's header (title + purpose paragraph + K.1-K.44 range), deploy.sh header.
       FAIL if Prompt_References.html still shows a `<div class="code-body">` containing the "REBUILD SEQUENCE" text inside the 3.23.C section.
       FAIL if Prompt_References.md still contains a fenced code block whose body starts with "Project is clean-slate. docs/PRODUCT.md is the source of truth." inside the 3.23 section.
       FAIL if either file still contains the literal string "paste Prompt 3.23.C" as a forward instruction (historical changelog references to "3.23.C Full Rebuild from PRODUCT.md" in V32.5.3 changelog rows ARE preserved per Rule 4 and are NOT a failure).
       FAIL if any canonical count changed — V32.6.1 is a content/semantic patch with zero count impact. Counts stay: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks.
       FAIL if the V32.6.1 row in Framework_Feature_Index.md is placed below the V32.6 row, or if the historical V32.6 row/V32.5.x rows have been overwritten or renamed to V32.6.1.
       FAIL if the historical V32.5.3 changelog entries in Master_Prompt.md (line ~7973) or Framework_Feature_Index.md (V32.5.3 row) were edited — they accurately describe what shipped at V32.5.3 and must remain frozen per Rule 4.
       Rationale: the original V32.5.3 3.23.C drove Phase 0 → 6.5 from a single paste-prompt. Twin problems: (1) it recreates the autopilot/thrashing surface the framework exists to prevent — single context driving the whole rebuild is the failure mode V32, V32.2 R7, V32.3 R6, and Phase 3.3 were each designed to eliminate; (2) it routes around Phase 3.3, which is the V32.6 hard-gate behavioral blueprint — a rebuild that runs straight from Phase 3 to Phase 4 misses the integration-validation step Phase 3.3 was added to enforce. V32.6.1 fixes both by making 3.23.C an explicit human handoff back into the normal Phase 0 Bootstrap entry point (with an optional Prompt 2.9 sanity check on PRODUCT.md first). The three-stage 3.23 invariant survives — only stage C's surface changes from "paste-and-execute" to "you take the wheel from here."

□ K.45 (V32.7) — Deploy-Location Migration: Detail Files Move to `.ai_prompt/`: V32.7 moves all 7 detail files (phases.md, memory-governance.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md) out of `.claude/rules/` and into `.ai_prompt/` (read on-demand). `CLAUDE_compact.md` remains the ONLY auto-loaded file, deployed as `CLAUDE.md` at the app root. `.claude/rules/` is intentionally empty after a V32.7 deploy. All canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts (38 NEW ✨) · 11 UI Rules · 17 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks.
       **Root cause (informational):** `.claude/rules/` files are injected into every subagent's baseline context, causing ~100-130K tokens of unconditional injection per worker session. Moving to `.ai_prompt/` makes loading explicit and on-demand.
       LOOK FOR in `deploy.sh`:
         (a) Files 2-8 (phases.md, memory-governance.md, security.md, ui-rules.md, bootstrap.md, scenarios.md, templates.md) deploy to `.ai_prompt/` — NOT `.claude/rules/`.
         (b) `grep -c '\.claude/rules/' deploy.sh` for detail-file deploy targets should return **0** (no `.claude/rules/` destination lines for any of the 7 detail files).
         (c) File 1 (`CLAUDE_compact.md`) deploys to `CLAUDE.md` at the app root (unchanged).
         (d) Total deliverable file count in the script header still reads **17**.
       LOOK FOR in `CLAUDE_compact.md`:
         (e) The file-loading table (contextual loading section) lists all 7 detail files under `.ai_prompt/` — NOT `.claude/rules/`.
         (f) No auto-load claim for any detail file (phases.md, memory-governance.md, etc.) — only `CLAUDE.md` auto-loads.
       LOOK FOR in `phases.md`:
         (g) Every SHORT MEMORY GOVERNANCE pre-flight block (14 hooks) carries an explicit `Read .ai_prompt/memory-governance.md` instruction (not `.claude/rules/memory-governance.md`).
       LOOK FOR in `memory-governance.md`:
         (h) File path self-reference (if any) says `.ai_prompt/memory-governance.md`.
       LOOK FOR in `Master_Prompt.md`:
         (i) V32.7 changelog entry documenting the deploy-location migration.
         (j) Any file-loading map or context budget table that referenced `.claude/rules/` for detail files now says `.ai_prompt/`.
       LOOK FOR in `Framework_Feature_Index.md`:
         (k) A V32.7 row documenting the deploy-location change.
       FAIL if `deploy.sh` still deploys any of the 7 detail files to `.claude/rules/`.
       FAIL if `CLAUDE_compact.md` file-loading table still lists any detail file under `.claude/rules/`.
       FAIL if any of the 7 detail files' phase-hooks in `phases.md` still reference `.claude/rules/memory-governance.md`.
       FAIL if any canonical count changed — V32.7 is a deploy-location change only.
       PASS if `.claude/rules/` is empty (no `overwrite_with_backup` lines targeting `.claude/rules/` for detail files in `deploy.sh`).
       Note: Historical references to `.claude/rules/` in V31/V32.x changelog entries (e.g., K.44 rationale, J.20 historical note) ARE preserved per Rule 4 and are NOT a failure.
       NOTE (V32.7.1 re-bump): current-version markers asserted by K.45 have been re-bumped V32.7 → V32.7.1; verify CURRENT values against K.46, not K.45.

□ K.46 (V32.7.1) — PA Dual-Host Documentation Patch: V32.7.1 is an additive docs-only patch allowing the Planning
       Assistant interviewer role to run in a dedicated Claude Code session in the project folder (preferred,
       gains the skills library during planning) OR in a Claude.ai chat (V31 original). The PA role remains
       distinct from Phase 3+ Claude Code build sessions. MOCKUP.jsx preview path differs by host: live artifact
       in Claude.ai vs. written `docs/MOCKUP.jsx` + Vite dev server in a Claude Code PA session. Counts
       unchanged: 30 Rules · 35 Scenarios · 61 Prompts (38 NEW ✨) · 17 deliverable files · 14 Phase Hooks.
       LOOK FOR:
         (a) `Planning_Assistant.md` preamble + Phase 2.8 "Who" section describe BOTH hosts:
             Claude Code PA session in the project folder (preferred) AND Claude.ai chat; neither is excluded.
         (b) `Master_Prompt.md` Phase 2.8 section + phase-menu entry say "Claude Code PA session (preferred)
             or Claude.ai" — NOT "chat only" / "NOT Claude Code".
         (c) `Prompt_References.md` (and .html) Group 4 + prompt 1.3.3b describe both host paths, including the
             `docs/MOCKUP.jsx` + Vite dev server path for Claude Code PA sessions.
         (d) Role distinction preserved: PA session (either host) is NOT blessed for Phase 3+ build work;
             a fresh Claude Code session begins at Phase 3 after the PA session concludes.
         (e) FAIL if any framework file still hard-excludes Claude Code from the PA role with language such as
             "Planning Assistant chat only" / "NOT Claude Code" / "runs in Claude.ai only" — in LIVE/current-state
             prose. Historical V30→V31 changelog entries (e.g. the "v30 → v31 upgrade notes" block) that describe
             what V31 originally shipped are EXEMPT per Rule 4 — do NOT fault those.
         (f) Counts unchanged: 30 Rules · 35 Scenarios · 61 Prompts · 17 deliverable files · 14 Phase Hooks.
       LOOK FOR in `Master_Prompt.md`:
         (g) V32.7.1 changelog entry documenting the PA dual-host addition.
       LOOK FOR in `Framework_Feature_Index.md`:
         (h) A V32.7.1 row documenting the dual-host docs patch.
       LOOK FOR in current-version markers (all 6 files that carry version markers):
         (i) `Master_Prompt.md`, `CLAUDE_compact.md`, `Framework_Feature_Index.md`,
             `ChatGPT_Cross_Audit.md`, `Prompt_References.html`, `deploy.sh`
             all read V32.7.1 (not V32.7).
       FAIL if any of the 6 canonical version-marker files still reads V32.7 instead of V32.7.1.
       FAIL if `Planning_Assistant.md` still says "NOT Claude Code" for the PA host.
       PASS if the PA file preamble and all Phase 2.8 references describe the dual-host model consistently.
       Note: Historical changelog entries and K.45 items that reference V32.7 (the prior version) ARE preserved
       per Rule 4 and are NOT a failure.
       NOTE (V32.7.2 re-bump): current-version markers asserted by K.46 have been re-bumped V32.7.1 → V32.7.2
       and the deliverable count 17 → 19; verify CURRENT values against K.47, not K.46. K.46 otherwise verifies
       the V32.7.1 PA dual-host mechanics, which remain in force unchanged.

□ K.47 (V32.7.2) — TODO-7a Levers 2-3: Custom Executor Subagent + Settings Context Caps: V32.7.2 adds two
       new deliverable files (count 17 → 19): `spec-executor.md` (custom Sonnet executor subagent) and
       `settings.json` (skill-listing context caps). Framework executor dispatch (R1/R5/R7) now targets
       `Agent(subagent_type: "spec-executor")` as the primary dispatch form, with `Agent(model: "sonnet")`
       retained as fallback for tasks outside the allow-list. Zero count change to Rules/Scenarios/Prompts/
       Bootstrap/UI Rules/Dispatch Rules/Phase Hooks.
       LOOK FOR:
         (a) `spec-executor.md` exists in the deliverable set with YAML frontmatter containing:
             `tools: Read, Write, Edit, Bash, Grep, Glob` AND `model: sonnet` AND `mcpServers: []`
             (no MCP baseline — minimal footprint executor).
         (b) `deploy.sh` deploys `spec-executor.md` → `.claude/agents/` in the target project AND
             jq-MERGES `settings.json` into the target `.claude/settings.json` (never clobbers — merge only);
             total deliverable file count in script header reads **19**.
         (c) `Master_Prompt.md` + `CLAUDE_compact.md` + `phases.md` dispatch rules / MODEL hooks
             reference `Agent(subagent_type: "spec-executor")` as the primary executor dispatch target;
             `Agent(model: "sonnet")` retained as fallback for out-of-allow-list tasks.
         (d) `settings.json` deliverable contains `skillListingBudgetFraction: 0.01` AND
             `maxSkillDescriptionChars: 1024` (skill-listing context caps).
         (e) Deliverable count reads **19** everywhere it appears as a current-state assertion:
             `Master_Prompt.md`, `CLAUDE_compact.md`, `Framework_Feature_Index.md`,
             repo `CLAUDE.md`, `CLAUDE_framework_repo.md`, this file (`ChatGPT_Cross_Audit.md`).
             FAIL if any of these six files still states 17 as the current deliverable count.
         (f) `Master_Prompt.md` contains a `V32.7.2` changelog entry documenting the TODO-7a
             Levers 2-3 addition (spec-executor + settings.json); `Framework_Feature_Index.md`
             contains a V32.7.2 row in the version table.
         (g) All six canonical version-marker files read V32.7.2 (not V32.7.1):
             `Master_Prompt.md`, `CLAUDE_compact.md`, `Framework_Feature_Index.md`,
             `ChatGPT_Cross_Audit.md`, `Prompt_References.html`, `deploy.sh`.
         (h) All other canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps ·
             61 Prompts (38 NEW ✨) · 11 UI Rules · 9 V32 Dispatch Rules · 14 Phase Hooks.
       NOTE (V32.7.3): the framework's ACTIVE behavior version (Master_Prompt.md VERSION+FILENAME
       POLICY line + Framework_Feature_Index.md header/footer) is re-bumped V32.7.2 → V32.7.3.
       V32.7.3 is a partial-touch patch (like V32.5.5): it does NOT re-bump the version markers in
       `CLAUDE_compact.md`, `Prompt_References.html`, or `deploy.sh`, which legitimately retain
       their last-touched markers. K.47 (g)'s "all six read V32.7.2" assertion is superseded only for
       the active-version files (Master Prompt + FFI now read V32.7.3); the deliverable count 19 and all
       other K.47 LOOK-FORs remain CURRENT. Verify the active version against K.48, not K.47.

□ K.48 (V32.7.3) — Design Baseline Back-Port Surface Check: V32.7.3 adds a NON-BLOCKING Phase 7 + Phase 8
       pre-flight MODEL HOOK that dispatches a Sonnet Scout to diff the app's live theme tokens
       (`apps/[web]/src/app/globals.css` CSS variables + Tailwind theme config) against the
       `docs/DESIGN.md` / `docs/MOCKUP.jsx` baseline tokens and surfaces a "🎨 Design Back-Port Candidates"
       report. It is the design analogue of the V32.5.5 spec Back-Port Surface Check (`docs/DECISIONS_LOG.md`
       ↔ `docs/PRODUCT.md`) and shares its posture: surface-and-inform only, NEVER gates phase closure.
       It is also the detection mechanism that CLOSES framework TODO-21 (per-wave `globals.css` ↔
       `MOCKUP.jsx` token diff). Zero count change to Rules/Scenarios/Prompts/Bootstrap/UI Rules/
       Dispatch Rules/Phase Hooks/deliverable files (mirrors V32.5.5: a non-blocking pre-flight MODEL HOOK
       is not a new memory-governance.md §3 injection point).
       LOOK FOR:
         (a) `phases.md` contains a `MODEL HOOK (V32.7.3 — Design Baseline Back-Port Surface Check, Phase 7
             pre-flight)` AND a `... Phase 8 pre-flight)` block, each placed alongside the existing
             V32.5.5 Back-Port Surface Check hook in the same pre-flight region.
         (b) Both hooks describe a Sonnet Scout token-diff of live `globals.css` / Tailwind theme tokens
             vs the `docs/DESIGN.md` / `docs/MOCKUP.jsx` baseline, surfacing "🎨 Design Back-Port Candidates",
             explicitly **non-blocking** and **never gating phase closure**.
         (c) The back-port requirement is **INHERIT-not-REPLACE**: update `docs/DESIGN.md` tokens AND
             annotate/expand `docs/MOCKUP.jsx` (full regenerate ONLY on a wholesale design change; the
             mockup stays the UI source of truth). Claude Code MAY write the back-port (DESIGN.md/MOCKUP.jsx
             are NOT human-only) but only to mirror an already-approved change — Rule 1 preserved (the design
             *decision* is the human's; PRODUCT.md remains human-only). Suppression via `design-divergent:
             <reason>` logged to DECISIONS_LOG.md.
         (d) Each hook states it CLOSES framework TODO-21 (per-wave `globals.css` ↔ `MOCKUP.jsx` token diff).
         (e) `Master_Prompt.md` contains a `V32.7.3` changelog entry; the VERSION+FILENAME POLICY active
             version reads **V32.7.3**; `Framework_Feature_Index.md` contains a V32.7.3 row + header +
             footer reading V32.7.3.
         (f) `memory-governance.md §3` closing note documents the V32.7.3 design check as layering on the
             Phase 7/8 governance hook and NOT a new injection point; the "14 hooks total" enumeration is
             UNCHANGED.
         (g) All canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts
             (38 NEW ✨) · 11 UI Rules · 19 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks.
       FAIL if: any V32.7.3 hook gates phase closure; the back-port is described as a full regenerate by
       default; PRODUCT.md is made writable by Claude Code; the §3 phase-hook count is bumped above 14; or
       the deliverable count changes from 19.
       FAIL if spec-executor.md is missing or lacks the required frontmatter fields.
       FAIL if deploy.sh clobbers (overwrites) .claude/settings.json instead of merging.
       FAIL if any current-state deliverable count reference reads 17 instead of 19.
       FAIL if dispatch rules/MODEL hooks do not reference Agent(subagent_type: "spec-executor").
       FAIL if any of the 6 canonical version-marker files still reads V32.7.1 instead of V32.7.2.
       Note: Historical changelog entries and K.45/K.46 items that reference V32.7/V32.7.1 counts
       of 17 deliverable files ARE preserved per Rule 4 and are NOT a failure.

□ K.49 (V32.7.4) — lint-deploy.sh pre-deploy footgun gate wired into Phase 5/6: V32.7.4 adds
       `scripts/lint-deploy.sh` as a named pre-deploy validation gate in `phases.md` Phase 5 OUTPUT
       CONTRACT and Phase 6 opening. No new rule/scenario/prompt/bootstrap/count change — this is a
       tooling gate reference, not a framework behavioral rule.
       LOOK FOR:
         (a) `phases.md` Phase 5 OUTPUT CONTRACT contains a `□ lint-deploy.sh: exit 0` checklist
             item instructing: `bash scripts/lint-deploy.sh deploy/compose` before any staging/prod
             push, listing the 8 footgun checks (C1–C8: compose parse, certresolver case, tls=true
             label, 127.0.0.1 healthcheck, no build: in stage/prod, push.sh login guard, start.sh
             project-name, shellcheck).
         (b) `phases.md` Phase 6 opening (before Docker commands) contains a
             `PRE-DEPLOY FOOTGUN GATE` block with the same `bash scripts/lint-deploy.sh deploy/compose`
             command and a summary of C1–C8 checks, noting dev compose is excluded from TLS/build: checks.
         (c) All canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61 Prompts
             (38 NEW ✨) · 11 UI Rules · 19 deliverable files · 9 V32 Dispatch Rules · 14 Phase Hooks.
       FAIL if lint-deploy.sh is presented as a new framework Rule or Scenario.
       FAIL if canonical counts changed from their V32.7.3 values.
       SUPERSEDED IN PART by K.50 (V32.7.5): the "deliverable files unchanged at 19" assertion in
       (c) was correct AT V32.7.4 (the script was referenced but not yet shipped). At V32.7.5 the
       deliverable count is **20** — verify the CURRENT count against K.50, not K.49(c). The Phase 5/6
       phases.md wiring LOOK-FORs (a)+(b) remain CURRENT and authoritative.

□ K.50 (V32.7.5) — lint-deploy.sh promoted to deliverable #20 (now shipped by deploy.sh):
       V32.7.5 promotes `lint-deploy.sh` from a referenced-but-unshipped tool (K.49 state) to framework
       deliverable #20. `deploy.sh` now copies it to the target app at `scripts/lint-deploy.sh`
       (overwrite-with-backup + `chmod +x`), so the Phase 5/6 gate K.49 wired into phases.md now points
       at a file that actually exists in target apps.
       LOOK FOR:
         (a) `deploy.sh` contains a GROUP 6 block that `mkdir -p scripts/` then
             `overwrite_with_backup` copies `$AI_PROMPT/lint-deploy.sh` → `$PROJECT/scripts/lint-deploy.sh`
             and `chmod +x` the result; the header banner reads `V32.7.5`; the PRE-FLIGHT/SUMMARY and
             expected-layout listings name `scripts/lint-deploy.sh` and `lint-deploy.sh`.
         (b) `lint-deploy.sh` exists in `/specdrivenprompt/` as the deliverable source.
         (c) Deliverable count reads **20** everywhere it appears as a current-state assertion:
             repo `CLAUDE.md` (intro "20 deliverable files", "all 20 framework files", "20-file AI
             governance framework", "The 20 Deliverable Files" heading + numbered item #20 lint-deploy.sh,
             Canonical Counts "20 deliverable files", "all 20 files" audit/grep lines);
             `Master_Prompt.md` V32.7.5 changelog entry + VERSION+FILENAME POLICY active version
             **V32.7.5**; `CLAUDE_compact.md` title + STRICTEST line; `Framework_Feature_Index.md`
             header + V32.7.4 + V32.7.5 rows + footer "Last updated: V32.7.5" + "20-file deliverable set"
             note; `AI_Tools_Reference.md` footer "20-file V32.7.5 deliverable set"; this
             file's purpose paragraph ("20 V32.7.5 framework files") + verified-counts block ("20
             deliverable files (... + lint-deploy.sh → scripts/lint-deploy.sh)").
         (d) All other canonical counts unchanged: 30 Rules · 35 Scenarios · 19 Bootstrap Steps · 61
             Prompts (38 NEW ✨) · 11 UI Rules · 9 V32 Dispatch Rules · 14 Phase Hooks.
       FAIL if any current-state deliverable count reference reads 19 instead of 20.
       FAIL if deploy.sh does not copy lint-deploy.sh to scripts/lint-deploy.sh (or does not chmod +x).
       FAIL if lint-deploy.sh is presented as a new framework Rule or Scenario.
       FAIL if any of the 6 canonical version-marker files still reads V32.7.2/V32.7.3 instead of V32.7.5.
       Note: Historical changelog entries and K.45/K.46/K.49 items that reference deliverable counts of
       17 or 19 ARE preserved per Rule 4 and are NOT a failure.

□ K.51 (V32.8) — Design-as-Contract (Rule 31) + Verifiable-Done + Learning Loop (Rule 32):
       V32.8 adds two new framework rules (Rules 31 and 32, both NEW V32.8), four new scenarios
       (Scenarios 36-39), one new UI rule (Rule 12 — Visual Token Gate), three new Phase Hooks
       (§3 hooks 15-17), one new Bootstrap Step (Step 20 — Baseline Capture), one new memory-gov
       section (§6 Mid-Project Adoption), and two new deliverable files (design-stop-hook.sh →
       `scripts/` + LESSONS_REGISTRY.md → `.ai_prompt/`). Spike reference: commit `14a1813`.
       **Count diffs vs V32.7.5:** Rules 30 → 32 · Scenarios 35 → 39 · Bootstrap Steps 19 → 20 ·
       UI Rules 11 → 12 · Phase Hooks 14 → 17 · memory-gov sections 5 → 6 ·
       deliverable files 20 → 22. All other canonical counts unchanged (Prompts 61 · Phase 4 Parts 8 ·
       Phase 5 Commands 9 · Phase 6.5 Categories 16 · Security Checklist 84 · governance docs 9).
       LOOK FOR — Rule 31 (Design-as-Contract):
         (a) `Master_Prompt.md` and `CLAUDE_compact.md` both contain "Rule 31 — Design-as-Contract"
             with the text "compiled constraint, not a prose nudge."
         (b) The **mandatory three-layer token bridge** is documented: Style Dictionary generates
             `--sd-color-*` vars (prefix `'sd'`) → `globals.css` semantic aliases `--sd-color-* →
             --primary → --color-primary`. The `prefix:'sd'` is explicitly named (prevents circular
             `var()` collision with shadcn's own `--color-*`). Spike commit `14a1813` referenced.
         (c) **Default Tailwind palette disabled by explicit enumeration** (all ~22 color scales set to
             `initial` in a `@theme` block). NOT the `--color-*: initial` wildcard (silently ignored in
             Tailwind v4.3.1) — the framework ships an explicit templated snippet. Documented in
             `templates.md` and `ui-rules.md`.
         (d) The **Playwright `toHaveScreenshot` visual gate** is wired into `phases.md` Phase 5 OUTPUT
             CONTRACT and Phase 8. The gate runs against a pinned Docker render image with animations
             disabled, `maxDiffPixelRatio ≈ 0.0015`, against **deterministic fixture state** (seeded DB
             snapshot / MSW-mocked responses in `tests/visual/fixtures/`) — never live data.
         (e) **Two-stage baseline** documented: (i) Phase 3.3 signed-off prototype render = DESIGN
             baseline; (ii) re-captured at end-of-Phase-4 against fixture state = PRODUCTION baseline.
             The gate asserts against the production baseline (Phase 5/8 onward).
         (f) A failed gate blocks phase completion and emits a diff image. Only two legal reconcile paths:
             (1) fix code to match baseline; (2) update `docs/DESIGN.md` / `docs/tokens.json` / mockup
             FIRST (Rule 1, human-owned) → recompile → re-capture as a reviewed human commit.
         (g) `deploy.sh` ships `design-stop-hook.sh` to `scripts/` as deliverable #21.
         (h) `settings.json` (deliverable #19) includes a **Stop hook** in the valid harness-executed
             command-type schema (NOT the invalid declarative matcher/action/message form). The hook
             invokes `design-stop-hook.sh` and blocks via non-zero exit when a done-claim's evidence
             field is empty. The schema uses the correct `{"hooks":{"Stop":[{"type":"command","command":
             "..."}]}}` shape — NOT `{"matcher":..., "action":..., "message":...}` which is invalid.
       LOOK FOR — Rule 32 (Verifiable-Done + Learning Loop):
         (i) `Master_Prompt.md` and `CLAUDE_compact.md` both contain "Rule 32 — Verifiable-Done
             + Learning Loop" with the text "a claim without evidence is not a status — it is a hope."
         (j) **Evidence field `{contract, check_command, captured_output}`** required in `STATE.md` and
             Smart Checkpoint (`memory-governance.md §2`). A done-claim with an empty evidence field is
             described as "a structurally malformed artifact."
         (k) **LESSONS_REGISTRY** is documented in `memory-governance.md` (and referenced in
             `phases.md`). Registry entries have a two-part fingerprint: coarse structured tuple
             `{scope.category.surface}` + optional machine-signature (CVE-ID, error-code, normalized
             error string). `deploy.sh` ships `LESSONS_REGISTRY.md` to `.ai_prompt/` as deliverable #22.
         (l) **Three mandatory consult points** enumerated: (1) work-start/dispatch — scan for fingerprints
             matching the target surface BEFORE working; (2) done-claim — run contract check AND scan
             registry; (3) failure-time — fingerprint the failure → scan; if a standing check should have
             caught it, STRENGTHEN it (not just re-fix).
         (m) **Scope-routing table** present: project-scope → `lessons.md` (in-repo); framework-scope →
             a deliverable (lint-deploy.sh Cn, templates.md rule, phase output contract) → propagated by
             `deploy.sh`; conductor-scope → `/memory` feedback file → auto-loads each session.
       LOOK FOR — Cross-file consistency:
         (n) Rule count reads **32** everywhere it appears as a current-state assertion: `Master_Prompt.md`
             (V32.8 changelog "30 → 32 Rules"), `CLAUDE_compact.md` (header), `Framework_Feature_Index.md`
             (V32.8 row + footer), this file's verified-counts block. Historical entries that cite 30 rules
             ARE preserved and are NOT a failure.
         (o) Scenario count reads **39** in all current-state references. V32.8 adds Scenarios 36-39
             (design-system compilation, visual-gate baseline, LESSONS_REGISTRY promotion, Verifiable-Done
             evidence schema). Scenarios 1-35 unchanged.
         (p) UI Rule count reads **12** in all current-state references. V32.8 adds UI Rule 12 — Visual
             Token Gate (Playwright `toHaveScreenshot` wired to the three-layer token bridge).
         (q) Bootstrap Step count reads **20** in all current-state references. V32.8 adds Step 20 —
             Baseline Capture (runs after Phase 3.3 gate-closure, captures the DESIGN baseline render).
         (r) Phase Hooks count reads **17** in `memory-governance.md §3` and all current-state references.
         (s) `Framework_Feature_Index.md` contains a V32.8 row documenting Rules 31+32, count changes,
             and two new deliverables.
       FAIL if Rule 31 or Rule 32 is absent from `Master_Prompt.md` or `CLAUDE_compact.md`.
       FAIL if the three-layer bridge (`--sd-color-*` → `--primary` → `--color-primary`) is not documented
             in `templates.md` or `ui-rules.md`.
       FAIL if the default Tailwind palette disable uses the `--color-*: initial` wildcard instead of
             explicit enumeration of all ~22 color scales.
       FAIL if the `toHaveScreenshot` gate is missing from `phases.md` Phase 5 OUTPUT CONTRACT or Phase 8.
       FAIL if the two-stage baseline (3.3 design → end-of-Phase-4 production against fixture state) is
             not documented.
       FAIL if the Stop hook in `settings.json` uses the invalid declarative matcher/action/message form
             instead of the valid `{"type":"command","command":"..."}` harness-executed form.
       FAIL if `LESSONS_REGISTRY.md` is absent from `deploy.sh` (deliverable #22, deploys to `.ai_prompt/`).
       FAIL if the three mandatory LESSONS_REGISTRY consult points are not documented.
       FAIL if any current-state rule count reads 30 instead of 32.
       FAIL if any current-state scenario count reads 35 instead of 39.
       FAIL if spike commit `14a1813` is not referenced where the three-layer bridge is documented.
       Note: Historical changelog entries that cite 30 rules, 35 scenarios, 11 UI rules, 14 phase hooks,
       19 bootstrap steps, 20 deliverable files ARE preserved per Rule 4 and are NOT a failure.

□ K.52 (2026-06-18) — Governance-Core Provenance Note: AIEF registered as Tier-0 origin of the shared
       Governance-Core sibling repo (§1–§7 primitives + SHARED/COMPARTMENTALIZED memory-scope modes +
       seeded fleet lessons registry); adopted by reference via `Governance-Core/adapters/aief.adapter.md`.
       LOOK FOR in `CLAUDE_framework_repo.md`: a "Governance-Core Provenance" section (or equivalent
       heading) that states: (a) AIEF is the Tier-0 origin; (b) `memory-governance.md` + V32.8 Rule 32
       learning loop + architect-execute dispatch are the in-framework expression of Core §1–§7;
       (c) adoption is by reference via `adapters/aief.adapter.md`; (d) provenance flows AIEF → Core
       (AIEF leads, does NOT follow the Core).
       ALSO CHECK: the note must NOT appear in `CLAUDE_compact.md` or `memory-governance.md`
       (those deploy into target app projects — a Core pointer there would dangle).
       FAIL if the provenance note is absent from `CLAUDE_framework_repo.md`.
       FAIL if a Governance-Core pointer appears in `CLAUDE_compact.md` or `memory-governance.md`.
       Note: No AIEF rule/scenario/prompt/deliverable counts change — Governance-Core is an external
       sibling repo, not a new AIEF rule.

□ K.53 (V32.8.1) — getdesign.md / awesome-design-md / VoltAgent removed from all live instructional text:
       V32.8.1 removes the external design catalogs `getdesign.md` and `VoltAgent/awesome-design-md` as
       design-token sources. shadcn/ui CSS custom property values are now the only design source. The
       Planning Assistant derives values from a named "theme direction" (e.g. "Linear", "Stripe") without
       fetching any external URL. docs/DESIGN.md records shadcn CSS variable overrides, not extracted
       third-party catalog content. Zero count change — 32 rules · 39 scenarios · 61 prompts · 20 bootstrap
       steps · 22 deliverables all unchanged.
       LOOK FOR:
         (a) `Planning_Assistant.md` Phase 2.8 Step 0 — must NOT reference `getdesign.md`
             or any external URL catalog. Must say "tune the shadcn/ui theme" / "name a visual direction".
         (b) `Planning_Assistant.md` Step 7b DESIGN.md header — must say "Theme direction:
             [design name] (shadcn/ui CSS variable overrides)" NOT "Source: [design name] from getdesign.md".
         (c) `scenarios.md` Scenario 33 CONTEXT block — must say "4 visual sections derived from a chosen
             shadcn/ui theme direction" NOT "extracted from awesome-design-md".
         (d) `scenarios.md` Scenario 33 WHAT AGENTS DO NOT DO — must NOT reference VoltAgent/awesome-design-md.
             Must say "only the shadcn/ui CSS variable values recorded in docs/DESIGN.md".
         (e) `scenarios.md` Scenario 33 LEGAL POSTURE — must NOT mention awesome-design-md MIT license.
             Must say values are "shadcn/ui CSS custom properties authored during the Planning Assistant session."
         (f) `Prompt_References.md` Prompt 4.8 title — must say "Adopt a DESIGN.md Aesthetic (shadcn/ui
             theme direction)" NOT "from awesome-design-md".
         (g) `Prompt_References.md` Prompt 4.8.2 code body — must say "CHOSEN DIRECTION" NOT "SOURCE URL"
             and must say "Do NOT fetch any external URL or catalog."
         (h) `Prompt_References.html` — must be 1:1 parity with the .md on all of the above points.
         (i) `Framework_Feature_Index.md` — must contain a V32.8.1 row documenting the removal.
       FAIL if any of getdesign.md / awesome-design-md / VoltAgent appears in live instructional text
             (outside historical changelog entries, which are frozen per Rule 4).
       FAIL if Prompt 4.8.2 still contains a "SOURCE URL" field or references a GitHub raw URL for
             awesome-design-md.
       FAIL if Scenario 33 LEGAL POSTURE still cites awesome-design-md MIT license.
       FAIL if docs/DESIGN.md header template still reads "Source: [design name] from getdesign.md".
       Note: Historical changelog entries in `Framework_Feature_Index.md` (V31 row referencing
       "Scenario 33 added — DESIGN.md integration with shadcn/ui (maps VoltAgent/awesome-design-md
       catalog tokens...)") and in `Master_Prompt.md` or `Prompt_References.md` changelog lines
       that mention awesome-design-md are FROZEN history per Rule 4 — do NOT flag those as failures.

---

### V32.9 — Compliance & Data Privacy Layer

□ K.54 (V32.9) — Rule 33 (Compliance & Data Privacy) present in Master Prompt and compact card:
       V32.9 adds Rule 33 — PH Data Privacy Act (RA 10173 / NPC compliance), WCAG 2.2 AA hard-gate
       for gov/LGU apps, ComplianceFooter honesty policy, and ASVS 5.0 / OWASP Top 10:2025 security
       refresh. Count bumps: Rules 32→33.
       LOOK FOR:
         (a) `Master_Prompt.md` — Rule 33 block present with RA 10173 / NPC reference, WCAG 2.2 AA
             gov/LGU hard-gate, ComplianceFooter honesty policy (4 default-ON badges; cert badges OFF
             unless held), ASVS 5.0 + OWASP Top 10:2025 A03/A10 security refresh.
         (b) `CLAUDE_compact.md` — Rule 33 one-liner present; header version reads V32.9; rule count
             shown as 33.
       FAIL if Rule 33 is absent from either file.
       FAIL if compact header still reads V32.8 or V32.8.1.
       Note: Historical V32.8.1 entries that say "32 rules" are FROZEN history — do NOT flag.

□ K.55 (V32.9) — privacy.md deliverable #23 exists, deployed by deploy.sh, enumerated in CLAUDE.md:
       V32.9 adds `privacy.md` as the 23rd framework deliverable (deployed to `.ai_prompt/privacy.md`
       in target projects). Deliverable count bumps 22→23.
       LOOK FOR:
         (a) `specdrivenprompt/privacy.md` exists in the framework repo.
         (b) `deploy.sh` — copies `privacy.md` to `.ai_prompt/privacy.md` with a GROUP 1 or GROUP 2
             entry (correct group for .ai_prompt/ detail files).
         (c) `CLAUDE.md` (repo root) — enumerates privacy.md as deliverable #23 in the 22-file enum
             (now 23-file enum).
         (d) Verified counts block (K.54 context) — 23 deliverable files listed.
       FAIL if privacy.md is absent from deploy.sh copy list.
       FAIL if CLAUDE.md deliverable enum still caps at 22.

□ K.56 (V32.9) — Hook 18 (Compliance/Data-Privacy Gap-Surfacing) in memory-governance.md §3 and phases.md:
       V32.9 adds Hook 18 to the Phase Hooks list in `memory-governance.md §3`. Phase Hooks bump 17→18.
       LOOK FOR:
         (a) `memory-governance.md` §3 — Hook 18 entry present with label "Compliance/Data-Privacy
             Gap-Surfacing"; the `### Injection Points (N hooks total)` header reads 18 (not 17).
         (b) `phases.md` — the relevant phase pre-flight (Phase 0 or Phase 7 Feature Update, per
             framework design) wires Hook 18 as a MEM-GOV pre-flight step.
       FAIL if §3 still says 17 hooks total.
       FAIL if Hook 18 is absent from the enumeration list.

□ K.57 (V32.9) — ui-rules.md Rule 13 (WCAG 2.2 AA gov/LGU hard-gate):
       V32.9 adds UI Rule 13: WCAG 2.2 AA accessibility is a hard gate for any app deployed to a PH
       government or LGU context (aligns with DICT Memorandum Circular 004). UI rule count bumps 12→13.
       LOOK FOR:
         (a) `ui-rules.md` — Rule 13 present, explicitly names WCAG 2.2 AA as the standard, identifies
             gov/LGU apps as the trigger condition, and states it is a hard gate (not advisory).
         (b) `Master_Prompt.md` — UI rules section counts 13 rules.
         (c) `CLAUDE_compact.md` — references 13 UI rules.
       FAIL if ui-rules.md Rule 13 is absent.
       FAIL if any current-state count reference still says "12 UI Component Rules" (outside frozen history).

□ K.58 (V32.9) — ComplianceFooter honesty rule in templates.md:
       V32.9 adds ComplianceFooter component policy to `templates.md`: 4 badges default-ON (Privacy
       Policy · Data Retention · Cookie Policy · Accessibility Statement); certification badges (ISO,
       PCI-DSS, SOC 2, etc.) are OFF unless the cert is actually held — no aspirational badges.
       LOOK FOR:
         (a) `templates.md` — ComplianceFooter section present with the 4 default-ON badges listed and
             the "certification badges OFF unless held" honesty rule explicit.
         (b) No template in `templates.md` that pre-populates ISO/PCI-DSS/SOC 2 cert badges by default.
       FAIL if ComplianceFooter section is absent from templates.md.
       FAIL if any cert badge appears as a default-ON template item.

□ K.59 (V32.9) — PA §12 Compliance section (PRODUCT.md 12 sections) + PA Rule 12 gap-reminder + interview Qs:
       V32.9 adds §12 Compliance & Privacy to PRODUCT.md (bumping required sections 11→12) and adds
       Rule 12 to the Planning Assistant (bumping PA rules 11→12). The PA interviews the human on
       compliance needs; Rule 12 is the standing gap-reminder that surfaces at PA close.
       LOOK FOR:
         (a) `Planning_Assistant.md` — §12 Compliance & Privacy section present in the
             PRODUCT.md template output; interview questions for RA 10173 / WCAG scope present.
         (b) `Planning_Assistant.md` — Rule 12 present (gap-reminder fires before PA
             hands off to Phase 0).
         (c) PA rules header / enumeration shows 12 rules (not 11).
         (d) PRODUCT.md template section count = 12.
       FAIL if §12 is absent from the PA template.
       FAIL if PA still shows only 11 rules.

□ K.60 (V32.9) — Post-Generation Security Checklist §14 (98 items / 14 sections):
       V32.9 expands the Post-Generation Security Checklist from 84 items (13 sections) to 98 items
       (14 sections). The new §14 covers Compliance & Data Privacy (RA 10173 NPC requirements,
       WCAG 2.2 AA gate, ComplianceFooter, consent flows, data-subject rights endpoints).
       LOOK FOR:
         (a) `Security_Checklist.md` — §14 Compliance & Data Privacy present with
             at least the new items reaching the 98-item total.
         (b) File header or footer states "98 items" and "14 sections".
         (c) All prior §1-§13 items intact (no items removed — count only grew).
       FAIL if §14 is absent.
       FAIL if total item count is not 98.
       Note: Prior items K.51(m) and E.4 reference 84 items / 13 sections — those reflect V32.8 /
       V31 states respectively and are FROZEN. Current-state is 98 / 14.

□ K.61 (V32.9) — security.md ASVS 5.0 + OWASP Top 10:2025 A03/A10 refresh:
       V32.9 updates `security.md` to align with ASVS 5.0 (replacing ASVS 4.0 references) and
       OWASP Top 10:2025 (specifically A03 Injection and A10 SSRF, the two categories most affected
       by the framework's tRPC + Prisma stack).
       LOOK FOR:
         (a) `security.md` — references ASVS 5.0 (not ASVS 4.0).
         (b) `security.md` — references OWASP Top 10:2025 A03 and A10 by name/number.
         (c) No regression: the 16 Secure Code Generation sub-sections are still present (count unchanged).
       FAIL if security.md still references ASVS 4.0 as current (frozen historical mentions are OK).
       FAIL if OWASP Top 10:2025 is absent from security.md.

□ K.62 (V32.9) — Skills `ph-data-privacy` and `accessibility-agents` present in skills DB and surfaced by /scan-project:
       V32.9 adds two new skills to the AIEF skills library: `ph-data-privacy` (PH Data Privacy Act /
       RA 10173 compliance skill) and `accessibility-agents` (WCAG 2.2 AA + ARIA audit skill).
       Both must be surfaced by `/scan-project` at the correct framework phase.
       LOOK FOR:
         (a) `src/data/skills.js` (AIEF repo) — `ph-data-privacy` entry present with correct id,
             label, description, and install command.
         (b) `src/data/skills.js` — `accessibility-agents` entry present with correct id, label,
             description, and install command.
         (c) `/scan-project` skill scanner (src/data/ or scan-project skill file) — both skills appear
             in the Phase 7 or compliance-phase suggestion list (Surface Additions Policy).
       FAIL if either skill is absent from skills.js.
       FAIL if either skill is absent from /scan-project surfacing (Surface Additions Policy violation).

□ K.63 (V32.9) — Compact card header version = V32.9 and rule count = 33:
       Supersedes K.53's version-marker check for the compact card. Verify the CURRENT values are V32.9.
       LOOK FOR:
         (a) `CLAUDE_compact.md` first line or header block — reads `V32.9` (not V32.8 or V32.8.1).
         (b) Rule count line in compact — reads `33 rules` (not 32).
         (c) UI rules count — reads `13 UI rules` (not 12).
         (d) Phase Hooks count — reads `18 phase hooks` (not 17).
         (e) Deliverable count — reads `23 deliverable files` (not 22).
         (f) Security Checklist reference — reads `98-item` or `98 items` (not 84).
       FAIL if any of (a)-(f) is stale.
       NOTE: Historical changelog entries inside CLAUDE_compact.md that say "32 rules" etc. for
       older versions are FROZEN — do NOT flag those.

□ K.64 (V32.9) — Count propagation: V32.9 bumps recorded correctly in Framework_Feature_Index.md:
       V32.9 is a major count-change version. The Framework Feature Index must record it.
       LOOK FOR:
         (a) `Framework_Feature_Index.md` — V32.9 row present documenting: Rule 33, privacy.md
             (#23), Hook 18, UI Rule 13, Checklist 98/14, PA §12 + Rule 12, PRODUCT.md §12,
             ph-data-privacy + accessibility-agents skills, ASVS 5.0 / OWASP Top 10:2025.
         (b) Framework header / "Current framework version" line reads V32.9.
         (c) Footer or counts summary updated: 33 Rules · 39 Scenarios · 23 deliverables · 18 hooks ·
             13 UI rules · 98 checklist items.
       FAIL if V32.9 row is absent.
       FAIL if "Current framework version" still reads V32.8.1.

□ K.65 (V32.9) — No stale current-state count references remain (zero-stale-count sweep):
       After V32.9, the canonical current-state counts are: 33 Rules · 39 Scenarios · 20 Bootstrap ·
       13 UI Component Rules · 18 Phase Hooks · 114 Security Checklist items (16 sections) · 23
       deliverable files · 12 PRODUCT.md sections · 12 PA rules · 61 Prompts (38 NEW ✨).
       LOOK FOR stale current-state occurrences of:
         - "32 Rules" / "32 rules" (outside frozen history)
         - "12 UI Component Rules" / "12 mandatory UI" (outside frozen history)
         - "84-item" / "84 security" (outside frozen history)
         - "13 sections" referring to checklist (outside frozen history)
         - "22 deliverable" (outside frozen history)
         - "17 phase hooks" / "17 Phase Hook" (outside frozen history)
         - "11 rules" referring to Planning Assistant (outside frozen history)
         - "11 sections" referring to PRODUCT.md (outside frozen history)
       FAIL for any current-state stale count found.
       PASS only if every occurrence of the above is inside a frozen historical context (dated changelog
       entry, per-version K-item, or explicit "at VXX.Y" qualifier).

□ K.66 (V32.10) — Mandatory compose resource limits in templates.md (zero-count-change templates patch):
       Verify in `templates.md`:
         (a) Stage/prod compose service definitions mandate top-level `mem_limit`, `mem_reservation`, and
             `cpus` keys on every service — NOT a `deploy:` block (non-swarm Komodo / `docker compose up`
             silently ignores `deploy.resources`).
         (b) A per-service-role default table is present (e.g. app, worker, db role defaults).
         (c) The OOM caveat is stated: a DB's `mem_limit` MUST exceed its buffer-pool size
             (e.g. `innodb_buffer_pool_size=512M` → cap ≥ 768m) or the container OOM-kills under load.
         (d) Dev compose is explicitly exempt from the resource-limit mandate.
         (e) Zero count change confirmed: no new rule/scenario/prompt/deliverable/file added; all canonical
             counts (33 rules · 39 scenarios · 61 prompts · 23 deliverables · 18 phase hooks) are unchanged.
       FAIL if any of (a)-(d) is missing from templates.md, or if any canonical count changed.
       PASS if (a)-(e) all confirmed.

### V32.11 — shadcn/studio Pro Design Generator

□ K.67 (V32.11) — shadcn/studio Pro adopted as the framework's default design generator:
       Verify across the framework:
         (a) `AI_Tools_Reference.md` has a new §2.5 documenting the shadcn/studio Pro MCP
             (user-global · build-time · output = plain shadcn/ui) with the /cui /iui /rui /ftc command map.
         (b) The two prior "shadcn-studio = not recommended (paid)" notes are GONE — reconciled to a
             "sanctioned design generator" block in BOTH `ui-rules.md` AND `Master_Prompt.md`.
         (c) `phases.md` carries the command routing in MODEL HOOKs: Phase 2.8→3.3 (the /cui→/iui→/rui
             trio), Phase 4 Parts 5-6 (/cui + /rui, design FROZEN — no /iui), Phase 7 (/cui + /iui
             new-sections-only + /rui). /ftc is conditional on a Figma source + the Figma MCP.
         (d) INHERIT-not-REPLACE is stated: generated blocks reconcile to docs/DESIGN.md / compiled tokens
             (Rule 12), never override; fallback when unreachable = plain shadcn/ui MCP + Blocks.
         (e) Counts: MCP servers 4 → 5 (3 project-wired + 1 user-global + 1 plugin) propagated to
             CLAUDE_compact.md, root CLAUDE.md, CLAUDE_framework_repo.md, E.11 above, the V32.11
             verified-counts block, and `public/documentation-hub.html` (sd-counts callout). ALL other
             canonical counts unchanged (33 Rules · 39 Scenarios · 13 UI Rules · 61 Prompts · 23 deliverables).
         (f) Version markers read V32.11 (not a stale earlier marker) in every "current"-tense surface:
             this file's title + Purpose + "verified counts" header (K.1-K.67 range), CLAUDE_compact.md
             header, Framework_Feature_Index.md "> Current framework version" line AND its §1.2
             "Claude Code (Primary Agent — current V32.11 behavior...)" subsection title, and the
             documentation-hub.html "Reconcile to current V32.11" pointer. Historical changelog/K-item
             snapshots that name an earlier version are correct and MUST be left as-is.
       FAIL if any "not recommended (paid)" shadcn-studio note remains, if §2.5 is missing, if the MCP
            server count is still 4 anywhere, if any non-MCP canonical count changed, or if any
            current-tense version marker still names a pre-V32.11 version.
       PASS if (a)-(f) all confirmed.

□ K.68 (V32.12) — `specdrivenprompt/design-principles.md` exists in the framework repo:
       Verify that the file `specdrivenprompt/design-principles.md` is present in the repository.
       It must cover: hierarchy & layout · spacing · typography · the 9-state control contract
       (default/hover/focus/active/disabled/loading/empty/error/success) · UX laws (Fitts, Hick, Miller,
       Jakob's Law) · WCAG by success-criterion · a QA checklist. Condensed from typeui.sh fundamentals (MIT).
       FAIL if the file is absent or missing any of the named sections.
       PASS if all sections confirmed present.

□ K.69 (V32.12) — `deploy.sh` copies `design-principles.md` to `.ai_prompt/design-principles.md`:
       Verify that `specdrivenprompt/deploy.sh` contains a copy/overwrite-with-backup entry
       that deploys `design-principles.md` to the target project's `.ai_prompt/design-principles.md`.
       The entry must sit in the GROUP 8 (or equivalent V32.12) block alongside `privacy.md`.
       FAIL if deploy.sh does not copy this file, or places it in the wrong target location.
       PASS if the deploy entry is confirmed.

□ K.70 (V32.12) — `phases.md` contains Read cues for `design-principles.md` at all 4 design phases:
       Verify that `.ai_prompt/phases.md` (or `specdrivenprompt/phases.md`) includes explicit
       `Read .ai_prompt/design-principles.md` cues (or equivalent MODEL HOOK language) at:
         (a) Phase 2.8 (Clickable Mockup Review)
         (b) Phase 3.3 (Interactive Prototype & Simulation)
         (c) Phase 4 Parts 5-6 (UI wiring)
         (d) Phase 7 (Feature Update)
       FAIL if any of the four cue points is absent.
       PASS if all four confirmed.

□ K.71 (V32.12) — `ui-rules.md` cross-references `.ai_prompt/design-principles.md` as fallback:
       Verify that `ui-rules.md` contains a note (in the intro or a dedicated subsection) stating
       that `.ai_prompt/design-principles.md` is the reference for structural patterns, component
       states, and a11y approaches not covered by the shadcn/ui token rules.
       FAIL if no cross-reference to design-principles.md is present in ui-rules.md.
       PASS if the cross-reference is confirmed.

□ K.72 (V32.12) — `Planning_Assistant.md` Step 7b.2 QA gate references `design-principles.md`:
       Verify that the PA file's Step 7b.2 (or equivalent DESIGN.md QA gate step) explicitly requires
       the submitted `docs/DESIGN.md` to enumerate: required component states · interactive patterns ·
       anti-patterns · a QA checklist. The gate should reference `design-principles.md` as the authority.
       FAIL if the QA gate is absent or does not reference design-principles.md.
       PASS if confirmed.

□ K.73 (V32.12) — Deliverable count reads 24 (not 23) in ALL current-tense surfaces:
       Verify that the following files all state **24 deliverable files** (not 23) in their
       current-tense count references:
         (a) `Master_Prompt.md` — V32.12 changelog entry + active-version paragraph
         (b) `CLAUDE_compact.md` — STRICTEST line deliverable count
         (c) `CLAUDE.md` (repo root) — lines 6, 8, 60, Canonical Counts block, section heading
         (d) `Framework_Feature_Index.md` — "> Current framework version" line + footer Note
         (e) `public/documentation-hub.html` — hero paragraph + sd-files h2 + sd-counts callout
         (f) `AI_Tools_Reference.md` — deliverable set footer note
         (g) `CLAUDE_framework_repo.md` — all instructional "N deliverable files" occurrences
         (h) `ChatGPT_Cross_Audit.md` — this file's title + Purpose + verified-counts block
       FAIL if any current-tense surface still reads 23 deliverable files.
       PASS if all eight surfaces confirmed at 24.
       **SUPERSEDED for the current total by K.75 (V32.14): the current deliverable count is 25, not 24.
       K.73 verifies only the V32.11→V32.12 transition (23→24) as a historical snapshot.**

### V32.13 — CI → Docker Hub → Komodo-API Auto-Deploy (fleet Watchtower-free standard)

□ K.74 (V32.13) — The CI → Docker Hub → Komodo-API auto-deploy mechanism is documented as a
       Phase-6 scaffold (NOT a new deliverable), and the deliverable count stays 24. Verify:
         (a) `templates.md` contains a **Rule 5c — CI → Docker Hub → Komodo-API auto-deploy** that
             specifies: the staging compose image line `${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${STAGING_IMAGE_TAG:-staging-latest}`;
             the Komodo staging stack env `STAGING_IMAGE_TAG = [[<APP>_STAGING_TAG]]`; the vendored
             `deploy/komodo-deploy.sh` helper; the `.github/workflows/docker-publish.yml` build→push→Komodo-deploy form;
             repo Actions secrets `DOCKERHUB_USERNAME/TOKEN` + `KOMODO_API_KEY/SECRET` (dedicated CI key, not master);
             a per-app enable checklist; and a **production-is-manual-only** gate.
         (b) `phases.md` Phase 4 Part 8 `docker-publish.yml` section has a **V32.13** note describing the
             Komodo CI-deploy variant (UpdateVariableValue pin → DeployStack → poll GetUpdate; webhook
             does NOT fire for files-on-host stacks); `.env.staging` carries the `STAGING_IMAGE_TAG` note;
             Phase 6 carries the staging-auto-deploy ENABLE checklist with the manual-prod gate.
         (c) Both docs **point to the canonical source of truth** —
             `Server-Setups/Powerbyte-Hostinger/runbooks/komodo-ci-deploy.md` +
             `komodo/ci-deploy/{komodo-deploy.sh,docker-publish.template.yml}` — and do NOT re-author the helper.
         (d) The V32.13 verified counts block + Master_Prompt + Framework_Feature_Index + CLAUDE_compact
             all confirm **24 deliverable files (unchanged)** — the workflow + helper are scaffold templates,
             not deploy.sh deliverables.
         (e) **Production is NEVER auto-deployed** anywhere in the V32.13 docs — no prod step in the
             push-to-main workflow; prod is a manual promotion.
         (f) Version markers read **V32.13** (not a stale earlier marker) in every "current"-tense surface:
             Master_Prompt.md active-version line, CLAUDE_compact.md title + STRICTEST line,
             Framework_Feature_Index.md "> Current framework version" line + §1.2 title + footer,
             this file's title + Purpose + verified-counts heading, public/documentation-hub.html reconcile line.
       FAIL if the mechanism is missing from templates.md/phases.md, if it is recorded as a new deliverable
       (count drifts off 24), if any current-tense surface still names a pre-V32.13 version, or if any prod
       auto-deploy path is present.

□ K.75 (V32.14) — The Motion Layer (deliverable #25 `motion.md` + UI Rule 14) is present and the
       counts read **14 UI Component Rules + 25 deliverable files** in ALL current-tense surfaces. Verify:
         (a) `specdrivenprompt/motion.md` exists in the framework repo — a library-agnostic, on-demand
             UI/UX motion-principles reference. Its header carries a credit line to Emil Kowalski's
             "Animations on the Web" (animations.dev) + the MIT-licensed emilkowalski/skills +
             vercel-labs/open-agents skill files, and an INHERIT-not-REPLACE contract (principles win
             structural/timing decisions; the design system wins token values). It covers: when/when-not
             to animate (skip high-frequency repeated actions), easing-by-intent (ease-out entrances/exits,
             ease-in-out on-screen movement, no `linear` for UI), duration budgets by element type, the
             **performance hard rule — animate `transform` + `opacity` ONLY, never layout props**,
             accessibility first-class (`prefers-reduced-motion` mandatory, reduced-motion a design
             decision not a kill-switch, ties to WCAG 2.2 AA + SC 2.3.3), spring-vs-tween, gesture
             interruptibility, CSS-vs-JS, and a Motion+Tailwind appendix.
         (b) `ui-rules.md` contains a new **Rule 14 "Motion & Micro-interactions"** — Motion (motion.dev)
             the only prescribed React animation lib (the primitive shadcn/ui builds on — shadcn-only
             preserved), LazyMotion/mini default, **mandatory `useReducedMotion()` guard** ties R13 WCAG
             gate, `transform`/`opacity` only, GSAP opt-in on a PRODUCT.md marketing/scroll signal (with
             `@gsap/react` + `gsap.matchMedia()` guard), Three.js/R3F parked for 3D-flagged apps only.
             The Rule 14 block points to `.ai_prompt/motion.md` for the full principles; the file header
             note also cross-references motion.md. The UI-rules heading reads "Rule 14 added V32.14".
         (c) `deploy.sh` copies `motion.md` to the target `.ai_prompt/motion.md` (GROUP 8, alongside
             `privacy.md` + `design-principles.md`, overwrite-with-backup); `sync-to-project.sh` whitelist
             includes `motion.md` and its gate message reads **25 whitelisted files**.
         (d) `phases.md` carries `Read .ai_prompt/motion.md` MODEL HOOK cues at Phase 3.3 / Phase 4
             Parts 5-6 / Phase 7. The project + repo CLAUDE.md `/scan-project` phase rows surface motion.md
             at 3.3 / Parts 5-6 / Phase 5 / Phase 7 (paired with `accessibility-agents`), and a V32.14
             Skills Library Awareness note is present.
         (e) The **V32.14 verified counts block** + Master_Prompt + Framework_Feature_Index + CLAUDE_compact
             + project/repo CLAUDE.md + documentation-hub.html all confirm **14 UI Component Rules + 25
             deliverable files** (and the .ai_prompt/ subtotal reads 19, was 18).
         (f) Version markers read **V32.14** (not a stale earlier marker) in every "current"-tense surface:
             Master_Prompt.md active-version line, CLAUDE_compact.md title + STRICTEST line,
             Framework_Feature_Index.md "> Current framework version" line + footer, this file's title +
             Purpose + verified-counts heading, deploy.sh banner, public/documentation-hub.html reconcile line.
       FAIL if `motion.md` is missing, if Rule 14 is absent from ui-rules.md, if either deploy script omits
       motion.md, if any current-tense surface still reads 13 UI rules / 24 deliverables, or if any
       current-tense surface still names a pre-V32.14 version.

□ K.76 (V32.14 post-ship) — Framework deliverable filenames are UNVERSIONED (Master_Prompt.md,
       CLAUDE_compact.md, Framework_Feature_Index.md, Planning_Assistant.md, AI_Tools_Reference.md,
       Security_Checklist.md, ChatGPT_Cross_Audit.md, deploy.sh — no `_v31` suffix). Git owns version
       history; in-file V32.x markers are unchanged. Verify:
         (a) No tracked file under `specdrivenprompt/` has an `*_v31*` deliverable name (run
             `git ls-files specdrivenprompt/ | grep _v31` — must return empty).
         (b) `deploy.sh` contains no hardcoded `*_v31*` destination paths; it may contain an intentional
             `AI/Master_Prompt_v*.md` orphan-cleanup glob (`.bak` rename) — that glob is the ONLY
             permitted reference to the old naming pattern.
         (c) Target app projects synced via `deploy.sh` / `spec-update` receive unversioned filenames
             at all destination paths (`.ai_prompt/`, `AI/`, `scripts/`, `.claude/`, project root).
       FAIL if any tracked deliverable file in `specdrivenprompt/` carries a `_v31` suffix, or if
       `deploy.sh` writes to a `_v31`-suffixed destination path.

□ K.77 (V32.17) — The Design Anti-Slop Gate (deliverable #26 `scripts/lint-design.sh` + design-principles.md
       Pillar 8) is present and the deliverable count reads **26 deliverable files** in ALL current-tense
       surfaces. Verify:
         (a) `specdrivenprompt/lint-design.sh` exists in the framework repo, and `deploy.sh` GROUP 9
             copies it to target `scripts/lint-design.sh` (overwrite-with-backup + chmod +x).
         (b) The linter checks D1–D7 (seven cardinal sins: default indigo/violet accent · two-stop
             "trust gradient" hero · emoji-as-icons · hardcoded sans on display headings · AI-tile
             pattern · invented metrics · filler copy) + P1a (ALL-CAPS without letter-spacing —
             advisory warning, never fails build).
         (c) All invocations at design phases (3.3 / Phase 4 Parts 5-6 / Phase 5) use
             `--report-only` (advisory, exit 0) — no design phase is ever hard-blocked by this gate.
         (d) `design-principles.md` (`.ai_prompt/`) contains a letter-spacing table (Pillar 4),
             a five-state render contract + loading thresholds (Pillar 6), and a new Pillar 8 —
             Anti-AI-Slop (D1–D7 documented with remediation guidance).
         (e) The **V32.17 verified counts block** + Master_Prompt.md + Framework_Feature_Index.md +
             CLAUDE_compact.md + documentation-hub.html + repo CLAUDE.md all read **26 deliverable files**.
       FAIL if any current-tense surface still reads 25 deliverables, if lint-design.sh is absent
       from deploy.sh GROUP 9, or if Pillar 8 is missing from design-principles.md.

□ K.78 (V32.18) — The App-Hardening Harvest (AI/LLM/MCP + API-Authz + Injection-Family security)
       is present and the Security Checklist reads **114 items / 16 sections** in ALL current-tense
       surfaces. Verify:
         (a) `security.md` contains three new blocks tagged NEW V32.18: "AI / LLM / MCP SECURITY"
             (OWASP LLM Top 10:2025 + MITRE ATLAS), "API AUTHORIZATION DEPTH — BOLA / BFLA / BOPLA"
             (OWASP API Top 10:2023), and "INJECTION FAMILY — beyond SQL", plus an "ADVERSARIAL
             VERIFICATION" pointer block.
         (b) `Security_Checklist.md` has SECTION 15 — AI / LLM / MCP SECURITY (7 items) and SECTION 16
             — API AUTHORIZATION DEPTH & INJECTION FAMILY (9 items); its header reads
             **114 verification items across 16 sections**; HOW TO USE reads "ALL 16 sections".
         (c) The harvested 38-skill bundle lives at `~/.claude/skills-library/Security & Testing/
             anthropic-cybersecurity-skills/` as a reference library — it is NOT counted as a 27th
             deliverable (deliverable count stays 26).
         (d) The **V32.18 verified counts block** + Master_Prompt.md + Framework_Feature_Index.md +
             CLAUDE_compact.md + documentation-hub.html + repo CLAUDE.md all read **114 Security
             Checklist items / 16 sections**.
         (e) No other canonical count changed (33 Rules · 39 Scenarios · 61 Prompts · 26 deliverables
             · 14 UI Rules · 18 Phase Hooks · 5 MCP servers).
       FAIL if any current-tense surface still reads 98 items / 14 sections, if §15 or §16 is missing,
       or if the bundle was counted as a new deliverable.

---

## OUTPUT FORMAT

For each checklist item, report ONE of:

```
✓ PASS — [item]
   Evidence: [file:line] or [file section]

✗ FAIL — [item]
   Problem: [what's wrong]
   Evidence: [file:line or quote]
   Suggested fix: [exact change needed]

? PARTIAL — [item]
   Concern: [what's ambiguous or incomplete]
   Evidence: [file:line or quote]
   Recommendation: [clarification needed]
```

After going through all items, provide a **SUMMARY SCORECARD**:

```
SECTION A (Phase 2.8 Implementation):          [X PASS / Y FAIL / Z PARTIAL]
SECTION B (Cline Deprecation Consistency):     [X PASS / Y FAIL / Z PARTIAL]
SECTION C (Historical V30 Preservation):       [X PASS / Y FAIL / Z PARTIAL]
SECTION D (Current-Version Consistency):       [X PASS / Y FAIL / Z PARTIAL]
SECTION E (Count Preservation):                [X PASS / Y FAIL / Z PARTIAL]
SECTION F (Foundational Architecture Intact):  [X PASS / Y FAIL / Z PARTIAL]
SECTION G (Regression Checks):                 [X PASS / Y FAIL / Z PARTIAL]
SECTION H (Phase 2.8 Technical):               [X PASS / Y FAIL / Z PARTIAL]
SECTION I (Automation Integration):            [X PASS / Y FAIL / Z PARTIAL]
SECTION J (Post-Lock Additive Patches):        [X PASS / Y FAIL / Z PARTIAL]
SECTION K (V32 / V32.8 Patches):              [X PASS / Y FAIL / Z PARTIAL]
───────────────────────────────────────────────────────────
TOTAL:                                         [X PASS / Y FAIL / Z PARTIAL] out of ~157 items

TOP 3 CRITICAL FAILS (must fix before release):
1. [item] — [file] — [fix]
2. [item] — [file] — [fix]
3. [item] — [file] — [fix]

SECONDARY ISSUES (nice to fix but not blocking):
[list any additional findings]
```

---

## IMPORTANT NOTES FOR CHATGPT

1. **Do not be lenient.** Bonito asks for this audit precisely because Claude (the LLM that made the changes) may miss its own errors. Report every real inconsistency.

2. **Do not invent features.** If a checklist item describes something that isn't actually in the files, report the gap — but don't suggest the feature should do more than specified.

3. **Distinguish FAIL from PARTIAL carefully.** A FAIL is factually wrong. A PARTIAL is ambiguous or incomplete coverage.

4. **Quote evidence.** Every PASS/FAIL/PARTIAL must include the file and a line quote or section reference. No hand-waving.

5. **Cline deprecation is in-place V31 — no version bump.** The framework stays V31. Cline is marked deprecated but retained structurally (folders, .clinerules file, historical changelog entries). Only active routing changed to Claude Code.

6. **Historical V30 changelog entries MUST stay as V30.** If you see "V30: Compact CLAUDE.md architecture" in a changelog, that's correct — V30 added that. V31 did NOT add that.

7. **`.cline/` folder path references are file paths, not Cline routing.** Claude Code reads and writes these files. Do NOT flag `.cline/memory/lessons.md` as a Cline reference — it's a file path that happens to use that folder name for historical continuity.

8. **False positives waste everyone's time.** If you can't find something with evidence, mark PARTIAL and explain — don't fabricate a FAIL.

9. **V31 is additive: Planning Assistant (Phase 2.8 + Rule 11 Automation) + Cline-deprecation-in-place + Scenario 33-34 + post-lock patches.** Planning Assistant Rule 11 is a Planning Assistant rule — it does NOT increment the framework's 30-rule count. Framework rule count stays at 30. Post-lock patches (Phase 3.5, anti-thrashing, Skill Installer, Prompt 4.13, attribution cleanup) were applied after V31 lock with no version bump.

10. **Memory system verification is critical.** If ANY memory command (Resume Session, Governance Sync, Feature Update, Governance Retro, Log Lesson, Resume from handoff) appears broken or has stale Cline routing as primary, flag as F.7 FAIL immediately — this is Bonito's most important concern.

11. **V31.1 / V31.2 / V31.3 / V31.4 are post-lock patches inside the V31 line** — additive changes that did not bump the major version. **V32 (2026-05-27) IS a full version bump** — it replaces the dispatch model structurally (token estimation → file-size checks, Step 2.5b removed). Treat V31.x patches as historical; treat V32 as the current authoritative state. The K section verifies V32; the J section retains historical V31.x items for audit completeness. V31.1 is a minor version tag for the Memory Governance Layer — still within V31. V31.2 added the 30K Token Budget Gate (Step 2.5) and Opus Escalation (Step 2.5b) — both SUPERSEDED by V32. V31.3 added the UI Loading-State Dual-Path (Rule 11, Scenario 35, Bootstrap Step 19, phantom-ui). V31.4 is the Dispatch Discipline Patch — it extended the Architect-Execute Model from Phase 4/7/8 only to ALL phases + ad-hoc edits, added a Sonnet Scout sub-step (§4 step 1.5), rewrote Tier 1 to mandate Sonnet dispatch (removing "proceed directly"), and rewrote phase hook MODEL lines and all phases.md MODEL: lines in imperative form. ChatGPT should verify patches exist in the correct files (Section J) but should NOT flag them as version inconsistencies. Phase 3.5 is a new phase — verify it appears in phase menus and counts. Anti-thrashing rules are in Phase 4 and Phase 8 sections. Context Budget is a global principle in CLAUDE_compact.md and Master_Prompt.md. Memory Governance Layer is in memory-governance.md with 13 hooks in phases.md. Architect-Execute Model uses Sonnet 4.6 (executor); Opus dispatched only by explicit human instruction. Prompt count is 59 (not 54, 55, or 56). Deliverable file count is 17 (not 16). Attribution chain is CLAUDE_CODE first (not CLINE).

---

*Part of the Spec-Driven Platform V32.9 deliverable set. Maintained by Claude on behalf of Bonito — Powerbyte IT Solutions, Lipa City, Philippines.*
