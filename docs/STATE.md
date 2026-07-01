# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9

SESSION_SAVE_2026_07_01_S11 (Swarm S11 — Validation + QA gate):
  ✅ DONE THIS SESSION:
    - All code gates green: lint PASS · 1225/1225 web tests PASS · build PASS
      49/49 storage tests PASS · 203/203 jobs tests PASS · prisma generate PASS
    - Dev DB: applied 2 pending S2 migrations (20260701000000_add_report_template,
      20260701000001_add_report_type_report_map) via prisma migrate deploy
    - WCAG 2.2 AA verified on 3 surfaces:
        S9 generate-printable-button.tsx — PASS (DialogTrigger asChild, aria-live polite,
          role=alert errors, aria-busy confirm, Label htmlFor+id on select)
        S5 report-template-form.tsx — PASS (shadcn FormLabel auto-wired, DialogTitle+
          aria-describedby, role=alert errors, min-h-[44px] buttons, Switch id wired)
        S7 report-map-report.tsx — PASS (<html lang=en>, h1/h2 headings, figure+figcaption
          sr-only MapAltTable with table caption+th scope, alt=Municipal logo, decorative alt="")
          DEFERRED (pre-existing, out-of-scope): Blue Alliance logo alt hardcoded from S8 Bucket-A
    - Fix: SSR/Leaflet ReferenceError — created map-islands-client.tsx (dynamic ssr:false wrapper);
        updated report-map-report.tsx to import maps from wrapper instead of raw Leaflet files.
        Root cause: RSC report-map-report.tsx imported EventPointsMap/PatrolTracksMap directly,
        causing Leaflet module (which reads window at init) to run during Next.js standalone SSR.
    - Render smoke test: HTTP 200 · body 6.5MB · all 5 data-testid sections present
        (section-law-enforcement, section-monitoring, section-high-priority,
         section-patrol-list, section-events-over-time)
        window.__renderPending=5 confirmed in SSR HTML · no window errors · no Prisma errors
    - Code-review gate: inline review on 2 changed files — 0 blocking findings
    - Committed: 56962ec feat(phase-4-S11) on swarm/printable-report-map
  STATE: branch swarm/printable-report-map, committed @ 56962ec. All gates green.

SESSION_SAVE_2026_07_01_S9 (Swarm S9 — UI — 'Generate Printable' button + template picker):
  ✅ DONE THIS SESSION:
    - Created apps/web/src/app/(dashboard)/map/_components/generate-printable-button.tsx
        GeneratePrintableButton client component placed under EventsOverTimeChart in report-map-view.tsx
        Template picker: trpc.reportTemplate.list (enabled only when dialog open); defaults to isDefault
        template; native select with "Loading templates…" / "No templates available" states
        On confirm: reportExport.create with reportType:'report_map', paperSize:'A4', paramsJson:
          { templateId, from, to, municipalityId?, protectedZoneId? } from useReportFilter()
        create→queue→link lifecycle mirrors generate-report-button.tsx VERBATIM
        WCAG: aria-label="Generate printable report" (button), aria-label="Report template" (select),
          aria-live="polite" sr-only region (pending + success); role="alert" for errors only (no
          double-announcement); aria-busy on confirm button
        <DialogTrigger asChild> wrapping so Radix returns focus to trigger on close (WCAG 2.4.3)
        useEffect cleanup for timeoutRef prevents setState on unmounted component
    - Updated apps/web/src/app/(dashboard)/map/_components/report-map-view.tsx
        Import + render GeneratePrintableButton in flex justify-end div directly under EventsOverTimeChart
    - Code-review gate: 4 confirmed/plausible findings, all fixed inline:
        (1) Missing DialogTrigger → wrapped with <DialogTrigger asChild> (WCAG 2.4.3)
        (2) Double error announcement polite+assertive → removed error from aria-live region
        (3) No unmount cleanup for timeout → added useEffect(() => clearRequestTimeout, [])
        (4) aria-busy on <select> semantically meaningless → removed
        (5) Dead prefersReducedMotion ternary (no spinner) → removed hook + dead ternary
    - Validation: lint ✅ · test 1225/1225 ✅ · build ✅
  DEFERRED (code-review Bucket-A, out-of-scope for S9):
    - useReducedMotion duplicated in report-template-form.tsx and this file (now removed from S9) —
      extract to shared apps/web/src/lib/hooks/use-reduced-motion.ts when a Loader2 spinner is
      added to either component (R14 will need real wiring at that point)
  STATE: branch swarm/printable-report-map, committed.

SESSION_SAVE_2026_07_01_S8 (Swarm S8 — Wire 'report-map' dispatch into print-render page):
  ✅ DONE THIS SESSION:
    - Confirmed page.tsx dispatch already wired in S7 (commit 50b96a5):
        "report_map" in VALID_REPORT_TYPES + import getReportMapReportData + import ReportMapReport
        + dispatch block if (reportType === "report_map") { ... }
    - Fixed patrolTrack query missing take:300 limit in get-report-map-report-data.ts (L379)
        Consistent with adjacent patrol query (L360 take:300); prevents unbounded memory load
        for tenants with large patrol histories
    - Code-review: 4 finders × 4 verifiers; 1 in-scope fix (patrolTrack limit); 3 deferred
        Bucket-A findings raised as questions (landscape/portrait Puppeteer conflict, MapReadySignal
        copy-paste, partner logo alt text hardcoded)
    - Validation: lint ✅ · test 1225/1225 ✅ · build ✅
  DEFERRED (code-review Bucket-A, out-of-scope for S8):
    - landscape/portrait Puppeteer flag conflict: LANDSCAPE_REPORT_TYPES includes report_map so
      Puppeteer always passes landscape:true, but portrait-layout templates apply @page portrait in CSS.
      Behavior depends on Puppeteer/Chromium CSS-vs-flag precedence (PLAUSIBLE, needs real-browser test).
    - MapReadySignal copy-pasted across 4 Leaflet islands — extract to shared component (pre-existing S7 defer)
    - Partner logo alt text hardcoded "Blue Alliance logo" (L127 report-map-report.tsx) — should be
      template-driven for WCAG 1.1.1 compliance in white-label deployments
  STATE: branch swarm/printable-report-map, committed.

