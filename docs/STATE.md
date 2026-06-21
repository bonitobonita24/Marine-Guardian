# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9
LAST_DONE: feat(ops-m2) — Operations Epic Milestone 2: editable records + edit history UI + settings sync controls.
            Branch: feat/mg-ops-editable-records-history. PR open (owner-merge-gated).
            Deliverables:
              Backend — event.update + patrol.update mutations (tenantProcedure, L5 audit, RBAC-gated);
              append-only EventRevision/PatrolRevision writes per changed field (Prisma.JsonNull for null values);
              event.getRevisions + patrol.getRevisions queries (lazy load for history tab);
              event.getEditedFields + patrol.getEditedFields queries;
              settings.getSyncLogs query (tenantProcedure, last-10 newest-first).
              Edit protection — REVISION-PRESENCE strategy in er-sync.processor.ts:
              getEventEditedFields + getPatrolEditedFields helpers query distinct fieldNames
              from revision tables; ER sync update path filters out locally-edited fields via
              Object.fromEntries/filter (no dynamic-delete anti-pattern).
              UI — Tabs (Edit/History) on event-detail-modal + patrol detail page;
              RevisionTimeline shared component (newest-first, ER baseline at bottom, WCAG 2.2 AA);
              ErSyncCard component on Settings page (recurring toggle, interval, sync now, log table).
              Infra — Prisma exported as value from @marine-guardian/db (was type-only).
              Tests — 24 new tests (event.update ×4, event.getRevisions ×4, patrol.update ×6,
              patrol.getRevisions ×3, settings.getSyncLogs ×7);
              er-sync.processor.test.ts mocks extended (patrol.findUnique, revision findMany stubs);
              Total: 859 web + 181 jobs = 1040/1040 green.
              Gate: typecheck, lint, test 1040/1040, build — all green.

PREV_LAST_DONE: feat(ops-m1) — Operations Epic Milestone 1: recurring incremental ER sync backend.
            Branch: feat/mg-ops-recurring-incremental-sync. Merged to main at e97bc6c.

NEXT: Milestone 3 (owner to trigger after M2 merge):
      - (M3) Events list UI redesign: Kanban → infinite-scroll list
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
            across alertRule/settings/user/breach/dsr routers). L5 AuditLog active (writeAuditLog
            calls in exports, impersonation, user, settings, dsr routers). L6 Prisma tenant
            guardrails active (packages/db/src/client.ts extension + explicit tenantId scoping
            in all routers).

DESIGN_GATE: V32.8 Rule 31 token pipeline active (tokens.json, sd.config.mjs, design-validate.mjs).
             design-stop-hook.sh wired in .claude/settings.json Stop hook.
             WCAG AA on compliance/auth surfaces confirmed in V32.9 feat commit.

STOP_HOOK_ACTIVE: true — .claude/settings.json → hooks.Stop → bash scripts/design-stop-hook.sh
