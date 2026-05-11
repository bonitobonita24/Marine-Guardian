# Phase 8 Batch 2 — Thrashing Recovery Split Plan
Generated: 2026-05-11 by Opus (Architect mode)
Trigger: Context thrashing during interactive map implementation. Memory governance §5 Step 2 baseline + §1 Tiered Decomposition applied.

## Baseline State (§5 Step 2)

- Phase 8 Batch 2 alerts engine: ✅ shipped 2026-05-11 (commit 9eb5c26 — alert enqueue wired from ER sync)
- Map decision: **mapcn (MapLibre GL)**, NOT Leaflet — locked in DECISIONS_LOG.md lines 68-72
- Webmaster password rule: AI-generated, stored in CREDENTIALS.md, never hardcoded in seed
- Sonnet effective workspace on this project: ~15K tokens (not 60K). All Sonnet tasks below capped at ≤25K to leave reasoning headroom.
- Single-tenant mode active. tenantId nullable. L3/L5/L6 always active.
- UserRole enum: `super_admin | site_admin | field_coordinator | operator`

## Task Queue (5 features, classified)

| # | Feature | Tier | Sub-sessions |
|---|---|---|---|
| 1 | Interactive map (`/map`) | 3 | 3 |
| 2 | Notification.patrolId FK + click-through | 2 | 1 |
| 3 | Real-time notifications | 3 | 3 |
| 4 | Exports (PDF/CSV) | 3 | 3 |
| 5 | Alert history log | 2 | 1 |
| **Total** |  |  | **11 Sonnet sessions** |

---

## SUB-SESSION 1.1 — Map: tRPC geo router + mapcn install

**Tier:** 2 | **Estimated tokens:** ~24K | **Branch:** `feat/interactive-map`

### Scope
- **Create:** `apps/web/src/server/trpc/routers/map.ts`, `apps/web/src/server/trpc/routers/__tests__/map.test.ts`
- **Modify:** `apps/web/src/server/trpc/_app.ts` (register `map` router)
- **Read (context only):** `apps/web/src/server/trpc/routers/dashboard.ts` (router pattern + L6 tenant scoping), `packages/db/prisma/schema.prisma` (Event/Subject/PatrolSegment/PatrolArea models — read ONLY these 4 models, not full file)

### Commands
```
git checkout feat/interactive-map   # branch created in 1.1
cd apps/web && npx shadcn@latest add @mapcn/map
```

### ✅ Install command resolved (investigated 2026-05-11 after 1.1)
The framework `ui-rules.md` references the stale URL `https://mapcn.dev/maps/map.json` (404). The canonical command from mapcn.dev/docs/installation is the **namespace form**:

```
npx shadcn@latest add @mapcn/map
```

If shadcn namespaces aren't enabled in this project, the direct registry URL is:
```
npx shadcn@latest add https://mapcn.dev/r/map.json
```

Both install `maplibre-gl` + add `src/components/ui/map.tsx` exporting `Map` and `MapControls`. Default tiles: free CARTO basemaps, auto-themed with shadcn dark mode. Dependency `lucide-react` already present.

### Usage pattern (per mapcn docs)
```tsx
import { Map, MapControls } from "@/components/ui/map";
import { Card } from "@/components/ui/card";

<Card className="h-[calc(100vh-12rem)] p-0 overflow-hidden">
  <Map center={[124.0, 1.5]} zoom={6}>
    <MapControls />
  </Map>
</Card>
```

Note: mapcn `center` order is `[lon, lat]` (MapLibre convention), NOT `[lat, lon]`.

### Framework note
`ui-rules.md` install URL is stale — should be updated. Defer that doc fix to a separate chore commit; do not bundle with feature work.

### Procedures (4 protectedProcedures, all tenant-scoped)
- `map.events.list({ bbox?, since? })` → returns `{ id, locationLat, locationLon, eventType, priority, time, title }[]` — only events with non-null coords
- `map.subjects.list()` → returns `{ id, name, lastPositionLat, lastPositionLon, lastPositionAt, isStale }[]` — `isStale = lastPositionAt < now - 1h`
- `map.patrolTracks.list({ patrolId? | activeOnly? })` → returns `{ patrolId, points: { lat, lon, recordedAt }[] }[]` — joins PatrolSegment via Patrol
- `map.patrolAreas.list({ activeOnly? })` → returns `{ id, name, polygonGeojson, colorHex, patrolType }[]`

