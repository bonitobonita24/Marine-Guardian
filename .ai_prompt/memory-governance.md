# Memory Governance Layer V32 — Token-Efficient Session & Task Management

> **Loaded contextually** when any phase pre-flight runs.
> Read the section relevant to your current task. Do NOT read all sections at once.
> Contains: §1 Tiered Decomposition (V32 file-size-based), §2 Smart Checkpoint, §3 Phase Hooks, §4 Architect-Execute Model (V32 Zero Opus Execution), §5 Mid-Project Adoption.
>
> **V32 change vs V31.4:** Token estimation REPLACED by `wc -l` file-size checks. Opus executor escalation (old Step 2.5b) DELETED entirely. New 500-line dispatch cap.

---

## §1 — TIERED DECOMPOSITION ENGINE (V32)

**Run this BEFORE starting any phase, part, batch, or feature update.**
V32 replaces token estimation with mechanically verifiable line counts.

### Core Principle

**If a task can't be done by Sonnet, it hasn't been decomposed enough.**
Opus escalation for execution is an anti-pattern, not a feature. There is no "last resort." There is no "small justified escalation." The Opus executor path has been removed from the framework.

### Step 1: List Scope

Before dispatching any Sonnet agent, list every file in scope:
1. Files to CREATE (estimate line count)
2. Files to MODIFY (with line ranges if file > 300 lines)
3. Files to READ for context

### Step 2: Run `wc -l`

```bash
wc -l <every file in scope>
```

Calculate: `total_lines = Σ(read + modify + create estimates)`

This is mechanically verifiable. No estimation. No guessing.

### Step 3: Classify Tier (file-size-based)

```
TIER 1 — LIGHTWEIGHT
  Condition: total_lines ≤ 500 AND no single file > 300 lines AND ≤ 4 files AND 1 module
  Action:    Dispatch single Sonnet subagent via Agent(model: "sonnet") per §4

TIER 2 — MODERATE
  Condition: total_lines 501-1500 AND 5-12 files AND 2-3 modules
  Action:    2-3 Sonnet subagents, split by module boundary
             Each sub-task MUST be ≤ 500 total lines

TIER 3 — HEAVY
  Condition: total_lines > 1500 OR > 12 files OR 4+ modules
  Action:    Mandatory split plan. Each sub-task MUST classify as Tier 1 or Tier 2.
             If a sub-task cannot reduce to ≤ 500 lines → defer to next session.
```

### Step 4: Pre-Dispatch Gate (mandatory — V32 R2)

```
FOR EACH Sonnet task BEFORE dispatching:

  IF total_lines > 500:
    → SPLIT FURTHER. Strategies:
      a) Scout-then-edit (V32 R5): Agent 1 reads + summarizes → Agent 2 edits with summary
      b) Section splits: Agent per line range (1-250, 251-500, etc.)
      c) Phase splits: create agent → configure agent → test agent
      d) Module splits: Agent per directory/module

  IF any file to MODIFY is > 300 lines (V32 R3 — Large-File Guard):
    → Task MUST specify line ranges ("edit lines 400-550")
    → OR use Scout-then-edit pattern

  IF total_lines ≤ 500 AND all modify-target files ≤ 300 lines:
    → Safe to dispatch
```

### Failure Protocol (V32 R4 — replaces old Step 2.5b)

**There is no Opus executor escalation. Failure means re-decompose, not escalate.**

```
SONNET RETURNS BLOCKED:
  1. Opus reads BLOCKED reason
  2. IF context problem → provide context, re-dispatch
  3. IF task too large → re-decompose (apply Step 4 to sub-tasks)
  4. IF architecture problem → Opus writes more detailed spec, re-dispatch to Sonnet
  5. IF plan is wrong → escalate to HUMAN (NEVER to Opus execution)

SONNET THRASHES (detected by Opus):
  Signs: re-reads same files, partial output, contradicts prior edits, > 30 min on a simple task
  1. STOP the agent immediately
  2. Identify cause (almost always: file too large or scope too broad)
  3. Re-decompose using scout-then-edit or section splits
  4. NEVER re-dispatch the same task — it will thrash again

AFTER 3 RE-DECOMPOSITION ATTEMPTS ON SAME TASK:
  1. Checkpoint progress to STATE.md
  2. Commit any partial work
  3. Defer remaining work to next session
  4. NEVER fall back to Opus execution
```

### The Five V32 Rules

