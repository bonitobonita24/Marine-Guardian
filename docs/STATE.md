# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9
LAST_DONE: feat(ops-m1) — Operations Epic Milestone 1: recurring incremental ER sync backend.
            Branch: feat/mg-ops-recurring-incremental-sync. PR pending.
            Deliverables:
              Schema — erOriginalSnapshot (immutable, set-once) on Event + Patrol;
              EventRevision + PatrolRevision append-only tables; TenantErConnection gets
              recurringEnabled + intervalMs (default 300_000ms / 5 min, min 60_000ms / 1 min);
              SyncLog composite watermark index.
              Queue layer — er-sync-watermark.ts helper (getWatermark from SyncLog.completedAt);
              enqueueErSyncWithWatermark (delta: watermark, full: omit since);
              scheduleRecurringErSync fixed (was passing no `since` → full pull every run; now
              computes watermark; interval fixed from wrong 30_000ms to 300_000ms; min clamp 60_000ms);
              removeRecurringErSync (BullMQ v5 removeJobScheduler).
              Bootstrap — start-workers.ts bootstrapRecurringErSync() wires all enabled tenants on startup.
              Settings tRPC — syncNow + updateErSyncConfig mutations (adminProcedure, L5 audit).
              Tests — 17 new tests across watermark, queue, settings-sync; all 835 pass.
              Gate: typecheck 7/7, lint 11/11, test 835/835, build 2/2.

PREV_LAST_DONE: feat(v329) — PH Data Privacy Act compliance + WCAG 2.2 AA + ComplianceFooter
            (commit a073ac8, merged 2026-06-21).
            Deliverables: ConsentLog/DSR/BreachNotification Prisma models + migrations,
            dsr + breach tRPC routers, /privacy page, Settings → Data & Privacy self-service,
            admin breach register, ComplianceFooter (honest config), WCAG 2.2 AA on
            compliance/auth surfaces. 23 new vitest tests. Gate: typecheck 7/7,
            lint 6/6, test 818/818, next build 2/2.

NEXT: Milestone 2 (UI layer — owner to trigger):
      - Settings → ER Sync tab: recurringEnabled toggle + intervalMs input (uses updateErSyncConfig)
      - Settings → manual "Sync Now" button (uses syncNow mutation)
      - (M3) Event list UI redesign + editable record modal with revision history

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
