# Session Handoff — 2026-07-21 PM (evening) — Worker CPU incident + showcase

> Prior handoff: `docs/SESSION_HANDOFF_0721_pm.md`. This one covers the evening session.
> Primary durable record: project memory `project_marine_guardian_worker_cpu_fix_and_showcase_root_0721`.

## ✅ DONE THIS SESSION

### 🔴→✅🚀 Worker CPU incident — FIXED & DEPLOYED to prod + staging
Owner reported prod + staging `*_worker` pinned near 100% CPU in Komodo. Diagnosed as a **BullMQ
cross-queue lock-starvation spiral**: all workers share one Node process/event loop; heavy synchronous
turf geometry (`municipality-assign`) blocked the loop past BullMQ's lock TTL → the per-process
lock-renewal timer couldn't fire → every queue's lock expired → jobs falsely re-run (prod re-ran ONE
job **16×**). Queues were near-empty — pathological re-runs, not backlog.

Fix branch **`fix/worker-cpu-lock-starvation`** (pushed to origin as a branch; NOT merged to main),
**4 commits**, built via CI `workflow_dispatch` → images:
- `963aee8` — raised lock on area-rederive + patrol-track-materialize + malformed-geometry log-once
- `7b4e8e3` — yield (`setTimeout(0)` macrotask) inside `classifyTrackTerrain` every 50 points (root cure)
- `91db289` — **raised lock on ALL 7 co-resident queues** (the definitive spiral fix — staging proved
  individual-queue raises were whack-a-mole; er-sync's `repeat:` scheduler still spiraled)
- `b695872` — **event change-detection**: skip re-attribution when an event's `locationLat/Lon` is
  unchanged (er-sync fan-out was unconditional per row every 5-min delta cycle). Patrols intentionally
  NOT optimized (track grows → needs track-aware pass).

**Both prod + staging now on `sha-b695872`.** Validated: **0 lock errors** (spiral eliminated), queues
drained, prod app healthy, attribution still correct (municipality-assign jobs complete for new/moved
events + patrols). CPU still bursts ~75-108% DURING each 5-min er-sync cycle — that's now **legitimate
active-patrol geometry** (growing tracks genuinely need re-classifying), not the spiral; worker eases
between cycles. Rollback tags saved on host: `.env.bak-preCpuFix-*` / `.env.bak-preOptim-*`.
Global lesson logged: `bullmq.shared-process.cross-queue-lock-starvation`.

### 🟣 Showcase changes — done + verified, LOCAL only (`feat/showcase-root-nav-tenants` @ `c8b2034`)
- Showcase at domain root (`NEXT_PUBLIC_SHOWCASE_AT_ROOT`): middleware rewrites `/`→showcase for everyone
  on public domains + redirects bare `/showcase`→`/`; timeline stays `/showcase/timeline`; localhost keeps
  the app at root. `app/showcase/_components/showcase-base.ts` centralizes the base path.
- "Go to PH" button top-right in showcase-nav → `/ph` (verified → `/ph/login`).
- Multi-tenant sample list (Philippines·live / Banggai·Soon / Pecca·Soon) — static, verified rendering.
- web tsc 0, lint clean, browser-verified in dev (flag off). Deploy needs `NEXT_PUBLIC_SHOWCASE_AT_ROOT=true`
  on staging/prod compose env (owner-gated).

### 🟡 PPTX black-frame — resolved analytically (safe)
The JPEG conversion CANNOT create a black margin (white-fill + centered placement; white fill only
REMOVES black). The black frame is **pre-existing content** in that report page (present in the PNG
version too). Size-fix (22.5→4.2 MB) is safe to commit. Still parked/uncommitted:
`packages/jobs/src/lib/pdf-to-pptx.ts` + test.

### 🧹 Cleanup
3 stale `.bak` files deleted. Docs handoff commit `ba8e0bd` kept LOCAL (unpushed) per owner.

## 📋 OPEN ITEMS / DECISIONS (owner-gated)
1. **Merge `fix/worker-cpu-lock-starvation` → main** to canonicalize the CPU fix (currently on the fix
   branch + deployed images only; main untouched so `ba8e0bd` stays local — needs a small reconcile:
   the fix branch contains ba8e0bd as an ancestor).
2. **Ship the showcase branch** (`feat/showcase-root-nav-tenants`) + set `NEXT_PUBLIC_SHOWCASE_AT_ROOT=true`.
3. **Commit the parked PPTX size-fix** (safe per above) — owner OK?
4. **Further worker CPU reduction** (diminishing/risky): (a) patrol track-aware change-detection — skip
   re-classifying ended patrols ER re-touches (medium risk, limited gain); (b) longer er-sync interval
   5→10 min (data-freshness [WHAT]); (c) accept as-is (spiral fixed, remaining CPU is real work).
5. Carried from prior handoff: prod/demo geometry zone-membership gap (Harka geom prod=13/demo=0);
   CI dep-audit red on main (time-based CVE, not our code); report-suite gallery real pages; manual
   zone-override UI; docs `/docs` typography `fix/docs-typography-shadcn`@`376e36c` (local).

## 🔧 Working-tree state at handoff
- Branch `fix/worker-cpu-lock-starvation` (4 commits, pushed to origin). Parked uncommitted:
  `packages/jobs/src/lib/pdf-to-pptx.ts` + `__tests__/pdf-to-pptx.test.ts`.
- Showcase branch `feat/showcase-root-nav-tenants` @ `c8b2034` (local).
- `main` @ `ba8e0bd` (local, 1 ahead of origin/main `86c4b6f` — the docs handoff, unpushed).
- HARD HOLD: nothing pushed to main; no further staging/prod deploy without owner word.
