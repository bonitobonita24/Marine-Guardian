# Memory Governance Layer — Token-Efficient Session & Task Management

> **Loaded contextually** when any phase pre-flight runs.
> Read the section relevant to your current task. Do NOT read all sections at once.
> Contains: §1 Tiered Decomposition, §2 Smart Checkpoint, §3 Phase Hooks, §4 Architect-Execute Model, §5 Mid-Project Adoption.

---

## §1 — TIERED DECOMPOSITION ENGINE

**Run this BEFORE starting any phase, part, batch, or feature update.**
This replaces ad-hoc "estimate scope" reasoning with a deterministic classifier.

### Step 1: Count Scope

Before reading any source files, answer these three questions:
1. **File count** — how many files will you create + modify + read for context?
2. **Module count** — how many distinct modules/directories are involved?
3. **Dependency depth** — how many modules depend on each other in a chain?

### Step 2: Classify Tier

```
TIER 1 — LIGHTWEIGHT
  Condition: ≤4 files AND 1 module
  Action:    Proceed directly. No split needed.
  Examples:  Fix a validation bug, add a field to one schema, update a single component.

TIER 2 — MODERATE
  Condition: 5-12 files AND 2-3 modules
  Action:    Estimate tokens: files × 2.5K + loaded context.
             If total < 80K → proceed as single session.
             If total ≥ 80K → split into 2 sub-sessions by module boundary.
  Examples:  New entity (schema + router + UI page), CRUD feature, new API endpoint with tests.

TIER 3 — HEAVY
  Condition: >12 files OR >80K estimated tokens OR 4+ modules OR cross-cutting concern
  Action:    Run scoring formula. If score > 40 → mandatory split.
  Formula:   score = (file_count × 2.5) + (module_count × 5) + (dependency_depth × 3)
  Examples:  Auth + RBAC + tenant isolation, multi-entity batch, billing integration.
```

### Step 3: Split Plan (Tier 3 only)

When score > 40, output a split plan before writing any code:

```
⚠ TIERED DECOMPOSITION — Tier 3 detected
Score: [N] (threshold: 40)
Breakdown: ([file_count] × 2.5) + ([module_count] × 5) + ([depth] × 3) = [score]

Split plan:
  Sub-session 1: [Module/Feature] — [file list] (~[N]K tokens)
    Dependencies: none
  Sub-session 2: [Module/Feature] — [file list] (~[N]K tokens)
    Dependencies: sub-session 1 (requires [specific artifact])
  Sub-session 3: [Module/Feature] — [file list] (~[N]K tokens)
    Dependencies: sub-session 2 (requires [specific artifact])

Starting with sub-session 1.
```

### Tier Upgrade Rule

If a Tier 2 task has dependency depth ≥ 4, re-score using the Tier 3 formula.
A seemingly moderate task with deep cross-module dependencies is actually heavy.

### Worked Examples

**Example A — Tier 1:** "Add email field to user profile"
Files: `schema.prisma`, `user-router.ts`, `profile-page.tsx`, `user.test.ts` → 4 files, 1 module → proceed.

**Example B — Tier 2:** "Add notifications feature"
Files: 7 files, 2 modules (backend + frontend). Estimate: 7 × 2.5K + 23K overhead = ~40K → under 80K → single session.

**Example C — Tier 3:** "Add multi-tenant billing with Stripe"
18 files, 5 modules, depth 3. Score: (18 × 2.5) + (5 × 5) + (3 × 3) = 79 → mandatory split into 3 sub-sessions.

**Example D — Tier upgrade:** "Add role-based dashboard"
Initial: 8 files, 2 modules → Tier 2. But dependency depth = 4 (touches shared auth middleware + 3 existing pages).
Re-score: (8 × 2.5) + (2 × 5) + (4 × 3) = 42 → score > 40 → upgraded to Tier 3.

---

## §2 — SMART CHECKPOINT PROTOCOL

**Run AFTER every phase/part/batch/feature-update completion.**
Writes progress to up to 3 targets based on change significance.

### Checkpoint Trigger

