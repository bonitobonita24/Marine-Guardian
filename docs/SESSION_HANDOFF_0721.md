# Session Handoff — 2026-07-21 · `preview/session-0720`

> **STATE:** all commits **LOCAL / UNPUSHED**. HARD HOLD holds — no push, merge, or deploy without the
> owner's explicit word. All code verified on **dev only**.
> **⚠ IN FLIGHT at time of writing:** other agents were still working. The working tree is **dirty**
> (see §6) — treat uncommitted files as unfinished, not as shipped.

---

## 1 · THE #1 NEXT-SESSION TASK — full re-verification

**Owner-directed.** Re-verify *every* change from this session in a **real browser** against a
**freshly rebuilt dev app AND worker**. Work this list in order; each item names its own evidence.

- [ ] **1.1 — Rebuild dev app AND worker off `preview/session-0720`, then verify the image shas match.**
  `dev_app` has **no source bind-mount**; the worker is a separate image and is a **repeat offender** in
  this project. A stale worker running **pre-`825cf6c`** code caused a wrong diagnosis this session.
  ```bash
  docker compose ... build --progress=plain app worker > /tmp/build.log 2>&1   # never pipe to `tail`
  docker inspect --format '{{.Image}} {{.Config.Image}}' marine-guardian_dev_app marine-guardian_dev_worker
  ```
  **Do not trust any behavioural result until both shas are confirmed post-build.**

- [ ] **1.2 — Attribution backfill results reconcile against SQL.** Expect **281 `title_hint` + 51
  `nearest` patrols** and **76 `nearest` events (7 flagged ambiguous)**. Query
  `municipality_attribution_method` counts per table and match each number exactly. A mismatch means the
  backfill ran twice or partially.

- [ ] **1.3 — Patrol municipality override + anti-clobber guard survives a real ER sync tick.** Set an
  override, run an actual sync (not a unit test), confirm the manual value persists and the method column
  still reads manual.

- [ ] **1.4 — Event municipality override + anti-clobber guard.** ⚠ The event path had **NO guard before
  this session** (`22f2de1` added it) — this is the least-exercised path here. Same test as 1.3.

- [ ] **1.5 — Patrol start/end time override + provenance badges** render correctly for all three states:
  **Manual**, **Derived**, **ER-supplied**.

- [ ] **1.6 — Four filters, each cross-checked against a SQL count:** Events unattributed · Patrols
  unattributed · Events subcategory + sorting · attribution needs-review **on BOTH screens**.

- [ ] **1.7 — Seaborne track parity (owner-reported regression, fixed in `7386eb3`).** Seaborne feature
  count must be **identical** with **COUNT FULL TRAVERSING PATROLS on and off**. **N ≥ 5 runs.**

- [ ] **1.8 — Clear-override actually recomputes** (deterministic-jobId fix `4e7b1cb`) — on **BOTH**
  entities. Assert the **DB delta**, not the job status: the queue reported success on work it never did.

- [ ] **1.9 — Provenance pairing CHECK constraint holds.** Zero rows with an id set and method NULL (or
  vice versa). Migration `20260721020000_enforce_municipality_attribution_pairing`.

- [ ] **1.10 — React #418 on the `report_map` print page — N ≥ 5 MINIMUM.** Measured **37.5% intermittent**
  over 8 runs. A single clean load proves nothing.

- [ ] **1.11 — New BA header logo** at **1440px** and **390px**.

- [ ] **1.12 — New `/showcase` Development Timeline page:** both `TIMELINE_MODE` values, `prefers-reduced-motion`,
  and **3 breakpoints**.

---

## 2 · COMMITS THIS SESSION (verified against `git log`)

Chain tip **`b6dcbb8`**, oldest **`0212db6`**. 16 commits, newest first:

