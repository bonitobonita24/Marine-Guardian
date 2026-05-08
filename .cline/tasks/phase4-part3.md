# Phase 4 Part 3 — packages/db
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Part will touch >12 files OR >80K → STOP. Sub-divide by module, build first
# sub-module only, commit, STOP. Resume next sub-module in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Parts)"
#
TASK: Generate full ORM schema with all entities (Part 3 of 8).
- Read STATE.md first. Read inputs.yml + PRODUCT.md (Core Entities section).
- Read DECISIONS_LOG.md (tenancy mode, security layers).
- Create scaffold/part-3 branch.
- Generate: Prisma schema, migrations (up+down), seed script, AuditLog, tenant-guard middleware, RLS helpers (if multi-tenant).
- Seed script MUST include the first admin account (MANDATORY — app cannot be accessed without it):
    username: webmaster
    password: Read from CREDENTIALS.md "First Admin Account" section.
              DO NOT hardcode any password here. DO NOT invent a password.
              bcrypt hash the plaintext value before writing to seed script.
    role: super_admin
    email: webmaster@marine-guardian.local
- Run: pnpm db:generate + pnpm typecheck. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 3 complete. Open phase4-part4.md in a NEW Claude Code session."
STOP HERE.
