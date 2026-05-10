# Claude Code Changes — 2026-05-10

## Memory Governance Layer (V31.1)

> **What this is:** A comprehensive changelog of all changes made to the Spec-Driven Platform V31
> framework files on 2026-05-10. Use this to brief any Claude AI instance (Claude Code, Claude.ai,
> or Planning Assistant) on what changed and why.
>
> **How to use:** Paste this document (or relevant sections) into a new Claude session to bring
> it up to speed on the Memory Governance Layer. It replaces the need to re-read all changed files.

---

## The Problem We Solved

Spec-Driven Platform projects running Claude Sonnet 4.6 were experiencing severe context thrashing,
especially in Phase 7 (Feature Updates) and Phase 8 (Iterative Buildout). Root causes:

1. **Reactive anti-thrashing** — the existing "if >12 files, split" rule only triggered AFTER
   scope was already too large. No proactive classification before starting work.
2. **Expensive session resume** — every new session required re-reading 3 governance docs
   (~5-10K tokens) just to orient. No memory-based shortcut.
3. **Sonnet doing architect work** — Sonnet 4.6 was forced to read full PRODUCT.md, analyze
   dependencies, AND decompose tasks — all in the same context window as implementation.
   This is the primary cause of thrashing on mature projects.
4. **No mid-project adoption path** — projects already in Phase 7/8 had no way to retroactively
   adopt token-saving strategies without restarting.

---

## What We Built

### New File: `memory-governance.md`

**Location:** `docs/SpecDrivenAIMegaPrompt/memory-governance.md` (copies to `.claude/rules/memory-governance.md` in target projects)

A standalone governance module with 5 sections:

### Section 1 — Tiered Decomposition Engine

Replaces ad-hoc "estimate scope" reasoning with a deterministic 3-tier classifier:

| Tier | Condition | Action |
|------|-----------|--------|
| **Tier 1** | 4 files, 1 module | Proceed directly |
| **Tier 2** | 5-12 files, 2-3 modules | Estimate tokens, proceed if <80K |
| **Tier 3** | >12 files OR 4+ modules | Score formula, mandatory split if >40 |

**Scoring formula:** `score = (file_count x 2.5) + (module_count x 5) + (dependency_depth x 3)`

Includes 4 worked examples (Tier 1 simple fix, Tier 2 CRUD feature, Tier 3 billing integration,
Tier upgrade from 2 to 3).

### Section 2 — Smart Checkpoint Protocol

Auto-persists progress to 3 targets after every task that modifies files:

| Target | What | Token Savings |
|--------|------|---------------|
| **STATE.md** (enhanced) | Added `TOKEN_ESTIMATE`, `FILES_TOUCHED`, `TIER_CLASSIFICATION`, `CHECKPOINT_TYPE` fields | Faster orientation |
| **Claude Code Memory** | Project-type memory entry with what was built, gotchas, what's next | ~5-10K saved per session (zero-cost resume) |
| **lessons.md** | Unchanged — typed entries per Rule 18 | Governance audit trail |

Skips checkpoint for read-only tasks (tests, scans, doc reads).

### Section 3 — Phase Hooks

One-liner hook injected into every phase's pre-flight:

```
MEMORY GOVERNANCE (memory-governance.md):
  PRE:   Run Tiered Decomposition (Section 1)
  POST:  Run Smart Checkpoint (Section 2) if files changed
  MODEL: Use Architect-Execute Model (Section 4) for Phase 4/7/8
```

**Injection points:** 12 phases — Phase 2, 2.5, 2.6, 2.7, 3, 3.5, 4, 5, 6, 6.5, 7, 7R, 8.

### Section 4 — Architect-Execute Model (Opus -> Sonnet)

The key innovation. Two-model orchestration:

| Role | Model | Responsibility |
|------|-------|---------------|
| **Architect** | Opus 4.6 | Reads heavy context, runs decomposition, writes task scopes, dispatches subagents, reviews output |
| **Executor** | Sonnet 4.6 | Receives pre-scoped task, reads ONLY listed files, builds/tests/commits, reports status |

**How it works:**
1. Opus reads STATE.md + relevant PRODUCT.md sections + governance docs
2. Opus runs Tiered Decomposition to classify the work
3. Opus dispatches Sonnet subagents via `Agent(model: "sonnet")`
4. Sonnet builds per the task scope (never reads full PRODUCT.md)
5. Opus reviews: spec compliance first, then code quality
6. Opus runs Smart Checkpoint after all tasks complete

**Sonnet reports one of:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

**Escalation:** If Sonnet reports BLOCKED on architecture, Opus handles directly. Two consecutive BLOCKEDs = Opus takes over.

Uses existing skills: `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents`, `superpowers:writing-plans`.

### Section 5 — Mid-Project Adoption

4-step adoption path for projects already in progress:

1. **Install** — copy `memory-governance.md` to `.claude/rules/`
2. **Baseline checkpoint** — Opus reads STATE.md + IMPLEMENTATION_MAP + lessons.md, writes Claude Code memory
3. **Apply to next task** — run Tiered Decomposition at pre-flight
4. **Retroactive memory seeding** — Opus distills top 10 gotchas + locked decisions into memory entries

Includes **Thrashing Recovery** emergency protocol for projects currently thrashing.

---

## Files Changed

### New Files Created