SESSION_SAVE_2026_07_01_S7 (Swarm S7 — Print report body — 5 chart+map pages):
  ✅ DONE THIS SESSION:
    - Created apps/web/src/app/print-render/[tenantSlug]/[reportType]/[exportId]/report-map-report.tsx
        RSC composer (~560 lines). resolveLayout maps template.layout string → "landscape"|"portrait"|"continuous"
        ("two-column" APP_DEFAULT + unknown strings fall through to "landscape")
        PageHeader: municipal logo LEFT | h1 reportTitle CENTRE | partner logo RIGHT (null-guarded)
        PageFooter: footerNotes | "Page N of 5 · Generated <timestamp>"
        5 sections: Law Enforcement · Monitoring · High Priority · Patrol List · Events Over Time
        Layout CSS: @page A4 landscape/portrait; page-break-before:always for one-per-page layouts
        Multi-map coordination: <script>window.__renderPending=5</script> → each island decrements
        WCAG: h1/h2 heading order per section; <figure aria-label>/<figcaption class="sr-only"> with
          <table caption+scope> as map text-alternative; logo alt attrs
    - Created components/event-points-map.tsx — Leaflet client island; CircleMarker per point;
        AutoFitBounds (skip if <2 points); MapReadySignal with __renderPending counter protocol;
        0-points: renders basemap + "No located items" overlay, flips immediately without tile wait
    - Created components/patrol-tracks-map.tsx — Leaflet client island; Polyline per renderable track;
        renderableTracks = tracks.filter(t => t.path.length > 1) (single-point track guard);
        AutoFitBounds on renderableTracks only (code-review fix — was `tracks`, skewed bbox);
        same MapReadySignal pattern
    - Created components/print-events-over-time-chart.tsx — Recharts LineChart with hardcoded colors
        (no shadcn CSS vars; print-safe); shortDay() for tick/tooltip labels; isAnimationActive=false
    - Updated page.tsx — added "report_map" to VALID_REPORT_TYPES + dispatch block
    - Code-review fixes applied (2 in-scope):
        __renderReady race: 5 map islands each independently flip → added __renderPending=5 counter;
          Puppeteer waitForFunction waits for all 5 to decrement (backward-compat: undefined falls through)
        AutoFitBounds passed all tracks → changed to renderableTracks (excludes single-point entries)
    - Validation: lint ✅ · test 1225/1225 ✅ · build ✅
    - Commit: 50b96a5
  DEFERRED (code-review Bucket-A, out-of-scope for S7):
    - MapReadySignal copy-pasted across 4 Leaflet islands (area-coverage-map, per-area-heatmap-map,
      event-points-map, patrol-tracks-map) — extract to shared components/map-ready-signal.tsx
    - map.whenReady(() => { map.once("load", paintFlush) }) timing: whenReady may fire before
      "load" is registered on some tile-load paths (pre-existing in area-coverage-map.tsx)
  STATE: branch swarm/printable-report-map, committed.

SESSION_SAVE_2026_07_01_S6 (Swarm S6 — SSR loader — getReportMapReportData + tests):
  ✅ DONE THIS SESSION:
    - Created apps/web/src/server/report-map-report/get-report-map-report-data.ts
        Mirrors null-contract of get-per-area-report-data.ts
        Template resolution: paramsJson.templateId → isDefault → APP_DEFAULT_TEMPLATE fallback
        Logos: resolveLogoDataUri (getImageBytes → base64 data URI, null on error)
        5-chart payload: LawEnforcement, Monitoring, HighPriority (via buildEventBreakdownWithCoords),
          PatrolList (Prisma patrol + patrolTrack, take:300), EventsOverTime (day-bucket series)
        Concurrent: logo S3 + chart Prisma queries in single outer Promise.all (code-review fix)
        dayKey() mirrors reportMap.ts local-time pattern
        patrolBreakdown: computedDistanceKm ?? totalDistanceKm (v2 pattern)
        EventsOverTime: continuous daily fill when both from+to present (400-day guard)
    - Created apps/web/src/server/report-map-report/__tests__/get-report-map-report-data.test.ts
        19 tests: 4 for parseReportMapParams, 15 for getReportMapReportData
        ESLint-clean: if (!result) return; narrowing pattern, typed empty arrays for EMPTY_BREAKDOWN
    - Validation: lint ✅ · test 1225/1225 ✅ · build ✅
    - Commit: 8eacd0c
  DEFERRED (owner [WHAT] / known issues logged):
    - patrolList.total capped at 300 (take limit, no count query)
    - eventFilter/patrolFilter replicated inline (unexported from reportMap.ts)
    - dayKey() duplicated 3× across codebase (no shared lib)
  STATE: branch swarm/printable-report-map, committed.

