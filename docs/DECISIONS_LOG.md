# Decisions Log — Marine Guardian Command Center
# Format: ## [Decision Title] → Decision: [value] → Rationale: [why] → Locked: yes/no
# NEVER re-ask anything listed here.
# ---

## Dev Environment Mode
Decision: MODE A — WSL2 native (the only supported mode as of V25)
Rationale: Devcontainer adds 4 virtualisation layers on WSL2 + Docker Desktop causing
permission errors, shell server crashes, and socket failures. WSL2 native eliminates all of this.
Docker Desktop provides the Docker socket to WSL2 natively. No DinD needed.
Locked: yes — do not re-ask or scaffold devcontainer files.

## Git Branching Strategy
Decision: Branch-per-feature with squash-merge to main
Branch patterns: feat/{slug}, scaffold/part-{N}, fix/{slug}, chore/{slug}
Commit style: conventional (feat:, fix:, chore:, docs:)
Locked: yes

## Model Routing
Decision:
  planning:   claude-code (Phase 2 — V31 primary)
  execution:  claude-sonnet-4-6 via Claude Code (V31 primary; Cline deprecated)
  governance: gemini-2.5-flash-lite (cheapest, non-critical writes)
Locked: yes

## Navigation Approach
Decision: Hardcoded sidebar navigation — role-based static menu configuration
Rationale: Internal operations tool with fixed role structure. Menu items determined by user role
(super_admin, site_admin, field_coordinator, operator). No DB-driven navigation needed —
role permissions are stable and don't change at runtime.
Locked: yes

## EarthRanger Credential Encryption
Decision: AES-256-GCM with Prisma middleware — per-field column encryption
Rationale: Each tenant stores 5 ER credentials (URL, username, password, DAS token, track token)
encrypted at rest in the database. A single ENCRYPTION_KEY env var provides the master key.
Prisma middleware auto-encrypts on write and decrypts on read for fields marked as encrypted.
AES-256-GCM provides authenticated encryption (integrity + confidentiality) and is the standard
for at-rest column encryption. No separate key management service needed for v1 scale.
Locked: yes

## Git Worktrees for Phase 4
Decision: Enabled — git worktrees used for Phase 4 Part isolation
Rationale: Cleaner isolation per Part prevents incomplete scaffold from Part N breaking Part N+1.
Locked: yes

## Internationalization (i18n) Strategy
Decision: Static JSON translation files via next-intl
Languages: EN (English), ID (Bahasa Indonesia), MS (Bahasa Malaysia)
Rationale: EarthRanger-sourced data displayed as-is (original language from field reports).
UI chrome translated via static JSON files — simple, no runtime overhead, easy for non-devs to edit.
Locked: yes

## File Storage
Decision: Skipped for v1 — packages/storage NOT generated
Rationale: No file upload feature in v1. Files (photos, documents) hosted in EarthRanger.
Command Center references ER file URLs but does not store files itself.
Can be enabled later via Feature Update when needed.
Locked: yes

## Bot Protection (Cloudflare Turnstile)
Decision: Opted out for v1 — turnstile.enabled: false
Rationale: Internal operations tool with no public registration, no public-facing forms.
Only login page is accessible without auth. Rate limiting on auth endpoints provides
sufficient protection for v1. Can be enabled later if public routes are added.
Locked: yes

## Map Library
Decision: mapcn (MapLibre GL) — shadcn-native maps
Rationale: PRODUCT.md declares advanced map features — live tracking, heatmaps, patrol area
polygons, drawing tools, fly-to animations. These require vector tiles and GL rendering,
which exceeds Leaflet.js capabilities. mapcn is MIT, zero API key, auto-themes with shadcn dark mode.
Locked: yes — decision logged per ui-rules.md Rule 6 requirement.

## Dev Port Strategy
Decision: Random base port 45194 with fixed offsets (Rule 22)
Port assignments:
  PostgreSQL: 45194, PgBouncer: 45195, Valkey: 45196,
  MinIO API: 45197, MinIO Console: 45198, MailHog SMTP: 45199,
  MailHog UI: 45200, pgAdmin: 45201, App: 45204, Worker: 45205,
  Prisma Studio: 45214
