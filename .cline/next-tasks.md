# 🔒 LOCKED NEXT TASK — Patrol Schedule (Gantt) 7.1d — Visual QA fixes

**Generated:** 2026-05-29 9:45am GMT+8 (supersedes 7.1a/b/c queue — 7.1a+7.1b+7.1c shipped to main, infra fix 3fa0321 shipped)
**Branch:** `feat/patrol-schedule-7-1d` (already created, checked out)
**Trigger this in a FRESH Claude Code session.** Read this file BEFORE STATE.md.

---

## Scope: fix three Gantt rendering bugs surfaced by 2026-05-29 Visual QA

7.1a/b/c shipped correct backend + dialog flow + period-toolbar wiring, but the Kibo
Gantt component wasn't fully wired into the page's period state. Visual QA found 3
real bugs that block the module from being usable.

### What's already shipped (verified by Visual QA on 2026-05-29)

✅ **Route + auth** — `/patrol-schedule` accessible to tenant users (`site_admin`, `coordinator`)
✅ **Period toolbar** — prev/next nav, Today reset, Bi-weekly↔Monthly toggle, tRPC query refires with correct from/to
✅ **CRUD dialogs (7.1b)** — Create (ranger autofill from user.fullName), Edit (pre-fills 5 fields), Delete (confirmation + cleanup)
✅ **Manage assignments list** — correctly shows "Ranger / Area · date range" with Edit/Delete actions
✅ **Empty state** — "No scheduled patrols found. Add patrol schedules to see them here."
✅ **Sidebar nav link** — "Patrol Schedule" between Patrols and Subjects
✅ **Production build** — unblocked by infra fix 3fa0321 (vendor folder lint ignores + context-menu modernization)

### Bugs to fix in 7.1d

#### Bug A — Gantt viewport unsynced with period toolbar (HIGH)

File: `apps/web/src/app/(dashboard)/patrol-schedule/_components/gantt-view.tsx:67`

Current:
```tsx
<GanttProvider range="daily">
```

Problem: GanttProvider receives no `scrollDate`/`from`/`to` props, so Kibo defaults to
an internal anchor — visible timeline shows ~June 20+ even when period toolbar selects
"May 29 – Jun 11, 2026". Schedules in the period render off-screen left, drag/resize
untestable, "Today" indicator visible but unrelated to selected period.

Fix: pass period range to GanttProvider. Check Kibo UI Gantt docs (use context7) for the
exact prop name — likely `scrollDate`, `currentDate`, or a `range`/`startDate` combination.

Add `Props.fromDate: Date` + `Props.toDate: Date` (or `period: { from, to }`) to
`GanttViewProps` and have `page.tsx` pass its period state down. Then pipe into Kibo's
viewport anchor prop. Verify: with toolbar "May 29 – Jun 11" and a schedule for Jun 2-5,
the bar renders inside the visible timeline at the correct column.

#### Bug B — Gantt rows labeled by PatrolArea instead of Ranger (HIGH)

File: `apps/web/src/app/(dashboard)/patrol-schedule/_components/gantt-view.tsx:73-76`

Current renders `<GanttSidebarItem feature={toGanttFeature(item)} />` per schedule item.
`toGanttFeature(item)` evidently sets `feature.name = item.patrolArea.name` (or similar),
so each schedule row's sidebar label is the area name, not the ranger.

Per 7.1a spec (`next-tasks.md` line 45 in the v1 queue): "rows=rangers, cols=days,
cells colored by PatrolArea.colorHex".

Fix: render ONE sidebar row PER RANGER (not per schedule). Group schedules by
`rangerName`, render `<GanttSidebarItem feature={{ id: rangerKey, name: rangerName, ... }}>`
once per ranger. Then in `<GanttFeatureRow features={features}>`, pass all that ranger's
schedule items — each feature gets the PatrolArea.colorHex.

Check `toGanttFeature()` definition in same file or `kibo-ui/gantt/index.tsx`. The
feature shape likely has `{ id, name, startAt, endAt, color, ... }`. Sidebar reads
`name`, timeline draws bars from `startAt/endAt` colored by `color`.

