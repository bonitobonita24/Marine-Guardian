# Phase 8 Batch 1 Item 3 — Alert Notification UI
#
# ⚠ CONTEXT BUDGET — Claude Sonnet 4.6 (200K window · ≤80K SAFE zone · thrashes near 120K)
# Before any code: estimate (rules ~5K + 9 docs ~10-15K + each read ~1-3K + each write ~2-5K).
# IF this Item will touch >12 files OR >80K → STOP. Sub-divide by sub-feature, build first
# sub-feature only, commit, STOP. Resume next sub-feature in a NEW session.
# Read ONLY relevant PRODUCT.md sections. Use codebase_search (Rule 17), not speculative reads.
# If thrashing mid-session: /clear → commit progress → write handoff → STOP.
# Full rule: .claude/rules/phases.md → "ANTI-THRASHING RULE — MANDATORY (applies to ALL Phase 8 Batches)"
#
# ─── SCOPE ASSESSMENT (filled 2026-05-08 from git status + PRODUCT.md inspection) ────
# PRODUCT.md sections to read (specific headings only):
#   - "Alert System"          (PRODUCT.md line ~177)
#   - "Notification Center"   (PRODUCT.md line ~184)
#   - "Roles and Permissions" (alert-related rows for Site Admin / Coordinator / Operator)
#   - "Routes" (line ~347)    (/[tenant]/alerts and /[tenant]/notifications)
#   - "Pages" table rows 16 + 17  (Alert Rules Configuration + Notification Center)
#
# Files in scope (already on disk, unstaged):
#   FEATURE files (Item 3):
#     - apps/web/src/app/(dashboard)/alerts/page.tsx           (M, +367 lines — major rewrite)
#     - apps/web/src/components/ui/dialog.tsx                  (??)
#     - apps/web/src/components/ui/dropdown-menu.tsx           (??)
#     - apps/web/src/components/ui/select.tsx                  (??)
#     - apps/web/src/components/ui/separator.tsx               (??)
#     - apps/web/src/components/ui/switch.tsx                  (??)
#     - apps/web/src/components/ui/tabs.tsx                    (??)
#     - apps/web/src/server/trpc/routers/__tests__/alertRule.test.ts    (??)
#     - apps/web/src/server/trpc/routers/__tests__/notification.test.ts (??)
#     - apps/web/package.json                                  (M — shadcn deps)
#     - pnpm-lock.yaml                                         (M)
#   EXISTING (verify, may need touch):
#     - apps/web/src/server/trpc/routers/alertRule.ts          (created May 3 — verify spec match)
#     - apps/web/src/server/trpc/routers/notification.ts       (created May 3 — verify spec match)
#   GOVERNANCE (write-only, append):
#     - docs/CHANGELOG_AI.md
#     - docs/IMPLEMENTATION_MAP.md
#     - .cline/STATE.md
#
# Estimated context: ~50-65K (rules 5K + 9 docs 12K + page.tsx 7K + 6 shadcn ~12K + 2 tests 8K
#                              + 2 routers 6K + PRODUCT.md sections 4K + writes 5K)
# Verdict: ✅ SAFE — within 80K, but tight. Stay disciplined: read shadcn files ONLY if
#          typecheck/lint surfaces issues there. Skim, don't deep-read.
#
# Sub-division plan (USE if context creeps past 70K mid-session):
#   3a — Branch hygiene + lint/typecheck/test stabilization
#        Files: only the 11 Item-3 files above + lint/typecheck/test runs
#        Commit when green: "feat(alerts): wire alert rule config + notification center UI"
#   3b — Two-stage review + governance writes + squash-merge
#        Files: 9 governance docs + STATE.md + merge ops
#        Commit not needed (squash absorbs).
# ─────────────────────────────────────────────────────────────────────────────────────

TASK: Complete the Alert Rule Configuration page and Notification Center UI for Site Admin
and operators (Site Admin + Coordinator + Operator per PRODUCT.md role matrix).

## ⚠ BRANCH HYGIENE — RESOLVE FIRST (before any feature work)

`git status` (run before starting) will show 23+ unstaged files. Only ~11 are Item 3 work.
The rest are FRAMEWORK/DOC changes from prior sessions or this session's anti-thrashing rollout
that must NOT be squashed into a "feat(alerts):" commit.

