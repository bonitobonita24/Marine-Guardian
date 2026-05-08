# Phase 4 Part 2 — packages/shared + packages/api-client
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
#
# Fresh session. Read STATE.md first, then inputs.yml only.
TASK: Generate shared TypeScript types and API client (Part 2 of 8).
- Read .cline/STATE.md first. Confirm LAST_DONE shows Part 1 complete.
- Read inputs.yml (entities + apps sections). Read .cline/memory/lessons.md.
- Create scaffold/part-2 branch.
- Generate: packages/shared/src/types/, packages/shared/src/schemas/ (Zod), packages/api-client/.
- Run: pnpm typecheck for this Part. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 2 complete. Open phase4-part3.md in a NEW Claude Code session."
STOP HERE.
