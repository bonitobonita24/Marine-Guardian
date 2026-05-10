# Spec-Driven Platform V31 — Cross-AI Audit Prompt (for ChatGPT)

> **Purpose:** Hand this prompt to ChatGPT along with the 16 V31 framework files. ChatGPT independently audits V31 to verify:
> 1. Phase 2.8 (Clickable Mockup Review — added V31) is correctly documented
> 2. Cline deprecation (in-place V31 update) is consistent across all files
> 3. Historical V30 changelog references are preserved
> 4. Memory system (Resume Session, Governance Sync, Feature Update, Log Lesson, Governance Retro) still works with Claude Code as primary
> 5. Foundation intact: L1-L6 security stack, 9 governance docs, Rule 24 fresh context, file ownership model
> 6. No regressions introduced during the updates
> 7. Post-lock additive patches: Phase 3.5, Phase 4+8 anti-thrashing, Skill Installer, Prompt 4.13, attribution cleanup, prompt count 55
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
11. **Context Budget — Global Principle** — Sonnet 4.6 model-aware task sizing added to CLAUDE_v31_compact.md and Master_Prompt_v31.md. Every task must be scoped to ≤80K tokens SAFE zone.
12. **Prompt 3.19** — Emergency Anti-Thrashing for any phase (Sonnet 4.6 calibrated, 3 variants)
13. **Memory Governance Layer (V31.1)** — new file `memory-governance.md` with 5 sections: Tiered Decomposition Engine, Smart Checkpoint Protocol, Phase Hooks (13 hooks across all phases), Architect-Execute Model (Opus 4.6 plans → Sonnet 4.6 executes), Mid-Project Adoption
14. **Prompts 3.20 + 3.21** — Memory Governance Baseline + Opus Planning Session

I am attaching 16 V31 framework files. Your job is to verify ALL changes were implemented correctly AND that the foundational Spec-Driven Platform architecture remains intact.

**Do NOT suggest new features.** Do NOT recommend changes to the framework's philosophy. Your job is ONLY to verify:

1. Phase 2.8 is correctly documented wherever it appears
2. Cline is consistently marked deprecated across all files
3. Historical V30 references preserved (changelog entries describing what V30 did must STILL say V30)
4. Cross-file references (filenames, phase counts, agent routing) are internally consistent
5. Memory system commands all still function (Resume Session, Governance Sync, Feature Update, Governance Retro, Log Lesson, Resume from handoff)
6. Foundation intact: L1-L6 security stack, 9 governance docs, Rule 24 fresh context, file ownership model
7. Post-lock patches are present in the correct files (Phase 3.5, anti-thrashing rules, Skill Installer, Prompt 4.13, attribution, prompt count)
8. No regressions

---

## V31 ARCHITECTURE — UNDERSTAND THIS BEFORE AUDITING

### What V31 IS (Two-Part Change)

**PART A — Phase 2.8 Addition**
Runs in the **Planning Assistant chat (Claude.ai)** — NOT in Claude Code. Generates a clickable React (.jsx) mockup with realistic industry-appropriate data using shadcn/ui conventions. After user confirms, Step 7a generates an HTML archive version. User verifies spec interpretation BEFORE Phase 3 locks the architecture.

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
- Post-lock patches add Phase 3.5 as a NEW phase (between Phase 3 and Phase 4) and anti-thrashing rules to Phase 4 and Phase 8. These are in phases.md and Master_Prompt_v31.md. They do NOT change the framework rule count, scenario count, or bootstrap step count.
- Post-lock patches add a **Context Budget — Global Principle** to CLAUDE_v31_compact.md and Master_Prompt_v31.md. This is a Sonnet 4.6 model-aware task sizing principle (200K window, 120K practical, ≤80K SAFE zone, 12-file threshold). It governs how ALL work is scoped — not a new rule, but a non-negotiable behavioral principle.

### V31 verified counts (must match in every file that quotes them)

