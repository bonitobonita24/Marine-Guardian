# Marine Guardian — Pending Owner Decisions / Gates

> Un-gated work continues regardless; these items are re-surfaced each session until resolved.

---

## 🔴 2026-07-21 (FINAL) — `main` @ `bb2aa50` · STAGING LIVE · PROD UNTOUCHED

**Merged to `main` and PUSHED. CI built `sha-bb2aa50`. STAGING DEPLOYED AND VERIFIED.
PRODUCTION UNTOUCHED — still `sha-a08c700`.** One local unpushed commit: **`d7e246e`**
(staged prod-promotion runbook). HARD HOLD still holds on production.

📄 **Full detail: [`docs/SESSION_HANDOFF_0721.md`](./SESSION_HANDOFF_0721.md)** · promotion runbook:
[`docs/PROD_PROMOTION_READY.md`](./PROD_PROMOTION_READY.md). This block is the scannable queue.

### 🔴 OPEN OWNER DECISIONS — most important first

- [ ] **1. PRODUCTION PROMOTION — staged, rehearsed, green. The owner's call to run.**
  Runbook: `docs/PROD_PROMOTION_READY.md`. It was deferred earlier tonight (nothing was on staging, the
  ordering was unrehearsed, the owner was asleep) — **those conditions no longer hold**: staging is
  deployed and verified against prod-shaped data. ⚠ The runbook uses the **rehearsed stop → migrate →
  start** path = **brief production downtime**. A lower-downtime variant exists but is **NOT what
  staging exercised** — choosing it means promoting an unrehearsed sequence.

- [ ] **2. Water-polygon split-artifact fix — still not done, deliberately.** It **reverses the owner's
  own map-declutter decision** (`13a035f`). **14.0% (~3,052 km²)** of prod's legal zone unclaimed; only
  **9 records** change directly. *Recommendation:* unfiltered **authoritative** geometry + a separate
  **filtered display projection** + a **coverage/no-gap invariant**.
  *Lesson:* `geo.derivation.display-declutter-filter-mutilates-source-of-truth`.

- [ ] **3. The full-traversing toggle moves NO numbers at any scope.** The attribution backfill closed
  the gap it existed to fill. **Keep, rework, or remove?**

- [ ] **4. `/showcase/timeline` date presentation.** `TIMELINE_MODE` at
  `apps/web/src/app/showcase/timeline/_components/timeline-data.ts:41`, default `"phases"`. The
  `"dates-feb"` variant presents a start **earlier than the 2026-04-30 first commit**.

- [ ] **5. Carried forward:** exports ignore the new filters on both screens · hardcoded
  `SUBCATEGORY_GROUPS` · `robots.ts` now **fail-closed site-wide** · pre-existing **234px header
  overflow at 390px** · ER/DAS token minting · Slice-6 field-value backfill execution · PPTX **91 MB** ·
  DSR export TTL · demo Patrol Zone Alpha.

### ⭐ #1 NEXT-SESSION TASK (owner-directed) — full re-verification, dev **and STAGING**

Staging is now live, so verification runs against **both** — and their behaviour must **match**.

**Method requirements (non-negotiable):**
- **Confirm app AND worker image shas before trusting any behavioural result** (staging: both must be
  `sha-bb2aa50`; dev: freshly built off `main`, no source bind-mount). `--progress=plain` to a file,
  **never `| tail`**.
- **Do NOT run parallel Playwright agents** — concurrent browser agents corrupted evidence **twice**
  overnight. Run serially, or make a **URL assertion before every capture** mandatory.