SESSION_SAVE_2026_07_01_S5 (Swarm S5 — Admin Settings — Report Template list + create/edit form):
  ✅ DONE THIS SESSION:
    - Created apps/web/src/app/(dashboard)/settings/report-templates/page.tsx
    - Created apps/web/src/app/(dashboard)/settings/report-templates/_components/report-template-form.tsx
        WCAG 2.2 AA: FormLabel+FormMessage via shadcn Form, aria-invalid auto-wired, logo inputs
        have explicit htmlFor labels + aria-label, dialog has DialogTitle + aria-describedby,
        error blocks use role="alert" + aria-live="assertive", 44px min touch targets throughout
        useReducedMotion() guards Loader2 animate-spin per R14
        Client-side MIME type + size validation (PNG/JPEG only, max 10 MB) before submit
        RHF + Zod (createReportTemplateInputSchema / updateReportTemplateInputSchema)
        Logo upload: FileReader → base64 → {data, contentType} → router municipalLogoUpload/partnerLogoUpload
    - Created apps/web/src/app/(dashboard)/settings/report-templates/_components/report-template-list.tsx
        shadcn Table with template rows (name, layout label, reportTitle, Default badge)
        Create / Edit / Set Default / Delete actions with WCAG aria-labels
        Delete confirmation Dialog showing template name to prevent accidental deletion
        limit: 200 (schema max) — avoids pagination complexity on a settings page
    - Updated apps/web/src/app/(dashboard)/settings/page.tsx — added Report Templates link card
    - Code-review fixes (4 confirmed findings):
        Dead liveRegionRef removed; file type cast → runtime MIME validation + early error;
        pagination truncation → limit: 200; delete dialog now shows template name
    - Validation: lint ✅ · test 1206/1206 ✅ · build ✅
  STATE: branch swarm/printable-report-map, changes staged.

SESSION_SAVE_2026_07_01_S4 (Swarm S4 — reportTemplate tRPC router — CRUD + setDefault):
  ✅ DONE THIS SESSION:
    - Created apps/web/src/server/trpc/routers/reportTemplate.ts
        list (tenantProcedure, Prisma native cursor, createdAt DESC)
        getById (tenantProcedure, tenant-scoped)
        create (adminProcedure, $transaction unsets siblings if isDefault, parallel logo upload)
        update (adminProcedure, $transaction for isDefault unset, parallel logo upload)
        delete (adminProcedure, deleteMany for TOCTOU safety)
        setDefault (adminProcedure, $transaction unsets siblings atomically)
        All mutations write writeAuditLog (L3+L5+L6 invariants satisfied)
    - Logo handling: base64 upload via @marine-guardian/storage uploadImage (parallel Promise.all)
    - Registered in apps/web/src/server/trpc/routers/index.ts as reportTemplate
    - Created apps/web/src/server/trpc/routers/__tests__/reportTemplate.test.ts
        18 tests: tenant isolation, RBAC (non-admin denied), setDefault sibling unset, delete audited, logo upload
    - Code-review fixes: cursor pagination (id-lt → Prisma native cursor), TOCTOU delete (deleteMany),
      audit changesJson backwards logic, sequential → parallel logo uploads
    - Validation: lint ✅ | test 1206/1206 ✅ | build ✅ | typecheck ✅
  ⚠ DEFERRED (separate session):
    - S3 logo orphan risk: uploadImage runs outside $transaction; if the post-upload key-persist update fails,
      S3 objects are orphaned. Fix requires moving upload inside the transaction or adding S3 compensating cleanup.
  STATE: branch swarm/printable-report-map committed @ eb848d6. All gates green.

SESSION_SAVE_2026_07_01_S2 (Swarm S2 — Prisma ReportTemplate model + migration):
  ✅ DONE THIS SESSION:
    - Added ReportTemplate model to packages/db/prisma/schema.prisma (id/tenantId/name/layout/logoKeys/reportTitle/footerNotes/isDefault/timestamps)
    - Added reportTemplates relation to Tenant model (packages/db/prisma/schema.prisma)
    - Created migration 20260701000000_add_report_template (CREATE TABLE report_templates + 2 indexes + FK)
    - Added report_map to Prisma ReportType enum (schema.prisma) + migration 20260701000001_add_report_type_report_map
    - Fixed S1 regression: "report-map" → "report_map" in reportTypeSchema (enums.ts) + pdf-render.processor.ts
      (S1 used hyphen, inconsistent with Prisma enum; caused exports/page.tsx build failure via tRPC type cascade)
    - Added reportLayoutSchema to packages/shared/src/schemas/enums.ts (3 layout values, hyphenated)
    - Created packages/shared/src/schemas/report-template.ts (reportTemplateSchema + CRUD input schemas)
    - Exported report-template from packages/shared/src/schemas/index.ts
    - Code-review fix: createReportTemplateInputSchema logo keys now accept null (.nullable().optional())
    - Validation: prisma generate ✅ | shared typecheck ✅ | web lint ✅ | web build ✅ | 1188/1188 tests ✅
  ⚠ DEFERRED (separate session required):
    - print-render page.tsx VALID_REPORT_TYPES and dispatch block need 'report_map' entry (S6 scope — when renderer is built)
  STATE: branch swarm/printable-report-map-S2 committed. All gates green.