```
30 Rules · 34 Scenarios · 18 Bootstrap Steps · 8 Phase 4 Parts
9 Phase 5 Commands · 16 Phase 6.5 Categories · 16 Secure Code Gen sub-sections
10 UI Component Rules · 84 Security Checklist items (13 sections)
59 Prompts (36 NEW ✨) in Prompt_References.md and Prompt_References.html
17 deliverable files (16 in .ai_prompt/ + deploy-v31.sh at project root) · 4 MCP servers (3 wired + 1 plugin) · Node v22 · pnpm@10
Phase count: 8 main phases + 2.5 + 2.6 + 2.7 + 2.8 (V31) + 3.5 (POST-LOCK) + 6.5
6 agents (Claude Code primary: Opus 4.6 Architect + Sonnet 4.6 Executor · Cline ⚠ DEPRECATED · Copilot · SpecStory · SocratiCode · code-review-graph)
9 governance docs (unchanged)
Planning Assistant: 11 rules (Rule 11 = n8n+OpenClaw automation opt-in)
```

### V31 post-lock additive patches (must be present in the files listed)

These were added after V31 was locked. No version bump — they are additive patches.
ChatGPT MUST verify each patch is present in the specified file(s):

```
1. Phase 3.5 — Execution Plan Generation
   MUST BE IN: phases.md (full section), Master_Prompt_v31.md (summary + phase menu),
   CLAUDE_v31_compact.md (phase menu), Framework_Feature_Index_v31.md (V31 row + footer)

2. Phase 4 anti-thrashing rule
   MUST BE IN: phases.md (full section), Master_Prompt_v31.md (in Phase 4 section)

3. Phase 8 anti-thrashing rule (with completeness check)
   MUST BE IN: phases.md (full section after batch confirmation),
   Master_Prompt_v31.md (summary in Phase 8 section)

4. Skill Installer integration
   MUST BE IN: phases.md (Phase 3.5 section), Framework_Feature_Index_v31.md

5. Prompt 4.13 — Add Automation to Existing Project
   MUST BE IN: Prompt_References.md (7-step flow), Prompt_References.html (card p-4-13)

6. code-review-graph setup signal
   MUST BE IN: phases.md (Phase 6 completion + Phase 7 pre-flight Step 0)

7. Attribution order: CLAUDE_CODE first, CLINE removed from active chain
   MUST BE IN: templates.md (Rule 15 template), Master_Prompt_v31.md (Rule 3 attribution)
   CLAUDE_v31_compact.md Rule 15 line must NOT list CLINE

8. **Attribution cleanup** — CLAUDE_CODE first, CLINE removed from active attribution chain
   MUST BE IN: Master_Prompt_v31.md (changelog), CLAUDE_v31_compact.md (header),
   Framework_Feature_Index_v31.md (V31 row + footer), Prompt_References.html (hero stat)
   MUST NOT appear as "54 prompts" or "55 prompts" or "31 New" or "32 New" anywhere

9. Context Budget — Global Principle (Sonnet 4.6 model-aware task sizing)
   MUST BE IN: CLAUDE_v31_compact.md (NON-NEGOTIABLE BEHAVIORS section — auto-loaded every session),
   Master_Prompt_v31.md (after GLOBAL INSTRUCTION PRIORITY ORDER section)
   Must include: "Claude Sonnet 4.6", "200K token context window", "≤80K SAFE zone",
   TOKEN BUDGET REFERENCE table, 12-file threshold explanation, codebase_search (Rule 17),
   exact autocompact error message quoted, mid-session recovery steps
   ALSO IN: phases.md Phase 4 + Phase 8 anti-thrashing sections (model context block)

10. Prompt 3.19 — Emergency Anti-Thrashing (any phase)
    MUST BE IN: Prompt_References.md (3 variants: mid-session rescue, proactive scope assessment,
    quick version — all Sonnet 4.6 calibrated), Prompt_References.html (card p-3-19)

11. Memory Governance Layer (V31.1) — new file memory-governance.md
    MUST BE IN: .claude/rules/memory-governance.md (5 sections: §1-§5)
    MUST BE REFERENCED IN: CLAUDE_v31_compact.md (contextual file loading table + agent stack),
    Master_Prompt_v31.md (context budget section + Rule 24), phases.md (13 memory governance hooks),
    Framework_Feature_Index_v31.md (feature domain entry), AI_Tools_Skills_MCPs_Reference_v31.md
    deploy-v31.sh MUST copy memory-governance.md to .claude/rules/

12. Architect-Execute Model (Opus 4.6 → Sonnet 4.6)
    MUST BE IN: memory-governance.md §4, CLAUDE_v31_compact.md (agent stack + context budget),
    Master_Prompt_v31.md (context budget + agent description)

13. Prompts 3.20 + 3.21 (Memory Governance Baseline + Opus Planning Session)
    MUST BE IN: Prompt_References.md, Prompt_References.html (cards p-3-20, p-3-21)

14. Prompt count: 59 prompts, 36 NEW ✨
    MUST BE IN: Master_Prompt_v31.md (changelog), CLAUDE_v31_compact.md (header),
    Framework_Feature_Index_v31.md (V31 row + footer), Prompt_References.html (hero stat)
    MUST NOT appear as "54 prompts" or "55 prompts" or "56 prompts" or "31 New" or "32 New" or "33 New" anywhere
```

