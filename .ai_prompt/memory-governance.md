# Memory Governance Layer V32 — Token-Efficient Session & Task Management

> **Loaded contextually** when any phase pre-flight runs.
> Read the section relevant to your current task. Do NOT read all sections at once.
> Contains: §1 Tiered Decomposition (V32 file-size-based), §2 Smart Checkpoint (+ V32.8 evidence field), §3 Phase Hooks (18 total — V32.9), §4 Architect-Execute Model (V32 Zero Opus Execution), §5 Mid-Project Adoption, §6 Learning Registry & Recurrence (V32.8).
>
> **V32 change vs V31.4:** Token estimation REPLACED by `wc -l` file-size checks. Opus executor escalation (old Step 2.5b) DELETED entirely. New 500-line dispatch cap.
> **V32.8 additions:** §2 gains required evidence field `{contract, check_command, captured_output}` on all done-claims. §3 phase-hook count 14 → 17 (Hooks 15-17: work-start registry consult, done-claim evidence capture, failure-time fingerprint→scan→strengthen). §6 (new): Learning Registry & Recurrence — `LESSONS_REGISTRY.md`, two-part fingerprint, three consult points, recurrence response protocol, promotion checklist.
> **V32.9 additions:** §3 phase-hook count 17 → 18 (Hook 18: compliance/data-privacy gap-surfacing — fires during all build phases to surface missing consent, DSR endpoints, retention, breach handling, and lawful basis before Phase 5). See `.ai_prompt/privacy.md` for the full PH DPA compliance model.

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
dispatch_ratio:
  sonnet_writes: <N>
  opus_writes: <N>
  ratio: <sonnet_writes / opus_writes>
  target: ≥ 3.0
  status: PASS | WARN | FAIL
```

> **V32 note:** STATE.md is the ONE file Opus is permitted to write directly (the checkpoint exception to R1). All other writes — including governance docs — must be dispatched to Sonnet.

> **`sync-context.sh` (V32.20)** — Immediately after rewriting STATE.md, run `bash scripts/sync-context.sh` to refresh the `AIEF:MANAGED` region in the project's CLAUDE.md (Phase / Locked stack / Last done / Next / Blockers / Recent CHANGELOG). The regenerator is idempotent — it is a pure function of docs/STATE.md + DECISIONS_LOG.md/PRODUCT.md + CHANGELOG_AI.md, and no-ops (no write, no mtime change) if the rendered block is unchanged. This does not add a new phase hook or change the 18-hook count — it is a mechanical tail step of the existing Smart Checkpoint POST action (see §3 Hook Text below).

> **`dispatch_ratio` (V32.2)** — Append the dispatch-ratio block per §4 R9 (sonnet_writes / opus_writes, target ≥ 3.0, status PASS/WARN/FAIL). FAIL triggers a `lessons.md` entry. See §4 R9 (Dispatch Ratio Metric) — every checkpoint MUST include the `dispatch_ratio` block.

> **`evidence` (V32.8 Rule 32) — REQUIRED on every done-claim.** A checkpoint that claims "done", "fixed", or "no work left" MUST carry the evidence block below. A checkpoint without a populated evidence block is a **structurally malformed artifact** — it is not a valid done-claim.

```yaml
evidence:
  contract: "<the acceptance criterion, written BEFORE work started>"
  check_command: "<machine command run — e.g. 'curl -s -o /dev/null -w \"%{http_code}\" http://…' OR 'npm test' OR 'grep -c …'
                  OR 'human-attestation: <who/why>' for the labeled exception (design sign-off, UX feel, product intent)>"
  captured_output: "<the actual output proving pass — e.g. '200', '43 passed', '3 matches'>"
