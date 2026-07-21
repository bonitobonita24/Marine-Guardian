# Session Handoff — 2026-07-21 (PM / resume session)

> `main` @ **`86c4b6f`**, pushed. **staging + prod + demo all LIVE on `sha-86c4b6f`**, health 200.
> Working tree clean except **one parked, uncommitted change** (PPTX JPEG size-fix — see below).
> This block is the scannable queue; deploy/env mechanics are in `MEMORY.md` (quick-ref) and the
> topic memory files linked below.

---

## ✅ DONE THIS SESSION (all shipped to staging + prod + demo, verified live)

1. **Title-hint MPA-zone attribution fallback** (`sha-4b4101e`). Zone-exclusive reports missed patrols
   whose title said a zone ("Apo Reef"/"Harka") but whose GPS never entered the polygon. Added a
   caption-based last-resort membership (`source='title_hint'` on `patrol_covered_zones`/`event_covered_zones`,
   new additive `CoveredZoneSource` column + migration `20260721080000`). **Prod Apo Reef report set
   209→245**; staging=prod; demo +173. Idempotent, guard refuses cross-municipality, municipality totals
   untouched. DB backups `/root/mg-*-backup-pre-zone-titlehint-*`.
   Detail: `project_marine_guardian_zone_title_hint_attribution_0721`.
2. **Official Blue Alliance white header logo** (from bluealliance.earth) — app header only; reports keep
   their own BA logo. Verified via next/image (11534B new vs 6180B old).
3. **UI batch** (`sha-2cc6bca`): header **role badge removed**; report **"Patrol Tracks Heatmap" uncrop**
   (framing 360→235 to match container); map-controls **date inputs widened** (`w-[8.5rem]`→`w-40`).
4. **Showcase `/showcase/timeline` overhaul** (`sha-86c4b6f`): click-to-enlarge lightbox on every image;
   multi-tenant image centered; patrol-scheduling route-coverage statement + gallery; report-suite
   5-image gallery; **Telegram milestone REMOVED → "Horizontal scaling" + SVG architecture diagram**.
   Detail: `project_marine_guardian_showcase_timeline_overhaul_0721`.

---

## ⏸ PENDING TASKS (un-gated work, ready to pick up)

- [ ] **PPTX JPEG size-fix — PARKED, uncommitted, UNRESOLVED.** Files: `packages/jobs/src/lib/pdf-to-pptx.ts`
  + its test. Change = PNG→JPEG q85 for report-page rasterization (deck **22.5MB → 4.2MB**, verified;
  tsc+tests green). **BLOCKER before shipping:** one rendered page showed a **black margin frame** — I have
  NOT determined whether that is pre-existing in the source PDF or introduced by the JPEG/white-fill
  change. Resolve that (compare old-PNG vs new-JPEG render of the same page) before committing/shipping.
- [ ] **Report-suite gallery images (owner shipped as-is).** The per-area/consolidated/event-log thumbnails
  are "Generate Report" DIALOG screenshots (show the report TYPE), not rendered output pages. Offer stands:
  swap in real rendered report pages (PDF-page-extract flow is proven). Owner said ship as-is; do only on request.

## 🔴 OPEN DECISIONS / FLAGS (surface each session)

- [ ] **Prod/demo geometry zone-membership GAP (pre-existing, not from this session).** Harka geometry
  membership: prod=13, demo=0, vs dev=158. The `98543dc` membership backfill (Phase-5 S4) likely never ran
  on prod/demo. The title-hint fallback compensated for reports, but the underlying geometry memberships are
  incomplete. **Decision:** run the membership backfill on prod/demo? (owner-gated, needs the tunnel + a run).
- [ ] **CI dep-audit RED on main since `e2de58a`.** A newly-published CVE advisory against an already-installed
  package (time-based), NOT introduced by our code — the Docker image build itself is green. Worth a dedicated
  dependency-remediation pass (there's a `chore/cve-remediation` branch already). Owner call on priority.
- [ ] **Manual zone-override UI + "included by caption" report badge** (title-hint follow-up). The
  `source='title_hint'` marker is in the DB now, so a report footnote/badge distinguishing caption-derived
  from GPS-confirmed memberships is a small add; and the patrol Override dialog could offer child MPA zones
  (Apo Reef / Harka) directly. Not yet built.
- [ ] **docs `/docs` typography fix** — `fix/docs-typography-shadcn` @ `376e36c` (LOCAL, off main; body
  18→16px + heading scale; eslint0/tsc0). Owner previously DEFERRED the dev rebuild/preview.

## 📌 STANDING NOTES

- **Prod janitor "bucket does not exist"** on a fresh export bucket = benign + self-healing. Do NOT re-investigate.
- **HARD HOLD holds:** no further push/deploy without the owner's explicit word.
- **Env / deploy mechanics** (host, stack dirs, image-swap, DB tunnel ports, vault creds, dev-rebuild
  command) are in `MEMORY.md` DEV/DEPLOY quick-ref.

Companion: `docs/PENDING_DECISIONS.md` (full queue) · `docs/SESSION_HANDOFF_0721.md` (earlier prod-promotion session).
