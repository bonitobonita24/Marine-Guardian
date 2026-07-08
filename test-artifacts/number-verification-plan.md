# Full-Scale Number Verification — /ph tenant (Marine Guardian)

Started 2026-07-09. FULL AUTO. Task: verify ALL report/map/chart numbers vs DB ground truth.

## Ground truth
- tenant ph = `cmoruubw20000gmx3jx7zudmy` (3206 events, 4940 patrols). Other tenants empty.
- DB: `docker exec marine-guardian_dev_postgres psql -U marine-guardian_0780f966cea5c4453a07ed -d marine-guardian_dev`
- App: http://localhost:45204 — login /ph/login  admin@mail.com / admin (site_admin)
- Branch: feat/ph-tenant-slug @ 57f6eea (dev-only, unpushed)

## Surfaces
- A: Report Map — reportMap.ts + map.ts (categories, patrols, high-priority, terrain, muni, MPA filters)
- B: Command Center — dashboard.ts (KPIs + charts)
- C: PDF Reports — reportExport.ts + reportTemplate.ts (per-area + coverage)

## Phases
1. [IN PROGRESS] Parallel code+DB analysis per surface → expected numbers + logic bugs (subagents, no Playwright)
2. [ ] Playwright spot-check UI displayed numbers vs Phase-1 ground truth (me, serial)
3. [ ] Fix discrepancies on NEW branch (gate + QA)

## Phase-2 Report Map UI spot-check: ✅ PASS
- Wide range (2020-01-01→2026-07-09): UI LE 439 ✓ / Monitoring 1,998 ✓ / High Priority 364 ✓ / Patrols 4,786 (=4940−154 null-start, correct for date-bounded) ✓.
- Default Last-30D: LE 1 / Monitoring 44 (5+27+12 ✓) / HighPri 13 / Patrols 44.
- Single-day 2026-07-08: UI Monitoring 4 / LE 0 == DB (Manila-day) 4 / 0 ✓ → END-OF-DAY INCLUSIVE, advisory #1 = NO BUG.

## Phase-2 captured UI numbers (for compare vs Phase-1 ground truth)
### Command Center /ph/dashboard (now = 2026-07-09 ~01:18, "War Room" last-48h/this-month)
- Active Events: 0 | Unacknowledged alerts 24h: 1701 | Active Patrols: 29 | Rangers on Duty: 0
- Events This Month: 434 (+48 vs last month) | Last Incident: None
- Law Enforcement (48h): 0 | Monitoring (48h): 13 = Infrastructure 1 + Community Support 6 + Threats on Habitat 6 ✓ (sum==headline)
- Protected Zones Jul7–Jul9: 0% (0/2). Apo Reef 0P/1E, Harka 0P/0E
- Ranger Roster: 11 on patrol · 11 active · 45 idle | Recent Patrols: 0

### Events /ph/events
- 3206 total | 23 new | 0 active | 3183 resolved (sum 3206 ✓; == DB ph total 3206 ✓ — cross-consistency anchor PASS)

## Findings

### Surface C — PDF Reports (reportExport/reportTemplate → per-area-report + coverage-report data builders): ✅ NO LOGIC BUGS
- Aggregation lives in apps/web/src/server/per-area-report/get-per-area-report-data.ts + coverage-report/get-coverage-report-data.ts.
- Correct fields: events `reported_at`, patrols `start_time`, fuel `date_received` (no occurred_at misuse). Half-open [start,end). Correct tenant+area scoping. Distance `computedDistanceKm ?? totalDistanceKm` consistent both reports. testPatrol/soft-delete excluded. Breakdown order count DESC / display ASC.
- Coverage June-2026 reproduced EXACTLY: 315 patrols (146 foot / 169 seaborne).
- DATA-QUALITY notes (NOT code bugs, faithfully reflected): per-area reports near-empty in ph (0/4940 patrols + only 157/3206 events carry area_boundary_id; real 439 LE + 1996 monitoring events have NULL area_boundary_id — area-derivation backfill gap). Coverage distances mostly blank (computed_distance_km on only 1283/4940 patrols). → potential owner [WHAT]: run area-attribution + distance materialization backfill.
- Latent (not triggered by ph): resolveTenantOffsetMinutes hardcodes +480 for any non-UTC tz (fine for PH/ID UTC+8; future non-UTC+8 tenant would break period bounds) — documented/deferred in JSDoc.

### Surface A — Report Map (reportMap.ts + map.ts): ✅ NO LOGIC BUGS
- Ground truth (wide/all-data, non-skylight): totalEvents 2469 (raw 3206 − 737 skylight); LE 439; Monitoring 1998; patrols 4940; highPriority 364; terrain All 2469 / Land 1231 / Water 1127 (111 null-terrain in All only ✓); MPA Apo Reef events 33 / patrols 206.
- Skylight excluded via NOT(display ILIKE %skylight%), consistent in map.ts live markers (markers==report numbers). highPriority identical across SQL + JS paths (SERIOUS_EVENT_PATTERNS). NULL terrain/municipality correctly excluded from specific bucket, retained in total. eventsOverTime series sum == filtered count.
- PHASE-2 TO CONFIRM: (1) filter bar sends end-of-day for `to` (bounds are inclusive on raw ts — if caller passes midnight, end day drops); (2) eventsOverTime patrol series = 4786 (drops 154 null-start_time patrols) vs KPI 4940 — intentional, numbers differ legitimately.
- Narrow scenario (terrain=water + Calapan + 2025): events 3, patrols 113 — reconciles.

### Surface B — Command Center (dashboard.ts): 🔴 1 BUG + 2 [WHAT] caveats
- ✅ Reconciled: activePatrols 29, eventsThisMonth 434, eventsLastMonth 386, eventBreakdown LE bars sum 439 / monitoring 1998, kpiTrends event buckets sum 45==window, patrols 44, rangerRoster.total 56, onPatrol 11, lastIncident (Vessel Intrusion pri200 2026-05-29). Ranges inclusive both ends, tenant-scoped, no dedup double-count. No "sum==headline" invariant violation (there is no total-events headline; breakdown deliberately excludes skylight + non-ER categories).
- 🔴 **BUG 1 — rangersOnDuty KPI = 0 vs rangerRoster onPatrol = 11** (dashboard.ts:76-114). KPI derives on-duty ONLY from AccompanyingRanger rows on open patrols, but open patrols have 0 such rows (all 4653 on completed patrols). Roster (dashboard.ts:428-489) additionally uses patrolSegment leaders → 11. Two tiles, same concept, contradict. Router comments L120-126/L424-427 acknowledge the gap was closed for roster but not the KPI. FIX = mirror roster's leadsOpenPatrol segment-leader logic into rangersOnDuty. → FIXING on new branch.
- 🟡 CAVEAT A [WHAT-defer]: activeEvents tile filters state='active' which is never populated (only new_event 23 / resolved 3183) → permanently 0. Product may intend new_event. Owner confirm.
- 🟡 CAVEAT B [WHAT-defer]: alertStats tile labeled "last 24h" but War Room feeds [now-7d,now] → counts 7d (~2211) not 24h (~735). Fix window or relabel — owner confirm intent.