| Rule | Name | Enforcement |
|------|------|-------------|
| **R1** | Zero Opus Execution | Opus NEVER calls Edit/Write on project files. STATE.md checkpoint is the only Opus write. |
| **R2** | File-Size Dispatch | `wc -l` before every dispatch. ≤ 500 total lines per Sonnet task. |
| **R3** | Large-File Guard | Files > 300 lines need explicit line ranges in the task scope. |
| **R4** | Failure = Split | BLOCKED/thrash → re-decompose (max 3 attempts) → defer. NEVER escalate to Opus. |
| **R5** | Scout-Before-Edit | Files > 200 lines → Sonnet Scout extracts relevant sections first. Edit agent works from scout output. |

### Worked Examples (V32)

**Tier 1 — Add email field to user profile**
Files (with `wc -l`):
- schema.prisma: 180 lines (modify lines 45-65)
- user-router.ts: 120 lines (modify lines 80-110)
- profile-page.tsx: 80 lines (modify lines 30-50)
- user.test.ts: 60 lines (create — estimated 60)

Total: 440 lines, 4 files, 1 module → Tier 1 ✅ dispatch single Sonnet.

**Tier 2 — Add notifications feature**
8 files, 2 modules. Total `wc -l` = 1100 lines.
Split: backend agent (router 200 + service 180 + tests 120 = 500L) + frontend agent (component 250 + page 200 + test 150 = 600L → STILL OVER → split frontend further into component+page agent (450L) + test agent (150L)).
Final: 3 Sonnet agents, each ≤ 500L ✅

**Tier 3 — Multi-tenant billing with Stripe**
18 files, 5 modules, total 3200 lines → mandatory split:
- Schema agent: prisma + migration (300L)
- Router agent: tRPC procedures (500L)
- Webhook agent: Stripe handlers (400L)
- UI agent: billing pages with line ranges (450L)
- Test agent: integration tests (450L)

Each sub-task is Tier 1 ✅

**Anti-pattern — what V32 forbids:**
"This refactor needs full-file understanding of an 1800-line file, so dispatch to Opus with Agent(model: 'opus')."
→ V32 FORBIDS this. Instead: use R5 (Scout-then-edit). Scout extracts a 200-line summary of the relevant sections; edit agent works from the summary. If even the scout output is too large, split by line ranges. Opus NEVER executes.

### Operational Note — Sonnet Subagent Context Overhead (V32.1, 2026-05-27)

**Finding (validated in production Phase 8, Yelli Task 3):** Sonnet subagents dispatched via `Agent(model: "sonnet")` inherit **~30-50K tokens** of baseline context from auto-loaded skills + MCP server descriptions BEFORE any task work begins. This consumes a large portion of Sonnet's working budget and can trigger "Autocompact is thrashing" *earlier* than the 500-line R2 gate would predict.

**Symptoms:**
- Sonnet thrashes on tasks that look small on paper (e.g., 2 files, ~75 lines net change).
- Thrash fires within 6–10 tool uses, before substantive edits complete.
- Re-dispatching the same task at the same scope thrashes again.

**Mitigation pattern (proven):**
1. **Dispatch prompts ≤ ~1K tokens.** Drop all explanation, history, rationale. Hand Sonnet only the exact edits + verify + commit commands.
2. **Per-dispatch tool-use budget ≤ 5.** If the task needs more, split it into sequential micro-dispatches (edit-only → verify → fix → commit as separate Sonnet calls).
3. **Verification runs on the Opus side** via `ctx_execute` (or equivalent sandboxed runner) — keeps test output and typecheck logs out of Sonnet's context.
4. **Decompose by surface, not by feature.** "Edit production file only" + "Append test block only" + "Fix import line only" + "Commit only" — each gets a tiny prompt.
5. **After-thrash check (added 2026-05-27 from Yelli Phase 8 Task 5).** Before re-dispatching recovery work, run `git status` + `git diff` to identify file writes that already landed before Sonnet thrashed. The recovery dispatch should pick up FROM current state — not redo completed edits. Treating thrash as "everything rolled back" causes duplicate writes and risks merge conflicts on partial-write files.

**Worked example (Yelli Phase 8 Batch B sub-4 Task 5, 2026-05-27):** First Sonnet dispatch wrote 4 files (spec, tsconfig, page.tsx data-testid, seed-recording enum fix), then thrashed on the verification step (autocompact fired 3×). Recovery: confirmed all 4 files landed via `git status`; split remaining work into 3 surgical Sonnet dispatches — (a) typeRoots/tsconfig fix, (b) enum fixes in seed-recording.ts, (c) commit. Each dispatch ≤ ~1K-token prompt, ≤ 5 tool uses. Result: Web typecheck 0 errors, vitest 473/473, E2E tsc 0 errors after recovery.

