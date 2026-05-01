# Phase 4 Part 1 — Root config files
# Fresh session. Read STATE.md first, then inputs.yml + PRODUCT.md only.
# Branch: scaffold/part-1. Never commit to main directly.
TASK: Generate all root config files (Part 1 of 8).
- Read .cline/STATE.md first (orientation).
- Read inputs.yml and docs/PRODUCT.md (entities + tech stack sections only).
- Read .cline/memory/lessons.md (ALL 🔴 gotchas first).
- Create scaffold/part-1 branch before writing any file.
- Generate: pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .editorconfig, .prettierrc, .eslintrc.js, .gitignore (final), .nvmrc.
- Run: pnpm install --frozen-lockfile. Fix all errors.
- Run: pnpm lint + pnpm typecheck for files generated in this Part only.
- Rewrite .cline/STATE.md: PHASE="Phase 4 Part 1 complete", NEXT="Start Part 2 in new session".
- Commit with message: scaffold(root): root config files — Part 1 of 8
- Squash-merge scaffold/part-1 to main. Delete branch.
- VERIFICATION (MANDATORY before reporting complete):
  Run: find . -name "pnpm-workspace.yaml" -o -name "turbo.json" -o -name "tsconfig.base.json" | sort
  Confirm: all expected files appear in output. If any missing → regenerate → re-verify.
- GOVERNANCE SELF-CHECK:
  □ STATE.md rewritten with PHASE="Phase 4 Part 1 complete"
  □ CHANGELOG_AI.md entry written for this Part
  Both must be done before squash-merge.
- Output: "✅ Part 1 complete. Open phase4-part2.md in a NEW Claude Code session."
STOP HERE. Do not proceed to Part 2 in this session.
