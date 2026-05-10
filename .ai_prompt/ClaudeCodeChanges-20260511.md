# Claude Code Changes — 2026-05-11

## Memory Governance V31.2: 30K Token Budget Gate + Opus Escalation

> **What this is:** A changelog of all changes made to the Spec-Driven Platform V31
> framework files on 2026-05-11. Use this to brief any Claude AI instance (Claude Code, Claude.ai,
> or Planning Assistant) on what changed and why.
>
> **How to use:** Paste this document (or relevant sections) into a new Claude session to bring
> it up to speed on the V31.2 additions to the Memory Governance Layer. It supplements
> ClaudeCodeChanges-20260510.md — read that first for full V31.1 context.

---

## The Problem We Solved

V31.1's Tiered Decomposition Engine (file-count-based splitting) was a major improvement, but one
failure mode remained: **Sonnet subagents thrashing within their own 60K context window** when a
single assigned task consumed too much of it.

Root causes:

1. **File count is a proxy, not a guarantee** — a task touching 4 files can still generate 40K+
   tokens of reads, diffs, and reasoning if those files are dense or interdependent. V31.1's
   Tier 1 ("4 files, 1 module → proceed directly") had no token floor.
2. **No hard ceiling per Sonnet dispatch** — Opus could assign a Tier 2 task with a 55K token
   estimate and Sonnet would accept it. If the estimate was wrong or the files larger than expected,
   Sonnet would thrash: re-reading files, producing partial output, or contradicting its own edits.
3. **No Opus escape hatch for genuinely large atomic tasks** — some tasks are legitimately
   unsplittable (e.g., rewriting a single 800-line file that touches every layer). V31.1 had no
   defined path for these — they'd get dispatched to Sonnet and thrash anyway.

---

## What We Built

### Addition 1 — Step 2.5: 30K Token Budget Gate

**Location:** `memory-governance.md` §1 (Tiered Decomposition Engine), between Step 2 and Step 3.

A hard token cap applied to every Sonnet subagent task, regardless of tier or file count:

- After Tiered Decomposition classifies a task and estimates tokens, Step 2.5 checks:
  **if estimated tokens > 30K → split further, always.**
- This applies even to Tier 1 tasks (4 files, 1 module) if the token estimate is high.
- Splitting follows the same decomposition rules as the tier system — break by module boundary,
  file group, or logical phase (read pass, write pass, test pass).
- The 30K figure targets the safe operating zone for a Sonnet subagent that also needs context
  for STATE.md, task scope, and output reporting (~10K overhead budget assumed).

### Addition 2 — Step 2.5b: Opus Escalation

**Location:** `memory-governance.md` §1, immediately after Step 2.5.

Last-resort path for tasks that are genuinely atomic and cannot be split below 30K:

- Opus dispatches these via `Agent(model: "opus")` with a 100K token budget.
- Hard limits: max 20% of total tasks per session may be Opus-escalated.
- Every Opus-escalated task is logged in STATE.md under a new `OPUS_ESCALATIONS` field with
  task name, estimated tokens, and reason it could not be split.
- Opus reviews Opus-escalated output the same way it reviews Sonnet output (spec compliance first,
  then code quality).

### Addition 3 — THRASHING Status in §4

**Location:** `memory-governance.md` §4 (Architect-Execute Model), Sonnet status definitions.

New fifth status added to Sonnet's reporting vocabulary:

| Status | Meaning |
|--------|---------|
| DONE | Task complete, all files written, tests pass |
| DONE_WITH_CONCERNS | Complete but Opus should review one issue |
| NEEDS_CONTEXT | Missing info — Opus must provide before proceeding |
| BLOCKED | Architecture decision required — Opus handles directly |
| **THRASHING** | **Agent is looping: re-reading files, producing partial output, or contradicting prior edits** |

**Detection:** Opus identifies THRASHING by observing subagent behavior across checkpoint reports —
re-reads of already-read files, repeated partial writes to the same file, or output that rolls back
a previous edit.

**Response protocol:**
1. Stop the agent immediately (do not wait for completion).
2. Re-decompose the task via Step 2.5 — apply the 30K gate to the original task scope.
3. If the task cannot be split (atomic), escalate via Step 2.5b (Opus executor).
4. Log the THRASHING event in STATE.md under `THRASHING_LOG` with task name, estimated tokens,
   and resolution path taken.

---

## Files Changed

### Modified Files