**Relationship to R4:** If thrash persists after the first re-decomposition, do NOT keep retrying the same scope. Re-decompose to a smaller surface (single file, then sub-file). R4's max-3-attempts rule applies to each task; each re-decomposition resets the counter only if the scope genuinely shrank.

**When this matters most:** Phase 4 Parts with heavy test infrastructure, Phase 8 Tasks touching files already at 200–300L, any task where the Sonnet agent must read existing test mocks or fixtures before editing.

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
LINES_TOUCHED: "~[N] lines created/modified this session"
CHECKPOINT_TYPE: "full | lightweight"
FILES_TOUCHED: ["path/to/file1.ts", "path/to/file2.tsx", ...]
TIER_CLASSIFICATION: "[1|2|3] — [lightweight|moderate|heavy]"
```

> **V32 note:** STATE.md is the ONE file Opus is permitted to write directly (the checkpoint exception to R1). All other writes — including governance docs — must be dispatched to Sonnet.

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
Lines touched: ~[N] (file-size dispatch verified)
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

### Hook Text (V32 — injected into each phase)

```
⚠ MEMORY GOVERNANCE (memory-governance.md):
  PRE:   Run Tiered Decomposition (§1) — `wc -l` all files in scope, ≤ 500 lines per Sonnet task.
  POST:  Run Smart Checkpoint (§2) if any files were created or modified.
  MODEL: ZERO OPUS EXECUTION (V32). Opus's only allowed actions in this session are: read context, plan, decompose, review Sonnet output, write STATE.md checkpoint. ALL other file writes (code, configs, governance docs, tests) MUST be dispatched via Agent(model: "sonnet") per §4. Before each dispatch: run `wc -l` on every file in scope; total ≤ 500 lines per Sonnet task; files > 300 lines need explicit line ranges. NO exceptions. NO "last resort." NO Opus executor escalation. If you find yourself about to call Edit/Write on a project file, STOP and dispatch.
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