---

## THE 16 V31 FILES (attached with this prompt)

```
1.  CLAUDE_v31_compact.md              — compact rules card (~200 lines)
2.  Master_Prompt_v31.md               — full monolithic prompt (~8000 lines)
3.  bootstrap.md                       — Phase 0 Bootstrap (18 steps)
4.  phases.md                          — All phase details (Phases 1–8 + 2.5, 2.6, 2.7, 2.8, 3.5, 6.5 + anti-thrashing rules)
5.  security.md                        — Secure Code Generation (16 sub-sections)
6.  ui-rules.md                        — UI Component Rules (10 rules, shadcn/ui enforced)
7.  scenarios.md                       — Scenarios 1–34 (Scenario 33: DESIGN.md integration; Scenario 34: CREDENTIALS.md Agent-Proof Upgrade)
8.  templates.md                       — Output types, .clinerules template, file ownership
9.  Product_md_Planning_Assistant_v31.md — Planning interview + Phase 2.8 (biggest V31 change)
10. Framework_Feature_Index_v31.md     — Feature + version history reference
11. AI_Tools_Skills_MCPs_Reference_v31.md — Tools + model routing reference
12. Post_Generation_Security_Checklist_v31.md — 84 items across 13 sections
13. Prompt_References.md               — Scenario-based prompt guide (markdown, authoritative)
14. Prompt_References.html             — Scenario-based prompt guide (interactive HTML UI, same content)
15. deploy-v31.sh                      — Deployment script
16. ChatGPT_V31_Cross_Audit_Prompt.md  — This audit prompt (don't audit the audit prompt itself)
```

---

## AUDIT CHECKLIST — Report PASS / FAIL per item

### SECTION A — Phase 2.8 Implementation (9 items)

```
□ A.1  Product_md_Planning_Assistant_v31.md contains a complete Phase 2.8 section
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

□ A.9  Master_Prompt_v31.md, phases.md, CLAUDE_v31_compact.md all reference Phase 2.8
       consistently as Planning Assistant chat only, NOT Claude Code, NOT Cline
```

### SECTION B — Cline Deprecation Consistency (15 items — NEW, verify carefully)

