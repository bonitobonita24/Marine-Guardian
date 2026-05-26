# 🔒 LOCKED NEXT TASK — Fuel Logging UI

**Generated:** 2026-05-26 5:15pm GMT+8
**Trigger this in a FRESH Claude Code session.** Read this file BEFORE STATE.md.

---

## Scope: Build the Fuel Logging UI module

PRODUCT.md declares Fuel Logging (line 111) but no `/fuel` route exists.
Backend is ~80% done — only UI is missing.

### What's already shipped

**Schema** (`packages/db/prisma/schema.prisma` line 468):
- `FuelEntry` model with: tenantId, areaName (NOT NULL), dateReceived, litersReceived, totalPrice, receiptPhotoUrl, notes, loggedByUserId
- Relations: Tenant.fuelEntries, User.loggedFuelEntries, AreaBoundary.fuelEntries
- Area-keyed allocation locked (decision in obs 3885 + 6.2c)

**tRPC router** (`apps/web/src/server/trpc/routers/fuelEntry.ts`):
- `list` (tenantProcedure) — filter by area + date range
- `getById` (tenantProcedure)
- `create` (operatorProcedure) — operator+ can log fuel
- `update` (operatorProcedure) — own entries
- `updateAny` (coordinatorProcedure) — coordinator+ can edit any
- `delete` (adminProcedure)

**Area derivation** (`packages/jobs/src/lib/area-derivation.ts` line 94):
- FuelEntry has areaName NOT NULL, derives areaBoundaryId on save
- area-rederive job already fans out to FuelEntry on boundary change

**Reports integration** (Per Area Report — Batch 6.2c, shipped):
- Average L/km KPI = sum(litersReceived in area+period) ÷ sum(seabornePatrolKm in area+period)
- PatrolTrack materialization shipped (Batch 5 item 2)
- All math wired — UI just needs to surface the entries

### What this session must build

PRODUCT.md spec (lines 111-128) requires:

1. **`/fuel` route** — fuel log list + analytics dashboard
   - Chronological table: date, area, liters, price, logger, photo thumbnail, notes
   - Filters: area, date range
   - Photo upload via MinIO presigned URL (storage helper exists)

2. **Fuel entry form (dialog)**
   - Fields: area (select from tenant's AreaBoundary list), dateReceived, litersReceived, totalPrice, receiptPhoto (camera capture or file), notes
   - Calls fuelEntry.create

3. **Edit/delete actions** per row (role-gated per existing router)

4. **Fuel consumption analytics**
   - Average L/km per area for selected period
   - Period selectors: daily, weekly, monthly, quarterly, annually
   - Trend chart (line): L/km over time
   - Summary KPIs: total liters, total cost, total seaborne km, average L/km
   - Per-area breakdown table
   - DECISION NEEDED: new tRPC procedure `fuelEntry.consumptionAnalytics` or reuse Per Area Report logic? Check Batch 6.2c implementation first.

### Out of scope for the first ship

- Mobile fuel logging (PRODUCT.md Mobile Needs — check if declared, may be v2)
- Multi-currency conversion (tenant currency assumed single per deployment)
- Cross-tenant analytics (super admin panel)

### Files to create (estimate)

- `apps/web/src/app/(dashboard)/fuel/page.tsx` — list + filters + analytics
- `apps/web/src/app/(dashboard)/fuel/_components/fuel-entry-dialog.tsx` — create/edit form
- `apps/web/src/app/(dashboard)/fuel/_components/fuel-analytics-panel.tsx` — KPIs + trend chart
- Sidebar nav update — add "Fuel" link in `apps/web/src/components/sidebar.tsx`
- Possibly: `apps/web/src/server/trpc/routers/fuelEntry.ts` — add `consumptionAnalytics` procedure

### Tier classification (per memory-governance.md §1)

Tier 2 likely: 4-7 files, 1-2 modules, depth 2. Estimate <40K tokens.
Single session feasible. Read PRODUCT.md only Fuel Logging section + Mobile Needs lines for mobile flag.

### Pre-flight checklist (run in fresh session before any code)

- [ ] Read `docs/PRODUCT.md` lines 111-128 (Fuel Logging section) AND grep for "fuel" in Mobile Needs (line 288-316)
- [ ] Read `apps/web/src/server/trpc/routers/fuelEntry.ts` in full to confirm router shape
- [ ] Read Per Area Report fuel rate logic — likely in `packages/jobs/src/lib/` or `apps/web/src/server/trpc/routers/reportExport.ts`
- [ ] Check if photo upload helper exists (MinIO storage package) — likely `packages/storage/`
- [ ] Check sidebar component for nav pattern
- [ ] Confirm decision on consumptionAnalytics procedure location

### Blocked / NOT this session

- **5.1d Area A inline re-derive on areaName change** — verified 2026-05-26: ER sync (`packages/jobs/src/processors/er-sync.processor.ts`) + ER client (`packages/jobs/src/lib/earthranger-client.ts`) have **zero** area references. ER does not emit area_name. Still BLOCKED until ER sync wires it. Separate work item.

---

## Out of immediate scope (next backlog)

After Fuel Logging UI ships:
1. **Patrol Schedule (Gantt)** — PRODUCT.md line 102-109. Net new. Higher complexity.
2. **Super Admin Panel** — PRODUCT.md line 210. Cross-tenant ops, narrow audience.
3. **5.1d Area A re-derive on areaName change** — unblocked once ER sync emits area_name.