- The Universal Context Budget (80K safe zone for Sonnet's own session, 12-file threshold) remains valid.
- The V32 Tiered Decomposition Engine (§1) uses file-size checks (`wc -l`) — mechanically verifiable, not estimated.
- Phase-specific anti-thrashing rules (Phase 8 sub-batches, Phase 4 fresh context) remain valid.
- This layer adds structure on top — it does not replace existing protections.

---

## §4 — ARCHITECT-EXECUTE MODEL — ZERO OPUS EXECUTION (V32)

**Use this for ALL phase work and ad-hoc edits.**
Opus 4.6 plans, decomposes, and reviews. Sonnet 4.6 executes ALL file writes.

### Why Two Models — and Why Opus Never Executes

- **Opus 4.6** excels at complex reasoning: reading large context, analyzing dependencies, making decomposition decisions, reviewing code quality. Higher cost per token. **Used only for planning and review.**
- **Sonnet 4.6** excels at following structured instructions: writing code, running tests, committing. Lower cost. **Used for ALL execution.**

By separating planning from execution, Sonnet never needs to read full PRODUCT.md or reason about decomposition. One Opus planning session enables many parallel Sonnet executions.

**V32 hard rule:** Opus NEVER calls Edit/Write on project files. If a task requires Opus to "just write it inline," the task hasn't been decomposed enough.

### Opus Role (strictly limited — V32 R1)

```
OPUS MAY:
  ✓ Read files for planning context
  ✓ Run `wc -l` for size checks
  ✓ Classify tiers and write split plans
  ✓ Write Sonnet task scopes
  ✓ Dispatch Agent(model: "sonnet") subagents
  ✓ Review Sonnet output (spec compliance + quality)
  ✓ Re-decompose failed tasks
  ✓ Write STATE.md checkpoints (the ONE permitted Opus write)
  ✓ Dispatch Sonnet Scouts for large discovery reads (R5)

OPUS MAY NOT:
  ✗ Call Edit on any project file
  ✗ Call Write on any project file (except STATE.md)
  ✗ "Quickly fix" anything inline
  ✗ "Small justified escalation" — phrase is BANNED
  ✗ Execute code changes under any rationalization
  ✗ Invoke Agent(model: "opus") for execution tasks — the path is REMOVED
```

### Execution Flow

```
PHASE BOUNDARY REACHED
  │
  ▼
OPUS SESSION (Architect)
  1. Read STATE.md → orient to current phase position
  1.5. SONNET SCOUT (V32 R5 — mandatory for files > 200 lines):
       IF the task requires reading any file > 200 lines, OR > 2 PRODUCT.md sections, OR > 2 governance docs, OR > 5 source files:
         Dispatch a Sonnet "scout" subagent: Agent(model: "sonnet") with a tight question
         (e.g., "Summarize Module X in PRODUCT.md and list the schema entities it touches — under 300 words").
         Opus receives the summary and plans from it instead of reading the files directly.
       Saves ~40-60% of Opus discovery tokens on mature projects.
  2. Read relevant PRODUCT.md sections + governance docs (or use Sonnet Scout summary from step 1.5)
  3. Run Tiered Decomposition (§1) → `wc -l` files, classify tier
  4. IF Tier 1: dispatch single Sonnet subagent directly
  5. IF Tier 2-3: write task scope(s), dispatch Sonnet subagent(s) — each ≤ 500 lines
  6. For each Sonnet task:
     → Dispatch via Agent(model: "sonnet", prompt: [task instructions])
     → Sonnet builds, tests, commits, reports status
     → Opus reviews: spec compliance first, then code quality
     → If issues found: re-dispatch Sonnet (never Opus). Max 3 attempts then defer.
  7. After all tasks complete: run Smart Checkpoint (§2)
  8. Session ends
```

### Task Scope Format (what Opus gives Sonnet)

Each dispatched Sonnet subagent receives a self-contained prompt.
**Every task MUST include file-size totals. If total_lines > 500 → do not dispatch, split further.**

```markdown
# Task: [Phase N] — [Module Name]
Tier: [1|2] | Total lines: ~[N] (MUST be ≤ 500)

## File Sizes (verified via wc -l)
- path/to/file1.ts: 120 lines (modify lines 45-80)
- path/to/file2.ts: 85 lines (create — estimated 85 lines)
- path/to/file3.ts: 200 lines (read for context only)
Total: 405 lines ✅

## Scope
Files to create: [explicit list]
Files to modify: [explicit list — LINE RANGES required for files > 300 lines]
Files to read (context only): [explicit list — ONLY these]

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
- Use Edit for modifications (not Write for existing files)
- Do NOT read files outside the scope list
- Do NOT read full PRODUCT.md — everything you need is above
- Do NOT make decomposition decisions — follow this scope exactly
- Report status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

### Sonnet Status Handling (V32)

```
DONE
  → Opus proceeds to spec compliance review

DONE_WITH_CONCERNS
  → Opus reads concerns before reviewing
  → If correctness/scope issue → re-dispatch Sonnet with corrected scope
  → If observation (e.g., "file is getting large") → note and proceed

NEEDS_CONTEXT
  → Opus provides missing context (or dispatches scout to gather it), re-dispatches same task

BLOCKED
  → Opus assesses (V32 R4):
    1. Context problem → provide more context, re-dispatch
    2. Architecture problem → Opus writes more detailed spec, re-dispatch to Sonnet
    3. Task too large → Opus re-decomposes into smaller pieces (apply §1 Step 4)
    4. Plan is wrong → escalate to HUMAN (NEVER to Opus execution)

THRASHING (detected by Opus — not self-reported)
  Signs: Sonnet re-reads same files multiple times, produces partial output,
         loses track of earlier tool results, or contradicts its own prior edits.
  → Cause is almost always: file > 300 lines without line range, OR scope too broad.
  → Response: STOP the agent. Re-decompose using R5 (scout-then-edit) or section splits.
  → Do NOT re-dispatch the same task — it will thrash again.

AFTER 3 RE-DECOMPOSITION ATTEMPTS ON SAME TASK:
  → Checkpoint progress to STATE.md (the one Opus write).
  → Commit any partial work via Sonnet.
  → Defer remaining work to next session.
  → NEVER fall back to Opus execution. The Opus executor path is removed in V32.
```

### When to Use Each Model (V32)

```
OPUS 4.6 (Architect — planning + review ONLY) — use when:
  ✓ Phase planning and decomposition
  ✓ Cross-module dependency analysis
  ✓ Tier classification and split planning
  ✓ Governance Sync and Retrospectives
  ✓ Any task requiring synthesis across > 3 PRODUCT.md sections
  ✓ Reviewing Sonnet's output (spec + quality)
  ✓ Conflict resolution between features
  ✓ Mid-project adoption baseline (§5)
  ✗ NEVER for file writes (R1)

SONNET 4.6 (Executor — ALL file writes) — use when:
  ✓ Any implementation work (pre-scoped by Opus)
  ✓ File creation per task spec
  ✓ Test writing per task spec (TDD: RED → GREEN → REFACTOR)
  ✓ Schema migrations (pre-planned by Opus)
  ✓ UI components (pre-designed by Opus)
  ✓ Running validations and scans
  ✓ Governance doc updates (mechanical, per template)
  ✓ Sonnet Scout duties (large discovery reads → summary)
  ⚠ HARD LIMIT: Each Sonnet task ≤ 500 total lines (see §1 Step 4)
  ⚠ Files > 300 lines require explicit line ranges in scope
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
   LINES_TOUCHED, CHECKPOINT_TYPE, FILES_TOUCHED, TIER_CLASSIFICATION
```

This creates the memory baseline. Future sessions get zero-cost context from memory
instead of re-reading 3+ governance docs (~5-10K tokens saved per session).

**STEP 3 — Apply governance to your next task**

Your next Phase 7 Feature Update or Phase 8 Batch:
1. Run Tiered Decomposition (§1) at pre-flight — `wc -l` all files in scope
2. ALL tiers: use Architect-Execute Model (§4) — Opus plans/reviews, Sonnet executes all file writes
3. Run Smart Checkpoint (§2) on completion

That's it. The governance layer is now active.

**STEP 4 — Retroactive memory seeding (optional, recommended for mature projects)**

For projects with extensive `lessons.md` (50+ entries) or large `DECISIONS_LOG.md`:

```
1. Opus dispatches a Sonnet Scout → distills top 10 🔴 gotchas from lessons.md into a memory entry
2. Opus dispatches a Sonnet Scout → distills locked decisions from DECISIONS_LOG.md into a memory entry
3. These memory entries mean future Sonnet sessions never re-read these files

Estimated savings: ~5-10K tokens per session × remaining project sessions
```

### Thrashing Recovery (emergency — use when currently thrashing)

If you are experiencing thrashing RIGHT NOW in a Phase 7/8 project:

```
1. STOP the current session immediately — do not read more files
2. Dispatch a Sonnet agent to commit partial work: git add -A && git commit -m "WIP: partial [feature]"
3. Open a NEW session with Opus 4.6 (switch model in Claude Code settings)
4. Tell Opus:
   "Run memory governance baseline (memory-governance.md §5 Step 2),
    then decompose my current Phase [7/8] task using V32 Tiered Decomposition (§1).
    I was working on: [describe what you were doing]."
5. Opus reads the context, writes the memory baseline (STATE.md only), and dispatches
   Sonnet subagents for each sub-task — each ≤ 500 lines.
```

### Why This Works Mid-Project

- **No structural changes** — governance is additive. STATE.md, lessons.md, handoffs all continue working.
- **Memory is cumulative** — each session adds to the baseline. After 2-3 sessions, memory contains enough context that governance docs become verification-only (spot-check, not full-read).
- **Tiered Decomposition uses current state** — it counts lines in files as they exist now, via `wc -l`. A 200-file project gets the same protection as a 20-file project.
- **Opus→Sonnet works at any scale** — the more context a project has, the more valuable Opus becomes as the planning layer. Mature projects benefit the most.

---

## QUICK REFERENCE (V32)

```
BEFORE any task:
  1. List files in scope (create + modify + read)
  2. Run `wc -l` on each — calculate total
  3. Classify: Tier 1 (≤500 total + ≤4 files + 1 module) → dispatch
              | Tier 2 (501-1500) → split by module, each sub-task ≤ 500
              | Tier 3 (>1500) → mandatory multi-agent split, each sub ≤ 500
  4. ALL tiers → dispatch to Sonnet via §4. Opus NEVER executes file writes.

THE FIVE V32 RULES:
  R1 Zero Opus Execution     Opus never Edit/Write on project files (STATE.md exception only)
  R2 File-Size Dispatch      ≤ 500 total lines per Sonnet task
  R3 Large-File Guard        Files > 300 lines → explicit line ranges in scope
  R4 Failure = Split         BLOCKED/thrash → re-decompose (max 3) → defer. NEVER escalate to Opus.
  R5 Scout-Before-Edit       Files > 200 lines → Sonnet Scout extracts context first

AFTER any task that modified files:
  1. Opus writes STATE.md (the ONE permitted Opus write)
  2. Dispatch Sonnet to write/update memory entry
  3. Dispatch Sonnet to update lessons.md if gotchas/decisions arose

THRASHING? → STOP → checkpoint STATE.md → new Opus session → re-decompose → Sonnet executes
```
