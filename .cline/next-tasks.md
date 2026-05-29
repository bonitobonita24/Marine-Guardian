# 🟢 NO LOCKED TASK — Patrol Schedule (Gantt) COMPLETE, pick next from backlog

**Generated:** 2026-05-29 11:16am GMT+8 (supersedes 7.1d scope — shipped a031a36)
**Trigger this in a FRESH Claude Code session.** Read STATE.md first.

---

## ✅ Just shipped

`a031a36 feat(patrol-schedule): complete Gantt module — Visual QA fixes (7.1d)`

All 4 sub-batches 7.1a/b/c/d in main. Patrol Schedule (Gantt) module satisfies
PRODUCT.md lines 102-109. Verified end-to-end via Playwright Visual QA against
dev container port 45204 — bar position synced with period toolbar, sidebar rows
= ranger names, header reads Rangers/Span, persistence across refresh, 0 console errors.

---

## Backlog — recommended priority order

### 1. Bug #6 — super_admin tenant-page redirect (HIGH, small scope)

**Symptom:** Logging in as `webmaster@marine-guardian.local` (super_admin, tenantId=null)
and visiting any tenant page (e.g. /patrol-schedule, /patrols, /events) produces
8x 403/401 console errors because tenant tRPC routers correctly reject null tenantId.

**Where to fix:** Layout-level role gate in `apps/web/src/app/(dashboard)/layout.tsx`.
Options:
- Redirect tenantId=null users to a super-admin-only landing (/admin/tenants?)
- Show a tenant picker if super_admin has access to multiple tenants
- Or: silently scope every tenant tRPC procedure to fall back to "first tenant" for
  super_admin — but that's a bigger architectural decision.

**Scope:** 1 file modify, ~30 lines + a redirect route. Tier 1.

**Why now:** Unblocks super_admin testing of every other module. Currently the
super_admin role is effectively unusable in the UI.

### 2. Bug #7 — Seed expansion for demo-ready UX (MEDIUM)

**Symptom:** Fresh seed leaves 10+ entity types empty. Every menu shows the "No X
found" empty state. Bad first impression for stakeholders / funder demos.

**Tables needing fixtures:**
PatrolSchedule (now we have a working UI — needs 5-10 sample assignments),
Event, Patrol, Subject, FuelEntry, Observation, Alert (rules + occurrences),
AreaBoundary (already have polygon UI ready), ReportExport.

**Where to fix:** `packages/db/prisma/seed.ts`. Add tenant-scoped fixtures for each
entity, referencing existing tenant + users + patrol areas.

**Scope:** 1 file modify, ~150-250 lines. Tier 1-2 depending on entity count chosen.

### 3. Super Admin Panel (PRODUCT.md line 210)

Cross-tenant ops — list all tenants, switch active tenant context, view audit log
across all tenants. Narrow audience but unlocks platform-level admin workflows.

### 4. Schedule conflict detection (v2 enhancement)

Detect overlapping ranger assignments (same ranger, overlapping date ranges).
Warning at create/update time. Optional — not in PRODUCT.md, would be a v2 feature.

### 5. 5.1d Area A re-derive on areaName change — STILL BLOCKED

Earth Ranger sync doesn't emit `area_name` in patch payloads, so we can't trigger
re-derivation on name change. Wait for upstream fix.

---

## Pre-flight (any new task)

- [ ] Read STATE.md first (this session's checkpoint)
- [ ] Run `wc -l` on all files in scope before dispatching each sub-batch (V32 R2 — ≤500L/task)
- [ ] Verify dev container is on commit a031a36 (`docker exec marine-guardian_dev_app ls /app`)
  — rebuild if not (`bash deploy/compose/start.sh dev up -d` + `docker compose build app`)
- [ ] Confirm CREDENTIALS.md (and `admin@demo-site.local` works in dev login)

---

## Tier classification reminders

- Tier 1 (single Sonnet, ≤500 lines, ≤4 files, 1 module): most bug fixes, small features
- Tier 2 (2-3 Sonnet dispatches, 501-1500 lines): typical feature modules
- Tier 3 (multi-agent split, >1500 lines): cross-cutting refactors

Per V32 R1: Opus NEVER calls Edit/Write on project files. STATE.md is the only Opus write.
Per V32.1: dispatch prompts ≤ ~1K tokens; verification runs on Opus side via ctx_execute.