```
IF task created or modified any files:
  → SIGNIFICANT CHANGE → full checkpoint (all 3 targets)

IF task was read-only (tests with no changes, doc reads, governance checks, scans):
  → LIGHTWEIGHT → STATE.md phase position update only
```

### Target 1 — STATE.md (enhanced format)

Existing STATE.md format stays. Add these fields after every checkpoint:

```
TOKEN_ESTIMATE: "~[N]K consumed this session"
CHECKPOINT_TYPE: "full | lightweight"
FILES_TOUCHED: ["path/to/file1.ts", "path/to/file2.tsx", ...]
TIER_CLASSIFICATION: "[1|2|3] — [lightweight|moderate|heavy]"
```

### Target 2 — Claude Code Memory (zero-cost resume)

Write or update a `project`-type memory entry. This is the key token saver —
next session reads memory (~0 extra tokens) instead of re-reading 3 governance docs (~5-10K saved).

Memory entry must capture:
- **What was built** — decisions and outcomes, not code details
- **Gotchas encountered** — summary of any 🔴 entries added to lessons.md
- **What's next** — exact phase position and next action
- **Decomposition state** — if mid-split, which sub-sessions remain

Format:
```markdown
---
name: [Project Name] — Session Checkpoint [date]
description: Phase [N] progress — [what was done] — next: [what's next]
type: project
---

## Last Session: [YYYY-MM-DD]
Phase: [current phase]
Completed: [what was built — 2-3 bullets]
Gotchas: [any new 🔴 entries, or "none"]
Next: [exact next action]
Decomposition: [if mid-split: "Sub-session 2 of 3 remaining" | "N/A"]
Token budget used: ~[N]K of 80K safe zone
```

### Target 3 — lessons.md (unchanged)

Any gotchas or decisions still get typed entries per Rule 18.
Memory captures the summary; lessons.md captures the detail.
Both persist — memory for fast resume, lessons.md for governance audit trail.

### Skip Conditions (no checkpoint needed)

- Running tests with no code changes
- Reading docs for orientation
- Governance Sync / Retro (these have their own output format)
- Dry-run scans (`/scan-project`, skill conflict checks)
- Planning-only sessions (Opus decomposition writes its own task files)

---

## §3 — PHASE HOOKS

**This section defines the one-liner hook injected into every phase pre-flight in `phases.md`.**
You do not need to read this section during execution — it documents where the hooks live.

### Hook Text (injected into each phase)

```
⚠ MEMORY GOVERNANCE (memory-governance.md):
  PRE:   Run Tiered Decomposition (§1) — classify scope before starting.
  POST:  Run Smart Checkpoint (§2) if any files were created or modified.
  MODEL: Use Architect-Execute Model (§4) for Phase 4/7/8 work.
```

### Injection Points