Rationale: Non-standard ports prevent conflicts with other projects on the same dev machine.
Staging and production use standard ports (5432, 6379, 9000, 3000, etc.).
Locked: yes

## Docker Image Publishing
Decision: Enabled — bonitobonita24/marine-guardian on Docker Hub
Registry: docker.io (Docker Hub)
Repository: bonitobonita24/marine-guardian
Image name: marine-guardian
Tags: latest (main branch), staging-latest (staging auto-update), sha-{short} (every push)
Platforms: linux/amd64, linux/arm64
Trigger: push to main only (Rule 23 squash-merge guarantees clean main)
GitHub Secrets: DOCKERHUB_USERNAME + DOCKERHUB_TOKEN
Locked: yes

## Spec Stress-Test (Phase 2.7)
Decision: Enabled — vibe_test.enabled: true
Result: Passed with 0 gaps on 2026-05-02
Locked: yes

## pnpm CVE Override Strategy (Phase 5)
Decision: Use pnpm.overrides in root package.json to force patched transitive dependency versions
Rationale: bcrypt@5.1.1 → @mapbox/node-pre-gyp@1.0.11 → tar@6.2.1 chain has 6 HIGH CVEs.
tar@6.x cannot be directly upgraded (locked by node-pre-gyp). pnpm overrides force tar ≥ 7.5.11
across the entire monorepo without modifying third-party packages. pnpm audit --fix wrote 10 overrides;
pnpm install (non-frozen) regenerated the lockfile. Re-audit confirmed 0 vulnerabilities.
Additional overrides: esbuild, vite, postcss, next-intl (minor CVEs, same mechanism).
Process: pnpm audit --fix → pnpm install → pnpm install --frozen-lockfile (CI will now pass).
Locked: yes — do not remove overrides; update version bounds when packages publish fixes.

## mapcn Vendor File Lint/TS Suppression (Phase 8 Batch 2 — Interactive Map)
Decision: File-level `/* eslint-disable */` + `// @ts-nocheck` headers on `apps/web/src/components/ui/map.tsx`
Rationale: The mapcn registry primitive (1844 lines, MIT) ships with 64 ESLint errors and 4 TS18048
errors under our strict config. The file is registry-managed — `npx shadcn@latest add @mapcn/map`
regenerates it on every pull, so inline fixes would be clobbered. Mirrors the pattern obs 82 used
for `map.test.ts` in sub-session 1.1.
Scope: Suppression applies ONLY to the vendor file. The thin `InteractiveMap` wrapper
(`apps/web/src/components/map/InteractiveMap.tsx`) and the map page route are clean under strict mode.
Re-validate on every mapcn upgrade — strict-mode compliance may land upstream.
Locked: yes — until mapcn ships strict-compliant or we vendor a maintained fork.

## User Management Dialogs — Strict-Mode Lint Deferral
Decision: Three pre-existing dialog files carry 13 ESLint errors under strict config — deferred
to dedicated `fix/user-dialogs-strict-mode` branch rather than fixed inline on `feat/interactive-map`.
Affected files (all on main, byte-identical to feat/interactive-map HEAD as of 2026-05-11):
  - apps/web/src/app/(dashboard)/users/create-user-dialog.tsx (7 errors)
  - apps/web/src/app/(dashboard)/users/edit-role-dialog.tsx (4 errors)
  - apps/web/src/app/(dashboard)/users/reset-password-dialog.tsx (2 errors)
Error classes: deprecated `FormEvent` import (typescript-eslint/no-deprecated),
no-confusing-void-expression on arrow shorthand handlers, strict-boolean-expressions on nullable strings.
Rationale: Errors are pre-existing tech debt unrelated to the interactive map feature.
Fixing them on the map branch would violate scope discipline (one feature per branch — Rule 23).
~6/13 are auto-fixable with `--fix`; remaining 7 need manual edits. A dedicated branch keeps the
diff readable and the fix attributable.
Impact: 1.2c merge proceeds with these lint errors on main. CI lint gate currently fails on main
for this reason (pre-existing). The `fix/user-dialogs-strict-mode` branch is queued as a separate
work item — owner to claim before next Feature Update touching that module.
Locked: yes — deferral confirmed; do not block 1.2c merge on these errors.