### TDD (write FIRST, RED → GREEN)
- Each procedure: 1 happy-path test + 1 cross-tenant isolation test (verify L6 guards reject other tenant's data)

### Validation Checklist
- [ ] `pnpm --filter @marine-guardian/web typecheck` exits 0
- [ ] `pnpm --filter @marine-guardian/web test src/server/trpc/routers/__tests__/map.test.ts` passes
- [ ] mapcn `Map` component visible in `apps/web/src/components/ui/` (or wherever shadcn installed it)
- [ ] No files outside scope modified

---

## SUB-SESSION 1.2 — Map: Base InteractiveMap component + page integration

**Tier:** 2 | **Estimated tokens:** ~22K | **Branch:** `feat/interactive-map` (continue from 1.1)

### Scope
- **Create:** `apps/web/src/components/map/InteractiveMap.tsx` (client component, `'use client'`)
- **Modify:** `apps/web/src/app/(dashboard)/map/page.tsx` (replace placeholder, render `<InteractiveMap />`)
- **Read (context only):** mapcn-installed file path (find via `ls apps/web/src/components/ui/` after 1.1), `apps/web/src/components/layout/` for layout pattern reference

### Component spec
- Default center: average of all subject positions OR Indonesian/Philippine MPA bbox fallback (lat: -2, lon: 122)
- Default zoom: 6
- Loads MapLibre style: shadcn-themed (auto from mapcn install)
- Empty layer scaffold — layers added in 1.3
- Loading state via Suspense boundary
- Container: `h-[calc(100vh-12rem)]`

### Validation Checklist
- [ ] `pnpm --filter @marine-guardian/web build` exits 0 (catches SSR/RSC boundary issues)
- [ ] Page renders empty themed map at `/[tenant]/map`
- [ ] No hydration errors in dev server console

---

## SUB-SESSION 1.3 — Map: Layers + LayerControl

**Tier:** 2 | **Estimated tokens:** ~28K | **Branch:** `feat/interactive-map` (continue from 1.2 → squash-merge after)

### Scope
- **Create:**
  - `apps/web/src/components/map/EventLayer.tsx` — pins, color by priority
  - `apps/web/src/components/map/SubjectLayer.tsx` — markers + staleness indicator badge
  - `apps/web/src/components/map/PatrolTrackLayer.tsx` — polylines, foot=blue / seaborne=green
  - `apps/web/src/components/map/PatrolAreaLayer.tsx` — filled polygons from `polygonGeojson`
  - `apps/web/src/components/map/LayerControl.tsx` — shadcn Card with 4 toggle switches
- **Modify:** `InteractiveMap.tsx` (compose all 5)

### Layer rules
- Each layer subscribes via tRPC client to corresponding `map.*.list` query
- Each layer accepts `visible: boolean` prop from LayerControl state
- Click on marker → shadcn Popover with detail; no router navigation in this sub-session

### Validation Checklist
- [ ] `pnpm --filter @marine-guardian/web build` exits 0
- [ ] All 4 layer toggles work (manual visual test in dev server)
- [ ] `pnpm --filter @marine-guardian/web typecheck` exits 0
- [ ] Squash-merge `feat/interactive-map` to main, delete branch
- [ ] STATE.md updated, CHANGELOG_AI.md entry added (Agent: CLAUDE_CODE)

---

## SUB-SESSION 2 — Notification.patrolId FK + click-through

**Tier:** 1/2 | **Estimated tokens:** ~20K | **Branch:** `feat/notification-patrol-fk`

### Scope
- **Modify:** `packages/db/prisma/schema.prisma` (add `patrolId String? @map("patrol_id")` + relation), `apps/web/src/server/trpc/routers/notifications.ts` (or wherever notif queries live), `apps/web/src/components/notifications/NotificationItem.tsx` (or equivalent — render link when patrolId present)
- **Create:** new Prisma migration via `pnpm --filter @marine-guardian/db prisma migrate dev --name add_patrol_id_to_notification --create-only` (then edit + run)
- **Read (context only):** existing Notification model, alerts processor (where notifications are created — wire patrolId where alert source has it)

### Validation Checklist
- [ ] Migration up + down both succeed
- [ ] `pnpm db:generate` + `pnpm typecheck` clean
- [ ] Test: notification with patrolId renders link to `/[tenant]/patrols/[id]`; without patrolId renders no link
- [ ] No cross-tenant leak (link is tenant-scoped)

---

## SUB-SESSION 3.1 — Realtime: SSE endpoint + auth handshake + heartbeat

**Tier:** 3 | **Estimated tokens:** ~25K | **Branch:** `feat/realtime-notifications`

### Scope
- **Create:**
  - `apps/web/src/app/api/notifications/stream/route.ts` — Next.js Route Handler, **manual auth required** (security rule #11)
  - `apps/web/src/server/lib/sse-channel-registry.ts` — in-memory tenant-scoped channel registry
  - `apps/web/src/app/api/notifications/stream/__tests__/route.test.ts`
- **Read:** `apps/web/src/server/auth/` config for `getServerSession` pattern

### Hard rules
- Auth at handshake: `getServerSession()` → reject 401 if missing
- Extract `tenantId` from session, NEVER from query params
- Heartbeat: send `event: ping` every 30s
- On role/tenant change: close connection (verify securityVersion match)
- Channel naming: `${tenantId}:notifications`
- Comment at top: `// Non-tRPC: manual auth required`

### Validation Checklist
- [ ] Test: connection without session → 401
- [ ] Test: connection with session → 200 + open event stream
- [ ] Test: stale securityVersion → connection closed
- [ ] No `tenantId` returned in client-visible payloads (security rule #13)

---

## SUB-SESSION 3.2 — Realtime: pub/sub + alerts processor integration

**Tier:** 3 | **Estimated tokens:** ~22K | **Branch:** `feat/realtime-notifications` (continue)

### Scope
- **Create:** `apps/web/src/server/lib/notification-publisher.ts` (publishes to channel registry from 3.1)
- **Modify:** `packages/jobs/src/processors/alerts.processor.ts` (after notification DB insert, call publisher)
- **Tests:** integration test — alert evaluation triggers SSE message on subscribed channel

### Validation Checklist
- [ ] Existing alerts processor tests still pass (16/16)
- [ ] New test: notification creation publishes to correct tenant channel
- [ ] No publishing to global channel (security rule)

---

## SUB-SESSION 3.3 — Realtime: client hook + notification panel integration

**Tier:** 2 | **Estimated tokens:** ~20K | **Branch:** `feat/realtime-notifications` (continue → squash-merge)

### Scope
- **Create:** `apps/web/src/hooks/useNotificationStream.ts` (EventSource wrapper, auto-reconnect, heartbeat detect)
- **Modify:** notification panel component to subscribe + invalidate tRPC cache on new notification

### Validation Checklist
- [ ] Manual test: trigger alert → notification appears in UI within 2s without page reload
- [ ] Connection survives 5min idle (heartbeat keeps alive)
- [ ] Squash-merge, delete branch, governance update

---

## SUB-SESSION 4.1 — Exports: CSV utility + Event Log endpoint

**Tier:** 2 | **Estimated tokens:** ~22K | **Branch:** `feat/exports`

### Scope
- **Create:**
  - `apps/web/src/server/lib/csv-export.ts` — generic CSV streaming util
  - `apps/web/src/app/api/exports/events/route.ts` — Route Handler, manual auth, tenant-scoped
- **Tests:** CSV escaping (quotes, commas, newlines), tenant isolation

### Validation Checklist
- [ ] Streaming works (no full buffer for >10K rows)
- [ ] Cross-tenant request returns 404 (not 403 — security rule)

---

## SUB-SESSION 4.2 — Exports: PDF utility + Per-Area Report

**Tier:** 2 | **Estimated tokens:** ~25K | **Branch:** `feat/exports` (continue)

### Scope
- **Install:** `@react-pdf/renderer` in apps/web (server-only — confirm SSR compatibility before committing)
- **Create:** `apps/web/src/server/lib/pdf-export.ts`, `apps/web/src/app/api/exports/reports/per-area/route.ts`, PDF templates (header, KPI cards, bar charts as static SVG)
- **Tests:** PDF byte-stream non-empty, includes tenant name

### Validation Checklist
- [ ] PDF generates for sample tenant data
- [ ] No client bundle bloat (verify @react-pdf only in server bundle)

---

## SUB-SESSION 4.3 — Exports: Ranger Perf CSV + Consolidated PDF + UI buttons

**Tier:** 2 | **Estimated tokens:** ~22K | **Branch:** `feat/exports` (continue → squash-merge)

### Scope
- **Create:** ranger performance CSV endpoint, consolidated report PDF endpoint, UI download buttons in 3 report pages
- **Modify:** Reports — Per Area / Consolidated / Ranger Performance pages — add Export buttons

### Validation Checklist
- [ ] All 4 export buttons work end-to-end
- [ ] Squash-merge, governance update

---

## SUB-SESSION 5 — Alert history log

**Tier:** 1/2 | **Estimated tokens:** ~20K | **Branch:** `feat/alert-history`

### Scope
- **Create:** `apps/web/src/app/(dashboard)/alerts/history/page.tsx` — table of past alert evaluations + outcomes (notification sent, suppressed, error)
- **Modify:** `apps/web/src/server/trpc/routers/alerts.ts` — add `alerts.history.list({ since?, limit?, ruleId? })` paginated query
- **Read:** existing alert evaluation log table in schema (or add one in this sub-session if missing — check first via `grep -i alert.*log packages/db/prisma/schema.prisma`)

### Validation Checklist
- [ ] Page renders empty state + populated state
- [ ] Pagination works (default 50, max 200 — security rule)
- [ ] Squash-merge, governance update

---

## Execution rules for each Sonnet sub-session

1. Open NEW Claude Code session (fresh context)
2. Sonnet reads ONLY this file's relevant sub-session block + STATE.md (don't open the whole plan)
3. Sonnet executes scope exactly — no exploration outside listed files
4. Sonnet runs validation checklist before committing
5. Sonnet outputs status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
6. Opus reviews → next sub-session
7. STATE.md rewritten between sub-sessions

## Escalation triggers

- Sonnet re-reads same file >1× → STOP, re-decompose
- Sonnet output exceeds estimated tokens by >30% → STOP, re-decompose
- Validation checklist fails twice → Opus takes over implementation (Step 2.5b)