| Commit | What it does |
|---|---|
| `b6dcbb8` | Provenance pairing **CHECK constraint** — makes municipality value + provenance inseparable (+ repair script) |
| `0489b3c` | BullMQ `lockDuration` 30s→15min on municipality-assign (CPU-bound job defeated lock renewal) |
| `7386eb3` | **Seaborne track parity** — full-traversing mode no longer truncates in-scope seaborne tracks |
| `4e7b1cb` | **Deterministic jobId fix** — re-enqueue with a retained completed jobId must actually run |
| `22f2de1` | **Event** municipality override + ER-sync anti-clobber (the event path had no guard before) |
| `4f41c57` | Attribution **review filter** for heuristically-attributed records |
| `ec8640b` | Governance docs — attribution reconciliation record + prior pending-queue rewrite |
| `96f7ff4` | **One-time attribution backfill** for the unattributed municipality backlog |
| `97ff0bd` | **Patrols** "Unattributed only" filter (manual-attribution work queue) |
| `825cf6c` | **Provenance writes** on municipality assignment + track-fallback re-enqueue |
| `e35382e` | **Events** "Unattributed only" filter |
| `a7518e8` | **Patrol** manual start/end time override + ER-sync anti-clobber |
| `caa28bc` | Events **individually selectable subcategory filter** + date/municipality sorting |
| `888189a` | Stamp derived-time provenance; never overwrite a manual `start_time` |
| `b438303` | **Schema** — municipality attribution + time-provenance columns |
| `0212db6` | `backfill-patrol-start-time.ts` (dry-run by default) |

**⚠ Two corrections to the verbal summary:** the events subcategory filter is **`caa28bc`**, *not* `e35382e`
(`e35382e` is the events unattributed filter only); and the `start_time` backfill **script** is **`0212db6`**
— `888189a` is the provenance-stamping change.

**Migrations added:** `20260721000000_add_municipality_attribution_provenance` ·
`20260721010000_add_title_hint_attribution_method` · `20260721020000_enforce_municipality_attribution_pairing`.

---

## 3 · DATA OPERATIONS PERFORMED (not code — record precisely)

**Dev**
- `start_time` backfill — **63 rows**.
- Attribution backfill — **281 `title_hint` + 51 `nearest` patrols**, **76 `nearest` events (7 ambiguous)**.
- Provenance repair — **34 events + 1 patrol**.

**Staging + Prod**
- Stalled-cohort re-enqueue: **staging 15 attributed**, **prod 11 attributed**. Both converged to
  **4617 attributed / 153 never-processed**.
- **Prod backup at `/root/muni-catchup/backup/`.**

**Staging — ⏳ IN FLIGHT at time of writing**
- The **173 stale-attribution correction** was **draining slowly** and had **not converged**. Last known
  state: still running. **It must be confirmed converged before prod runs.**

**Prod**
- The **173 correction is NOT yet applied** — gated on staging matching prediction.

---

## 4 · OPEN OWNER DECISIONS (most important first)

1. **Production deploy — owner asked for it immediately with no confirmation; I deferred.**
   Reasoning, recorded so the owner can overrule with full information:
   - ~**55 commits have never been on staging**.
   - An **unrehearsed worker-before-migration ordering constraint** (see item 2) — getting it wrong takes
     writes down.
   - **Known-open defects** (§5).
   - The **owner was asleep** and could not respond if it went wrong.
   Plan: stage everything up to prod, with **prod promotion reduced to a single command**.
   **The owner must decide whether to run it.**

2. **⚠ DEPLOY ORDERING — LOAD-BEARING.** A **worker image ≥ `825cf6c` MUST ship BEFORE** migration
   `20260721020000` (the pairing CHECK) is applied **in any environment**. A pre-`825cf6c` worker writes one
   half of the pair, and that write is **now rejected** by the constraint. Run
   `scripts/repair-municipality-attribution-pairing.ts` **per env** before validating the constraint.

3. **Water-polygon split-artifact fix — NOT yet done.** **14.0% (~3,052 km²)** of prod's legal 15 km zone is
   unclaimed. Regeneration changes only **9 records directly** but **forces a re-backfill**.
   *Recommendation:* unfiltered **authoritative** geometry + a **separate filtered display projection** +
   a **coverage / no-gap invariant** (independent of the existing no-overlap one).

4. **The full-traversing toggle now moves NO numbers.** Counts are identical with the flag on/off at every
   scope tested — the `96f7ff4` backfill appears to have closed the gap the toggle existed to fill. It may
   now be **inert**. Owner to decide: **keep / rework / remove**.

5. **Timeline date presentation.** Built with **phase labels by default**; a February-anchored variant sits
   behind a single constant:
   `apps/web/src/app/showcase/timeline/_components/timeline-data.ts:41`
   → `export const TIMELINE_MODE: "phases" | "dates-feb" = "phases";`