| File | What Changed |
|------|-------------|
| `docs/SpecDrivenAIMegaPrompt/memory-governance.md` | Added Step 2.5 (30K token budget gate) and Step 2.5b (Opus escalation) to §1. Added THRASHING as a fifth Sonnet status in §4 with detection criteria and response protocol. Added `OPUS_ESCALATIONS` and `THRASHING_LOG` field definitions. |
| `docs/SpecDrivenAIMegaPrompt/ChatGPT_V31_Cross_Audit_Prompt.md` | Note 11 updated to reference V31.2 as the latest minor version and describe the 30K gate and Opus escalation. Added checkbox J.21 verifying §1 Step 2.5 and Step 2.5b exist. Renumbered old J.21→J.22 and old J.22→J.23. |
| `docs/SpecDrivenAIMegaPrompt/ClaudeCodeChanges-20260511.md` | This changelog (new file). |

### Reference Docs Updated Today

The following reference files are being updated in this session to reflect V31.2:

| File | What to Update |
|------|---------------|
| `docs/SpecDrivenAIMegaPrompt/Master_Prompt_v31.md` | Memory Governance Layer reference block: add Step 2.5 and THRASHING to the bullet summary. |
| `docs/SpecDrivenAIMegaPrompt/CLAUDE_v31_compact.md` | Context Budget section: add 30K-per-Sonnet-task rule. Architect-Execute Model paragraph: add THRASHING status. |
| `docs/SpecDrivenAIMegaPrompt/Prompt_References.md` | Consider adding a new prompt for the Step 2.5 escalation decision. |
| `~/.claude/projects/.../memory/project_memory_governance.md` | Update V31.2 section summary. |

---

## Design Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Token cap value | 30K per Sonnet task | Leaves ~30K headroom in a 60K Sonnet context for overhead (STATE.md read, task scope, output). Conservative — better to split more than thrash. |
| Gate placement | After tiered classification, before dispatch | Opus applies the gate at planning time, not mid-execution. Cleaner than a runtime abort. |
| Opus escalation limit | 20% of tasks per session | Opus is expensive. If >20% of tasks require Opus, the decomposition strategy itself is wrong — Opus should re-plan the whole feature. |
| THRASHING detection | Opus-side observation, not Sonnet self-report | Thrashing agents often don't know they're thrashing. Opus must recognize the pattern from checkpoint reports. |
| STATE.md logging | OPUS_ESCALATIONS + THRASHING_LOG fields | Preserves audit trail for retrospectives and future decomposition calibration. |
| Version tag | V31.2 (not V32) | No breaking changes. Fully additive to V31.1. All existing governance still applies. |

---

## How to Brief Claude AI on These Changes

### For Claude Code (starting a new session on a Spec-Driven project):

```
The Memory Governance Layer has been updated to V31.2.
Read .claude/rules/memory-governance.md for the full protocol.

V31.2 additions (on top of V31.1):
- Step 2.5 (30K Token Budget Gate): After Tiered Decomposition, check token estimate.
  If any Sonnet subagent task exceeds 30K tokens, split further — always, regardless of tier.
- Step 2.5b (Opus Escalation): If a task is genuinely atomic and cannot be split below 30K,
  dispatch to Agent(model: "opus") as last resort. Max 20% of tasks. Log in STATE.md.
- THRASHING status: New Sonnet report status. If Opus detects a subagent re-reading files,
  producing partial output, or contradicting edits — stop it, re-decompose via Step 2.5.

Apply the 30K gate at decomposition time (Step 2 → Step 2.5 → Step 2.5b → Step 3 dispatch).
```

### For Claude.ai Planning Assistant:

```
The Memory Governance Layer is now V31.2.
When generating Phase 3.5 execution plans, size each Part for the 30K token budget gate:
each Part should be completable by a Sonnet subagent in ≤30K tokens of reads + reasoning.
If a Part cannot be split that small (e.g., a large file rewrite), flag it as an Opus-escalation
candidate. Opus 4.6 will handle that Part directly with a 100K budget.
```

### For explaining to a colleague:

V31.1 solved thrashing by splitting tasks into file-count-based tiers (Tier 1/2/3). V31.2 adds
a harder constraint: **every Sonnet subagent task must fit within 30K tokens**, regardless of
how few files it touches. This prevents the case where a "small" 4-file task turns out to be
40K tokens because the files are dense.

For the rare case where a task genuinely cannot be split that small (e.g., rewriting one giant
file), V31.2 adds an **Opus escalation path**: Opus executes the task itself with a 100K budget.
This is the last resort — at most 20% of tasks per session can go this route.

Finally, V31.2 formally defines **THRASHING** as a detectable Sonnet failure mode (looping,
re-reading, contradicting its own edits). Opus now has a defined response: stop the agent,
re-decompose through the 30K gate, escalate to Opus if needed, and log everything.

---

## Version Tag

This update is tagged as **V31.2** — a minor version within V31. No breaking changes.
All existing V31 and V31.1 governance continues to apply. V31.2 is purely additive:
new gate (Step 2.5), new escalation path (Step 2.5b), new status (THRASHING).
