# Implementation Map — Marine Guardian Command Center
# Current build state. Rewritten after every feature update.
# ---

## Status: Phase 0 — Bootstrap

### Root Config
- [ ] pnpm-workspace.yaml
- [ ] turbo.json
- [ ] tsconfig.base.json
- [ ] .editorconfig, .prettierrc, .eslintrc.js

### Packages
- [ ] packages/shared (types + schemas)
- [ ] packages/api-client
- [ ] packages/db (Prisma schema + migrations)
- [ ] packages/ui (shadcn/ui)
- [ ] packages/jobs (BullMQ)
- [ ] packages/storage (MinIO)

### Apps
- [ ] apps/web (Next.js — Command Center)

### Deploy
- [ ] deploy/compose/dev/
- [ ] deploy/compose/stage/
- [ ] deploy/compose/prod/
- [ ] .github/workflows/ci.yml
- [ ] .github/workflows/docker-publish.yml

### Governance
- [x] CLAUDE.md (V31 compact)
- [x] .claude/rules/ (6 files)
- [x] docs/PRODUCT.md (complete)
- [x] docs/DESIGN.md (Meta Dark Mode)
- [x] .gitignore
- [x] .vscode/mcp.json
- [ ] inputs.yml
- [ ] .env files
- [ ] CREDENTIALS.md
