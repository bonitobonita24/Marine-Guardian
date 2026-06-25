# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9

GOALS_2026_06_25 (owner-set, Full Auto Mode — branch feat/warroom-date-range-drilldown):
  Spec locked in docs/PRODUCT.md (Active Goals + War Room spec). Local-dev ONLY (no staging/prod).
  1. ✅ Local-dev only — staging/prod paused (PRODUCT.md Deployment Config updated). PR #27 fix stays on main, NOT deployed.
  2. 🔴 GATED — ER data completeness + images: date coverage 2024→now EXISTS locally (patrols 2023-26, events 2023-26);
     IMAGES NOT STORED (only has_photo flag, no attachment table, ingest script has no image download). Live verification +
     image ingestion need DAS_WEB_TOKEN (dev ER conn = fake-er.example.com). See docs/PENDING_DECISIONS.md.
  3. ⏳ War Room defaults to last 7 days — BACKEND foundation = add optional {dateFrom,dateTo} (default [now-7d, now]) to
     dashboard.ts procedures (kpis/recentEvents/eventBreakdown/alertStats/lastIncident/activePatrols → range-scoped).
  4. ⏳ FROM/TO range header + click→modal on every element — FRONTEND.
  DECOMPOSITION (each a fresh-context task, ≤500L):
    T1 (backend, keystone): dashboard.ts — add z.object({dateFrom,dateTo}).optional() default last-7d to all 6 procedures
       + range-scoped counts; update dashboard.test.ts. TDD + gate. [in progress]
    T2 (ui-state): DateRangeProvider/context for war room (default [now-7d,now]) + URL/useState; FROM/TO header.
    T3 (ui-picker): DateRangePicker component (shadcn Popover + calendar — VERIFY calendar installed, else `npx shadcn add calendar`).
    T4 (wire): thread range into every war-room component query (KPI/feed/patrols/charts/alerts/map).
    T5 (modals): click→Dialog detail modal per element (event row→EventDetailModal reuse; patrol row; KPI drill; chart bar; alert).
    T6: Visual QA (Playwright) — default 7d shows, FROM/TO changes data, each element opens modal.
  VERIFY-FIRST: Explore brief had several "(implied)" component paths — confirm real paths before editing each.

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
