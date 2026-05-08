# Phase 4 Part 7 — tools/ + deploy/compose/ + SocratiCode artifacts
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
#
TASK: Generate dev tools, Docker Compose files, and deployment scripts (Part 7 of 8).
- Read STATE.md first. Read inputs.yml (all sections).
- Create scaffold/part-7 branch.
- Generate: tools/ (validate-inputs, check-env, check-product-sync, hydration-lint), deploy/compose/dev|stage|prod/ (split compose files per service group), deploy/compose/start.sh, deploy/compose/push.sh (if docker.publish: true), COMMANDS.md (if docker.publish: true), .socraticodecontextartifacts.json (MERGE with existing entries).
- Run: pnpm typecheck for tools. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 7 complete. Open phase4-part8.md in a NEW Claude Code session."
STOP HERE.