The hook appears in the pre-flight/context-budget section of:
- Phase 2 (Discovery Interview)
- Phase 3 (Generate Spec Files)
- Phase 3.5 (Execution Plan)
- Phase 4 (Full Scaffold — each Part's pre-flight)
- Phase 5 (Validation)
- Phase 6 (Docker + Visual QA)
- Phase 6.5 (Error Triage)
- Phase 7 (Feature Update)
- Phase 7R (Feature Rollback)
- Phase 8 (Iterative Buildout)

### Relationship to Existing Rules

- The Universal Context Budget (80K safe zone, 12-file threshold) remains valid.
- The Tiered Decomposition Engine (§1) is the structured implementation of those rules.
- Phase-specific anti-thrashing rules (Phase 8 sub-batches, Phase 4 fresh context) remain valid.
- This layer adds structure on top — it does not replace existing protections.

---

## §4 — ARCHITECT-EXECUTE MODEL (Opus 4.6 → Sonnet 4.6)

**Use this for Phase 4 Parts, Phase 7 Feature Updates, and Phase 8 Batches.**
Opus 4.6 plans and decomposes. Sonnet 4.6 executes pre-scoped tasks.

### Why Two Models

- **Opus 4.6** excels at complex reasoning: reading large context, analyzing dependencies, making decomposition decisions, reviewing code quality. Higher cost per token but used sparingly for planning.
- **Sonnet 4.6** excels at following structured instructions: writing code, running tests, committing. Lower cost, used heavily for execution. But it thrashes when forced to also plan.

By separating planning from execution, Sonnet never needs to read full PRODUCT.md or reason about decomposition. One Opus planning session saves 3-5 Sonnet sessions from thrashing.

### Execution Flow

```
PHASE BOUNDARY REACHED
  │
  ▼
OPUS SESSION (Architect)
  1. Read STATE.md → orient to current phase position
  2. Read relevant PRODUCT.md sections + governance docs
  3. Run Tiered Decomposition (§1) → classify the work
  4. IF Tier 1: dispatch single Sonnet subagent directly
  5. IF Tier 2-3: write task scope(s), dispatch Sonnet subagent(s)
  6. For each Sonnet task:
     → Dispatch via Agent(model: "sonnet", prompt: [task instructions])
     → Sonnet builds, tests, commits, reports status
     → Opus reviews: spec compliance first, then code quality
     → If issues found: Sonnet fixes, Opus re-reviews
  7. After all tasks complete: run Smart Checkpoint (§2)
  8. Session ends
```

### Task Scope Format (what Opus gives Sonnet)

Each dispatched Sonnet subagent receives a self-contained prompt:

```markdown
# Task: [Phase N] — [Module Name]
Tier: [1|2|3] | Estimated tokens: ~[N]K

## Scope
Files to create: [explicit list]
Files to modify: [explicit list with line ranges if known]
Files to read (context only): [explicit list — ONLY these, nothing else]

## Dependencies
Requires: [what must be complete before this task]
Blocks: [what depends on this task completing]

## Instructions
[Pre-inlined PRODUCT.md sections — ONLY the relevant parts]
[Specific implementation steps — not vague, not "fill in"]

## Validation Checklist
□ [Specific check 1]
□ [Specific check 2]
□ Tests pass for this module
□ No files outside scope were modified

## Rules
- Do NOT read full PRODUCT.md — everything you need is above
- Do NOT read governance docs — Opus already validated governance
- Do NOT make decomposition decisions — follow this scope exactly
- Report status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

### Sonnet Status Handling

```
DONE
  → Opus proceeds to spec compliance review

DONE_WITH_CONCERNS
  → Opus reads concerns before reviewing
  → If correctness/scope issue → address before review
  → If observation (e.g., "file is getting large") → note and proceed

NEEDS_CONTEXT
  → Opus provides missing context, re-dispatches same task

BLOCKED
  → Opus assesses:
    1. Context problem → provide more context, re-dispatch
    2. Architecture problem → Opus handles directly (never retry Sonnet on architecture)
    3. Task too large → Opus re-decomposes into smaller pieces
    4. Plan is wrong → escalate to human
  → Two consecutive BLOCKEDs on same task → Opus takes over implementation
```

### When to Use Each Model

```
OPUS 4.6 (Architect) — use when:
  ✓ Phase planning and decomposition
  ✓ Cross-module dependency analysis
  ✓ Tier 3 scoring and split planning
  ✓ Governance Sync and Retrospectives
  ✓ Any task requiring >3 PRODUCT.md sections
  ✓ Any task touching >3 modules
  ✓ Reviewing Sonnet's output (spec + quality)
  ✓ Conflict resolution between features
  ✓ Mid-project adoption baseline (§5)

SONNET 4.6 (Executor) — use when:
  ✓ Single-module implementation (pre-scoped by Opus)
  ✓ File creation per task spec
  ✓ Test writing per task spec (TDD: RED → GREEN → REFACTOR)
  ✓ Schema migrations (pre-planned by Opus)
  ✓ UI components (pre-designed by Opus)
  ✓ Running validations and scans
  ✓ Governance doc updates (mechanical, per template)
```

### Skill Integration

This model uses existing skills — no new skills required:
- `superpowers:subagent-driven-development` — Opus as controller, Sonnet as implementer
- `superpowers:dispatching-parallel-agents` — when Opus identifies independent Sonnet tasks
- `superpowers:writing-plans` — Opus writes task scopes in plan format
- `superpowers:test-driven-development` — Sonnet follows TDD within each task
- `superpowers:verification-before-completion` — Opus runs verification after all tasks

---

## §5 — MID-PROJECT ADOPTION

**For projects already in Phase 7 or 8.** This governance layer is additive —
it works at any point in the project lifecycle without structural changes.

### Adoption Steps

**STEP 1 — Install the governance file**

Copy `memory-governance.md` into your project's `.claude/rules/` directory.
Add this line to the Contextual File Loading table in your project's CLAUDE.md:

```
Any phase pre-flight / context thrashing    .claude/rules/memory-governance.md
```

**STEP 2 — Run a baseline checkpoint (Opus recommended)**

In your next session, run this baseline to seed the memory system:

```
1. Read STATE.md + IMPLEMENTATION_MAP.md + lessons.md
2. Write a Claude Code memory entry (project type) capturing:
   - Current phase and what's been built (summary from IMPLEMENTATION_MAP)
   - Known gotchas (from lessons.md 🔴 entries — distill top 10)
   - Locked decisions (from DECISIONS_LOG.md — distill key ones)
   - What's next
3. Update STATE.md with new fields:
   TOKEN_ESTIMATE, CHECKPOINT_TYPE, FILES_TOUCHED, TIER_CLASSIFICATION
```

This creates the memory baseline. Future sessions get zero-cost context from memory
instead of re-reading 3+ governance docs (~5-10K tokens saved per session).

**STEP 3 — Apply governance to your next task**

Your next Phase 7 Feature Update or Phase 8 Batch:
1. Run Tiered Decomposition (§1) at pre-flight
2. If Tier 3: use Architect-Execute Model (§4) — Opus plans, Sonnet executes
3. Run Smart Checkpoint (§2) on completion

That's it. The governance layer is now active.

**STEP 4 — Retroactive memory seeding (optional, recommended for mature projects)**

For projects with extensive `lessons.md` (50+ entries) or large `DECISIONS_LOG.md`:

```
1. Opus reads lessons.md → distills top 10 🔴 gotchas into a memory entry
2. Opus reads DECISIONS_LOG.md → distills locked decisions into a memory entry
3. These memory entries mean future Sonnet sessions never re-read these files

Estimated savings: ~5-10K tokens per session × remaining project sessions
```

### Thrashing Recovery (emergency — use when currently thrashing)

If you are experiencing thrashing RIGHT NOW in a Phase 7/8 project:

```
1. STOP the current session immediately — do not read more files
2. Commit any partial work: git add -A && git commit -m "WIP: partial [feature]"
3. Open a NEW session with Opus 4.6 (switch model in Claude Code settings)
4. Tell Opus:
   "Run memory governance baseline (memory-governance.md §5 Step 2),
    then decompose my current Phase [7/8] task using Tiered Decomposition (§1).
    I was working on: [describe what you were doing]."
5. Opus reads the context, writes the memory baseline, and produces a
   decomposed task plan that Sonnet can execute without thrashing.
6. Switch back to Sonnet 4.6 for execution of each sub-task.
```

### Why This Works Mid-Project

- **No structural changes** — governance is additive. STATE.md, lessons.md, handoffs all continue working.
- **Memory is cumulative** — each session adds to the baseline. After 2-3 sessions, memory contains enough context that governance docs become verification-only (spot-check, not full-read).
- **Tiered Decomposition uses current state** — it counts files as they exist now, not as planned. A 200-file project gets the same protection as a 20-file project.
- **Opus→Sonnet works at any scale** — the more context a project has, the more valuable Opus becomes as the planning layer. Mature projects benefit the most.

---

## QUICK REFERENCE

```
BEFORE any task:
  1. Count files + modules + dependency depth
  2. Classify: Tier 1 (≤4/1) → proceed | Tier 2 (5-12/2-3) → estimate | Tier 3 (>12/4+) → score & split
  3. If Phase 4/7/8 + Tier 2-3 → use Opus as Architect (§4)

AFTER any task that modified files:
  1. Update STATE.md (enhanced fields)
  2. Write/update Claude Code memory entry
  3. Update lessons.md if gotchas/decisions arose

THRASHING? → STOP → commit → new Opus session → decompose → Sonnet executes
```
