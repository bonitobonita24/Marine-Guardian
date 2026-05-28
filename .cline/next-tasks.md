# 🔒 LOCKED NEXT TASK — Patrol Schedule (Gantt)

**Generated:** 2026-05-29 1:00am GMT+8 (supersedes Fuel Logging UI queue — shipped 2026-05-26 commit bec437e)
**Trigger this in a FRESH Claude Code session.** Read this file BEFORE STATE.md.

---

## Scope: Build the Patrol Schedule Gantt UI module

PRODUCT.md lines 102-109 declare Patrol Schedule (Gantt) but no `/patrol-schedule` route exists.
Backend is ~90% done — only frontend + one permission fix needed.

### What's already shipped

**Schema** (`packages/db/prisma/schema.prisma` line 516):
- `PatrolSchedule` model: tenantId, patrolAreaId, rangerUserId (optional), rangerName, scheduledStart, scheduledEnd, notes, createdBy
- Relations: Tenant.patrolSchedules, PatrolArea.schedules, User."PatrolScheduleRanger" + "PatrolScheduleCreatedBy"
- Indexed on tenantId, patrolAreaId, rangerUserId

**tRPC router** (`apps/web/src/server/trpc/routers/patrolSchedule.ts`):
- `list` (tenantProcedure) — cursor pagination, filters: patrolAreaId, rangerUserId, from, to
- `create` / `update` / `delete` — currently `adminProcedure` (⚠ needs fix — see 7.1a)

**PatrolArea** — already has colorHex for zone color-coding (used in router `include`).

### Backend gap (fix in 7.1a)

PRODUCT.md line 229 grants Field Coordinator scheduling rights ("schedule ranger assignments (Gantt)").
Router uses `adminProcedure` for create/update/delete — should be `coordinatorProcedure`.
Fix in sub-batch 7.1a alongside the page scaffold.

### Library choice — locked

PRODUCT.md line 484: "Kibo UI (Kanban board, **Gantt chart**, rich text editor, file dropzone)".
Install via: `npx kibo-ui add gantt` (MIT, shadcn-native, already aligned with ui-rules.md Rule 7).

### Sub-batch decomposition (Tier 2 — V32 §1)

#### 7.1a — Gantt skeleton + permission fix (~400 lines)

Goal: Read-only Gantt page renders existing schedules. No mutations yet.

Files:
- CREATE `apps/web/src/app/(dashboard)/patrol-schedule/page.tsx` — page orchestrator, fetches list, RBAC gate (coordinator+ for write actions)
- CREATE `apps/web/src/app/(dashboard)/patrol-schedule/_components/gantt-view.tsx` — Kibo Gantt wrapper, rows=rangers, cols=days, cells colored by PatrolArea.colorHex
- MODIFY `apps/web/src/server/trpc/routers/patrolSchedule.ts` — change `adminProcedure` → `coordinatorProcedure` on create/update/delete (3 occurrences, lines 44, 70, 95)
- MODIFY `apps/web/src/components/sidebar.tsx` — add "Patrol Schedule" nav link with calendar icon
- MODIFY `apps/web/src/server/trpc/routers/patrolSchedule.test.ts` — update perm test expectations (admin→coordinator)
- Install Kibo Gantt component

Verify:
- pnpm typecheck clean
- vitest passes (router tests with new perm)
- /patrol-schedule renders existing seeded schedules as Gantt blocks

#### 7.1b — Assignment CRUD dialogs (~350 lines)

Goal: Create + edit + delete assignments via dialog flow.

Files:
- CREATE `apps/web/src/app/(dashboard)/patrol-schedule/_components/assignment-dialog.tsx` — shared create/edit dialog with ranger picker (User list), patrol area picker (PatrolArea list), date range picker, notes
- CREATE `apps/web/src/app/(dashboard)/patrol-schedule/_components/delete-assignment-dialog.tsx` — confirmation + delete mutation
- MODIFY `apps/web/src/app/(dashboard)/patrol-schedule/page.tsx` — wire "Add assignment" button + per-cell edit/delete actions, cache invalidation

Verify:
- Create flow works end-to-end
- Edit pre-fills correctly
- Delete confirms before deletion
- Coordinator-gated (operators see read-only)

#### 7.1c — Drag-resize + view toggles + period nav (~300 lines)

Goal: Full interactive Gantt per PRODUCT.md 102-109.

Files:
- MODIFY `apps/web/src/app/(dashboard)/patrol-schedule/_components/gantt-view.tsx` — wire Kibo onDrag/onResize handlers calling `update` mutation
- CREATE `apps/web/src/app/(dashboard)/patrol-schedule/_components/period-toolbar.tsx` — prev/next nav, date range picker, bi-weekly/monthly toggle (default: bi-weekly per locked decision)
- MODIFY page.tsx — wire period state, pass `from`/`to` to list query
- CREATE tests for drag handler logic + period bucketing

Verify:
- Drag block on timeline → update mutation fires → schedule moves
- Resize edge → update changes scheduledEnd
- Bi-weekly toggle = 14-day window, monthly = calendar month
- Prev/next steps by current view's window size

### Out of scope for first ship

- Recurring schedule templates (PRODUCT.md does not declare)
- Conflict detection (overlapping ranger assignments) — defer to v2 unless trivial
- Bulk assignment import — defer
- Mobile Gantt — desktop-only per PRODUCT.md line 304

### Locked decisions

- **Library:** Kibo UI Gantt (PRODUCT.md line 484, ui-rules.md Rule 7)
- **Default view:** bi-weekly (14-day cycle matches typical patrol planning cadence)
- **Permission:** Coordinator+ for write, all authenticated for read (PRODUCT.md line 229)
- **Color source:** PatrolArea.colorHex (already wired in router include)

### Pre-flight checklist (run in fresh session before any code)

- [ ] Read `docs/PRODUCT.md` lines 102-109 (Patrol Schedule section) + line 229 (Coordinator permissions) + line 304 (Mobile Ready clarification) + line 484 (Kibo Gantt locked)
- [ ] Read `apps/web/src/server/trpc/routers/patrolSchedule.ts` in full
- [ ] Read `apps/web/src/server/trpc/middleware/rbac.ts` to confirm `coordinatorProcedure` export shape
- [ ] Verify Kibo UI Gantt API: https://www.kibo-ui.com/components/gantt (use context7 if uncertain)
- [ ] Read sidebar component for nav pattern + icon convention
- [ ] Run `wc -l` on all files in scope before dispatching each sub-batch (V32 R2 — ≤500L/task)

---

## Out of immediate scope (next backlog)

After Patrol Schedule (Gantt) ships:
1. **Super Admin Panel** — PRODUCT.md line 210. Cross-tenant ops, narrow audience.
2. **5.1d Area A re-derive on areaName change** — still BLOCKED (ER sync doesn't emit area_name).
3. **Schedule conflict detection** — overlapping ranger assignments, v2 enhancement.
