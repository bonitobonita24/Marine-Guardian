# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9
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
