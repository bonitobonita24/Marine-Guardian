# Phase 4 Part 5 — apps/web (Next.js full scaffold)
TASK: Generate the Next.js web application scaffold (Part 5 of 8).
- Read STATE.md first. Confirm Part 4 complete.
- Read inputs.yml + PRODUCT.md (all sections). Read .cline/memory/lessons.md.
- Read docs/DESIGN.md for visual tokens (colors, typography, layout).
- Create scaffold/part-5 branch.
- Initialize shadcn/ui: npx shadcn@latest init + base components.
- Generate: apps/web/ with App Router, tRPC routers, Auth.js config, middleware,
  security headers, rate limiter, sanitizer, Dockerfile (if docker.publish: true).
- Map DESIGN.md color palette → globals.css CSS custom properties (shadcn/ui variables).
- Map DESIGN.md typography → layout.tsx font config.
- Run: pnpm typecheck for this Part. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 5 complete. Open phase4-part6.md in a NEW Claude Code session."
STOP HERE.