## ReportExport PDF Storage Backend (Phase 8 Batch 5 Item 3)
Decision: MinIO bucket per environment — pattern `marine-guardian-{env}-exports`
Rationale: packages/storage is the locked OSS choice (Rule 14). Local-disk path per v2
PRODUCT.md L777 (`/uploads/exports/{tenant_slug}/{year}/{month}/{export_id}.pdf`) encourages
single-server lock-in and complicates backups (separate tarball per v2 L811). MinIO signed
URLs simplify download auth and align with the existing STORAGE_* env infrastructure (already
provisioned but `packages/storage` source not yet built). Storage surface (uploadPdf,
getReadStream, delete) builds in Sub-batch 5.3c. Per-tenant prefix inside the bucket:
`{tenantSlug}/{year}/{month}/{exportId}.pdf` — matches v2's path semantics without the disk
mount. 30-day retention enforced by extending the existing maintenance worker (deferred).
Locked: yes — packages/storage MinIO adapter is the only PDF persistence path. Disk fallback
flag rejected (option 3 from decision matrix) — adds adapter complexity without a self-host
business need at v1 scale.

## PDF Renderer Service Auth (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: Custom `X-PDF-Renderer-Token` header + 48-char shared secret + constant-time compare
Rationale: The marine-guardian-pdf-renderer Docker service exposes `/render` only over the
internal Docker network (no host port). The web app's `/print-render/*` print target also
guards on the same header so the renderer can prove its identity when navigating back. JWT
or mTLS would be over-engineered for a fixed pair of trusted internal services on the same
Docker network. Service-token pattern matches the v2 PRODUCT.md L774-775 spec ("service-token
auth header"). Token rotates via CREDENTIALS.md + .env.{env} + container restart. Constant-time
compare implemented manually (no node:crypto.timingSafeEqual) because the middleware runs in
Next.js Edge runtime where node:crypto is unavailable — see
apps/web/src/server/lib/service-token-guard.ts. Mirror impl in deploy/pdf-renderer/src/server.js.
Locked: yes — header name + comparison strategy frozen across web + renderer + worker (5.3b).

## Puppeteer Concurrency + Rate Limiter (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: BullMQ pdf-render worker concurrency=2, limiter={max:5, duration:1000}
Rationale: Chromium PDF rendering is heavy on CPU + memory (~300-500MB resident per browser
instance, ~1-3s per page render). Concurrency=2 caps two concurrent renders per worker
container — exceeds this risks OOM on smaller staging/prod hosts. Limiter 5/sec is a per-worker
queue ceiling that smooths bursty admin "rebuild all reports" actions without backlogging the
queue. Scale throughput by running multiple worker container replicas rather than raising the
in-process concurrency. v2 PRODUCT.md §776-779 typical latency 3-30s — concurrency=2 sustains
~40-160 reports/min per worker container. Tune in production based on observed Active CPU.
Locked: yes — defaults frozen for 5.3b; revisit only after production telemetry justifies a change.

## PDF Renderer Internal Route Path (Phase 8 Batch 5 Sub-batch 5.3a)
Decision: Print-only render target lives at `/print-render/[tenantSlug]/[reportType]/[exportId]`
Rationale: v2 PRODUCT.md L724 specifies `/_print/{tenant_slug}/{report_type}/{export_id}` but
Next.js App Router treats folders prefixed with `_` as private folders that are excluded from
the routing system (`apps/web/src/app/_print/` would not generate a route). "Internal-only"
semantics are enforced by the X-PDF-Renderer-Token guard in middleware.ts (constant-time
compare bypasses the user-session auth gate, returns 401 without the header). The leading
underscore in the spec was conventional shorthand for "internal"; the service-token guard
makes that semantic explicit. URL-encoded folder name (`%5Fprint`) was considered and rejected
as it complicates tooling and IDE navigation.
Locked: yes — path frozen across web router + middleware guard + 5.3b BullMQ producer
(constructs printUrl from this template) + 5.3a Puppeteer service Dockerfile env.
