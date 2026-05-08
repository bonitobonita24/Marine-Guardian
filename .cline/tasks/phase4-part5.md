# Phase 4 Part 5 — apps/web Next.js scaffold (Command Center)
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
# NOTE for Part 5: this Part scaffolds full Next.js app — almost certainly >12 files.
#                  Plan sub-division upfront: layout/shared first → module-by-module pages.
#
TASK: Generate full Next.js web application scaffold (Part 5 of 8).
- Read STATE.md first. Read inputs.yml + PRODUCT.md (all modules).
- Read docs/DESIGN.md for visual tokens (Meta Dark Mode aesthetic).
- Create scaffold/part-5 branch.
- Initialize shadcn/ui: npx shadcn@latest init + base components.
- Generate: src/app/ (App Router pages for all modules), src/server/trpc/ (routers), src/server/auth/, src/middleware.ts, src/components/, next.config.ts (with security headers), src/server/lib/rate-limit.ts, src/server/lib/sanitize.ts, Dockerfile (if docker.publish: true), .dockerignore.
- Run: pnpm lint + pnpm typecheck. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 5 complete. Open phase4-part6.md in a NEW Claude Code session."
STOP HERE.