```
□ B.1  CLAUDE_v31_compact.md agent stack table shows Cline as ⚠ DEPRECATED
       LOOK FOR: "Cline             ⚠ DEPRECATED — do not use. Kept for historical reference only."

□ B.2  Master_Prompt_v31.md HOW TO USE section explicitly marks Cline deprecated
       LOOK FOR: "Cline → ⚠ DEPRECATED — do not use. Kept in framework for historical reference only."

□ B.3  Master_Prompt_v31.md H4 agent table Cline entry rewritten as DEPRECATED
       LOOK FOR table row: "Cline | ⚠ DEPRECATED (V31)"

□ B.4  Master_Prompt_v31.md session banner agent mode shows Cline deprecated
       LOOK FOR: "Cline → ⚠ DEPRECATED"

□ B.5  AI_Tools_Skills_MCPs_Reference_v31.md agent stack table: Cline marked ⚠ DEPRECATED

□ B.6  Framework_Feature_Index_v31.md Section 1.3 Cline: rewritten as ⚠ DEPRECATED
       Must include V31 change history entry documenting the in-place deprecation

□ B.7  Scenario 19 rewritten: title is "Cline is deprecated — use Claude Code (with Copilot
       as emergency fallback)" — polarity inverted vs V30 which called it "No Cline credits"

□ B.8  Every Phase "Who:" line in Master_Prompt_v31.md and phases.md routes to Claude Code
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
□ C.1  Framework_Feature_Index_v31.md V30 row "Compact CLAUDE.md Architecture
       + Claude Sonnet 4.6 Primary" — MUST say V30

□ C.2  V30 changelog entries describing promotion/demotion of agents preserved as V30

□ C.3  Master_Prompt_v31.md v29 → v30 changelog block describes V30 features as V30

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
□ D.1  CLAUDE_v31_compact.md header: "# SPEC-DRIVEN PLATFORM — V31"
□ D.2  CLAUDE_v31_compact.md session start: "✅ Spec-Driven Platform V31 loaded"
□ D.3  Master_Prompt_v31.md header: "# SPEC-DRIVEN PLATFORM — V31"
□ D.4  Master_Prompt_v31.md agent role: "V31 STRICTEST discipline"
□ D.5  Framework_Feature_Index_v31.md header: "Current framework version: V31"
□ D.6  Framework_Feature_Index_v31.md footer 16-file list: ALL versioned files have _v31 suffix
□ D.7  AI_Tools_Skills_MCPs_Reference_v31.md agent table: Claude Code shows "V31 primary"
□ D.8  Post_Generation_Security_Checklist_v31.md header: "— V31"
□ D.9  Post_Generation_Security_Checklist_v31.md Section 13: "V31 VALIDATION"
□ D.10 Prompt_References.md header: "Prompt References — Spec-Driven Platform V31"
□ D.11 Prompt_References.md deploy command: "bash deploy-v31.sh"
□ D.12 deploy-v31.sh header references V31 throughout
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
□ E.10 Deliverable file count = 16 in all files that mention it (15 in .ai_prompt/ + deploy-v31.sh at project root)
□ E.11 MCP servers = 4 (3 wired + 1 plugin)
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

       NOTE: CLAUDE_v31_compact.md lists only the 9 (STATE.md covered in Rule 24).
       Master_Prompt_v31.md lists STATE.md as "0" (pre-read) then 1-9.
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

□ F.9  Phase 2.8 does not affect Claude Code / Cline behavior
       Phase 2.8 runs in Planning Assistant chat ONLY
       Zero Phase 3+ impact

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

□ G.6  Phase 2.8 correctly scoped to Planning Assistant chat only

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
       three sources: bootstrap.md Step 8, Master_Prompt_v31.md Step 8,
       deploy-v31.sh GITIGNORE_ENTRIES

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

□ J.2  Phase 3.5 summary exists in Master_Prompt_v31.md
       LOOK FOR: "## PHASE 3.5" between Phase 3 and Phase 4 sections
       Must include: cross-reference to phases.md, output contract

□ J.3  Phase 3.5 appears in CLAUDE_v31_compact.md phase menu
       LOOK FOR: "Phase 3.5" line between Phase 3 and Phase 4

□ J.4  Phase 4 anti-thrashing rule exists in phases.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
       Must include: 12-file threshold, module-by-module sub-sessions, Part 8 always subdivides

□ J.5  Phase 4 anti-thrashing rule exists in Master_Prompt_v31.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE" inside Phase 4 section

□ J.6  Phase 8 anti-thrashing rule exists in phases.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE — MANDATORY (applies to ALL Phase 8 Batches)"
       Must include: 12-file threshold, per-feature sub-batches, CRITICAL PRINCIPLE,
       completeness check (verifies every user flow, data field, permission guard,
       validation rule, UI element from PRODUCT.md), STATE.md progress tracking

□ J.7  Phase 8 anti-thrashing summary exists in Master_Prompt_v31.md
       LOOK FOR: "### ⚠ ANTI-THRASHING RULE" inside Phase 8 section
       Must include: CRITICAL PRINCIPLE about protecting the build

□ J.8  Prompt 4.13 — Add Automation to Existing Project exists in Prompt_References.md
       LOOK FOR: "## 4.13 — Add Automation to Existing Project"
       Must include: 7 sub-steps (4.13.1 through 4.13.7)

□ J.9  Prompt 4.13 card exists in Prompt_References.html
       LOOK FOR: id="p-4-13"

□ J.10 Prompt count is 59 (not 54, 55, or 56) across all files that state a count:
       Master_Prompt_v31.md, CLAUDE_v31_compact.md, Framework_Feature_Index_v31.md,
       Prompt_References.html hero stat
       MUST NOT find "54 prompts" or "55 prompts" or "56 prompts" or "31 New" or "32 New" or "33 New" anywhere

□ J.11 Attribution order: CLAUDE_CODE first, CLINE removed from active chain
       templates.md Rule 15: must show CLAUDE_CODE | COPILOT | HUMAN | UNKNOWN
       CLAUDE_v31_compact.md Rule 15: must NOT list CLINE
       Master_Prompt_v31.md Rule 3: CLAUDE_CODE → self-reported first

□ J.12 Framework_Feature_Index_v31.md V31 row mentions Phase 3.5, anti-thrashing,
       Skill Installer, Prompt 4.13, and Phase 8 anti-thrashing

□ J.13 Context Budget — Global Principle exists in CLAUDE_v31_compact.md
       LOOK FOR: "### ⚠ CONTEXT BUDGET — GLOBAL PRINCIPLE" in NON-NEGOTIABLE BEHAVIORS
       Must include: "Claude Sonnet 4.6", "200K token context window", "≤80K SAFE zone",
       TOKEN BUDGET REFERENCE table (with ~5-8K, ~2-4K, ~1-3K, ~10-15K, ~2-5K estimates),
       12-file threshold explanation, codebase_search (Rule 17) directive,
       exact autocompact error message: "Autocompact is thrashing: the context refilled
       to the limit within 3 turns"

□ J.14 Context Budget — Global Principle exists in Master_Prompt_v31.md
       LOOK FOR: "### ⚠ CONTEXT BUDGET — GLOBAL PRINCIPLE" after priority order section
       Must include: same elements as J.13 + mid-session recovery steps (5 steps:
       STOP, /clear, STATE.md, handoff, commit)

□ J.15 Phase 4 and Phase 8 anti-thrashing sections both have "Model context:" block
       LOOK FOR in phases.md: "**Model context:** Claude Sonnet 4.6" within 5 lines of
       each "### ⚠ ANTI-THRASHING RULE" heading. Must include "80K SAFE zone".
       Same check in Master_Prompt_v31.md for both Phase 4 and Phase 8 summaries.

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

□ J.18 Memory governance hooks in phases.md (should be 13 hooks)
       LOOK FOR: "> **⚠ MEMORY GOVERNANCE**" blockquotes across phases.
       Must exist in: Phase 2, 2.5, 2.6, 2.7, 3, 3.5, 4, 5, 6, 6.5, 7, 7R, 8
       Phase 4/7/8 hooks must include "Architect-Execute Model (§4)"

□ J.19 Architect-Execute Model referenced in CLAUDE_v31_compact.md
       LOOK FOR: "Opus 4.6 = Architect" and "Sonnet 4.6 = Executor" in Agent Stack
       Also: "Architect-Execute Model" in Context Budget section

□ J.20 deploy-v31.sh deploys memory-governance.md
       LOOK FOR: overwrite_with_backup line for memory-governance.md → .claude/rules/
       File count should say 17 deliverable files (not 16)

□ J.21 Prompts 3.20 + 3.21 exist in Prompt_References.md and .html
       LOOK FOR: "## 3.20 — Memory Governance Baseline" and "## 3.21 — Opus Planning Session"
       Cards p-3-20 and p-3-21 must exist in HTML

□ J.22 Prompt count is 59 (not 54, 55, or 56) across all files that state a count
       MUST NOT find "54 prompts" or "55 prompts" or "56 prompts" or
       "31 New" or "32 New" or "33 New" anywhere
```

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
───────────────────────────────────────────────────────────
TOTAL:                                         [X PASS / Y FAIL / Z PARTIAL] out of ~115 items

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

11. **Post-lock patches are NOT a new version.** They are additive changes applied to V31 files without bumping to V32. V31.1 is a minor version tag for the Memory Governance Layer — still within V31. ChatGPT should verify patches exist in the correct files (Section J) but should NOT flag them as version inconsistencies. Phase 3.5 is a new phase — verify it appears in phase menus and counts. Anti-thrashing rules are in Phase 4 and Phase 8 sections. Context Budget is a global principle in CLAUDE_v31_compact.md and Master_Prompt_v31.md. Memory Governance Layer is in memory-governance.md with 13 hooks in phases.md. Architect-Execute Model uses Opus 4.6 (architect) and Sonnet 4.6 (executor). Prompt count is 59 (not 54, 55, or 56). Deliverable file count is 17 (not 16). Attribution chain is CLAUDE_CODE first (not CLINE).

---

*Part of the Spec-Driven Platform V31 deliverable set. Maintained by Claude on behalf of Bonito — Powerbyte IT Solutions, Lipa City, Philippines.*