#### Bug C — Kibo default "Issues" / "Duration" column headers (LOW polish)

The Kibo UI Gantt sidebar header reads "Issues" + "Duration" out of the box. Domain
mismatch for patrol scheduling.

Fix paths (pick one):
1. Check if `<GanttSidebar>` accepts a `headerLabel` or similar prop
2. Wrap sidebar with a custom header div above `<GanttSidebar>` and CSS-hide the
   default Kibo header row
3. Override directly in `apps/web/src/components/kibo-ui/gantt/index.tsx` (vendor file,
   already excluded from lint by 3fa0321 — safe to modify) — change literal strings
   "Issues" → "Patrols", "Duration" → "Span"

### Out of scope for 7.1d

- Bug #6 (super_admin gets 403/401 on tenant pages) — defer to dedicated PR for layout-
  level role gate. Affects all tenant pages, not just patrol-schedule. Separate scope.
- Bug #7 (empty seed) — defer to dedicated seed-expansion PR covering all 10+ missing
  entity types. Separate scope.
- Drag-resize verification — was blocked by Bug A. After Bug A fixed, Visual QA needs
  to verify: (i) drag block on timeline → update mutation fires → schedule moves to new
  start date, (ii) resize right edge → update changes scheduledEnd, (iii) optimistic UI
  reverts on server error.

### Pre-flight checklist (run in fresh session before any code)

- [ ] Confirm on branch `feat/patrol-schedule-7-1d` (already created)
- [ ] Read `apps/web/src/app/(dashboard)/patrol-schedule/page.tsx` to understand period state shape
- [ ] Read `apps/web/src/app/(dashboard)/patrol-schedule/_components/gantt-view.tsx` in full
- [ ] Read `apps/web/src/components/kibo-ui/gantt/index.tsx` — find GanttProvider props, GanttSidebar header, toGanttFeature equivalent
- [ ] Run `wc -l` on all files in scope — confirm Tier 1 (≤500 lines per V32 R2)
- [ ] Verify dev container has 3fa0321 (the lint-vendor-ignores fix) — if not, rebuild: `bash deploy/compose/start.sh dev up -d`

### Tier classification (V32 §1)

Files to read: ~3 (page.tsx + gantt-view.tsx + kibo-ui/gantt/index.tsx)
Files to modify: ~2 (gantt-view.tsx + maybe page.tsx) + 1 (kibo-ui/gantt/index.tsx if Bug C taken)
Estimated lines: page.tsx ~150L + gantt-view.tsx ~100L + targeted edits to kibo gantt (vendor, scoped to header literals)
**Tier 1 — dispatch single Sonnet task per V32 R2.**

### Verification before squash-merge

- [ ] `pnpm typecheck` clean in apps/web
- [ ] `pnpm test` — gantt-view test (if added) passes
- [ ] Rebuild dev container (`bash deploy/compose/start.sh dev up -d`) — production `next build` succeeds
- [ ] Visual QA: login as `site_admin`, create a 4-day schedule in current bi-weekly window, verify:
  - Bar renders in visible Gantt timeline at correct date column
  - Sidebar row label = ranger name (not patrol area)
  - Bar color = PatrolArea.colorHex
  - Drag bar 2 days right → mutation fires → bar moves + persists on refresh
  - Resize right edge → mutation fires → bar extends
- [ ] Squash-merge `feat/patrol-schedule-7-1d` → main, delete branch, push origin/main
- [ ] After ship: Patrol Schedule module COMPLETE per PRODUCT.md 102-109

---

## Out of immediate scope (next backlog after 7.1d)

1. **Bug #6** — super_admin tenant-page redirect (`(dashboard)/layout.tsx` role gate)
2. **Bug #7** — Seed expansion (PatrolSchedule + Event + Patrol + Subject + FuelEntry + Observation + Alert + AreaBoundary + ReportExport fixtures)
3. **Super Admin Panel** — PRODUCT.md line 210, cross-tenant ops (deferred from prior queue)
4. **5.1d Area A re-derive on areaName change** — still BLOCKED (ER sync doesn't emit area_name)
5. **Schedule conflict detection** — overlapping ranger assignments, v2 enhancement
