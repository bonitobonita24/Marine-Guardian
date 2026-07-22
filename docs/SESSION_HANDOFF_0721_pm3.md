# Session Handoff — 2026-07-21 PM #3 (evening) — Event re-derivation churn FIXED + SHIPPED all envs

> Focus: root-cause + fix the OPEN "event re-derivation churn" that left staging+prod worker CPU
> "not stable" (periodic 60–90% bursts). Owner then said "do what's necessary to fix it" → merged to
> `main`, promoted to production, validated on the live ER feed.

`main` @ **`ae5bdff`** · prod + staging both live on **`sha-ae5bdff`** · dev rebuilt off `main` · demo untouched.

---

## ✅ DONE THIS SESSION (root-caused → fixed → validated → shipped everywhere)

**The bug (owner "not stable"):** every 5-min er-sync cycle re-derived ~20 events, running the CPU-heavy
`municipality-assign` geometry each time → periodic 60–90% worker-CPU bursts on staging AND prod.

**Root cause — TWO compounding bugs (both confirmed on ground truth, not inferred):**
1. **Strict `!==` on floating-point coordinates** in the event `geometryChanged` guard
   (`packages/jobs/src/processors/er-sync.processor.ts`). Proven by a direct ER-API probe vs stored
   `float8send` bits: ER re-serializes lat/lon with sub-display **floating-point ULP noise** (e.g. ER
   lat bits `…3135` vs stored `…3137`, identical to display precision). The strict inequality reported a
   "move" every cycle → re-enqueued `area-rederive` + `municipality-assign` forever.
2. **Frozen `since` watermark.** The recurring er-sync repeatable bakes `since` into its BullMQ payload
   once at schedule time and `processErSync` read `job.data.since` forever, so the delta window never
   advanced — **stuck at 2026-07-06 on BOTH staging and prod** (this corrects the prior session's
   "prod is fine = data/ER-feed difference"; it was the same bug on both, both re-pulling 25 events/cycle).

**The fix — `ae5bdff`** (`packages/jobs/src/processors/er-sync.processor.ts` + tests):
- **Epsilon coordinate compare** (1e-6 deg ≈ 0.11 m) instead of strict `!==`; null↔value still counts as
  changed. Absorbs ER FP noise, still catches any real move.
- **Watermark self-advance:** recurring firings (`job.name` starts `er-sync:recurring:`) recompute `since`
  from `SyncLog` each run (the design the queue.ts comment already described); one-shot / backfill jobs
  keep their explicit `since`.
- jobs: typecheck + lint clean, **346/346 tests** (9 new: FP-noise suppressed, real move re-derives,
  value→null, new event, recurring uses fresh watermark, one-shot keeps payload).

**Shipped + validated on the LIVE ER feed (both envs):**

| metric | staging before→after | prod before→after |
|---|---|---|
| events `records_synced`/cycle | 25 → 0–3 | 25 → 0–2 |
| area-rederive event churn | 47:17 → **0:0** | 56:22 → **0:0** |
| patrol area-rederive | present → 0 | present → 0 |
| `municipality-assign` (CPU-heavy) | every cycle → **0** | every cycle → **0** |
| worker CPU | 60–90% bursts → **flat 0.02–0.36%** | bursts → **flat 0.01–0.38%** |
| app health / errors | healthy / none | healthy / none |

The residual `0–2`/`0–3` events per cycle are **genuine ER deltas** — the watermark advances correctly,
it did not go silently blind.

**Deploy record:**
- Branch `fix/event-fp-geometry-churn` @ `ae5bdff` pushed → **fast-forward merged to `main`** (`eb9b3e1`→
  `ae5bdff`) → pushed. CI **Docker build green**; all Turbo gates (build/lint/typecheck/test) pass.
- **Staging** validated first, then **prod promoted** (`APP_IMAGE_TAG=sha-ae5bdff`, split compose files,
  `up -d --no-deps app worker`). Both healthy, verified over multiple cycles.
- **Dev** rebuilt off `main` (fix present in bundle). **Demo** left as-is (curated, no er-sync → never
  affected).

**Diagnostic playbook extended:** "MG worker CPU high" has now had **4 distinct causes** — cross-queue
lock starvation (91db289) · unconditional event fan-out (b695872) · unconditional patrol fan-out
(eb9b3e1) · **FP-noise + frozen watermark (ae5bdff, this session)**. Full method + reusable ER-probe
recipe in memory `project_marine_guardian_event_rederive_churn_rootcause_0721`.

---

## ⚠ OPEN / OWNER ATTENTION (carried forward — none blocking; the CPU incident is closed)

- [ ] **CI `main` dependency-audit is RED** — pre-existing `brace-expansion` DoS advisory (transitive dep,
  NOT our code; red since `e2de58a`; Docker build stays green). A `chore/cve-remediation` branch exists.
  Address it or accept? (owner [WHAT] — priority call.)
- [ ] **Parked local branches awaiting owner word to ship** (all HARD HOLD, unmerged):
  - `feat/pptx-jpeg-compression` @ `71d8e17` — PPTX PNG→JPEG q85 (22.5→4.2 MB, 329 jobs tests green;
    black-frame confirmed pre-existing/safe).
  - `feat/patrol-zone-manual-override` @ `5fa3fd2` — manual zone-override UI + "included by caption" badge
    (green). ⚠ FOLLOW-UP: the printed PDF report does NOT list covered zones — badging the PDF is a
    separate task (needs a new zone column).
  - `feat/showcase-root-nav-tenants` @ `c8b2034` — showcase-at-root + Go-to-PH + tenant list (needs
    `NEXT_PUBLIC_SHOWCASE_AT_ROOT=true` on staging/prod compose).
  - `fix/docs-typography-shadcn` @ `376e36c` — `/docs` typography (owner previously deferred rebuild).
- [ ] **Prod/demo geometry zone-membership GAP** — Harka geom prod=13 / demo=0 vs dev 158; the `98543dc`
  membership backfill never ran on prod/demo (owner-gated, needs tunnel).
- Standing: prod janitor "bucket does not exist" = benign/self-healing — do NOT re-investigate.

Deeper backlog (water-polygon split-artifact, per-screen export filters, per-env ER tokens, image
ingestion, R2 photo cache, etc.) remains in the older `docs/PENDING_DECISIONS.md` blocks — untouched this
session.

---

## Next session
Nothing gated on the CPU work — it's closed and live. Pick from the parked branches above (each needs the
owner's ship word) or the deeper backlog. If revisiting worker CPU, the 4-cause diagnostic playbook +
ER-probe recipe are in the memory file named above.
