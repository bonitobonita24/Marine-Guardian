# Phase 4 Part 8 — CI + governance docs + MANIFEST.txt + SocratiCode index
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
#
TASK: Generate CI workflows, finalize governance docs, and index codebase (Part 8 of 8).
- Read STATE.md first. Read ALL 9 governance docs.
- Create scaffold/part-8 branch.
- Generate: .github/workflows/ci.yml, .github/workflows/docker-publish.yml (if docker.publish: true), MANIFEST.txt.
- Append to CHANGELOG_AI.md (Agent: CLAUDE_CODE).
- Rewrite IMPLEMENTATION_MAP.md — complete current state snapshot.
- Run SocratiCode initial index: codebase_index → codebase_status → codebase_context_index.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 8 complete. Say 'Start Phase 5' in a NEW Claude Code session."
STOP HERE. Human manually triggers Phase 5.
