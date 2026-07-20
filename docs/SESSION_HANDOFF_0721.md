# Session Handoff — 2026-07-21 (FINAL) · `main`

> **STATE:** work is **merged to `main` and PUSHED**. CI built **`sha-bb2aa50`**.
> **STAGING is DEPLOYED AND VERIFIED. PRODUCTION IS UNTOUCHED** (still `sha-a08c700`).
> One local unpushed commit remains: **`d7e246e`** (the staged prod-promotion runbook).
> HARD HOLD still holds on production — promotion is the owner's call to run.

---

## 1 · THE #1 NEXT-SESSION TASK — full re-verification (dev **and** staging)

**Owner-directed.** Re-verify *every* change from this session in a real browser. Staging is now live,
so verification runs against **BOTH dev and staging** — and their behaviour must **match**.

**Method requirements (non-negotiable):**
- **Confirm app AND worker image shas before trusting any behavioural result.** Both must be
  `sha-bb2aa50` on staging; both must be freshly built off `main` on dev (`dev_app` has no source
  bind-mount). Build with `--progress=plain` to a file — **never pipe through `tail`**.
- **Do NOT run parallel Playwright agents.** Concurrent browser-driving agents corrupted evidence
  **twice** overnight — the shared browser produced results attributed to the wrong page (this is how the
  React #418 figure went wrong). Either run browser verification strictly serially, or make a **URL
  assertion before every capture** mandatory.
- **N ≥ 5** on anything intermittent (**N ≥ 8** for React #418).

| # | Item | Evidence required |
|---|---|---|
| 1.1 | Rebuild dev app **and** worker off `main`; verify shas | `docker inspect` both containers post-build |
| 1.2 | Attribution backfill reconciles against SQL | 281 `title_hint` + 51 `nearest` patrols; 76 `nearest` events (7 ambiguous) — exact match |
| 1.3 | Patrol municipality override + anti-clobber survives a **real ER sync tick** | manual value persists, method still `manual` |
| 1.4 | Event municipality override + anti-clobber (⚠ path had **no guard** before `22f2de1`) | same as 1.3 |
| 1.5 | Patrol start/end time override + provenance badges | Manual / Derived / ER-supplied all render |
| 1.6 | Four filters cross-checked against SQL counts | Events unattributed · Patrols unattributed · Events subcategory+sorting · needs-review **on both screens** |
| 1.7 | Seaborne track parity (regression fixed in `7386eb3`) | identical feature count with full-traversing **on and off**, **N ≥ 5** |
| 1.8 | Clear-override actually recomputes (`4e7b1cb`), **both** entities | assert the **DB delta**, not job status |
| 1.9 | Provenance pairing CHECK holds | zero rows with id set / method NULL (or vice versa) |
| 1.10 | React #418 on `report_map` print page | **N ≥ 8**; validate the detector on a known-positive first |
| 1.11 | BA header logo | 1440px and 390px |
| 1.12 | `/showcase/timeline` | both `TIMELINE_MODE` values, reduced-motion, 3 breakpoints |
| **1.13** | **Staging behaviour matches dev** | run 1.2–1.12 against staging; any divergence is a finding |

---

## 2 · WHAT SHIPPED

**57 commits** merged to `main` (49 non-merge) — spanning **both** the 2026-07-20 reports/map session
and the 2026-07-21 attribution session. Merge commit `6c76010`, then `bb2aa50`.

> **Repo convention correction:** this repo uses **real merge commits (`--no-ff`)**, not squash-merge.
> `main`'s history preserves the granular per-branch commits. This **contradicts Rule 23's**
> squash-merge guidance — the actual convention wins; treat Rule 23 as stale on this point.

**Headline commits (newest first):**

| Commit | What it does |
|---|---|
| `bb2aa50` | **Staging gate must not certify a migration it never ran** (see §4 — a live defect in the gate itself) |
| `af78193` | **React #418 hydration mismatch on `/showcase` — real bug, fixed** (4 branching components) |
| `0540dcf` | `/showcase` Development Timeline subpage + roadmap section |
| `464cf32` | Municipality geometry hot path **1.8× faster, output-identical** |
| `413ad71` | Blue Alliance logo in the dashboard header bar |
| `b6dcbb8` | Provenance **pairing CHECK constraint** — municipality value + provenance inseparable |
| `0489b3c` | BullMQ `lockDuration` 30s→15min (CPU-bound job defeated lock renewal) |
| `7386eb3` | Seaborne track parity — full-traversing mode no longer truncates in-scope tracks |
| `4e7b1cb` | Deterministic-jobId fix — re-enqueue on a retained completed job must actually run |
| `22f2de1` | **Event** municipality override + ER-sync anti-clobber |
| `4f41c57` | Attribution **review filter** for heuristically-attributed records |
| `96f7ff4` | **One-time attribution backfill** for the unattributed backlog |
| `97ff0bd` / `e35382e` | "Unattributed only" filters — Patrols / Events |
| `825cf6c` | **Provenance writes** on municipality assignment + track-fallback re-enqueue |
| `a7518e8` | Patrol manual start/end time override + anti-clobber |
| `caa28bc` | Events individually selectable subcategory filter + date/municipality sorting |
| `888189a` | Stamp derived-time provenance; never overwrite a manual `start_time` |
| `b438303` | **Schema** — municipality attribution + time-provenance columns |
| `0212db6` | `backfill-patrol-start-time.ts` (dry-run by default) |

**FOUR migrations** (not three):

1. `20260720000100_add_report_type_event_highlights` — was also pending from the 07-20 session
2. `20260721000000_add_municipality_attribution_provenance`
3. `20260721010000_add_title_hint_attribution_method`
4. `20260721020000_enforce_municipality_attribution_pairing`

---

## 3 · DEPLOYMENT + DATA STATE

### Production data correction — **CONVERGED EXACTLY**

The **173-row stale-attribution correction** landed on prod and converged **exactly to prediction**:

- **173/173** rows at the predicted target
- **0** unpredicted changes
- **0** manual overrides touched
- `attributed_total` **4617 → 4603**
- **every municipality** matching prediction

Staging converged **identically** beforehand — the prod run was a confirmed rehearsal, not a guess.

**Backup:** `/root/muni-catchup/backup/prod_patrols_20260720_191322.sql` (**5,016 rows**).

> **Figure correction:** Dumaran **271** / Roxas **368** / Baco **51** / **4603** are **PATROL** counts.
> The corresponding **EVENT** counts are Dumaran **325** / Roxas **330** / Baco **21** / **5109**.

### Environments

| Env | Image | State |
|---|---|---|
| `main` | `sha-bb2aa50` | merged + pushed; CI built the image |
| **Staging** | `sha-bb2aa50` (app **and** worker) | ✅ **DEPLOYED AND VERIFIED** |
| **Production** | `sha-a08c700` | ❌ **UNTOUCHED** — provenance columns absent |

**Staging verification — all 6 gate steps green:**
- All **four** migrations applied against **prod-shaped data**
- `prisma migrate status` **asserted** up to date — *not inferred from a health 200*
- **Zero** unpaired provenance rows on both `patrols` and `events`
- Filters, header logo, and `/showcase/timeline` confirmed **live**
- App and worker **both** on `sha-bb2aa50`

**Prod promotion staged** at `docs/PROD_PROMOTION_READY.md` (commit `d7e246e`, **unpushed**).

---

## 4 · ⚠ A LIVE DEFECT FOUND AND FIXED IN THE STAGING GATE ITSELF (`bb2aa50`)

**Read this before trusting any past staging result.**

The staging gate opened its SSH tunnel with `-L 5433:localhost:5433` — **local port equal to the remote
`DB_PORT`**. `ferrybook_dev_db` listens on **5433 on this machine**. The forward would therefore have
bound nothing, `migrate deploy` would have connected to **ferrybook's dev database**, and the gate would
**still have printed "✅ HEALTHY — safe to promote to production."**

A green staging verdict certifying a migration that never ran, against the wrong database.

**Patched in `bb2aa50` with four changes:**

1. **Ephemeral local tunnel port** — scans **45500–45560** for a free port; local never equals remote.
2. **Tunnel-listening verification that aborts** — confirms the local port is actually LISTENING before
   migrating; never runs a silent no-op migrate.
3. **`prisma migrate status` hard gate before `up -d`** — schema must report up to date or the run aborts.
   A shallow `/health` 200 can no longer certify a promotable staging on its own.
4. **`ENCRYPTION_KEY` read from the stack `.env`**, not `docker exec` on a stopped container.

> **Item 4 had been silently dead.** The ER-token re-key step ran `docker exec` against a container that
> is stopped at that point in the sequence — so **the re-key never ran on any previous staging refresh**.
> This run it reported `re-keyed=1` for the first time.

These invariants match `~/.claude/rules/staging-refresh-gate.md` §"Robustness invariants".

---

## 5 · REACT #418 — **REVISED** (supersedes the previous entry)

The prior handoff recorded "**37.5% intermittent on `report_map`**". **That was a mis-measurement.**

- **NOT reproducible on `report_map`:** **0/40** across four conditions.
- The **detector was validated at 8/8** on a known-positive — so the 0/40 is a real negative, not a blind test.
- The 37.5% figure is most likely `/showcase` failures **misattributed to `report_map`** via a shared
  Playwright browser driven by concurrent agents.

**A REAL bug was found and fixed — on `/showcase`, not `report_map`:**
- `/showcase` failed **100%** under `prefers-reduced-motion`.
- Fixed in `af78193`: **10/10 → 0/10**. Required **four branching components**, not just `reveal.tsx`.

**Remaining unobserved suspect on `report_map`:** `map-islands-client.tsx` dynamic islands —
**deliberately NOT changed**, since nothing was reproduced there. Re-check at N ≥ 8 with a validated
detector before touching it.

---

## 6 · OPEN OWNER DECISIONS — ordered

**1. PRODUCTION PROMOTION — staged, rehearsed, green. The owner's call to run.**
Runbook: `docs/PROD_PROMOTION_READY.md`. The owner asked for an unattended prod deploy; it was deferred
at the time because nothing was on staging, the ordering was unrehearsed, and the owner was asleep.
**Those conditions no longer hold** — staging is deployed and verified against prod-shaped data.
⚠ The runbook uses the **rehearsed stop → migrate → start** path, which means **brief production
downtime**. A lower-downtime variant exists but is **NOT what staging exercised** — choosing it means
promoting an unrehearsed sequence.

**2. Water-polygon split-artifact fix — still not done, deliberately.**
It **reverses the owner's own map-declutter decision** (`13a035f`). **14.0% (~3,052 km²)** of prod's
legal zone is unclaimed; only **9 records** change directly. *Recommendation:* unfiltered
**authoritative** geometry + a separate **filtered display projection** + a **coverage/no-gap invariant**.
*Lesson:* `geo.derivation.display-declutter-filter-mutilates-source-of-truth`.

**3. The full-traversing toggle moves NO numbers at any scope.**
The attribution backfill closed the gap the toggle existed to fill. **Keep, rework, or remove?**

**4. `/showcase/timeline` date presentation.**
`TIMELINE_MODE` at `apps/web/src/app/showcase/timeline/_components/timeline-data.ts:41`, default
`"phases"`. The `"dates-feb"` variant presents a start **earlier than the 2026-04-30 first commit**.

**5. Carried forward:** exports ignore the new filters on both screens · hardcoded `SUBCATEGORY_GROUPS` ·
`robots.ts` now **fail-closed site-wide** · pre-existing **234px header overflow at 390px** ·
ER/DAS token minting · Slice-6 field-value backfill execution · PPTX **91 MB** · DSR export TTL ·
demo Patrol Zone Alpha.

---

## 7 · THE THROUGH-LINE

**Every real bug found was invisible to the check that should have caught it.**

- The **queue reported success on work it never did** (retained completed jobId silently dropped the re-add).
- The **seaborne regression passed every count assertion** while the map drew nothing.
- **Provenance drift came from a stale worker** the test suite never runs against.
- The **geometry equivalence proof destroyed its own evidence** by piping a long run through `| tail`.
- **NEW —** the **staging gate would have certified a promotable staging while migrating the wrong
  database**, and printed a green verdict doing it.
- **NEW —** the **ER-token re-key had been silently dead on every previous refresh** — a step that
  reported nothing because it never ran at all.
- **NEW —** the **React #418 measurement itself was the bug**: concurrent browser agents attributed
  `/showcase` failures to `report_map`.

**Standing rules now in force:**

1. **Assert DB deltas, not job status.**
2. **Verify image shas before trusting any behavioural result.**
3. **N ≥ 5 on anything intermittent** (**N ≥ 8** for React #418).
4. **Never pipe a long verification through `tail`.**
5. **Validate the detector on a known-positive before trusting a 0/N.**
6. **Never bind a tunnel's local port equal to the remote port.**
7. **No concurrent browser agents** — or assert the URL before every capture.

---

## 8 · LESSONS LOGGED — confirmed in `~/.claude/LESSONS_GLOBAL.md`

`bullmq.deterministic-jobid.retained-completed-job-silently-drops-readd` ·
`bullmq.lockduration.cpu-bound-processor-defeats-lock-renewal` ·
`db.paired-columns.stale-worker-writes-one-of-the-pair` ·
`geo.derivation.display-declutter-filter-mutilates-source-of-truth` ·
`prisma.updateMany.not-predicate-excludes-null-rows` ·
`regex.word-boundary.ascii-class-splits-unicode-tokens` ·
`deploy.staging-gate.tunnel-port-collision-swallows-migrate-failure`

---

## 9 · ENV QUICK-REF

Dev login `webmaster@localhost.com` @ `http://localhost:45204/ph/login` · dev pg container
`marine-guardian_dev_postgres`, db `marine-guardian_dev` · dev `ph` tenant test municipality **Baco** ·
`docker exec -i` for stdin SQL · dev-DB checksum drift on `20260624104753` → `migrate deploy`, not
`migrate dev` · print-render header `x-pdf-renderer-token` = `PDF_RENDERER_SERVICE_TOKEN` ·
prod remote `DB_PORT` **5434**, staging **5433** — **tunnels must use an ephemeral local port** ·
`docker compose build` can hang at ~0 CPU with `| tail` showing nothing → `--progress=plain` to a file.