UNRELATED changes currently mingled on `feat/alert-notification-ui`:
  - .ai_prompt/**          (framework V31 docs — older session)
  - AI/Master_Prompt_v31.md (framework V31 — older session)
  - .claude/rules/bootstrap.md  (anti-thrashing rollout — this session)
  - .claude/rules/phases.md     (anti-thrashing rollout — this session — also has .bak)
  - .cline/tasks/phase4-part*.md (anti-thrashing rollout — this session)
  - CLAUDE.md              (anti-thrashing rollout — this session — also has .bak)
  - .specstory/statistics.json (auto-captured)
  - *.bak files            (manual backups from anti-thrashing rollout)

REQUIRED PROCEDURE:
1. From `feat/alert-notification-ui`, stash Item-3 files only:
   ```
   git stash push -m "item3-wip" -- \
     apps/web/src/app/\(dashboard\)/alerts/page.tsx \
     apps/web/src/components/ui/dialog.tsx \
     apps/web/src/components/ui/dropdown-menu.tsx \
     apps/web/src/components/ui/select.tsx \
     apps/web/src/components/ui/separator.tsx \
     apps/web/src/components/ui/switch.tsx \
     apps/web/src/components/ui/tabs.tsx \
     apps/web/src/server/trpc/routers/__tests__/alertRule.test.ts \
     apps/web/src/server/trpc/routers/__tests__/notification.test.ts \
     apps/web/package.json \
     pnpm-lock.yaml
   ```
2. The remaining staged/unstaged work is framework. Move it to `chore/framework-v31-anti-thrashing`:
   ```
   git checkout -b chore/framework-v31-anti-thrashing
   git add CLAUDE.md .claude/rules/ .cline/tasks/phase4-part*.md AI/ .ai_prompt/
   git commit -m "chore(framework): adopt V31 anti-thrashing — Sonnet 4.6 context budget"
   git checkout main && git merge --squash chore/framework-v31-anti-thrashing
   git commit -m "chore(framework): adopt V31 anti-thrashing — Sonnet 4.6 context budget"
   git branch -d chore/framework-v31-anti-thrashing
   ```
3. Delete *.bak files (or rm and -- gitignored ones).
4. Return to feat/alert-notification-ui (now empty), restore stash:
   ```
   git checkout feat/alert-notification-ui
   git stash pop
   ```
5. Confirm `git status` now shows ONLY the 11 Item-3 files. Proceed.

## PRE-FLIGHT (after branch hygiene)
- Read .cline/STATE.md first
- Read .cline/memory/lessons.md (ALL 🔴 + 🟤 entries first)
- Read PRODUCT.md — only the sections listed in scope assessment above
- Run `codebase_search` for blast radius BEFORE opening shadcn component files
  (likely no need to read them — they're stock shadcn primitives)

## VALIDATE WIP (Rule 25 prep)
- pnpm typecheck → fix errors (focus: alerts/page.tsx interactions with new shadcn components)
- pnpm lint     → fix errors
- pnpm test --filter alertRule.test --filter notification.test → confirm new tests pass
- pnpm audit --audit-level=high → 0 HIGH/CRITICAL CVEs (V18 default)

## TWO-STAGE REVIEW (Rule 25 — both must PASS)
- Stage 1 — Spec compliance against PRODUCT.md "Alert System" + "Notification Center":
  □ Alert rules: condition_json (event_type, priority_threshold, category) — implemented?
  □ Alert rules: notification_channels (in_app, email) — wired in UI?
  □ Alert rules: is_active toggle — works?
  □ Alert history log — visible in UI?
  □ Notification Center: chronological list — implemented?
  □ Notification Center: filters by type (event alert | system alert | escalation | warning)?
  □ Notification Center: is_read toggle — works?
  □ Roles: Site Admin can create/edit alert rules; Coordinator/Operator cannot — RBAC enforced?
  □ Routes: /[tenant]/alerts (Site Admin+) and /[tenant]/notifications (all roles) — guards in place?
- Stage 2 — Code quality:
  □ No any types in alerts/page.tsx
  □ Tests assert behavior (not stubs)
  □ Only blast-radius files touched
  □ shadcn components are stock (not modified)
  □ Form uses React Hook Form + Zod (Rule from ui-rules.md)
  □ DRY: no duplicated dialog/dropdown logic across the two pages

## COMMIT (after both stages PASS)
- One atomic conventional commit:
  `git commit -m "feat(alerts): alert rule config + notification center UI"`

## GOVERNANCE (non-blocking — append AFTER commit)
- CHANGELOG_AI.md: entry with Agent: CLAUDE_CODE, files modified/added, why, errors resolved
- IMPLEMENTATION_MAP.md: mark Alerts + Notifications as built; update Phase 8 Batch 1 progress
- STATE.md: rewrite —
  PHASE="Phase 8 Batch 1 Item 3 complete"
  LAST_DONE="Alert rule config + notification center UI — feat/alert-notification-ui squash-merged."
  NEXT="Phase 8 Batch 1 Item 4 — pick next feature from PRODUCT.md / IMPLEMENTATION_MAP gap list."
- lessons.md: 🟤 decision entry if any new auth/RBAC pattern was locked; 🔴 gotcha if any
  shadcn integration surprise (e.g. Switch needing useState wrapper)

## MERGE (Rule 23)
- Squash-merge feat/alert-notification-ui → main
  ```
  git checkout main
  git merge --squash feat/alert-notification-ui
  git commit -m "feat(alerts): alert rule config + notification center UI"
  git branch -d feat/alert-notification-ui
  ```
- Verify `git status` clean on main

## OUTPUT CONTRACT
□ git log shows: chore(framework) commit + feat(alerts) commit on main, no leftover branches
□ pnpm typecheck + lint + test all pass on main
□ STATE.md PHASE="Phase 8 Batch 1 Item 3 complete"
□ CHANGELOG_AI.md last entry timestamp = this session
□ IMPLEMENTATION_MAP.md reflects Alerts + Notifications complete

## STOP CONDITION
Output: `✅ Phase 8 Batch 1 Item 3 (Alert Notification UI) complete. Next: Item 4 — see STATE.md.`
**STOP HERE. Open phase8-batch1-item4-[name].md in a NEW session, or run "Roadmap check" first.**

## RECOVERY (if thrashing mid-session)
1. /clear immediately
2. Update STATE.md: PHASE="Phase 8 Batch 1 Item 3 PARTIAL", LAST_DONE=[exact step], NEXT=[next step]
3. Write handoff: .cline/handoffs/[timestamp]-item3-alerts-pause.md (what's done, what remains)
4. Commit work done so far on feat/alert-notification-ui (partial > lost)
5. STOP — human opens new session