```

**Machine-executable check = DEFAULT.** `curl`, test runners, `grep`, lint, build-passes, `toHaveScreenshot` (Rule 31's visual gate is one instance). **Human-attestation = labeled exception** — reserved for what a machine genuinely cannot judge; must name *who* attested and *why* machine verification was impossible. The label keeps attestation auditable and prevents it silently becoming the lazy default. **Proportionality rule:** trivial tasks — one-line check (e.g. `grep "import X" file.ts` → `1`); substantial/risky tasks — full criteria block with multiple check rows. The discipline scales to the stakes.

The evidence block also triggers a **registry consult** (§6): scan `LESSONS_REGISTRY.md` for fingerprints matching the surface being claimed done. A known failure-mode must not sail through unverified. See §6 for the full consult protocol.

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

> **V32.7 load mechanism:** `memory-governance.md` is no longer auto-loaded via `.claude/rules/`.
> It now lives in `.ai_prompt/`. Every phase pre-flight in `phases.md` instructs reading this file
> before running these hooks; short-form blocks carry an explicit **`Read .ai_prompt/memory-governance.md`**
> inline, while full-form blocks also carry the governance summary inline as a self-contained fallback.
> The coupling is mechanical — do NOT weaken the phase pre-flight Read after this change.

### Hook Text (V32.3 — injected into each phase)

```
⚠ MEMORY GOVERNANCE (memory-governance.md):
  PRE:   Run Tiered Decomposition (§1) — `wc -l` all files in scope, ≤ 500 lines per Sonnet task.
  POST:  Run Smart Checkpoint (§2) if any files were created or modified. After STATE.md is
         rewritten, run `bash scripts/sync-context.sh` to refresh CLAUDE.md's AIEF:MANAGED region
         (V32.20 — idempotent, no-op if unchanged).
  MODEL: ZERO OPUS EXECUTION (V32.3). Opus's only allowed actions in this session are: read context, plan, decompose, review Sonnet output, write STATE.md checkpoint. ALL other file writes (code, configs, governance docs, tests) MUST be dispatched via Agent(model: "sonnet") per §4. Before each dispatch: run `wc -l` on every file in scope; total ≤ 500 lines per Sonnet task; files > 300 lines need explicit line ranges. Allow-list governance docs > 200 lines MUST also go through Scout-Sonnet with the Governance Extraction Schema (§4) — direct Opus read of a > 200-line allow-list doc counts as `opus_writes` for `dispatch_ratio`. NO exceptions. NO "last resort." NO Opus executor escalation. If you find yourself about to call Edit/Write on a non-allow-list project file, STOP and dispatch.
```

### Injection Points (18 hooks total — V32.9)

The original 14 governance hooks cover every Claude-Code-executed phase (one per pre-flight). V32.8 Rule 32 adds **3 new hook types** that fire within those phases at specific task boundaries — they are not new phase pre-flights but distinct consult/capture points:

**Hook 15 — Work-Start Registry Consult** (fires at the start of every dispatched task/batch)
Before any work begins on a task or wave, scan `LESSONS_REGISTRY.md` for fingerprints matching the target surface. If a match exists, surface it to the operator before proceeding. Direct fix for Orqafy phantom-wire ($58 wave on already-wired surfaces) and MG "no work left" (unfalsifiable claim). Cross-references `phases.md` work-start consult step.

**Hook 16 — Done-Claim Evidence Capture** (fires at every task/batch completion before marking done)
Run the acceptance contract check and capture `{contract, check_command, captured_output}` into STATE.md / the checkpoint. Also scan `LESSONS_REGISTRY.md` for surface-relevant fingerprints so a known failure-mode cannot sail through unverified. A claim with an empty evidence block is structurally malformed — the Stop hook (deliverable #19 `settings.json`) blocks it. Cross-references `superpowers:verification-before-completion` and `phases.md` done-claim step.

**Hook 17 — Failure-Time Fingerprint→Scan→Strengthen** (fires whenever a build/test/gate/human-report failure occurs)
Fingerprint the failure using the two-part fingerprint (see §6). Scan `LESSONS_REGISTRY.md`. If a match exists AND the standing check should have caught this → the check **eroded** → STRENGTHEN it (don't just re-fix). If novel → promotion candidate. Cross-references `phases.md` failure-handling step and §6 recurrence-detection protocol.

**Hook 18 — Compliance & Data-Privacy Gap-Surfacing** (fires at the start of every build phase pre-flight — V32.9 Rule 33)
Before ANY Phase 4 Part, Phase 7 Feature Update, or Phase 8 Batch begins work on data-touching surfaces (models, API routes, auth flows, storage, file uploads), read `.ai_prompt/privacy.md` and actively surface any gap in the following areas:

```
COMPLIANCE GAP SCAN — surfaces to check:
  □ Consent capture — is lawful basis (consent, legitimate interest, or legal obligation per PH DPA Art. 12)
    declared for every personal data field being collected or processed?
  □ DSR endpoints — do the tRPC router(s) in scope expose Data Subject Request procedures
    (access, rectification, erasure, portability, object) per RA 10173 §16?
  □ Data retention — does the Prisma schema have retention/deletion fields (retainedUntil, deletedAt)
    for tables holding personal data?
  □ Breach handling — is there a breach-notification stub (72-hour NPC report trigger per RA 10173 §20)?
  □ Third-party disclosure — does PRODUCT.md §7 (Integrations) declare all processors that receive
    personal data, and does the app have a data-processing agreement placeholder?
  □ WCAG 2.2 AA (gov/LGU) — if client flag is set, verify accessibility-agents is wired into
    this build phase (cross-references ui-rules.md Rule 13).

