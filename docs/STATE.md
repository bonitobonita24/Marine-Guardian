# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9
LAST_DONE: feat(v329) — PH Data Privacy Act compliance + WCAG 2.2 AA + ComplianceFooter
            (commit a073ac8, merged 2026-06-21).
            Deliverables: ConsentLog/DSR/BreachNotification Prisma models + migrations,
            dsr + breach tRPC routers, /privacy page, Settings → Data & Privacy self-service,
            admin breach register, ComplianceFooter (honest config), WCAG 2.2 AA on
            compliance/auth surfaces. 23 new vitest tests. Gate: typecheck 7/7,
            lint 6/6, test 818/818, next build 2/2.

NEXT: ⭐ OPERATIONS EPIC — owner-directed 2026-06-21 (queued TODO, see DECISIONS_LOG "Operations: Events list redesign…" + PRODUCT.md "Event Management (Operations List)" / "Editable Records & Edit History" / Tenant Settings recurring auto-sync). Three linked features:
        (1) Events view → infinite-scroll LIST (50/page, cursor pagination, newest-first like Patrols, per-row inline state control) — REPLACES Kanban. Design-touching → owner eyes before merge.
        (2) Editable Events + Patrols on MG's canonical copy + immutable erOriginalSnapshot + field-level edit-history with a right-side timeline tab (who/when/what).
        (3) Recurring ER sync OPTION 3: per-tenant opt-in toggle (gated on verified connection) @ default 5min interval (configurable, min 1min) + admin "Sync now" button. Wires the existing-but-uncalled scheduleRecurringErSync + new settings.syncNow. ⚠ TODAY NO AUTO-POLLING RUNS (scheduler never invoked).
        Tier 2-3, likely multi-session split. NOT yet started (owner resting PC).

      Owner-gated items deferred from V32.9:
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
