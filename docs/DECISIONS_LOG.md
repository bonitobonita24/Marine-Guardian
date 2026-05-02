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
