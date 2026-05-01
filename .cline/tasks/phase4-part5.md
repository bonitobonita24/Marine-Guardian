# Phase 4 Part 5 — apps/web Next.js scaffold (Command Center)
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
