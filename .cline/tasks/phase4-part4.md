# Phase 4 Part 4 — packages/ui + packages/jobs + packages/storage
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
#
TASK: Generate UI components, job queue, and storage packages (Part 4 of 8).
- Read STATE.md first. Read inputs.yml + PRODUCT.md.
- Create scaffold/part-4 branch.
- Generate: packages/ui/ (shadcn/ui + Tailwind + Radix UI), packages/jobs/ (Valkey + BullMQ), packages/storage/ (MinIO/S3).
- Run: pnpm typecheck for this Part. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 4 complete. Open phase4-part5.md in a NEW Claude Code session."
STOP HERE.
