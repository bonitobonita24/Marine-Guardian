# Command Center Dashboard — Tactical Redesign

**Date:** 2026-06-26
**Status:** Design — awaiting spec review
**Scope:** Full visual + layout redesign of the War Room command center, plus two
additive backend procedures. Local-dev only (standing owner directive — no
staging/prod deploy).
**Framework:** Phase 7 Feature Update, V32.9. UI generated via the owner's
shadcn/studio Pro MCP (V32.11 routing: `/iui` → `/cui` → `/rui`),
INHERIT-not-REPLACE over existing components (Rule 12). All new procedures honor
L3 RBAC / L5 AuditLog-where-applicable / L6 tenant guardrails.

---

## 1. Goal

Rebuild the look and feel of the Command Center (`apps/web/src/app/(dashboard)/
dashboard/page.tsx` + its `_components/`) into a **dark-locked tactical
mission-control surface** — map-dominant, status-band-first, with cohesive
tactical styling and three new data surfaces (KPI sparklines, ranger roster,
coverage % headline). No working tRPC wiring is thrown away; panels are
restyled and recomposed in place.

### Owner decisions (locked during brainstorming)
1. **Scope:** full redesign, data on the table.
2. **Aesthetic:** dark tactical command center.
3. **Hero:** dominant live map + a persistent KPI/alert status band.
4. **Layout:** map-left hero + right rail (alerts/feed/patrols) + analytics row beneath, under the status band.
5. **New data:** KPI sparklines · ranger roster · coverage % headline.
6. **Theme:** dark **always** — theme-locked on this route only; the rest of the app still respects the global toggle.
7. **Response time:** deferred — show coverage % only until a real resolution timestamp exists.
8. **Roster:** a **separate** panel; the existing active-patrols panel stays unchanged in the rail.

---

## 2. Theme — dark-locked tactical surface

- A route-scoped wrapper (e.g. `.command-center` on the dashboard root) forces the
  dark token set on this page only. Other routes keep following the global
  light/dark toggle.
- Tactical accent language layered on the existing zinc base, expressed as **CSS
  variables in `globals.css`** (Rule 31 / Rule 3 — no hardcoded hex in
  components):
  - `cyan` — live / info / map telemetry
  - `amber` — warning / active events
  - `red` — alarm / unacknowledged
  - `green` — healthy / on-duty
- Subtle glow / elevated treatment reserved for **live and critical** elements
  only (unacked alarm tile, live map ping) — not applied globally.
- Existing semantic tokens already used by panels (`--warning`, `--success`,
  `--info`, `--destructive`) are remapped/confirmed against the tactical palette
  so existing `valueClass` references keep working.

## 3. Layout

Single non-scrolling viewport, CSS grid, responsive collapse to a stacked column
on small screens.

```
[ STATUS BAND — 5 KPI tiles w/ sparklines + unacknowledged ALARM tile ]
+----------------------------+----------------------+
|                            |   ALERTS (alarm)     |
|        LIVE MAP            +----------------------+
|        (dominant hero)     |   EVENT FEED         |
|                            +----------------------+
|                            |   ACTIVE PATROLS     |
+----------------------------+----------------------+
| LE bars | Monitoring | Coverage zones | RANGER ROSTER (new) |
```

- **Status band:** the 5 existing KPI tiles gain sparklines; the "Unacknowledged"
  tile is styled as the alarm (red, subtle pulse when > 0). Coverage % headline
  shown as a compact stat within/next to the band (client-derived — see §4).
- **Map:** dominant hero, left, large.
- **Right rail (unchanged data):** alerts → event feed → active-patrols.
- **Analytics band (bottom):** LE breakdown bars · Monitoring breakdown bars ·
  municipality/protected-zone coverage · **ranger roster (new panel)**.

## 4. New data — additive, tenant-scoped procedures

Two new `dashboard.*` procedures (`tenantProcedure`, range-aware via the existing
`rangeInput` shape, L6 tenant-scoped). The coverage % headline needs **no new
procedure** — it is a light client-side aggregation of the existing
`municipalityCoverage.protectedZoneCoverage` result.