SESSION_SAVE_2026_07_01_S3 (Swarm S3 — Storage: generic image upload + read helper):
  ✅ DONE THIS SESSION:
    - Extended packages/storage/src/index.ts (same S3 client, same exports bucket):
        buildLogoKey(tenantId, templateId, ext) → logos/{tenantId}/{templateId}.{ext}
          Leading dot stripped defensively (path.extname returns ".png" → "png")
        uploadImage(input): image/png|jpeg content-type, 10 MiB size guard
        getImageReadStream(input): mirrors getPdfReadStream
        getImageBytes(input): collects stream into Buffer (for print body)
    - Extended packages/storage/src/__tests__/storage.test.ts: +27 tests (49 total)
        buildLogoKey (key shape, jpeg, prefix collision, leading-dot normalization)
        uploadImage (png, jpeg, oversized guard, at-limit)
        getImageReadStream (round-trip, missing body)
        getImageBytes (single chunk, multi-chunk concat)
    - Code-review fix: buildLogoKey ext leading-dot normalization (path.extname compat)
  STATE: branch swarm/printable-report-map-S3 committed @ cf17320.
    pnpm --filter @marine-guardian/storage test: 49/49 ✓
    pnpm --filter @marine-guardian/storage exec tsc --noEmit: clean ✓

