# Marine-Guardian — STATE.md

> Canonical framework location: `docs/STATE.md` (V32.8 Rule 32 / design-stop-hook contract).
> Historical location `.cline/STATE.md` preserved for reference (pre-V32.8).

PHASE: Phase 8 (ongoing buildout)
FRAMEWORK_VERSION: V32.9
LAST_DONE: feat(ops-m3) — Operations Epic Milestone 3: Events List redesign (Kanban → infinite-scroll Operations List).
            Branch: feat/mg-ops-events-list-redesign. PR open, base: feat/mg-ops-editable-records-history (owner-merge-gated).
            Deliverables:
              Router — event.list extended with 4 new server-side filters (category, areaName, dateFrom, dateTo);
              eventListFilters Zod schema updated; backward-compatible (all new fields optional).
              UI — events/page.tsx rewritten: Kanban removed, EventsList infinite-scroll component mounted.
              UI — EventsList (src/components/events/events-list.tsx, NEW):
                • Continuous vertical list (role=list/listitem), newest-first (createdAt desc), 50/page cursor pagination.
                • IntersectionObserver sentinel + fallback "Load more" button for auto-load on scroll.
                • Filter bar: state, category, areaName (debounced input), monthFilter (monthly-accomplishment).
                • Inline state control: shadcn Select per row — New / Active / Resolved transitions via updateState.
                • Click row → opens M2 EventDetailModal (Edit/History tabs).
                • WCAG 2.2 AA: icon+text state badge (never color-alone), keyboard-operable Select, aria-label, time[dateTime].
                • Design tokens inherited from DESIGN.md; shadcn/ui only.
              Tests — 15 new tests: cursor pagination (5), server-side filters (7), inline state transition (3).
              Total: 874 web + 181 jobs = 1055 green.
              Gate: typecheck 13/13, lint 0 errors/0 warnings, test 874/874, build — all green.

PREV_LAST_DONE: feat(ops-m2) — Operations Epic Milestone 2: editable records + edit history UI + settings sync controls.
            Branch: feat/mg-ops-editable-records-history. PR #10 open (owner-merge-gated).

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
            across alertRule/settings/user/breach/dsr routers). L5 AuditLog active (writeAuditLog
            calls in exports, impersonation, user, settings, dsr routers). L6 Prisma tenant
            guardrails active (packages/db/src/client.ts extension + explicit tenantId scoping
            in all routers).

DESIGN_GATE: V32.8 Rule 31 token pipeline active (tokens.json, sd.config.mjs, design-validate.mjs).
             design-stop-hook.sh wired in .claude/settings.json Stop hook.
             WCAG AA on compliance/auth surfaces confirmed in V32.9 feat commit.

STOP_HOOK_ACTIVE: true — .claude/settings.json → hooks.Stop → bash scripts/design-stop-hook.sh