1. **`dashboard.kpiTrends`** — daily-bucketed counts (events, patrols) across the
   active range. Returns small time-series arrays the KPI sparklines render. Pure
   read aggregation; no writes.
2. **`dashboard.rangerRoster`** — derived from `KnownRanger` + `Patrol`
   (`leaderName` / `state` / `startTime`). Returns per-ranger status
   (`on_patrol` / `on_duty` / `idle`) + last-seen time. Pure read aggregation.

**Coverage % headline (client-derived):** zones patrolled-in-range ÷ total zones,
from the already-fetched `protectedZoneCoverage` data. Honest empty state when no
zone data in range. No response-time metric (deferred per decision 7).

## 5. shadcn/studio Pro workflow (V32.11)

- **`/iui`** — inspiration for tactical command-center blocks (status band,
  roster, stat tiles).
- **`/cui`** — scaffold the new panels (sparkline KPI tile, roster,
  coverage-headline) as plain shadcn/ui.
- **`/rui`** — refine the tactical dark token pass across all panels for cohesion.
- Output stays **plain shadcn/ui**, INHERIT-not-REPLACE over the existing
  components (Rule 12).

## 6. Components touched / added

**Restyled in place (data wiring unchanged):** `page.tsx` (grid + theme wrapper),
`kpi-strip.tsx` (+ sparklines), `breakdown-bars.tsx`, `municipality-coverage-chart.tsx`,
`protected-zone-card.tsx`, `alerts-panel.tsx`, `event-feed.tsx`,
`active-patrols.tsx`, `last-incident-card.tsx`, `clock-card.tsx`,
`date-range-header.tsx`.

**New:** a sparkline sub-component for KPI tiles, `ranger-roster.tsx`, a coverage
% headline element, tactical theme tokens in `globals.css`.

**Untouched:** all drill-down modals (event/patrol/alert/kpi/breakdown), the
range context, all tRPC routers except the two new dashboard procedures.

## 7. Execution — gated sub-batches

Exceeds the 12-file / 500-line single-session budget, so it ships in gated
sub-batches. **Each sub-batch passes the hard pre-merge gate:**
`pnpm tools:check-product-sync && web typecheck && web test &&
pnpm --filter @marine-guardian/web build && scoped eslint clean`, on its own
`feat/...` branch, squash-merged.

- **A — Theme + layout shell:** scoped dark wrapper, tactical tokens in
  `globals.css`, new grid in `page.tsx`, restyle existing panels in place. No data
  changes. Visual QA checkpoint.
- **B — Backend procedures:** `dashboard.kpiTrends` + `dashboard.rangerRoster` +
  router tests (TDD — failing test first). No UI yet.
- **C — New panels:** sparkline KPI tiles (wire to `kpiTrends`), `ranger-roster.tsx`
  (wire to `rangerRoster`), coverage % headline (client-derived). Built via
  shadcn/studio Pro.
- **D — Polish + Visual QA:** `/rui` cohesion pass, Playwright QA @
  `http://localhost:45204` (admin@mail.com/admin, demo-site), screenshots to
  `docs/qa-screenshots/`, 0 console errors. Rebuild dev app first (compose has no
  source mount).

## 8. Out of scope (YAGNI)

- Response-time metric (no resolution timestamp — deferred).
- Light-mode variant of the command center (dark-locked by decision 6).
- Any staging/prod deploy (local-dev directive).
- New product entities or schema changes (the two new procedures are read-only
  aggregations over existing models).
- Changes to drill-down modal behavior or the range-context mechanics.

## 9. PRODUCT.md sync

The War Room section of `docs/PRODUCT.md` is updated (human-owned, Rule 1) to
note the tactical-dark command-center direction + roster / sparkline / coverage-%
surfaces, keeping spec ↔ implementation aligned (Rule 9). Done as a back-port step
during/after implementation, not a blocker.