SESSION_SAVE_2026_07_01_S0 (Swarm S0 — Data gap #1: reportMap geo data):
  ✅ DONE THIS SESSION:
    - Added buildEventBreakdownWithCoords() exported helper (single-pass, SSR-reusable)
    - Added eventBreakdownWithCoords tenantProcedure (LE/monitoring/high-priority with lat/lon points)
    - Added allEventPointsInRange tenantProcedure (all events with lat/lon for overview map)
    - Added patrolTrackPointsInRange tenantProcedure (patrol polylines from PatrolTrack.trackGeojson)
    - Extended reportMap.test.ts: +8 tests, added patrolTrack mock; 1188 tests total
    - Code-review fix: eliminated redundant event.count in allEventPointsInRange (use rows.length)
  STATE: branch swarm/printable-report-map-S0 committed. Lint ✓ test ✓.
    Pre-existing typecheck errors in exports/page.tsx + reportExport.ts (not in scope).

SESSION_SAVE_2026_07_01_S1 (Swarm S1 — Data gap #2a):
  ✅ DONE THIS SESSION:
    - Registered `"report-map"` in reportTypeSchema (packages/shared/src/schemas/enums.ts)
    - Added `"report-map"` to LANDSCAPE_REPORT_TYPES in pdf-render.processor.ts (A4 landscape per PM decision)
    - Added paramsJson shape comment to createReportExportInputSchema in report-export.ts
    - Validation: shared typecheck ✅ | jobs 203/203 ✅ | code-review clean (0 in-scope blockers)
  ⚠ DEFERRED (separate session required):
    - Prisma `ReportType` enum migration — add `report_map` value to packages/db/prisma/schema.prisma (L124)
      and generate+deploy the migration before report-map exports can be created at the DB layer.
  STATE: swarm/printable-report-map-S1 committed. Awaiting owner approval to merge.

SESSION_SAVE_2026_06_27 (read FIRST on reboot):
  ✅ DONE THIS SESSION:
    - Command Center tactical redesign GOAL COMPLETE (full auto): 4 gated sub-batches A 23c97a4 / B c6f6527 /
      C 9586d39 / D 8940b47 — all merged to LOCAL main, Visual-QA PASS, web 1026→1038. See GOAL_2026_06_26 below
      + memory project_marine_guardian_command_center_tactical_redesign.
    - Committed prior War Room QA evidence (d6f6792). Compacted MEMORY.md 27.3KB→10.2KB (entries dropping on load).
  ⚠ OWNER DECISIONS TO RE-SURFACE (docs/PENDING_DECISIONS.md → 2026-06-27 block — all un-gated work else continues):
    1. Push redesign commits to origin / deploy? (on LOCAL main only; local-dev-only directive held — not pushed.)
    2. Expand seed to wire AccompanyingRanger↔KnownRanger so Ranger Roster demos with content (now 0/0/0 on demo data)?
    3. Back-port tactical War Room direction into docs/PRODUCT.md (Rule 9 / Rule 1 — human-owned).
    (Pre-existing still open: Item 2 ER completeness + images — DAS_WEB_TOKEN; deploy posture local-only.)
  STATE: working tree CLEAN. Dev app healthy @ :45204 (rebuilt at 9586d39). main HEAD = 8940b47.

GOAL_2026_06_26 (owner-set, FULL AUTO MODE — Command Center tactical redesign):
  Spec: docs/superpowers/specs/2026-06-26-command-center-redesign-design.md (committed df2ab47).
  Dark-locked tactical command center. Map-dominant hero + status band (KPIs w/ sparklines +
  unacked alarm) + right rail (alerts/feed/active-patrols UNCHANGED) + analytics band
  (LE bars · Monitoring · coverage zones · NEW ranger roster). Built via shadcn/studio Pro
  (/iui /cui /rui), INHERIT-not-REPLACE (Rule 12). Local-dev ONLY (no staging/prod).
  Owner decisions: full redesign · dark ALWAYS (route-scoped) · coverage% only (NO response-time)
  · roster = separate panel in analytics band · 2 new read-only procedures only.
  SUB-BATCHES (each gated: check-product-sync + web typecheck + test + web build + scoped eslint):
    A ✅ MERGED 23c97a4 — .command-center scoped tactical token layer + map-dominant layout shell. Gate green (1026 tests).
    B ✅ MERGED c6f6527 — dashboard.kpiTrends + dashboard.rangerRoster (read-only, tenant-scoped) +4 tests. Gate green (1030).
    C ✅ MERGED 9586d39 — sparkline.tsx + ranger-roster.tsx + coverage% headline; wired into page.tsx +8 tests. Gate green (1038).
    D ✅ DONE — /rui principles applied (consistency/contrast; no studio-variant churn per INHERIT-not-REPLACE).
        Visual QA PASS @ :45204 (docs/qa-screenshots/cc-redesign-2026-06-26/): tactical dark surface, status band +
        sparklines (6 polylines), map-dominant, alarm-styled alerts rail, analytics band all 5 panels (LE 13 /
        Monitoring 19 / Municipality Coverage / Protected Zones 100% coverage-% / Ranger Roster summary), 0 console
        errors, single-screen @1920, responsive @1366. Dev app rebuilt at 9586d39 (port 45204).
  ✅ GOAL COMPLETE — all 4 sub-batches merged to main + Visual-QA-verified. Local-dev only (nothing deployed).
     Follow-ups (un-gated, owner may trigger): roster shows 0/0/0 on demo data (sparse AccompanyingRanger↔KnownRanger
     links — same data reality as active-patrols leaders); back-port War Room tactical direction into docs/PRODUCT.md
     (Rule 9, human-owned). Item 2 (ER images) still owner-gated on DAS_WEB_TOKEN.

HANDOFF_2026_06_26 (War Room owner feedback round 2 — branch feat/warroom-date-range-drilldown, PR #28; resume here):
  Owner gave 6 dashboard corrections. ALL 6 BUILT + GATED on branch feat/warroom-date-range-drilldown (PR #28):
  items 1-4 = commit ed2dce0 (categorization fix + titles + bar-end count labels + coverage range label; web tests →1020);
  items 5-6 = commit bfa5939 (map-dominant layout + fullscreen toggle hiding sidebar/header; web tests →1026). Each gate green
  (product-sync/typecheck/test/build/eslint). Final Visual QA of all 6: ✅ PASS (docs/qa-screenshots/warroom-feedback-2026-06-26/:
  LE bar populated, exact titles, count at bar ends, coverage shows "Jun 19–26" not "30 days", map dominant, fullscreen hides
  sidebar+header + Exit/ESC restores, 0 console errors).
  ✅ MERGED to main 2026-06-26 — PR #28 squash 704ecfa (entire War Room: date-range default + FROM/TO + drill-down modals
  + the 6 owner-feedback fixes). Owner then REVERTED #5 map-dominant layout back to the previous grid (commit 8a5f4df, in the
  merge) — #1-4 fixes + #6 fullscreen toggle KEPT; "Others" KEPT in the LE bar per owner. Also fixed a typecheck error
  bfa5939's fullscreen-toggle.test.tsx carried (document.exitFullscreen strict assign → Object.defineProperty). Web suite 1026.
  Dev app (port 45204) rebuilt at this state and healthy. NOTHING about staging/prod changed (local-dev only).
  OPEN: Item 2 (ER completeness + images) still gated on DAS_WEB_TOKEN — docs/PENDING_DECISIONS.md.
  MINOR (owner aware): LE breakdown top item is "Others" (real law-enforcement-and-apprehensions category) — kept per owner.
  ITEM 1 (DATA FACT): real eventType.category values are 'law-enforcement-and-apprehensions' (LE bar) and
    'monitoring_patrolling_and_surveillance' (Monitoring bar). Old code checked 'law_enforcement' → LE bar always empty.
    Fix in dashboard.ts eventBreakdown: bucket by those two exact strings, exclude all other categories. (agent applied it.)
    Proper sub-groups — A. Law Enforcement and Apprehensions: Unregistered Illegal Fishing · Fishing in a prohibited
    area (MPA) · Taking of Prohibited Species · Use of Prohibited Gears · Compressor Fishing · Destructive Practices.
    B. Monitoring, Patrolling & Surveillance: Marine Wildlife Sightings · Infrastructure and Assets · Research and
    Studies · Community Support · Threats on Habitat.
  ITEM 2: page.tsx <BreakdownBars> titles → "Law Enforcement and Apprehensions" / "Monitoring, Patrolling & Surveillance".
  ITEM 3: breakdown-bars.tsx (already horizontal) → add count number at END of each bar (Recharts <LabelList position="right">).
  ITEM 4: municipality-coverage-chart.tsx (~L82) + protected-zone-card.tsx (~L58) hardcode "30 days" but data IS
    range-filtered — replace with the active range label (pass from/to from page.tsx useDashboardRange).
  ITEM 5 (NEXT — map bigger + rearrange): page.tsx grid is lg:grid-cols-5 (left col-span-3 map+charts, right col-span-2).
    Make InteractiveMap the DOMINANT element (largest, ~60-70% area) for a command center; KPI strip as a top band; other
    cards smaller around the map.
  ITEM 6 (NEXT — fullscreen): header.tsx (NotificationBell on the right) → add a SQUARE icon button (lucide Maximize/
    Minimize) immediately LEFT of the bell. Toggle = browser Fullscreen API on the dashboard root AND hide Sidebar +
    Header (show only the dashboard). Shell (dashboard)/layout.tsx is a SERVER comp (async auth) → wrap Sidebar+Header+main
    in a NEW client component (e.g. components/layout/fullscreen-shell.tsx) holding fullscreen state (context or
    fullscreenchange listener); hide Sidebar/Header when fullscreen; ESC + a floating exit button to leave.
  THEN Visual QA all 6 (rebuild dev app: COMPOSE_PROJECT_NAME=marine-guardian_dev docker compose -f
    deploy/compose/dev/docker-compose.app.yml up -d --build --force-recreate app --env-file .env.dev; wait /api/health 200;
    Playwright @ http://localhost:45204 admin@mail.com/admin): LE bar now populated + correct titles + count at bar ends;
    coverage cards show active range not "30 days"; map dominant; fullscreen button hides sidebar+header, ESC restores.
  GATE per commit (web): product-sync + web typecheck + web test + `pnpm --filter @marine-guardian/web build` + scoped eslint.

GOALS_2026_06_25 (owner-set, Full Auto Mode — branch feat/warroom-date-range-drilldown):
  Spec locked in docs/PRODUCT.md (Active Goals + War Room spec). Local-dev ONLY (no staging/prod).
  PROGRESS (all commits on branch feat/warroom-date-range-drilldown, pushed to origin, each gated green, NOT merged — owner review):
    T1 backend 66e1193 · T2-T4 range header+context 3d1b616 · T5 event/patrol modals 2d62b4a ·
    T5b KPI+breakdown drill modals 412fb2c · T4b 2 coverage charts range-scoped + alert detail modal f976435.
    Web suite 989→1019. ITEM 3 ✅ COMPLETE (all panels incl. municipality + protected-zone charts honor range; default last-7d).
    ITEM 4 ✅ COMPLETE (every data element clickable→modal: event-feed, last-incident, patrol rows, KPI cards [list-backed],
    breakdown bars, alert rows; non-list aggregates [Unacked/RangersOnDuty] non-interactive by design).
    Visual QA core PASS (docs/qa-screenshots/warroom-2026-06-25/: default 7d, range re-query, 4 modal types, 0 console errors).
    T4b-additions QA: ✅ PASS (docs/qa-screenshots/warroom-t4b-2026-06-26/: both coverage charts re-query on range
    change [municipality 17/11→378/126 when widened]; alert row→detail modal; ACK no-modal; 0 console errors).
    => ITEMS 3 + 4 FULLY BUILT + GATED + VISUAL-QA-VERIFIED. Un-gated queue empty (only Item 2 remains, owner-gated).
  INFRA NITS (dev-only follow-ups, NOT feature defects): (1) deploy/compose/dev/docker-compose.app.yml external network
    'dev_network' ≠ actual 'marine-guardian_dev_network'; (2) recreating the dev app needs `--env-file .env.dev` +
    COMPOSE_PROJECT_NAME=marine-guardian_dev or it binds a stale host port (54850) and breaks NextAuth login. start.sh
    sets both correctly — align the compose file / document so a bare `docker compose up --build app` works.
  REMAINING (owner-gated only): Item 2 ER completeness + images — needs DAS_WEB_TOKEN (see docs/PENDING_DECISIONS.md).
  1. ✅ Local-dev only — staging/prod paused (PRODUCT.md Deployment Config updated). PR #27 fix stays on main, NOT deployed.
  2. 🔴 GATED — ER data completeness + images: date coverage 2024→now EXISTS locally (patrols 2023-26, events 2023-26);
     IMAGES NOT STORED (only has_photo flag, no attachment table, ingest script has no image download). Live verification +
     image ingestion need DAS_WEB_TOKEN (dev ER conn = fake-er.example.com). See docs/PENDING_DECISIONS.md.
  3. ⏳ War Room defaults to last 7 days — BACKEND foundation = add optional {dateFrom,dateTo} (default [now-7d, now]) to
     dashboard.ts procedures (kpis/recentEvents/eventBreakdown/alertStats/lastIncident/activePatrols → range-scoped).
  4. ⏳ FROM/TO range header + click→modal on every element — FRONTEND.
  VERIFIED STRUCTURE: War Room = apps/web/src/app/(dashboard)/dashboard/page.tsx (no separate war-room route).
    9 client components in apps/web/src/app/(dashboard)/dashboard/_components/: kpi-strip.tsx, event-feed.tsx,
    active-patrols.tsx, alerts-panel.tsx, breakdown-bars.tsx, last-incident-card.tsx, municipality-coverage-chart.tsx,
    protected-zone-card.tsx, clock-card.tsx (+ lib.ts). Each calls its trpc.dashboard.* query directly (client).
    shadcn calendar/date-picker NOT installed → use native <input type="date"> (no new dep) OR `npx shadcn add calendar popover`.
    Modal pattern: apps/web/src/components/events/event-detail-modal.tsx (shadcn Dialog). dashboard.ts procedures NOW
    accept { dateFrom, dateTo } (T1 done) — pass the active range into every component's useQuery input.
  DECOMPOSITION:
    T1 ✅ DONE (commit 66e1193): dashboard.ts — all 6 procedures take optional {dateFrom,dateTo} (omit = unchanged);
       +8 range tests (web 989→997). Full gate green (product-sync/typecheck/test/build/lint).
    T2 (ui-state): a client date-range state defaulting to [now-7d, now] shared across the page — a React context
       provider (DashboardRangeProvider) wrapping page.tsx's client tree, exposing {from,to,setRange,resetTo7d}.
    T3 (ui-picker): a FROM/TO header at top of the dashboard showing active range (native <input type="date"> ×2 +
       a "Last 7 days" reset button); WCAG labels.
    T4 (wire): each _components/*.tsx reads the range from context and passes {dateFrom:from,dateTo:to} into its
       trpc.dashboard.* useQuery input. (clock-card has no query — skip. municipality/protected-zone read their own
       queries — thread range only if those procedures take it; else leave + note.)
    T5 (modals): click→shadcn Dialog detail modal per element — event-feed row reuses EventDetailModal; active-patrols
       row → patrol detail modal; kpi card → drill list; breakdown bar / last-incident → detail. New small modal
       components under _components/ as needed.
    T6: Visual QA (Playwright, http://localhost:45204, admin@mail.com/admin, demo-site) — default shows last 7d with
       FROM/TO at top; changing range re-queries all panels; every element opens a modal. REBUILD dev_app first
       (compose has NO source mount — `docker compose up -d --build --force-recreate app`).
  GATE per commit (web change): pnpm tools:check-product-sync && web typecheck && web test && `pnpm --filter @marine-guardian/web build` (HARD — catches lint debt) && scoped eslint clean.

DONE_2026_06_25 (merged): materialize ER-creds fix — PR #27 squash-merged to main (255b668: ca58f43 fix + 44d5284 client timeout).
  Prod deploy + 3391-patrol track backfill DEFERRED (local-dev-only directive). Detail in memory project_marine_guardian_materialize_er_creds_bug.

ACTIVE_WORK (2026-06-25, resume session — SUPERSEDED, see DONE_2026_06_25 above):
  🐛 ROOT CAUSE found for QA P2-B/P1-D (patrol distance "—" everywhere): materializePatrolTrack
  (packages/jobs/src/lib/patrol-track-materialization.ts L202-228) reads ER creds from the LEGACY
  NULL Tenant.earthrangerUrl/earthrangerDasToken columns instead of tenant_er_connections (where the
  Settings UI writes them). → every materialize job returns skipped:no_credentials → no PatrolTrack →
  no computed_distance_km → "—". Same bug class as the 2026-06-21 er-sync prod hotfix, which patched
  er-sync.processor.ts but NOT materializePatrolTrack. DB proof: demo-site legacy ER cols NULL,
  tenant_er_connections populated; 2026-06 = 235 patrols / 235 segments-with-leader / 0 tracks (cliff);
  1270/4784 tracked (older ingest path); read paths + computed-metrics backfill all verified CORRECT.
  Full detail: memory project_marine_guardian_materialize_er_creds_bug.
  FIX (owner approved "backfill + root-cause"): (1) patch materializePatrolTrack Step 2 to read
  tenantErConnection (mirror er-sync L70-86) + update its no_credentials test; (2) new
  scripts/backfill-patrol-track-materialization.ts. GATED: live ER GETs (235) + prod deploy = owner go-ahead.

PROD_DEPLOY (2026-06-21, deploy architect):
  Promoted MG to PRODUCTION at commit 19c7e58 (mg.powerbyte.app). PROD LIVE & CLEAN.
  • Images: staging→prod re-tag (no rebuild). prod latest + prod-sha-19c7e58.
    app/worker digest sha256:098d73fd… , pdf digest sha256:4a39a753… — both == 19c7e58 (verified
    via Docker Hub: staging-latest digest === staging-sha-19c7e58 digest for both images).
  • Trivy gate: PASS (app exit 0, pdf exit 0 — 26 HIGH/CRIT on pdf are all unfixable/will_not_fix;
    gate blocks only on fixable). Prior prod rollback target = prod-sha-70648c4 (still on Docker Hub).
  • Pre-migration backup: fresh pg_dump taken →
    /userdata/dumps/marine-guardian_prod_pre-19c7e58_20260621T141826Z.sql.gz (11MB, gzip-verified;
    Backrest nightly snapshots /userdata/dumps → S3 powerbyte-restic-offsite). Backrest container Up.
  • Migrations applied to prod (direct Postgres :5434 via SSH tunnel, NOT PgBouncer): 4 pending →
    20260619000000_drop_polymorphic_accompanying_ranger_fks, 20260621000000_add_compliance_privacy,
    20260621030355_ops_m1_snapshot_revisions_recurring_sync, 20260621100000_add_alert_history_acknowledgement.
    (20260616113329_add_tenant_er_connection was already on prod.) No tenant_id drift. "Schema is up to date."
  • Deploy: docker compose pull + up -d in /etc/komodo/stacks/marine-guardian. All containers healthy
    (app/worker/postgres/minio/valkey/pdf_renderer/pgbouncer). /api/health 200 {"status":"ok"}; home 307.
  • RECURRING ER SYNC: ✅ LIVE (activated 2026-06-21, owner-approved). Wired the live
    mindoro.pamdas.org EarthRanger connection into the prod "Demo Site" tenant
    (id cmqgv4kit0000gmygz0ulcjos) via Settings→EarthRanger Sync UI (token through AES-256-GCM
    encryption path — never written to Postgres directly). Test Connection → status='connected'.
    Recurring sync enabled at interval_ms=300000 (5 min); persisted (recurringEnabled=true,
    intervalMs=300000, verified across page reload + via getErConnection). Full delta sync verified
    green end-to-end: subjects 85, event_types 39, observations 25, patrols 25, events 3 — all
    sync_logs status='success', 0 errors. Dashboard renders healthy with live data.
    Activation surfaced + FIXED 3 real prod defects (see DECISIONS_LOG 2026-06-21 ER-sync activation):
      1. app container BullMQ enqueue ECONNREFUSED — docker-compose.app.yml app service was missing
         REDIS_HOST/REDIS_PORT overrides (inherited localhost:6381 host-CLI values); BullMQ reads
         REDIS_HOST/PORT not REDIS_URL. Added overrides matching the worker service.
      2. worker read ER creds from unused Tenant.earthrangerUrl/earthrangerDasToken columns instead
         of the canonical tenant_er_connections table the UI writes → "EarthRanger not configured".
         Fixed packages/jobs/src/processors/er-sync.processor.ts to read tenantErConnection
         (baseUrl plaintext + decrypt(apiTokenEnc)).
      3. EarthRanger client mis-parsed DRF responses (events/patrols/observations "X is not iterable";
         event_types 404). Fixed earthranger-client.ts request() to unwrap data→results envelope and
         corrected getEventTypes path to /activity/events/eventtypes/ (matches scripts/ingest-earthranger.mjs).
    Deployed via image bonitobonita24/marine-guardian:prod-hotfix-ersync-0621-2307
    (digest sha256:51e6da41…e4c3613); APP_IMAGE_TAG flipped in .env.prod + .env. app+worker healthy.
    Known follow-up (pre-existing, unrelated): alerts processor throws Prisma "Unknown argument userId"
    (Notification model uses recipients, not userId) — does not affect ER sync or worker health.
  • Rollback: none performed; none needed. ER-sync rollback = set APP_IMAGE_TAG back to prod-sha-19c7e58.

LAST_DONE: feat — Alert Acknowledgement (branch feat/mg-alert-acknowledge, 2026-06-21).
            Owner-approved closure of WHAT_OWNER_DECISIONS ACK item:
            • Schema: AlertHistory gains acknowledgedAt DateTime? + acknowledgedBy String?
              (additive migration 20260621100000_add_alert_history_acknowledgement).
            • tRPC: alertHistory.acknowledge mutation (adminProcedure L3, writeAuditLog L5,
              tenantId-scoped L6, idempotent). alertHistory.unacknowledgedCount query (tenantProcedure).
            • dashboard.alertStats: now returns true unacknowledged count (WHERE acknowledgedAt IS NULL,
              last 24h) — no longer the "recent alerts proxy".
            • WAR ROOM KPI tile: "Recent Alerts" → "Unacknowledged"; sub-label "alerts last 24h".
            • AlertsPanel: ACK button per unacked alert (admin-only, canAck prop); acked alerts show
              badge + timestamp. Read-only caption removed. WCAG 2.2 AA (aria-label on ACK button;
              ack state is text not color-alone).
            • Tests: 8 new router tests + 9 new AlertsPanel component tests.

PREV_LAST_DONE: feat — Operations Epic (M1-M3) + WAR ROOM dashboard fidelity ALL MERGED to main 2026-06-21.
            • ops-m1 (e97bc6c): recurring INCREMENTAL delta-only ER sync backend + schema.
            • ops-m2 (44bbff4): editable Events/Patrols + edit-history timeline UI + settings ER-sync.
            • ops-m3 (4f04331): events view Kanban → infinite-scroll Operations List (50/page cursor).
            • WAR ROOM fidelity (42%→~85%): 5-KPI strip + live clock + InteractiveMap + Alerts panel
              + Live Event Feed + Active Patrols + Last Incident + breakdown bars.
            Combined gate green (typecheck/lint/test/build); CI green on every PR (#9/#10/#12/#7).

NEXT: Operations Epic is now feature-complete (all 3 milestones built, stacked PRs await owner merge):
      Merge order: main already has M1 → merge PR #10 (M2) → merge M3 PR (base: M2 branch).
      After merge: enable recurring ER sync toggle per tenant on prod settings page.
      - (deferred) Coverage Report Page 3 (patrol track ∩ area-boundary clipping)

NEXT (owner-gated, pre-M1):
      - DPO appointment (human decision — named DPO / external DPO service)
      - NPC registration / Privacy Impact Assessment (PIA) — human-initiated
      - Lawful-basis fine-tuning in PRODUCT.md §Compliance (owner input needed)
      - Phase 8 Item 6.1c: Coverage Report Page 3 (patrol track ∩ area-boundary
        clipping, ~12 files, ~55K tokens, Tier 2) — unblocked, owner to trigger.
      - 5.1d Area A: ER client area_name ingestion extension (precursor to 5.1d-B full close)

DEFERRED:
      - Area A from 5.1d: extend ErEvent/ErPatrol interfaces + syncEvents/syncPatrols
        mapping to ingest area_name from EarthRanger (precursor batch 5.1d.A).
      - 6.1c Coverage Report Page 3 (area coverage km / hrs per boundary — turf.js algorithm)

BLOCKED_ON_OWNER:
      - DPO contact information for PRODUCT.md §Compliance
      - NPC data breach registration decision (mandatory within 72h of discovery)
      - Phase 3.3 client sign-off gates (PROTOTYPE.md) if re-engaged
      - S3 backup credentials for full Phase 5 cloud-backup validation

FRAMEWORK_SYNC: V32.9 (latest — synced 2026-06-21 via chore/framework-sync-v329)
DELIVERABLES_SYNCED: 23/23 — all .ai_prompt/ files match framework HEAD (md5 verified)
CLAUDE_MD: MATCHES framework HEAD (642824e8c3dc78471c43abc35a019cd7)

COMPLIANCE_LAYER:
  evidence: V32.9 Rule 33 active. privacy.md present in .ai_prompt/. ComplianceFooter
            shipped in apps/web/src/components/compliance-footer.tsx. /privacy page live.
            DSR + breach routers active. WCAG 2.2 AA on compliance/auth surfaces.
            Note: MG is NOT a gov/LGU app — WCAG gate is best-effort, not DICT MC 004 hard gate.
            ConsentLog/DataSubjectRequest/BreachNotificationRecord/RetentionPolicy in schema.

SECURITY_L1_L6:
  evidence: L3 RBAC active (role-based guards on tRPC routers — hasPermission + adminProcedure
            across alertRule/settings/user/breach/dsr/alertHistory routers). L5 AuditLog active
            (writeAuditLog calls in exports, impersonation, user, settings, dsr, alertHistory
            routers). L6 Prisma tenant guardrails active (packages/db/src/client.ts extension +
            explicit tenantId scoping in all routers).

DESIGN_GATE: V32.8 Rule 31 token pipeline active (tokens.json, sd.config.mjs, design-validate.mjs).
             design-stop-hook.sh wired in .claude/settings.json Stop hook.
             WCAG AA on compliance/auth surfaces confirmed in V32.9 feat commit.

STOP_HOOK_ACTIVE: true — .claude/settings.json → hooks.Stop → bash scripts/design-stop-hook.sh