| File | Purpose |
|------|---------|
| `docs/SpecDrivenAIMegaPrompt/memory-governance.md` | The governance module (5 sections, ~400 lines) |
| `docs/superpowers/specs/2026-05-10-memory-governance-design.md` | Design spec documenting all decisions |
| `docs/SpecDrivenAIMegaPrompt/ClaudeCodeChanges-20260510.md` | This changelog |

### Modified Files

| File | What Changed |
|------|-------------|
| `docs/SpecDrivenAIMegaPrompt/phases.md` | Added 12 memory governance hooks to phase pre-flights (one per phase). Phase 7 and 8 hooks include extra context about thrashing prevention. |
| `docs/SpecDrivenAIMegaPrompt/CLAUDE_v31_compact.md` | Added `memory-governance.md` to contextual file loading table. Added Architect-Execute Model paragraph to Context Budget section. Updated Agent Stack: Claude Code entry now lists Opus 4.6 (Architect) and Sonnet 4.6 (Executor) roles. |
| `docs/SpecDrivenAIMegaPrompt/Master_Prompt_v31.md` | Added Memory Governance Layer reference block to Context Budget section (5-bullet summary). Added Architect-Execute Model paragraph. Updated Claude Code agent description with Opus/Sonnet roles. Updated Rule 24 title and added V31.1 integration paragraph. Added step 6 to thrashing recovery (Opus session decompose). |
| `docs/SpecDrivenAIMegaPrompt/AI_Tools_Skills_MCPs_Reference_v31.md` | (Updated) Added memory-governance.md as governance tool entry. Updated Claude Code agent to document Opus/Sonnet roles. |
| `docs/SpecDrivenAIMegaPrompt/Framework_Feature_Index_v31.md` | (Updated) Added Memory Governance as feature domain under Governance Documents section. |
| `docs/SpecDrivenAIMegaPrompt/Prompt_References.md` | (Updated) Added new prompts for memory governance baseline, thrashing recovery, Opus planning. |
| `docs/SpecDrivenAIMegaPrompt/Prompt_References.html` | (Updated) Added memory governance prompts to interactive HTML. |
| `public/prompt-reference.html` | (Updated) Added memory governance section to Vercel-served reference. |
| `docs/skillpilot/SKILL.md` | (Updated) Added memory-governance awareness to session start protocol. |
| `~/.claude/commands/scan-project.md` | Added Phase 1.5 memory governance detection, Phase 4 auto-install, Part A table entry, scan-results.json schema update, installation report section. (Global command — not in repo) |

---

## Design Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Location | Standalone `.claude/rules/memory-governance.md` + phase hooks | Self-contained, referenceable, minimal footprint in phases.md |
| Session model | STATE.md-first + memory boost | Portable across environments (Copilot, paste workflows); Claude Code gets zero-cost resume |
| Decomposition | Tiered system (Tier 1/2/3 with scoring) | Avoids overhead on small tasks while preventing thrashing on big ones |
| Checkpointing | Smart checkpoint (auto only on significant changes) | Skips ceremony for read-only tasks |
| Execution model | Opus plans + dispatches Sonnet subagents in same session | Fully automated; uses existing `subagent-driven-development` skill |
| Mid-project adoption | 4-step path, works at any phase | Critical for Phase 7/8 projects already experiencing thrashing |
| `/scan-project` integration | Auto-detect + auto-install | Ensures governance is active from day 1 on new projects and gets adopted on existing ones |

---

## How to Brief Claude AI on These Changes

### For Claude Code (starting a new session on a Spec-Driven project):

```
I've added a Memory Governance Layer to the Spec-Driven Platform (V31.1).
Read .claude/rules/memory-governance.md for the full protocol.

Key changes:
- Every phase pre-flight now runs Tiered Decomposition (Section 1) before starting
- Every task completion runs Smart Checkpoint (Section 2) to persist progress
- Phase 4/7/8 use the Architect-Execute Model (Section 4): Opus plans, Sonnet executes
- Rule 24 now references memory governance integration
- If thrashing occurs, follow Section 5 Thrashing Recovery

Start by running the baseline checkpoint (Section 5 Step 2) if this project doesn't have one yet.
```

### For Claude.ai Planning Assistant:

```
The Spec-Driven Platform now has a Memory Governance Layer (V31.1).
This doesn't change PRODUCT.md planning, but when you generate Phase 3.5
execution plans, note that each Part should be sized for the Tiered Decomposition
system: ideally Tier 1-2 (under 12 files per Part). Opus 4.6 will plan the
decomposition; Sonnet 4.6 will execute.
```

### For explaining to a colleague:

The Memory Governance Layer solves the #1 pain point with AI-driven development:
**context thrashing on large projects**. Instead of letting Sonnet 4.6 read everything
and hope it fits in 80K tokens, we use Opus 4.6 as an architect that pre-reads the
heavy context, decomposes work into Sonnet-sized chunks, and dispatches Sonnet subagents
with exactly the files they need. Each Sonnet session gets a laser-focused task instead
of the whole kitchen sink. Progress is checkpointed to Claude Code's memory system so
the next session starts at zero cost instead of re-reading governance docs.

---

## Version Tag

This update is tagged as **V31.1** — a minor version within V31. No breaking changes.
All existing V31 projects continue working. The governance layer is additive.
`/scan-project` will auto-install it on the next scan.
