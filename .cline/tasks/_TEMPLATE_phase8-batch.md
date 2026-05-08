# Phase 8 Batch [N] Item [M] — [Feature Name]
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Item will touch >12 files OR >80K → STOP. Sub-divide by sub-feature, build first
# sub-feature only, commit, STOP. Resume next sub-feature in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Phase 8 Batches)"
#
# ─── SCOPE ASSESSMENT — fill in BEFORE any code ──────────────────────────────
# PRODUCT.md sections to read (specific headings only — never the whole file):
#   - [section heading 1]
#   - [section heading 2]
# Files to create/modify (full list, including tests + governance docs):
#   Source:     [list]
#   Tests:      [list]
#   Governance: CHANGELOG_AI.md, IMPLEMENTATION_MAP.md, STATE.md
# Estimated total context: [N]K
# Verdict:     SAFE (≤80K) | AT RISK (80-100K — flag tight) | MUST SUB-DIVIDE (>100K)
# Sub-division plan (if needed):
#   [N]-1: [files] — what this sub-session builds
#   [N]-2: [files]
#   [N]-3: [files]
# ──────────────────────────────────────────────────────────────────────────────

TASK: [one-sentence feature description from PRODUCT.md]

## PRE-FLIGHT (Rule 4 + Phase 7 sequence)
- Read .cline/STATE.md first (orientation)
- Read .cline/memory/lessons.md (ALL 🔴 gotchas → ALL 🟤 decisions, then keyword-relevant rest)
- Read PRODUCT.md sections listed in scope assessment ONLY (strip <private> tags — Rule 20)
- Read DECISIONS_LOG.md (relevant sections only)
- Run codebase_search (Rule 17) BEFORE opening any source file — get blast radius
- IF code-review-graph installed: run get_impact_radius_tool + get_review_context_tool

## GIT (Rule 23)
- Branch: feat/[slug] (create new, or `git checkout` if resuming — never duplicate)
- Verify no unrelated changes are mixed into this branch. If mixed:
  - Move unrelated changes to a separate branch (chore/[slug]) first
  - Resume Item work on a clean feat/ branch

## IMPLEMENT (Rule 25 — TDD enforced)
- Write failing test FIRST (RED). Confirm it fails before writing implementation.
- Write minimal code to pass (GREEN). Refactor only after GREEN.
- Modify ONLY files in blast-radius scope (from codebase_search / impact_radius).
- TypeScript strict — no `any`, no `as` assertions without comment (Rule 12).

## REVIEW (Rule 25 — two-stage, both must PASS before governance writes)
- Stage 1 — Spec compliance: every behavior declared in PRODUCT.md is implemented at [file:line]
- Stage 2 — Code quality:
  □ No any types introduced
  □ Tests written BEFORE implementation (RED→GREEN verified)
  □ Only blast-radius files modified
  □ Conventional commit format
  □ Simplicity (DRY, no wrapper functions adding zero value, no single-use vars that obscure)

## VALIDATE
- pnpm typecheck → 0 errors
- pnpm lint     → 0 errors (warnings allowed)
- pnpm test     → new tests pass + no regressions
- IF UI changed: Visual QA per Rule 16 (page loads, no console errors, no layout breaks)

## GOVERNANCE (non-blocking — append AFTER implementation, Rule 3 + Rule 15)
- CHANGELOG_AI.md: entry with `Agent: CLAUDE_CODE`, why, files added/modified/deleted, errors resolved
- IMPLEMENTATION_MAP.md: rewrite to reflect current state including this Item
- STATE.md: rewrite with PHASE / LAST_DONE / NEXT — must reflect Item complete
- lessons.md: typed entry if any 🔴 gotcha encountered or 🟤 decision locked (Rule 18)
- IF SocratiCode installed: run codebase_update to refresh index

## MERGE (Rule 23)
- Squash-merge feat/[slug] → main with conventional commit message: `feat([scope]): [description]`
- Delete feature branch
- Verify main is clean: `git status` shows nothing to commit

## OUTPUT CONTRACT (mandatory before reporting complete)
□ All scope-assessment files actually touched (not skipped)
□ Two-stage review: both stages PASS
□ All 4 validation commands pass
□ Governance docs updated (CHANGELOG_AI + IMPLEMENTATION_MAP + STATE.md timestamps match this session)
□ Branch squash-merged + deleted
□ STATE.md NEXT field points to next Item or "Roadmap check"

## STOP CONDITION
Output: `✅ Phase 8 Batch [N] Item [M] complete. Next: [Item M+1] or 'Roadmap check'.`
**STOP HERE. Do not auto-chain to next Item.** Human opens next Item in a NEW Claude Code session.

## RECOVERY (if thrashing mid-session)
1. /clear immediately
2. Update STATE.md with progress (which sub-step done, which pending)
3. Write handoff to .cline/handoffs/[timestamp]-[slug]-pause.md
4. Commit any work done so far (partial > lost)
5. STOP — human opens new session with narrower scope
