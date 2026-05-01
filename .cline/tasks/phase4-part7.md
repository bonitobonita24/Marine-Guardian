# Phase 4 Part 7 — tools/ + deploy/compose/ + SocratiCode artifacts
TASK: Generate dev tools, Docker Compose files, and deployment scripts (Part 7 of 8).
- Read STATE.md first. Read inputs.yml (all sections).
- Create scaffold/part-7 branch.
- Generate: tools/ (validate-inputs, check-env, check-product-sync, hydration-lint), deploy/compose/dev|stage|prod/ (split compose files per service group), deploy/compose/start.sh, deploy/compose/push.sh (if docker.publish: true), COMMANDS.md (if docker.publish: true), .socraticodecontextartifacts.json (MERGE with existing entries).
- Run: pnpm typecheck for tools. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 7 complete. Open phase4-part8.md in a NEW Claude Code session."
STOP HERE.