- **N ≥ 5** on anything intermittent (**N ≥ 8** for React #418).

1. Rebuild dev app **and** worker off `main`; verify both shas.
2. Attribution backfill reconciles against SQL — 281 `title_hint` + 51 `nearest` patrols, 76 `nearest`
   events (7 ambiguous). Exact match.
3. Patrol municipality override + anti-clobber survives a **real ER sync tick**.
4. Event municipality override + anti-clobber — ⚠ path had **no guard** before `22f2de1`.
5. Patrol start/end time override + provenance badges — Manual / Derived / ER-supplied.
6. Four filters cross-checked against SQL counts — Events unattributed · Patrols unattributed ·
   Events subcategory+sorting · needs-review **on both screens**.
7. Seaborne track parity (`7386eb3`) — identical count with full-traversing on **and** off. **N ≥ 5.**
8. Clear-override actually recomputes (`4e7b1cb`) on **both** entities — assert the **DB delta**.
9. Provenance pairing CHECK holds — zero rows with id set / method NULL.
10. React #418 on `report_map` — **N ≥ 8**; **validate the detector on a known-positive first**.
11. BA header logo at 1440px and 390px.
12. `/showcase/timeline` — both `TIMELINE_MODE` values, reduced-motion, 3 breakpoints.
13. **Staging behaviour matches dev** — run 2–12 against staging; any divergence is a finding.

### ✅ Completed overnight

- **Prod 173-row stale-attribution correction — CONVERGED EXACTLY:** 173/173 at predicted target,
  **0** unpredicted, **0** manual overrides touched, `attributed_total` **4617 → 4603**, every
  municipality matching. Staging converged identically beforehand.
  Backup `/root/muni-catchup/backup/prod_patrols_20260720_191322.sql` (5,016 rows).
- **Merged to `main` + pushed** — **57 commits** (49 non-merge), spanning both the 07-20 reports/map
  session and the 07-21 attribution session. CI built `sha-bb2aa50`.
- **Staging deployed + verified** — all 6 gate steps green, **four** migrations applied against
  prod-shaped data, `prisma migrate status` **asserted** up to date (not inferred from health 200),
  zero unpaired provenance rows, filters/logo/`/showcase/timeline` live, app + worker both `sha-bb2aa50`.
- **Production untouched** — `sha-a08c700`, provenance columns absent.

> **FOUR migrations, not three:** `20260720000100_add_report_type_event_highlights` (pending from 07-20) ·
> `20260721000000` provenance columns · `20260721010000` title_hint enum · `20260721020000` pairing CHECK.
>
> **Figure correction:** Dumaran 271 / Roxas 368 / Baco 51 / 4603 are **PATROL** counts. **EVENT** counts
> are Dumaran **325** / Roxas **330** / Baco **21** / **5109**.
>
> **Repo convention:** this repo uses **real merge commits (`--no-ff`)**, not squash — `main`'s history
> preserves granular commits. This **contradicts Rule 23**; the actual convention wins.

### ⚠ A live defect found and fixed in the staging gate itself (`bb2aa50`)

The gate opened its SSH tunnel with `-L 5433:localhost:5433` — **local == remote `DB_PORT`**.
`ferrybook_dev_db` listens on 5433 on this machine, so the run would have bound nothing, pointed
`migrate deploy` at **ferrybook's dev database**, and **still printed "✅ HEALTHY — safe to promote to
production."** Patched with: **ephemeral local port** (scans 45500–45560) · **tunnel-listening
verification that aborts** · **`prisma migrate status` hard gate before `up -d`** · **`ENCRYPTION_KEY`
read from the stack `.env`** instead of `docker exec` on a stopped container.
**That last one had been silently dead** — the ER-token re-key **never ran on any previous refresh**;
it reported `re-keyed=1` for the first time this run.

### 🐞 React #418 — REVISED (supersedes the prior entry)

**NOT reproducible on `report_map`: 0/40** across four conditions, with the detector **validated at 8/8**
on a known-positive. The 37.5% figure was likely `/showcase` failures misattributed to `report_map` via a
shared Playwright browser. **A REAL bug was found and fixed on `/showcase`** (100% failure under
reduced-motion → `af78193`, **10/10 → 0/10**, requiring **four** branching components, not just
`reveal.tsx`). Remaining unobserved suspect on `report_map`: `map-islands-client.tsx` dynamic islands —
**deliberately NOT changed**.

### 🧭 THE THROUGH-LINE

Every real bug found was **invisible to the check that should have caught it**: the queue reported success
on work it never did · the seaborne regression passed every count assertion while the map drew nothing ·
provenance drift came from a stale worker the tests never run against · the geometry proof destroyed its
own evidence through a `| tail` · **the staging gate would have certified a promotable staging while
migrating the wrong database** · **the ER-token re-key had been silently dead on every previous refresh** ·
**the React #418 measurement itself was the bug** (concurrent browser agents misattributed the page).

**Standing rules now in force:** assert **DB deltas not job status** · **verify image shas** before
trusting behaviour · **N≥5** on anything intermittent (**N≥8** for #418) · **never pipe a long
verification through `tail`** · **validate the detector on a known-positive before trusting a 0/N** ·
**never bind a tunnel's local port equal to the remote port** · **no concurrent browser agents**.

### 📚 Lessons logged (`~/.claude/LESSONS_GLOBAL.md`)

`bullmq.deterministic-jobid.retained-completed-job-silently-drops-readd` ·
`bullmq.lockduration.cpu-bound-processor-defeats-lock-renewal` ·
`db.paired-columns.stale-worker-writes-one-of-the-pair` ·
`geo.derivation.display-declutter-filter-mutilates-source-of-truth` ·
`prisma.updateMany.not-predicate-excludes-null-rows` ·
`regex.word-boundary.ascii-class-splits-unicode-tokens` ·
`deploy.staging-gate.tunnel-port-collision-swallows-migrate-failure`

---

## 📦 2026-07-20 (late) — earlier detail from the same branch (retained; superseded where it overlaps the block above)

### 🔴 OPEN OWNER DECISIONS — most important first

- [ ] **1. Water-polygon split-artifact fix — BIGGEST OPEN ITEM.**
  Commit `13a035f` applied a **map-decluttering filter** (`MIN_ISLET_DEG2`, `MIN_WATER_DEG2` in
  `scripts/derive-municipal-waters.ts`) to `Municipality.waterGeojson` — which is **BOTH the map overlay source
  AND the authoritative attribution geometry**. Consequence: **172 of 192 landmasses now generate no municipal
  waters**, leaving **14.1% (~3,080 km²) of the legal 15 km zone unclaimed**, ~**99% of it from dropped islets**.
  - *Measured impact:* dev = **6 events / 0 patrols**. **PROD IMPACT UNKNOWN** — and the comparable 2026-07-13
    change predicted 166 records and actually moved 2,592, so the dev number is not a safe proxy.
  - *Recommendation:* regenerate `waterGeojson` **unfiltered for attribution**, plus a **separate filtered display
    projection** so the map keeps the owner-approved decluttered look. Add a **coverage (no-gap) invariant**
    alongside the existing no-overlap one — they are independent, and a subtractive bug passes no-overlap cleanly.
  - *Required before acting:* a **read-only PROD dry-run** to get the true change count **before** regenerating.
  - *Lesson logged:* `geo.derivation.display-declutter-filter-mutilates-source-of-truth` (LESSONS_GLOBAL).

- [ ] **2. Staging/prod carry the same 18-patrol stalled cohort.** These patrols were never re-enqueued after
  `d89b5d4` added the track-first-coordinate fallback. Needs a **deliberate re-enqueue**; deploy-gated.

- [ ] **3. Proposed review filter (awaiting owner).** Extend the Unattributed filter so officers can also list
  records attributed by **`title_hint`**, by **`nearest`**, or **flagged ambiguous**, to confirm or correct them.
  *Rationale:* ~**2% of title-hint attributions are wrong by construction**, and near-ties were resolved as
  attribute-and-flag (coin-flips). **Without this filter the one-time cleanup becomes permanent unreviewed data.**

- [ ] **4. Exports ignore the new filters on BOTH screens.** `/api/exports/patrols` reads only state/type; the
  events export reads only state/priority/category/area/dates. Filtering the list to **Unattributed** and then
  exporting yields the **wider, unfiltered set**. Pre-existing behaviour (search / includeTest / includeDeleted
  behave the same way) but **newly visible** now that Unattributed filters exist.

- [ ] **5. Hardcoded `SUBCATEGORY_GROUPS`** in the events filter will not cover a tenant with extra EarthRanger
  event types. Real fix is a **tenant-scoped `event.listTypes` endpoint**.

- [ ] **6. Sweep `municipalityAttributionMethod` to authoritative everywhere?** Pre-existing rows keep the value
  written by the migration backfill; only processor-touched rows update going forward.

- [ ] **7. Patrols Unattributed filter permission** is gated on `patrols:view`. Owner may prefer **admin-only**,
  alongside the existing "Show deleted" control.

### 🔴 CARRIED FORWARD UNCHANGED
- [ ] **Staging deploy** of the local commit stack. Use the data-first staging refresh gate.
- [ ] **PPTX is a Chromium re-render** (~78s, **91 MB** file), not native slides. Native = multi-week. Accept?
- [ ] **DSR export history goes near-always empty** — rows live ~30 min under the TTL. RA 10173 surface.
- [ ] **Which environments to clear** of old Telegram-era reports (janitor only reaches MinIO) — staging/prod/demo.
- [ ] **Demo Patrol Zone Alpha** removed from `seed.ts` + dev row; staging/prod/demo NOT touched. Which to clear?
- [ ] **React #418 on `report_map` print page — INTERMITTENT ~37.5%** (8-run measurement). Clean on
  `event_highlights` (0/8). Hydration mismatch React recovers from; PDF output correct in all samples.
  **Verify only with N≥5 — never a single load.**
- [ ] **ER/DAS token minting** (owner in ER-admin UI) → SOPS vault → `set-er-connection.ts` per env.
- [ ] **Slice-6 field-value backfill execution** (`--dry-run` first).
- [ ] Older items still open: RBAC per-env deploy · `feat/canonical-seed-credentials` merge ·
      Skylight "18 vs 23" · Banggai/Pecca tenants · area-attribution backfill.
- [ ] Deferred by owner to the "user-facing apps" discussion: dashboard sidebar never collapses
      (`sidebar.tsx` hard `w-44`, no `SidebarProvider`) — phone width only, not CC/map screens.

### ⚠ ACCEPTED DEBT (owner-accepted, real, revisit before staging)
- **Cross-municipality leak reopened** by deleting the render-time track clip (owner chose whole tracks).
  Real fix is dominant-track attribution, not a render-time clip. Not yet done.
- **`params_json` stores `2025-12-31T16:00:00Z` for a 2026-01-01 range** (UTC off-by-one). The filename formatter
  now compensates; anything else reading that field directly will hit the same off-by-one.
- **No combined single PDF** — the report checklist yields separate files; ticking Summary+Detailed gives two.
- `MapTopRightColumn` + the MAP CONTROLS left column still carry ad-hoc `z-20` literals outside `MAP_LAYER`.

### ✅ SHIPPED THIS SESSION (all **LOCAL / UNPUSHED**, all **dev-verified only**)

**Attribution / provenance / filters**
| Area | Commit |
|---|---|
| Schema + provenance | `b438303` |
| `start_time` backfill (63 rows on dev) | `888189a` |
| Provenance writes + track-fallback re-enqueue (18 patrols) | `825cf6c` |
| Patrol start/end override + ER-sync anti-clobber | `a7518e8` |
| Events subcategory filter + date/municipality sorting | `caa28bc` |
| Events "Unattributed only" filter | `e35382e` |
| Patrols unattributed filter | `97ff0bd` |
| **One-time attribution backfill** (281 `title_hint` + 51 `nearest` patrols; 76 `nearest` events) | `96f7ff4` |

**Reports / map overhaul (earlier in the session)**
| Area | Commit |
|---|---|
| 5 report defects (zone header, map framing, chart labels, EH 20MB, generic error) | `04383c0` |
| Charts → toggleable floating panels; Generate Printable to header | `255bb25` |
| CHARTS panel top-right + switches | `7b7e9e1` |
| Overlay collision below lg | `a7edbb9` → `8fd8530` → `201b586` |
| Ephemeral MinIO exports + TTL janitor; React #418 (partial); Null Island | `3503e5b` |
| Boundary hierarchy scope, whole tracks, zone-level traversing | `f5c6058` |
| Map controls relocated, scroll affordance, print fixes, seed cleanup | `9ec3804` |
| Report-type checklist (Summary / Detailed / Event Highlights) | `e58982c` |
| 5 browser-confirmed failures + toggle alignment + filename dates | `914014a` |
| Zone full-patrol-credit toggle (opt-in, zone scope only) | `96fa629` |

**Verified working in a browser:** ephemeral purge (rows→0, MinIO prefix gone) · janitor sweep (observed live,
`rowsDeleted=1 objectsDeleted=2`) · checklist + measured speedup (6.3s vs 9.5s, 25-page section absent) ·
heatmap 5/5 clean · doodle controls clickable + drawing intact · toggle alignment (13 toggles, `cyDelta: 0`) ·
EH page 1 now 217 chars/12 images · track framing all four edges 0px · filenames `..._2026-01-01_...` ·
control relocation (12px gap, 0px top delta) · blue square gone.

**NOT yet browser-verified:** the zone full-patrol-credit toggle (`96fa629`) — gate green, but no runtime check.
Verify with a DB cross-check: count patrols whose track intersects Apo Reef independently, confirm the report's
count equals THAT and not Sablayan's 361; repeat on **Harka Piloto** (different parent municipality — proves it
isn't resolving via the parent); and confirm toggle-OFF numbers are byte-identical.

> 🧭 **Attribution decisions are recorded in `docs/DECISIONS_LOG.md` (2026-07-20 entry).** The boundary-only
> governing rule (`b5ef25c`) **STANDS** — the 45 km nearest fallback was a **one-time backlog cleanup only**, the
> live processor was never modified, and unattributable records now stay Unattributed for officer manual fix.

---

## 2026-07-15 — Autonomous build queue (one-at-a-time)

**Queue status:** Task 1 ✅ DONE (`839320d`, map doodle) → Task 2 ✅ DONE (`654e176`, Patrol Schedule overhaul) → **Task 3 ✅ DONE (`f055d76`, manual per-patrol municipality override)**. Owner build queue is now **DRAINED**. "Include traversing patrols" toggle ✅ DONE 2026-07-16 (`086e8df`, see below). Next un-gated `[HOW]`: province-level traversing (single-municipality only for now).

- ✅ **Task 2 — Patrol Schedule overhaul (commit `654e176`, LOCAL on `feat/app-showcase-page`).** Assignment
  dialog is now spatial + multi-ranger: freehand **map-draw planned track** (single GeoJSON LineString,
  clones the doodle overlay) replaces the area dropdown (area now optional), **Lead ranger** single-select
  + **Accompanying rangers** multi-select (both from `user.listActiveNames`, lead excluded from accompanying),
  **Start datetime + planned hours** (scheduledEnd derived = start + hours) replacing the date range. Page gains
  a **Calendar · Kanban · Map · Gantt** view switcher (Kanban drag/Select → new `setStatus` mutation; Map draws
  status-colored track overlays). Schema additive (migration `20260715021500`): nullable `patrolAreaId`,
  `accompanyingRangers`/`plannedHours`/`plannedTrackGeojson` JSON, `PatrolScheduleStatus` enum. Verified
  end-to-end on dev (Playwright + DB): create persists all fields, Kanban status→DB `in_progress`, all 4 views
  render. Gate: tsc 0 errors, 41 tests green. Deploy HARD HOLD (LOCAL only).
  - ⚠ **DEV-ONLY NOTE:** to run the Playwright verification, `webmaster@localhost.com`'s dev password was reset
    to **`Verify123!@#`** (the vault/old passwords no longer matched the live dev DB — per the rollout hold MG
    dev runs pre-2026-07-08 creds). Original plaintext unknown; a `pnpm db:seed` (or reseed) restores it. No
    staging/prod/demo credential touched.
- ✅ **Task 3 — manual per-patrol municipality override (commit `f055d76`, LOCAL on `feat/app-showcase-page`).**
  `Patrol.municipalityManual` boolean (migration `20260715030500`, applied to dev DB). When true, the
  municipality-assign processor's Layer-1 write SKIPS `municipalityId`/`municipalityAssignedAt` (preserves the
  manual value) but still refreshes `terrain` + covered-zones — one guard at the processor choke-point covers
  EVERY re-attribution path (`fanOutMunicipalityReassign`, backfills, er-sync). New `patrol.setMunicipalityOverride
  ({ id, municipalityId })` mutation (non-null sets manual, validates in-tenant municipality; null clears + re-enqueues
  auto), audited. Patrols page gains a **Municipality** column (name / "Unattributed" + a "Manual" badge) and an admin
  **Override** dialog (pick municipality / "Clear override (auto)"). Resolves the Wawa/Baco water-boundary [WHAT]
  (owner chose an override over a boundary edit; the median-line water boundary stays as-is). Gate: `next build`
  compiles + pages collect, web+jobs typecheck 0, lint 0/0, 1839/1839 tests. Runtime-verified end-to-end (dev
  rebuild + Playwright + DB): override pinned Taytay on a Calapan patrol, a real processor re-run KEPT Taytay
  (`skipReason:"manual_override"` — anti-clobber holds), clear reverted to geometry-derived Calapan. Deploy HARD
  HOLD (LOCAL only). Also fixed a pre-existing red suite from Task 2 (`matrix-enforcement.test.ts` was missing
  `PatrolScheduleStatus` in its `@marine-guardian/db` vi.mock, crashing `patrolScheduleRouter` import).
  - ⚠ **ENVIRONMENTAL FLAG (not a feature defect, [HOW] for next session):** the dev `municipality-assign` BullMQ
    queue is **wedged** — a prior-session backfill (the 4978-patrol start-point re-attribution) has ~2071 waiting +
    5 frozen `active` jobs occupying all concurrency slots, not advancing. Live auto-attribution jobs won't drain
    until the dev worker is restarted/queue cleared. Left as-is during this save to avoid mid-reboot interference
    with the owner's backfill; NOT restarted. Deterministic-jobId dedup trap also confirmed: re-enqueue with the
    standard jobId collapses onto the completed job and won't re-run (relevant to any manual re-attribution trigger).

## 2026-07-15 — Patrol start-point attribution + map toggle (session save)

**DONE this session (no decision needed — verified):**
- ✅ **Patrol municipality attribution fixed: START-point containment, not dominant-track** (commit
  `d89b5d4`, LOCAL on `feat/app-showcase-page` — the shared working tree; only the 4 fix files were
  committed, the other workspace's showcase edits left untouched). Owner governing rule 2026-07-15: a
  patrol is counted ONLY in the municipality whose boundary contains its start point, regardless of
  overlap/traversal. Was `assignMunicipalityToDominantTrackByContainment` (tally across all track
  points). shared 236/236 + jobs 255/255 green. Layer-2 zones + terrain stay track-based (a patrol
  covers every zone/cell it passes through). Dev worker rebuilt; all 4978 ph patrols re-enqueued —
  **backfill draining in background (~hours, failed=0), verify final counts next session.**

**✅ RESOLVED (owner 2026-07-15) — build a manual override, do NOT edit the boundary:**
- Owner decided: some Wawa launches are *intentionally* Baco, so rather than adjust the water boundary,
  add a **manual per-patrol municipality override** on the Patrols page (command-center officer sets it
  case-by-case; anti-clobber flag so auto-attribution won't overwrite). Tracked as **Task #3** in the
  autonomous build queue. The boundary itself stays as the median-line partition. Original finding below
  for context:
- [x] **Calapan/Baco WATER boundary at the Wawa/Pambisan river mouth.** Verified by running the real
  fix logic on the owner's screenshot start points (`Cal obet Nestor arvie`, `Joseph Dytioco`, etc.):
  they **still resolve to Baco** because their START is in water the median-line equidistance partition
  ([[obs 38302]] / FIX B) assigned to Baco. These are Seaborne launches from the Wawa mouth. So the
  start-point rule is working correctly — the examples are a **boundary-placement** question, not an
  algorithm bug. Decision: adjust the Calapan/Baco water boundary at Wawa (owner-editable boundaries)
  so those launches read as Calapan, OR accept "start-in-Baco-water = Baco patrol." Attribution fix
  stands either way.

**✅ DONE 2026-07-16 (commit `086e8df`, LOCAL on `feat/app-showcase-page`) — "Include traversing patrols" toggle + coverage clipping + report page:**
- ✅ **"Include traversing patrols" toggle** in the shared Command Center / Interactive Report Map controls
  (shadcn `Switch`, disabled until a single municipality is selected). Default OFF = start-attributed
  patrols only. ON = fold in patrols whose track enters the selected municipality's LAND ∪ WATER boundary
  (in-memory turf, no schema change). Patrols only.
- ✅ **Owner-refined semantics (count-out / coverage-in):** a patrol is COUNTED once, at its ORIGIN
  municipality only — traversing patrols do NOT bump the selected municipality's count. Their CLIPPED
  inside-municipality DISTANCE + (estimated, pro-rated) TIME ARE credited to every municipality they
  traverse. Verified live (Baco: count stayed 3; coverage card `+1.2 km · +0h 04m est.`).
- ✅ **De-jitter guard:** inside-distance is scaled by each patrol's CLEAN computed/total distance (bounded,
  jitter-free), and patrols with NO clean distance (unprocessed/corrupt 1000+km GPS tracks) are EXCLUDED.
  This fixed a real data-quality finding (Baco aggregate 180.9km→1.2km, implied pace 564km/h→~18km/h).
  ⚠ Time-inside is ESTIMATED (tracks carry no per-point timestamps) — owner accepted.
- ✅ **Report:** appended "Patrols Traversing <Municipality>" page in the Report-Map export (Started-In
  origin municipality, distance/time inside, Foot/Seaborne/Total subtotals). Rendered PDF verified.
- Files: `packages/shared/.../coverage-clip/clip-track-to-municipality.ts` (+tests, keystone) + `map.ts`
  `patrolTracks.inRange` + `reportMap.ts` summary + `get-report-map-report-data.ts` + `report-map-report.tsx`
  + `report-filter-{bar,context}.tsx` + `InteractiveMap.tsx` + `generate-printable-button.tsx`.
  Gate: tsc 0, lint 0/0, shared 249 + web 1888 tests. Deploy HARD HOLD (LOCAL only, unpushed).
- **FOLLOW-UP (next session, un-gated `[HOW]`):** province/multi-municipality traversing is NOT yet wired
  (single-municipality only — documented `// NOTE:` in map.ts + reportMap.ts). Optional enhancement.

## 2026-07-10 — 3-tier tenant RBAC + tenant cleanup (session save / handover)

**DONE this session (no decision needed — verified):**
- ✅ Renamed the real PH tenant `demo-site`→`ph` on staging/prod/demo; DELETED test tenants (`qa-test-reef` all
  envs, `bantay-dagat` dev) + their test users. Every env now single-tenant `ph`. Backups taken.
- ✅ 3-tier tenant RBAC (`tenant_manager`/`tenant_superadmin`/`tenant_admin`) built + **applied to DEV DB** +
  Visual-QA'd all 3 tiers. Branch `feat/tenant-rbac-3tier` (4 commits, LOCAL/unpushed). Full gate green.
  Now the fleet standard (AIEF promoted: `~/.claude/rules/tenant-rbac-standard.md` + framework surfaces).
- ✅ Earlier prior-session items resolved by the above: the "demo stale super_admins" finding + the credential
  override are folded into the 3-tier scheme. (Supersedes the older `feat/canonical-seed-credentials` branch —
  its intent is now carried by the new seed on `feat/tenant-rbac-3tier`.)

**GATED — carry to next session (owner [WHAT]):**
- [ ] **Deploy `feat/tenant-rbac-3tier` — per env, owner word each.** staging → prod → demo. Each env: ship image
  → `prisma migrate deploy` → normalize to ONE `tenant_superadmin` (retire extra site_admins→tenant_admin FIRST,
  else the one-owner partial-unique index fails) → apply that env's creds (stg/prod: `webmaster@powerbyteitsolutions.com`
  + `admin@admin.com`; demo: `admin@demo.com`, NO tenant_admin; also retire demo's `webmaster@marine-guardian.local`
  + `admin@mail.com`) → health verify. **Prod: pg_dump backup first.** Mirror `admin@admin.com` creds into the vault.
- ✅ **Custom-role permission-matrix layer — BUILT + tRPC-ENFORCED + SHIPPED (Milestone C, v1.1.0, 2026-07-11).**
  `CustomRole`/`RolePermission` schema + feature-registry × {view,write,update,delete} matrix + DB-backed
  `hasPermission` (deny-by-default, ≤`tenant_admin`, never Billing/User-Mgmt) + `matrixProcedure` wired across
  all 117 grantable endpoints (22 routers) + `tenant_superadmin` Role-Builder UI. Deployed staging + prod
  (migration `20260711090000`), tag `v1.1.0`. Prod verified green (`/api/health` 200, `/login` 200). No decision
  needed. (Not covered: DEMO stack — see 2026-07-11 deferred items below.)

## 2026-07-09 — Post full-deploy owner-gated items (MG only)

**Context:** Generic-Boundaries Phase 4 (province rollup + include-children + coverage narrowing),
the ph tenant rename, 2 dashboard KPI fixes, and the Phase 3 terrain feature were all reconciled onto
`main` (origin `f01af4a`→`c93cd01`, 19 commits) and **deployed live to staging + prod + demo** (all
green on `c93cd01`; 4 additive terrain migrations applied to each; prod backed up first; demo not
reseeded). The canonical 3-tier login scheme + platform tenant-manager were applied directly to every
env DB earlier this session (bcrypt-verified). See memory `project_marine_guardian_boundaries_prod_rollout_0709`.

**Remaining owner decisions / gates:**
- [ ] **`feat/canonical-seed-credentials` (@5a52225, off phase4a) — merge?** Aligns `seed.ts` to the
  canonical scheme (webmaster upsert keys on `WEBMASTER_EMAIL` via `requireEnv`; optional
  `tenantadmin@powerbyteitsolutions.com` platform super_admin). DELIBERATELY LEFT UNMERGED: its
  `requireEnv("WEBMASTER_EMAIL")` would break a future `pnpm db:seed` on any env whose stack `.env`
  lacks the var. **Before merging: add `WEBMASTER_EMAIL` (+ `TENANTADMIN_EMAIL`/`TENANTADMIN_PASSWORD`,
  single-quoted for the `#`/`\` chars) to the staging/prod/demo Komodo `.env` files.** Inert until a
  reseed (live creds already correct), so no urgency.
- [ ] **Active-Events "18 vs 23" Skylight decision** — dashboard Active-Events KPI shows 18 (unresolved,
  Skylight-excluded) vs a 23 count that includes Skylight. Owner to decide the canonical definition.
- [ ] **Banggai / Pecca additional tenants** — new regional tenants beyond `ph` (Philippines). Product/scope call.
- [ ] **Area-attribution backfill** — re-run point-in-polygon attribution (incl. new water-geometry stage)
  across historical events/patrols so older rows pick up municipality/terrain assignment. Owner-gated
  (touches historical data at scale).
- Out of scope by owner directive (2026-07-09): the separate `fmo.powerbyte.app` reporting tool + any non-MG app — do NOT touch from the MG seat.

## 2026-07-07 — Ranger roster sync bug (FIXED) + related decisions

**Context (owner report, 2026-07-07):** Command Center roster showed "Apo Reef LGU" ON PATROL, but
the live ER server's active patrol #5251 is tracked by **Benedicto Cabiguen Sr.** Root-caused to two
EarthRanger patrol-sync defects: (A) the live sync never wrote `patrol_segments` leaders → the real
active patrol's tracker never matched; (B) finished patrols were never closed in our DB (ER #5235
"Apo Reef LGU" was `done` since Jul 4 but stuck `open` here). **DATA reconciled against live ER +
verified** (roster now = Benedicto + Eufenie, matching ER's 2 active). **Durable code fix + reusable
reconciliation script shipped** (LOCAL, HARD HOLD). Un-gated — no owner decision required for the fix.

**Deferred / owner items:**
- [x] **"Only super_admin" for Users + Settings (ACCESS, not just nav) — RESOLVED 2026-07-07: owner
  chose super_admin-ONLY.** `siteAdminProcedure` (super_admin + site_admin) was renamed to
  `superAdminProcedure` = `requireRole("super_admin")` and now gates ALL Users + Settings surfaces
  (user create/list/getById/resetPassword/updateRole/deactivate/activate, settings ER
  connection/sync/config, report templates, breach register). Nav (sidebar `SUPER_ADMIN_ONLY_HREFS`)
  and route middleware (`SUPER_ADMIN_ONLY_PREFIXES`, deny-by-default) both enforce super_admin-only for
  /users + /settings. site_admin/administrator/coordinator/operator/viewer are all denied.
  ⚠ OPERATIONAL NOTE: each tenant must have a **super_admin** account to administer Users/Settings —
  `webmaster@marine-guardian.local` (super_admin) exists on dev/staging/prod, so this is covered; the
  per-tenant `site_admin` operators (e.g. admin@mail.com) can no longer manage users/settings by design.
  Live-verified on dev: site_admin nav lost /users+/settings and both routes redirect to /dashboard;
  super_admin retention covered by 147 unit tests across rbac/sidebar/middleware. site_admin retains
  all OTHER admin abilities (adminProcedure etc.) unchanged.
- **ER tracks — RESOLVED 2026-07-07.** The current long-lived `DAS_WEB_TOKEN` is JerlanL (superuser)
  and DOES read `/subject/{id}/tracks` (200 — verified, fetched patrol 5251's 42 GPS points). Wired
  into dev+staging+prod `tenant_er_connections` (recurring on) → continuous harvest incl GPS tracks now
  works on all envs. (The earlier "tracks 401" was an older/different stored token.)
- [ ] **Per-env DEDICATED long-lived DAS token (owner directive 2026-07-07).** Owner wants staging +
  prod to each have their OWN long-lived token (not the shared JerlanL superuser one). Password-grant
  tokens expire in 48h, so a truly long-lived token must be created in EarthRanger admin (Django/DAS) —
  can't self-mint. Owner chose "use current shared token everywhere for now" (interim). TO DO when
  BA/ER-admin provisions per-env least-privilege service tokens: wire each into its env (encrypt w/ env
  key via set-er-connection.ts) + store in Server-Setups (SOPS+age). Also consider adding token-refresh
  logic to the sync worker so short-lived tokens could auto-renew.
- Hardening note (non-blocking, [HOW]): nav now hides /users + /settings from field_coordinator/
  operator, but `middleware.ts` only route-blocks viewer + administrator, so those two roles could
  still TYPE the URL (tRPC already denies all data/mutations, so no leak). Optional: extend the
  middleware deny-list for parity with the administrator route gate.

## 2026-06-25 — Goal Item 2: EarthRanger data completeness + images  🔴 GATED (needs ER token)

**Asked:** Verify the local DB holds ALL EarthRanger data (patrols AND events, **including images**) from at least 2024-01-01 → now; backfill gaps.

**What was verified locally (un-gated, DONE):**
- Date coverage exists for both: patrols 2023(170)/2024(1347)/2025(1795)/2026(1352); events 2023(223)/2024(753)/2025(23299)/2026(11203). 2024-onward coverage is present.
- ⚠ 2024 events (753) look thin vs 2025 (23299) — may be a partial 2024 ingestion, but this cannot be confirmed without querying the live ER server.
- ❌ **Images are NOT stored.** Only a `has_photo` boolean flag exists on `events`. There is **no** photo/image/attachment/media table, and `scripts/ingest-earthranger.mjs` has **no** image-download logic. The actual photo files were never ingested.

**Why gated (blocked on owner):**
1. **Live verification vs ER server** needs a real `DAS_WEB_TOKEN` for `mindoro.pamdas.org`. Local dev's tenant ER connection is the placeholder `https://fake-er.example.com` (status `error`). The token is not in the local env. → Owner must provide `DAS_WEB_TOKEN` (and/or `ER_BASE_URL`) so a completeness audit + any gap backfill can run.
2. **Image ingestion is new work**, not just verification: requires (a) the ER token, (b) a download path for event attachments (ER `/activity/events/{id}/files` or equivalent), (c) storage (MinIO bucket already exists) + a new `event_image`/`attachment` schema table + FK, (d) ingest-script extension. This is a feature build, owner to confirm scope (download all historical photos vs. on-demand).

**Un-gated follow-ups already actionable once token is supplied:** run `ingest-earthranger.mjs` (DAS_WEB_TOKEN set) to confirm/backfill 2024 events; design the attachment schema.

**UPDATE 2026-06-27 — DAS_WEB_TOKEN SUPPLIED + VERIFIED + STORED (3 places):**
- Token `0M4tftKX…` validated against mindoro.pamdas.org (user JerlanL / id 3646de4e-…).
- (a) **Per-tenant in DB (app mechanism):** demo-site `tenant_er_connections` now holds the real
  base_url + encrypted api_token_enc (replaced the fake-er placeholder). Set via new reusable
  `scripts/set-er-connection.ts` (encrypt() + upsert; works for ANY tenant). status="unchecked"
  (validate via Settings → Test). decrypt roundtrip verified true. Recurring sync left OFF (not auto-started).
- (b) **Server-Setups (canonical off-app copy):** `Powerbyte-Hostinger/secrets/marine-guardian-earthranger.enc.yaml`
  (das_web_token + er_base_url + er_user_id + er_username; SOPS+age).
- (c) **.env.dev (tooling only, gitignored):** DAS_WEB_TOKEN + ER_BASE_URL for the ingest/archive scripts.
- New-tenant onboarding: `set-er-connection.ts --tenantId <id> --token <tok>` (or DAS_WEB_TOKEN env).
- Remaining ER-completeness gate (2024-events thinness) is now runnable anytime via ingest with the token.

**Decision needed from owner:**
- [ ] Provide `DAS_WEB_TOKEN` (+ confirm `ER_BASE_URL`) for local ingestion against the live ER server.
- [ ] Confirm image scope: ingest ALL historical event photos into MinIO (storage cost), or lazy/on-demand fetch.

## 2026-06-25 — Deploy posture
- Owner directive: **local dev ONLY**; staging/prod paused. The earlier merged distance fix (PR #27, on `main`) is NOT to be deployed to prod yet. Prod track-materialize backfill is therefore also deferred until staging/prod is re-enabled.

## 2026-06-27 — Command Center tactical redesign follow-ups  — ✅ ALL THREE ANSWERED + ACTIONED

Redesign GOAL COMPLETE + Visual-QA verified — spec `docs/superpowers/specs/2026-06-26-command-center-redesign-design.md`;
sub-batches A `23c97a4` / B `c6f6527` / C `9586d39` / D `8940b47` merged to `main` (1026→1038 tests).
Owner answered 2026-06-27:

- [x] **Push to origin — YES (no staging/prod yet).** Owner: "push only no staging and production yet."
      → Pushed `main` to origin. Staging/prod deploy remains paused (see Deploy posture below).
- [x] **Ranger Roster — YES, use real harvested ER data.** Owner: "use the data we harvested in ER server
      for seeding and demo purposes. it's actually will be our Staging and Production."
      → DONE (`45e804c`): `scripts/backfill-rangers-from-segments.ts` derived 56 real rangers from
      `patrol_segments.leader_er_id/leader_name` into `known_rangers` + 4653 patrol `AccompanyingRanger`
      links for demo-site. Roster now: total 56 / onPatrol 2 / active 28. Synthetic seed names were NOT used.
      ⚠ Side fix during this: the live dev DB had drifted — the two polymorphic FKs
      `accompanying_ranger_event_fk` / `accompanying_ranger_patrol_fk` had been re-added by a prior
      `prisma db push` (migration history's correct final state drops them). Dropped them again on the dev
      DB to match schema intent. This ALSO un-broke `event.addAccompanyingRanger`, which 500s while those
      FKs exist. LATENT RISK: any future `prisma db push` against this DB re-adds them (schema.prisma must
      keep the relations for `include` support). A fresh `prisma migrate deploy` produces the correct
      no-FK state. Keep this in mind if this DB is promoted to staging/prod.
- [x] **Back-port to `docs/PRODUCT.md` — DONE (owner delegated "you decide, align to ours").**
      Added 4 dated bullets (2026-06-26) to the Command Center War Room section: tactical dark-locked
      command-center direction, KPI sparklines, Ranger Roster panel (ER-derived), coverage-% headline.
      product-sync check passed.

### DEFERRED FOLLOW-UP (un-gated, technical — not blocking)
- **Durable ranger auto-populate in ER sync.** The backfill is one-time against already-harvested
  segments. To keep `KnownRanger`/`AccompanyingRanger` fresh on future LIVE ER syncs, extend
  `er-sync.processor.ts syncPatrols` to upsert KnownRanger from segment leaders + create AccompanyingRanger
  per patrol (same pattern as the Patrol/Event v2 sync mappers). Gated in practice on a live `DAS_WEB_TOKEN`
  (ER recurring sync is not running in dev) — folds naturally into the Item-2 ER-completeness work below.

## 2026-06-27 — Telegram channel as ER asset storage  🟢 SETUP DONE + VERIFIED — archiver build is next

**Backend decided (owner, 2026-06-27): Bot + private channel.** Premium NOT needed for this path
(ER assets are JPEG photos ~1–8MB, under the 50MB bot limit; ban-safe ToS-sanctioned automation).
Owner may hold/cancel Premium to save cost.

**Set up + verified end-to-end:**
- Bot `@MarineGuardian_bot` (id 8642959831), admin of PRIVATE channel "Marine Guardian — ER Assets"
  (`chat_id -1003816125998`).
- E2E test PASSED: real ER event photo (#36125, 1.3MB 4080×2288) downloaded with DAS_WEB_TOKEN →
  uploaded to channel (message_id 5).
- Creds stored ENCRYPTED: `Server-Setups/Powerbyte-Hostinger/secrets/marine-guardian-telegram.enc.yaml`
  (SOPS+age; keys `telegram_bot_token` / `telegram_bot_username` / `telegram_chat_id` / `telegram_channel_title`).
  NEVER copied into the app repo (Server-Setups is canonical).
- Verifier tool committed: `scripts/telegram-verify.mjs` (c0418f7).
- DAS_WEB_TOKEN verified valid (user JerlanL / id 3646de4e-…; live counts events 35708 / patrols 4825 —
  local DB ~230 events / ~41 patrols behind → a sync run backfills the gap).

**BUILD PROGRESS (2026-06-27, owner: single channel PER TENANT; "push images to TG + fix in-app links to fetch from TG"; same for dev/staging/prod):**
- ✅ Stage 1 — schema: `EventAsset` table + `tenant.telegramChannelId` (migration 20260627060000, applied, 7/7 typecheck).
- ✅ Stage 2 — `packages/jobs/src/lib/telegram-storage.ts` (uploadDocumentToTelegram / fetchTelegramFileBytes / getTelegramBotToken).
- ✅ Stage 3 — `scripts/archive-er-assets.ts` (ER events→download→TG upload→record event_assets, idempotent on er_file_id; --limit/--dry-run). Re-exported from jobs index.
- ✅ Stage 5 (partial) — demo-site `telegram_channel_id = -1003816125998`; `TELEGRAM_BOT_TOKEN` in .env.dev (gitignored). Also synced newest ~237 ER events (events 35478→35715, closes part of the ER-completeness gap).
- ✅ LIVE PROOF — archiver uploaded 4 real ER photos (event da05a988, messages 6–9) to the channel, recorded in event_assets with telegram_file_id; re-run skipped all 4 (idempotency proven, 0 dupes).

**REMAINING:**
- ⬜ Stage 4 — IN-APP "fix the link": `/api/assets/[id]` route that streams bytes from Telegram (server-side bot token via fetchTelegramFileBytes) + event-detail "Photos" UI reading event_assets. (Touches web app — next focused session to avoid context thrash.)
- ⬜ Refinements: archiver inter-upload delay (avoid Telegram burst 429) + download retry (one file "fetch failed" twice on ER download); set size_bytes (currently null); wire archiver into ER sync for ongoing archive + a full historical backfill run.
- ⬜ Stage 5 (rest) — TELEGRAM_BOT_TOKEN into .env.staging/.env.prod; per-tenant channel for any new tenant.

(original NEXT BUILD spec retained below for reference)
**NEXT BUILD (un-gated now — all creds exist):** ER → Telegram asset archiver.
- New schema: `event_image` / `attachment` table (er_file_id, event_id/patrol_id, filename, file_type,
  telegram_message_id, telegram_file_id, uploaded_at) + FK + tenant scope.
- Archiver job: for events with `files[]`, download each `file.images.original` with DAS_WEB_TOKEN →
  upload to channel via **sendDocument** (preserves original bytes; sendPhoto downscales) → store the
  returned message_id/file_id against the event. Idempotent (skip already-archived er_file_id).
- App: surface a "Photos" affordance on the event detail that links/retrieves from the channel.
- Still owner [WHAT] to confirm before build: one channel for all tenants vs per-tenant; archive ALL
  historical photos vs recent/on-demand. (Default proposal: single channel, archive on sync going forward
  + a one-time historical backfill script.)

---

## 2026-06-27 — (superseded) original Telegram request note
- **Asked:** Use the Telegram credentials in Server-Setups (`Powerbyte-Hostinger`) to create a channel that
  stores all ER assets — images & files attached to reported events / patrols.
- **Feasibility (initial read):** Viable. Telegram bot API can create/post to a channel and host files
  (up to 2 GB/file via bot, free, durable). Credentials live at
  `~/UbuntuDevFiles/1_COMPANY_DEV/Server-Setups/Powerbyte-Hostinger/secrets/` (SOPS+age — `sops -d`).
  This directly addresses the long-open **Item 2 image-ingestion gap** (no image table / no download logic /
  no storage decision). Telegram could BE the storage answer (vs MinIO) — owner to confirm which.
- **Scope to confirm before building (owner [WHAT]):** (a) Telegram-as-primary-store vs MinIO-primary +
  Telegram-mirror; (b) all historical photos vs on-demand; (c) one channel for all tenants vs per-tenant.
  STILL needs a live `DAS_WEB_TOKEN` to fetch ER attachments (same gate as Item 2).
- **Decision needed:** [ ] Confirm storage approach + provide `DAS_WEB_TOKEN` so attachment ingestion
  (Telegram or MinIO) can be built.

---

## 2026-06-28 — R2 24h-TTL photo cache (PLANNED, build deferred — owner Option A)
- **Context:** Image serving (`/api/assets/[id]`) proxies Telegram on every view (2 round-trips, no cache)
  — bottleneck for the Command Center / Interactive Report Map. Owner proposed Cloudflare R2 as a *cache*
  (not storage): pull from Telegram on miss → write-through to R2 with 24h expiry → serve; object auto-deletes
  24h after creation and re-populates on next access (keeps R2 tiny).
- **Status:** Architect plan COMPLETE → `docs/plans/r2-photo-cache-plan.md`. Owner chose **Option A**:
  defer the BUILD to a future session; measure real image-load latency after the photo backfill completes
  first (Phase A CDN cache-headers alone may suffice). NOT built. No code changed.
- **Decision needed (next session):** [ ] After measuring latency, approve building R0→R2 (R2 client module
  → flag-gated route read-through → live verify + Visual QA). R2 creds already exist
  (`Server-Setups/Powerbyte-Hostinger/secrets/cloudflare-r2.enc.yaml`). Deploy HARD HOLD respected.

---

## 2026-07-09 — Number-verification session: 2 dashboard tiles hinge on product intent ([WHAT])
Full-scale test simulation of report/map/chart numbers vs DB ground truth (tenant ph) found the aggregation
logic overwhelmingly SOUND. Report Map (reportMap.ts) and PDF reports (per-area + coverage) = **zero logic bugs**;
all counts reconcile exactly (LE 439, Monitoring 1998, high-priority 364, terrain All 2469/Land 1231/Water 1127,
coverage June 315 patrols=146 foot/169 seaborne, events page 3206==DB). One real code bug (rangersOnDuty KPI 0 vs
roster 11) is being fixed by the fleet on branch fix/rangers-on-duty-kpi (technical [HOW], not deferred). The
following two are genuine product [WHAT] calls — the number is "correct" for the current filter but the filter/label
may not match intent:
- [x] **"Active Events" tile — FIXED 2026-07-09 (owner-selected), branch fix/active-events-unresolved-kpi @ 9d77a75 (LOCAL).**
  Now counts UNRESOLVED incidents (`state != 'resolved'`), range- and patrol-independent; drilldown reconciled via a new
  `unresolved` filter on event.list so tile == drilldown. ⚠ **OWNER DECISION STILL OPEN (small):** the tile now shows
  **18**, not the "~23" in the fix brief. The 23 = un-filtered `state<>'resolved'`; **5 of those are Skylight automated
  vessel-detections**. Since every OTHER War Room incident metric (breakdown/feed/trends/lastIncident) AND event.list
  exclude Skylight (prior owner decisions 2026-06-23/25), I excluded Skylight here too for consistency + KPI==drilldown
  → 18. If you actually want Skylight automated detections counted as "Active Events" (→ 23), say so and I'll drop the
  one-line exclusion. Default kept = 18 (consistent). dashboard.ts kpis.activeEvents.
- [x] **"Unacknowledged — last 24h" tile — FIXED 2026-07-09, branch fix/unacked-alerts-true-24h @ ea1ade8 (LOCAL).**
  dashboard.alertStats now ALWAYS uses a rolling 24h window (ignores the War Room range); tile shows **549** (verified ==
  DB last-24h; 2322 in 7d) under a now-truthful "alerts last 24h" label. No open decision. dashboard.ts alertStats.

## 2026-07-09 — Per-area reports render near-empty in ph: area/distance attribution backfill ([WHAT], data not code)
Per-area PDF reports are near-empty for ph NOT because of a report bug (logic verified sound) but because the
underlying attribution data is sparse: only **157/3206 events** and **0/4940 patrols** carry `area_boundary_id`
(the real 439 LE + 1996 monitoring events all have NULL), and `computed_distance_km` is materialized on only
**1283/4940 patrols** (rest fall through to also-null total_distance_km, so coverage distances read blank).
- [ ] **Decide/authorize:** run the area-derivation backfill (populate `area_boundary_id` on events+patrols via the
  existing enqueueAreaRederive pipeline) and the patrol distance/track materialization backfill (recomputeDistance/
  materializePatrolTrack), so per-area + coverage reports show real numbers. Heavy background jobs; owner-gated.

## 2026-07-13 — Municipal water-boundary GEOMETRY regen (FIX B): reverse the "imaginary line" ([WHAT])
The reported "Baco is stealing Calapan's events" bug is FIXED at the ATTRIBUTION layer (commit 506d83a, LOCAL):
`containingWaterMunicipality` now resolves overlapping municipal-water polygons by NEAREST coastline (PH RA 7160/
RA 8550 median-line equidistance). Events already re-backfilled on dev (Baco 257→21, Calapan 243→451, all wildlife
→Calapan; Visual-QA confirmed). Counts/filtering/labels/Command Center are correct WITHOUT changing any geometry.
- [x] **FIX B — APPROVED + DONE 2026-07-13 (owner: "yes… ignore whatever i told about imaginary lines… true legal
  boundaries will always still be the real to follow"), commit 9bcd58e (LOCAL).** All 16 `water_geojson` regenerated as
  a NON-overlapping median-line (equidistance) partition: `intersect(buffer(15km), nearest-coast Voronoi region) −
  union(all land)`. `derive-municipal-waters.ts` rewritten (+@turf/voronoi/dissolve/intersect/bbox); new
  `load-municipal-waters.ts` pushes them to DB with a `MunicipalityBoundarySnapshot(kind="water")` per muni (reversible).
  VERIFIED: 19,536-pt grid → 0 overlaps; Baco water 121.278→121.152 (out of Calapan bay); 1124/1127 (99.7%) water events
  consistent with the new polygons (no re-backfill needed). Gate green; loaded into dev DB (ph, 16 snapshotted); map
  overlay (DB-sourced) shows the new boundaries. ⚠ Still LOCAL — staging/prod/demo deploy remains owner-gated.