6. **Carried forward:** exports ignore the new filters on both screens · hardcoded `SUBCATEGORY_GROUPS` ·
   `municipalityAttributionMethod` sweep · Patrols-unattributed filter permission level · PPTX 91 MB ·
   DSR export TTL · which environments to clear of Telegram-era reports · demo Patrol Zone Alpha ·
   ER/DAS token minting · Slice-6 field-value backfill execution.

---

## 5 · KNOWN-OPEN DEFECTS

- **React #418** on the **`report_map`** print page — **~37.5% intermittent** (8-run measurement). Clean on
  `event_highlights` (0/8). **Verify only with N ≥ 5.**
- **Traversing-coverage readout jumped +175.4 km → +4452.2 km** after the seaborne fix. Correct per design,
  but it sits oddly beside a count the toggle **doesn't move** (see decision 4).

---

## 6 · IN-FLIGHT / UNCOMMITTED AT HANDOFF TIME

Other agents were still working. **These are NOT shipped** — inspect before assuming anything:

- **Modified, uncommitted:** `apps/web/src/components/layout/header.tsx` (BA header logo) ·
  `apps/web/src/app/showcase/_components/showcase-nav.tsx` ·
  `packages/shared/src/lib/municipality-assignment/index.ts` + its `__tests__/index.test.ts` ·
  framework/governance files (`.ai_prompt/*`, `AI/Master_Prompt.md`, `CLAUDE.md`, `deploy.sh`).
- **Untracked:** `apps/web/src/app/showcase/timeline/` (the Development Timeline page) ·
  `apps/web/public/showcase/timeline/` · `apps/web/public/blue-alliance-logo.png` ·
  `apps/web/src/app/robots.ts` + `apps/web/src/app/sitemap.ts` (SEO retrofit, Rule 35) ·
  `packages/shared/src/lib/municipality-assignment/__baseline__.ts` ·
  `packages/jobs/bench/`, `enqueue.mjs`, `qstat.mjs` (throwaway ops helpers — decide keep vs delete) ·
  `.ai_prompt/seo.md` · three `*.20260720_094418.bak` files (framework-sync backups, safe to delete).

Items **1.11** and **1.12** of the re-verification checklist cover work that is **in this uncommitted set** —
commit or discard it before verifying.

---

## 7 · THE THROUGH-LINE — the most transferable thing from tonight

**Every real bug found tonight was invisible to the check that should have caught it.**

- The **queue reported success on work it never did** (retained completed jobId silently dropped the re-add).
- The **seaborne regression passed every count assertion** while the map drew nothing.
- **Provenance drift came from a stale worker** the test suite never runs against.
- The **geometry equivalence proof destroyed its own evidence** by piping a long run through `| tail`.

**Standing rules now in force:**
1. **Assert DB deltas, not job status.**
2. **Verify image shas before trusting any behavioural result.**
3. **N ≥ 5 on anything intermittent.**
4. **Never pipe a long-running verification through `tail`.**

---

## 8 · LESSONS LOGGED — confirmed present in `~/.claude/LESSONS_GLOBAL.md`

All six verified present:

- `bullmq.deterministic-jobid.retained-completed-job-silently-drops-readd`
- `bullmq.lockduration.cpu-bound-processor-defeats-lock-renewal`
- `db.paired-columns.stale-worker-writes-one-of-the-pair`
- `geo.derivation.display-declutter-filter-mutilates-source-of-truth`
- `prisma.updateMany.not-predicate-excludes-null-rows`
- `regex.word-boundary.ascii-class-splits-unicode-tokens`

---

## 9 · ENV QUICK-REF

Dev login `webmaster@localhost.com` @ `http://localhost:45204/ph/login` · dev pg container
`marine-guardian_dev_postgres`, db `marine-guardian_dev` · dev `ph` tenant test municipality **Baco** ·
use `docker exec -i` for stdin SQL · dev-DB checksum drift on `20260624104753` → use `migrate deploy`,
not `migrate dev` · print-render header `x-pdf-renderer-token` = `PDF_RENDERER_SERVICE_TOKEN` ·
`docker compose build` can hang at ~0 CPU with `| tail` showing nothing → always `--progress=plain` to a file.