OUTPUT: List every gap found as a 🔴 item. If no gaps: log "Hook 18 — privacy scan clean" to STATE.md.
Do NOT silently proceed past gaps — surface them before writing any file.
```

This hook replaces passive silence with active gap-detection. It does not block the phase on its own — it surfaces gaps so the developer can resolve them before they compound. Critical gaps (missing consent on a new personal-data field, missing DSR routes on a new entity) MUST be resolved before Phase 5 may close. Non-critical gaps (audit-log refinements, third-party DPA placeholders) may be logged as deferred items in DECISIONS_LOG.md.

Read: `.ai_prompt/privacy.md` — the full PH DPA compliance model.

---

The original 14 governance hooks (pre-flight blocks per phase):

1. Phase 2 (Discovery Interview)
2. Phase 3 (Generate Spec Files)
3. Phase 3.3 (Interactive Prototype & Simulation — NEW V32.6)
4. Phase 3.5 (Execution Plan)
5. Phase 4 Parts 1-2 (Monorepo + shared packages)
6. Phase 4 Parts 3-4 (Prisma schema + tRPC/Auth/security)
7. Phase 4 Parts 5-6 (Next.js web + Expo mobile UI)
8. Phase 4 Parts 7-8 (Background jobs + storage)
9. Phase 5 (Validation)
10. Phase 6 (Docker + Visual QA)
11. Phase 6.5 (Error Triage)
12. Phase 7 (Feature Update)
13. Phase 7R (Feature Rollback)
14. Phase 8 (Iterative Buildout)

Phase 0 (Bootstrap), Phase 1 (Concept), Phase 2.7 (Pre-PRD checkpoint), and Phase 2.8 (Mockup) are human-executed in Claude.ai — no agent-side hook required. Designer-skills MODEL HOOKs at Phase 2.8 / Phase 4 Parts 5-6 / Phase 7 (V32.5) layer on top of the governance hook; they are gate-keepers, not separate budget hooks. Likewise the Back-Port Surface Check MODEL HOOKs at Phase 7 + Phase 8 — the spec check (V32.5.5: `docs/DECISIONS_LOG.md` ↔ `docs/PRODUCT.md`) and the design check (V32.7.3: live `globals.css`/Tailwind theme tokens ↔ `docs/DESIGN.md`/`docs/MOCKUP.jsx` baseline) — are non-blocking pre-flight surfacing steps that layer on top of the existing Phase 7/Phase 8 governance hook; they are NOT new §3 injection points. Hooks 15-17 (V32.8) are task-boundary hooks, not phase pre-flights — they fire within phases at specific points per Rule 32.

### Relationship to Existing Rules

- The Universal Context Budget (80K safe zone for Sonnet's own session, 12-file threshold) remains valid.
- The V32 Tiered Decomposition Engine (§1) uses file-size checks (`wc -l`) — mechanically verifiable, not estimated.
- Phase-specific anti-thrashing rules (Phase 8 sub-batches, Phase 4 fresh context) remain valid.
- This layer adds structure on top — it does not replace existing protections.

### Output Equivalence Guarantee (V32.5.1)

Tiered Decomposition is **result-preserving**: a Tier-3 task executed as N Sonnet sub-batches produces the same final committed state as a hypothetical single-context execution would have. The split exists to bound each executor's context, not to alter what gets built. Concretely:
- Sub-batches are scoped by module boundary or file group, not by arbitrary line cuts mid-function.
- STATE.md persists the join state between sub-batches so the next batch resumes with full prior context.
- Smart Checkpoint (§2) records `dispatch_ratio` + `files_changed` so an auditor can verify the sum-of-parts equals the would-have-been whole.
- If a sub-batch reveals that an earlier batch made a now-wrong decision, Opus re-plans (Tier reassessment) rather than papering over — Output Equivalence is the contract.

### Mid-Session Thrash Rescue

If a Sonnet swarm starts thrashing mid-phase (context overflow, repeated retries, incoherent diffs), invoke **Prompt 3.19 (Emergency Anti-Thrashing)** from `.ai_prompt/Prompt_References.md` — a general-purpose Opus rescue prompt that re-decomposes the interrupted work, writes a fresh STATE.md checkpoint, and dispatches a clean Sonnet batch from a smaller scope. Do NOT escalate to Opus-executor as a workaround — that violates R1 (Zero Opus Execution).

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
DONE (V32.2 tightened — diff-review mandatory)
  → Opus reads the full diff returned by Sonnet, OR runs `git diff` against prior commit.
  → Diff review is the quality gate. Review-by-summary is FORBIDDEN.
  → If diff was not read in full → task is NOT DONE; re-dispatch with explicit "return diff in full" instruction.
  → Then proceed: spec compliance review → quality review (V32 two-stage).

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

### Dispatch Discipline Rules (V32.2)

Four new rules added 2026-06-01 to address the dominant Opus-token leak: exploratory reads, serial dispatches, and silent R1 bypasses on "small" edits.

**R6 Scout-Before-Plan (V32.2)**

Opus's exploratory reads burn architect attention without improving decisions. Any source/config/test file > 100 lines that Opus needs to understand for planning MUST be summarized by a Scout-Sonnet:

```
Agent(
  model: "sonnet",
  subagent_type: "Explore",
  prompt: "Extract from <path>: [structured schema — e.g., 'every Edit/Write call site,
           the auth check before each, any tenant-scope filter']. Return as JSON.
           Do NOT summarize freeform — match the schema exactly."
)
```

**Architect-read allow-list** (Opus reads directly when ≤ 200 lines; files > 200 lines route through Scout-Sonnet with the **Governance Extraction Schema** below — V32.3):
- `docs/PRODUCT.md` (source of truth, Rule 1)
- `docs/STATE.md`, `docs/DECISIONS_LOG.md`, `docs/CHANGELOG_AI.md`, `docs/IMPLEMENTATION_MAP.md`
- `.cline/STATE.md`
- `.claude/rules/*.md`, `.ai_prompt/*.md` (framework governance — session-start only)

R6 extends R5 (Scout-Before-Edit) from Sonnet's editing context to Opus's planning context. **V32.3 closes the "growing governance doc" loophole** — as allow-list docs grow past 200 lines, Smart Hydration keeps them Scout-mediated rather than burning the full file into Opus context.

**Governance Extraction Schema (V32.3 — Smart Governance Hydration)**

Per-doc extraction contract for the 9 governance docs of Rule 4. Scout-Sonnet returns the schema below — Opus consumes the hydration brief, never the full file (when > 200 lines).

```
governance_hydration:
  task_domain: "<keyword[,keyword,...] for filtering — derived from current task>"

  lessons_md:                       # .cline/memory/lessons.md
    gotchas_in_full: [...]          # ALL 🔴 entries — verbatim
    decisions_in_full: [...]        # ALL 🟤 entries — verbatim
    keyword_matched: [...]          # remaining entries whose title matches task_domain

  product_md:                       # docs/PRODUCT.md
    sections_for_task: [...]        # sections matching task_domain (e.g., "Module X", "Role Y")
    out_of_scope_relevant: bool     # true if task touches anything listed in Out of Scope

  inputs_yml:                       # full read (always small + structural)

  inputs_schema_json:                # full read (always structural)

  changelog_ai_md:                  # docs/CHANGELOG_AI.md
    recent_entries: [...]           # last N entries (default N = 20)
    red_flagged: [...]              # any 🔴 entries regardless of recency
    task_domain_hits: [...]         # entries whose summary matches task_domain

  decisions_log_md:                 # docs/DECISIONS_LOG.md
    matched_decisions: [...]        # decisions matching task_domain — verbatim
    all_unresolved: [...]           # every unresolved decision regardless of domain

  implementation_map_md:            # docs/IMPLEMENTATION_MAP.md
    area_status: [...]              # status of areas touched by task_domain
    blocked_or_partial: [...]       # any area in BLOCKED / PARTIAL state regardless

  project_memory_md:                # full read (always small + ambient)

  agent_log_md:                     # .cline/memory/agent-log.md
    current_session: [...]          # action entries from current session
    task_domain_hits: [...]         # action entries matching task_domain from prior sessions

  hydration_metadata:
    files_scout_hydrated: <int>     # how many of the 9 went through Scout
    files_direct_read: <int>        # how many were ≤ 200 lines (direct)
    files_missing: [...]            # files that don't exist yet
    total_brief_tokens: <int>       # estimated brief size returned to Opus
```

**Dispatch template:**

```
Agent(
  model: "sonnet",
  subagent_type: "Explore",
  prompt: "Hydrate the 9 governance docs for task: '<one-line task summary>'.
           task_domain keywords: <keyword,keyword,...>.
           Return the V32.3 Governance Extraction Schema exactly — JSON-ish blocks
           with VERBATIM quotes for 🔴/🟤 entries, matched decisions, and
           BLOCKED/PARTIAL areas. Do NOT summarize freeform. Mark files > 200 lines
           as scout-hydrated; files ≤ 200 lines may be direct-read sections."
)
```

**Size threshold:** 200 lines. Files at exactly 200 lines: direct read. Files > 200 lines: Scout. The threshold is mechanically verifiable via `wc -l` — the same instrument R2/R3/R5 use. **Why 200 not 100:** R6 already uses 100 lines for arbitrary non-allow-list source files. Allow-list governance docs are higher-signal-per-line (decisions, status entries, attributed changelog records) than arbitrary source files, so the threshold is doubled. Anything > 200 lines is large enough that the hydration brief saves Opus context significantly.

**Why Rule 4 reframed from "read" to "hydrate":** Reading implies full-file ingestion. Hydration means "load the task-relevant slice into context". The 9-file list stays (provenance, integrity, and the audit trail for what was checked) — but the mechanism is now Scout-mediated for any file that has grown past the threshold. Opus context stays small. Sonnet handles the read.

**R9 interaction (V32.3 — counted as an Opus burn):** A direct Opus read of a > 200-line allow-list governance doc counts as an `opus_writes` event for `dispatch_ratio` purposes. The metric treats Opus context burn as the equivalent failure mode to an Opus Edit/Write call — both indicate dispatch discipline drift. Smart Checkpoint logs the file path and line count in the drift entry so the operator can audit which docs grew past the threshold without triggering Scout.

**R7 Default Parallel Fan-Out (V32.2)**

When Opus dispatches ≥ 2 Sonnet subagents whose tasks have NO inter-dependency, they MUST go in a SINGLE response with multiple Agent tool calls (parallel). Inter-dependency must be declared in the dispatch plan ("task B reads task A's output"). Otherwise: parallel by default.

```
// CORRECT — parallel:
[single response]
  Agent(prompt: "task A scope...")
  Agent(prompt: "task B scope...")
  Agent(prompt: "task C scope...")

// FORBIDDEN — serial (unless N depends on N-1):
[response 1]: Agent(prompt: "task A scope...")
  ↓ wait for result
[response 2]: Agent(prompt: "task B scope...")
```

Wall-clock savings compound: 3 parallel dispatches ≈ 1 dispatch worth of wall-clock; 3 serial ≈ 3×. Token savings: Opus reasoning between dispatches is eliminated.

**R8 Opus Write Allow-List (V32.2)**

Closes R1's "STATE.md exception only" wording with an enumerated CLOSED list. Opus MAY directly call Edit/Write ONLY on:

```
docs/STATE.md
docs/DECISIONS_LOG.md
docs/CHANGELOG_AI.md
docs/IMPLEMENTATION_MAP.md
.cline/STATE.md
```

ALL other paths (source code, configs, tests, schemas, governance docs not listed, framework files) MUST be dispatched to Sonnet via `Agent(model: "sonnet")`. The list is CLOSED — additions require a Master Prompt revision, not session-level discretion. If a path is not on the list and Opus is about to Edit/Write, STOP and write a Sonnet dispatch scope instead.

**R9 Dispatch Ratio Metric (V32.2)**

Every Smart Checkpoint (§2) MUST append to `docs/STATE.md`:

```
dispatch_ratio:
  sonnet_writes: <count of Sonnet Edit/Write calls this session>
  opus_writes: <count of Opus Edit/Write calls this session>
  ratio: <sonnet_writes / opus_writes>
  target: ≥ 3.0
  status: PASS (≥3.0) | WARN (1.0–2.99) | FAIL (<1.0)
```

`FAIL` status triggers a `docs/lessons.md` entry for the next session:
> "Dispatch discipline drift — review which Opus writes should have been Sonnet dispatches. Session <id> ended with ratio <X>."

The metric is per-session, not cumulative. Resets at each new Claude Code session. Counts are gathered by inspecting the session's tool-call log at Smart Checkpoint time.

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

Run `deploy.sh` (or `spec-update`) to copy `memory-governance.md` into your project's `.ai_prompt/` directory (V32.7 — was `.claude/rules/` in V32.6.1 and earlier).
The Contextual File Loading table in CLAUDE.md already contains the correct Read command:

```
Context thrashing / task decomposition    Read .ai_prompt/memory-governance.md
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

### Flow-Back reconcile loop (V32.21)

When a discovery lands in the code/config/ops layer instead of `docs/PRODUCT.md` first —
the common brownfield/mid-project pattern — use the **Flow-Back** path named in
Master_Prompt.md Rule 1's Spec-Persistence Model addendum: capture the discovery in the
closest artifact, then reconcile the rest of the spec set back up to it. The full 5-step
procedure (capture → classify → update disagreeing artifacts → run the cross-artifact
gap-check → resume) is **Scenario 40** in `scenarios.md`. The gap-check itself is
`scripts/spec-gap-check.sh` (deliverable #28, also reachable as Prompt 2.9 — Validate
Spec Consistency) — a read-only, non-blocking scan of `docs/PRODUCT.md` ↔ `inputs.yml`
↔ the Prisma schema ↔ `docs/IMPLEMENTATION_MAP.md` ↔ `docs/STATE.md`. Use it any time
Mid-Project Adoption (above) or a Feature Update reveals that the artifact set may have
drifted from reality — it is the cheap check that tells you whether Step 3 above
("Apply governance to your next task") is starting from a trustworthy baseline.

---

## §6 — LEARNING REGISTRY & RECURRENCE (V32.8 Rule 32)

**Read this section when:** promoting a lesson, investigating a recurrence, or needing to understand the registry consult protocol. The three mandatory consult points (work-start Hook 15, done-claim Hook 16, failure-time Hook 17) are defined in §3 above.

### The Canonical Registry

**File:** `LESSONS_REGISTRY.md` — framework repo, canonical, append-only. Mirrored to a `/memory` index entry (a one-line-per-entry summary keyed by fingerprint) so the conductor can consult cheaply without loading the full file. Created in a companion V32.8 task; reference it here as the single consult surface.

**Entry shape:**

```yaml
- fingerprint:
    tuple: "<scope>.<category>.<surface>"          # e.g. framework.docker-build.worker-image
    machine_signature: "<CVE-ID | error-code | normalized-regex>"  # optional; omit if not machine-emitted
  scope: project | framework | conductor
  failure: "<plain-language description of what broke>"
  standing_check: "<the check that should catch this going forward>"
  check_location: "<where the check lives — e.g. lint-deploy.sh C9, templates.md Rule 5c, /memory feedback_copy_dot_dot.md>"
```

**Scope routes the CHECK, not the index.** The index is single; the check lands in its destination:

| Scope | Example | Check lands in | Reaches new apps via |
|---|---|---|---|
| **project** | "this app's X needs Y" | `lessons.md` (in-repo) | n/a (project-local) |
| **framework** | "`COPY . .` → phantom CVEs" | a deliverable (`lint-deploy.sh` Cn, `templates.md` rule, phase output contract) | **`deploy.sh` (automatic)** |
| **conductor** | "cheap-scout all surfaces before a per-surface wave" | a `/memory` feedback file | **auto-loads each session** |

Framework-scope inheritance is therefore mostly already solved: promotion = "edit the deliverable + add its check", and `deploy.sh` carries deliverables into every new app automatically. Conductor-scope auto-loads via `/memory`.

### Two-Part Fingerprint

Every registry entry carries a two-part fingerprint to enable recurrence detection:

1. **Coarse structured tuple** `{scope.category.surface}` — e.g. `framework.docker-build.worker-image`, `conductor.wave-planning.surface-state`, `project.auth.session-expiry`. Always present; AI-matchable even without a machine signature. Assigned at promotion time.
2. **Optional machine-signature** — CVE-ID, error-code, or regex-normalized error string (strip paths / timestamps / line-numbers to produce a stable signature). Present only when the failure is machine-emitted (build error, test failure, CVE scanner output).

**Matching logic:**
- If a machine-signature exists on both the new failure and an existing entry → **exact-signature fast path** (deterministic).
- Otherwise → **AI-judged similarity** against the tuple catalogue. No separate telemetry service; the consult is a scan the session/conductor runs inline.

### Three Mandatory Consult Points

See §3 Hooks 15-17 for the full hook definitions. Summary:

| Point | When | Action |
|---|---|---|
| **Work-start** (Hook 15) | Before any task/batch begins | Scan for fingerprints matching the target surface; surface matches before proceeding |
| **Done-claim** (Hook 16) | Before marking any task done | Run contract check + scan for surface-relevant fingerprints; evidence block required |
| **Failure-time** (Hook 17) | Whenever a build/test/gate/report fails | Fingerprint → scan → if match + check should have caught it → STRENGTHEN; if novel → promote |

### Recurrence Response Protocol

```
FAILURE OCCURS
  │
  ▼
Fingerprint the failure (tuple + machine-signature if available)
  │
  ▼
Scan LESSONS_REGISTRY.md
  │
  ├─ MATCH FOUND + standing check exists that should have caught this
  │    → The check ERODED (the fix was insufficient or the check drifted)
  │    → DO NOT just re-fix the symptom
  │    → STRENGTHEN the standing check:
  │         • tighten the check expression (stricter grep, broader test scope, lower threshold)
  │         • move the check earlier in the pipeline if feasible
  │         • update check_location in the registry entry
  │         • log the erosion event in lessons.md with 🔴
  │
  ├─ MATCH FOUND but no standing check / check_location is missing
  │    → Prior lesson was recorded but never converted to a standing check
  │    → PROMOTE now: add standing_check + check_location, route by scope
  │
  └─ NO MATCH → novel failure
       → Fix it
       → Assess promotion candidacy:
            framework-scope? → edit the deliverable + add the check → append registry entry
            conductor-scope? → write /memory feedback file → append registry entry
            project-scope?   → add to lessons.md → append registry entry (with scope: project)
```

### Promotion Checklist

When promoting a lesson to the registry:

```
□ Write the standing_check in imperative form ("Run X against Y; expect Z")
□ Assign a tuple fingerprint (scope.category.surface)
□ Add machine_signature if the failure is machine-emitted
□ Route the check to its scope destination:
     project  → lessons.md entry in the target app
     framework → edit the relevant deliverable; verify deploy.sh ships it
     conductor → write /memory feedback file
□ Append entry to LESSONS_REGISTRY.md (append-only — never edit existing entries)
□ Update the /memory mirror index (one-line summary per entry)
□ If framework-scope: verify the check is referenced in the appropriate phase output contract
```

### Cross-references

- `phases.md` — work-start consult step, done-claim evidence step, failure-handling fingerprint step (the procedural implementations of Hooks 15-17)
- `superpowers:verification-before-completion` — the driver skill that prompts running the evidence contract; §6 gives it structural teeth
- `templates.md` — acceptance-contract skeleton + evidence-field shape + `LESSONS_REGISTRY.md` entry template + Stop hook config
- `LESSONS_REGISTRY.md` — the canonical registry file (companion V32.8 artifact; seeded with the first framework-scope entry from the Yelli `COPY . .` lesson)

> **Section count note:** This file now contains **6 sections** (§1–§6). The file header lists sections by name; update it if you add further sections. The §3 phase-hook count is **18** (was 14; bumped by V32.8 Hooks 15-17; bumped again by V32.9 Hook 18 — Compliance & Data-Privacy Gap-Surfacing). No `TODO(count)` remains in this file — the count is authoritative.

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
