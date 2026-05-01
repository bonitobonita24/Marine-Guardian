# Phase 4 Part 7 — tools/ + deploy/compose/ + SocratiCode artifacts
TASK: Generate tooling, Docker Compose files, and SocratiCode config (Part 7 of 8).
- Read STATE.md first. Confirm Part 6 complete (or skipped).
- Read inputs.yml (ports, docker, services). Read .cline/memory/lessons.md.
- Create scaffold/part-7 branch.
- Generate: tools/ (validate-inputs.mjs, check-env.mjs, check-product-sync.mjs, hydration-lint.mjs).
- Generate: deploy/compose/dev|stage|prod/ — split compose files per service group.
- Generate: deploy/compose/start.sh, deploy/compose/push.sh (if docker.publish: true).
- Generate: COMMANDS.md (if docker.publish: true).
- Generate: deploy/k8s-scaffold/ placeholder.
- Generate/MERGE: .socraticodecontextartifacts.json (preserve design-system entry if exists).
- Generate: pgadmin-servers.json for each environment.
- Run: pnpm typecheck for this Part. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 7 complete. Open phase4-part8.md in a NEW Claude Code session."
STOP HERE.
