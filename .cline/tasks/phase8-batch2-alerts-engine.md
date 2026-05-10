# Sonnet Task — Phase 8 Batch 2 Item: Alert Rule Evaluation Engine

**Tier:** 2 · **Estimated Sonnet context:** ~50K · **SAFE zone:** 60K
**Branch:** `feat/alerts-evaluation-engine`
**Model:** Sonnet 4.6 (executor only — Opus already planned this scope)

---

## Why this task exists
Alert Rules CRUD UI + Notification Center shipped 2026-05-08, but **rules don't fire**. The alerts BullMQ queue and AlertRule entity exist; the processor body is empty. This task fills the body so events trigger notifications end-to-end.

---

## Scope — DO NOT exceed this list

### Files to CREATE (2)
1. `packages/jobs/src/processors/alerts.processor.ts`
2. `packages/jobs/src/__tests__/alerts.processor.test.ts`

### Files to MODIFY (2)
3. `packages/jobs/src/workers/index.ts` — register alerts worker
4. `apps/web/src/server/trpc/routers/event.ts` — enqueue alerts job on event create

### Files to READ (5 — read ONLY these, do not browse)
5. `packages/db/prisma/schema.prisma` — read ONLY the `AlertRule`, `Event`, `Notification` models (use grep/section read; do not load full schema)
6. `packages/jobs/src/processors/er-sync.processor.ts` — pattern template
7. `packages/jobs/src/workers/base-worker.ts` — base class
8. `packages/jobs/src/queues/index.ts` — verify alerts queue export
9. `apps/web/src/server/trpc/routers/notification.ts` — read ONLY the `create` (or equivalent insert) procedure to mirror notification creation

**DO NOT read** PRODUCT.md, IMPLEMENTATION_MAP.md, DECISIONS_LOG.md, lessons.md, agent-log.md, CHANGELOG_AI.md. Opus already validated governance — you do not need them.

---

## Dependencies
- **Requires:** alerts BullMQ queue already scaffolded in `packages/jobs/src/queues/`. Verify in step 1.
- **Blocks:** Alert history log (E1), real-time notifications (C1-C3) — both depend on alerts firing.

---

## Pre-inlined design intent (from Opus baseline — sufficient; do not read PRODUCT.md)

**Trigger:** When an `Event` is created in tRPC `event.create`, enqueue an `evaluate` job to the `alerts` queue with payload `{ tenantId, eventId }`.

**Processor logic:**
1. Validate `tenantId` present; reject if missing (FORBIDDEN-equivalent — see base-worker pattern).
2. Load the `Event` by id, scoped to tenant.
3. Load all `AlertRule` rows where `tenantId = event.tenantId AND isActive = true`.
4. For each rule: evaluate match (see "Match logic" below).
5. For each matching rule: create one `Notification` per recipient. Recipient resolution rules below.
6. Write `AuditLog` per notification created (action `ALERT_FIRED`, entity `Notification`).
7. Return `{ rulesEvaluated, rulesMatched, notificationsCreated }`.

**Match logic (read AlertRule schema first to confirm fields, THEN implement):**
- If `AlertRule` has a `conditions` JSON field: match by event category/severity/eventTypeId equality. Start with equality on whichever fields exist in the schema (e.g. `eventCategory`, `eventTypeId`, `minSeverity`). Document which fields you matched on at the top of the processor file in a single-line comment.
- If schema has explicit fields like `eventCategory` directly on AlertRule (no JSON conditions): match those directly.
- Keep matching pure-functional: `function matches(event, rule): boolean` at top of file. Single responsibility.

**Recipient resolution (read AlertRule schema first):**
- If `AlertRule` has explicit `userId` or `userIds` field → notify those users.
- If `AlertRule` has `role` field → notify all users in tenant with that role (query User table scoped to tenant).
- If neither → notify all users with `super_admin` or `admin` role in the tenant. Default fallback only.
- Discover the actual schema before deciding. Comment your choice at top of processor.

**Notification fields:** `tenantId`, `userId`, `type` (map from rule severity: critical/warning/info/system), `title`, `message`, `eventId`, `alertRuleId` (if Notification has this FK; if not, omit), `isRead: false`. Mirror the pattern from `notification.ts` create procedure exactly.

---

## Step-by-step instructions

### Step 1 — TDD RED (mandatory before any implementation)
Write `alerts.processor.test.ts` covering:
- (a) tenant validation: missing `tenantId` → throws/rejects (mirror er-sync test pattern)
- (b) no active rules → returns `rulesMatched: 0, notificationsCreated: 0`
- (c) one matching rule + one recipient → creates one Notification with correct fields
- (d) one matching rule + zero recipients → returns `notificationsCreated: 0` (do not fail)
- (e) Prisma error during notification create → throws and does NOT partial-commit (use transaction)

Run: `pnpm --filter @marine-guardian/jobs test alerts.processor` → confirm all tests RED. Do NOT proceed until RED confirmed.

### Step 2 — Implement processor
Use `er-sync.processor.ts` as the structural template (not the body). Pattern:
- Default export an async function `evaluateAlerts(job: Job<AlertEvaluatePayload>)`.
- Use Prisma transaction for the multi-step write (load event + rules + create notifications + audit logs).
- Apply L6 tenant guard implicitly — Prisma client extension auto-injects `tenantId`.
- Add explicit `tenantId` checks anyway (defense-in-depth per security.md).

### Step 3 — Register worker
In `packages/jobs/src/workers/index.ts`: add `alertsWorker` next to existing workers, using base-worker pattern. Connection from `connection.ts`. Concurrency: 5.

### Step 4 — Enqueue from event.create
In `apps/web/src/server/trpc/routers/event.ts`: after successful event creation, enqueue `{ tenantId: ctx.tenantId, eventId: created.id }` to alerts queue. Use existing queue import; do NOT block the mutation response on the job — fire-and-forget enqueue. Surround the enqueue in try/catch and log on failure (mutation must still succeed).

### Step 5 — Run all tests
- `pnpm --filter @marine-guardian/jobs test` — all jobs tests pass (existing er-sync 7 tests + new alerts ~5 tests = 12 minimum)
- `pnpm --filter @marine-guardian/web test` — event router tests still pass
- `pnpm lint` — 0 errors
- `pnpm typecheck` — 0 errors

### Step 6 — Commit and merge
- Commit message: `feat(alerts): rule evaluation engine — fires notifications on event create`
- Squash-merge `feat/alerts-evaluation-engine` to main per Rule 23
- Delete branch

### Step 7 — Update governance (mandatory before reporting DONE)
- `docs/CHANGELOG_AI.md`: append entry with Agent: CLAUDE_CODE, files added/modified
- `docs/IMPLEMENTATION_MAP.md`: move "Alert rule evaluation engine" from "Not yet built" to a new "Phase 8 Batch 2 Item: Alert Engine" section
- `.cline/STATE.md`: rewrite — `PHASE: Phase 8 Batch 2 — Alert Engine complete`, update LAST_DONE and NEXT
- DO NOT touch `.cline/memory/lessons.md` unless you hit a 🔴 gotcha or 🟤 decision

---

## Validation checklist (verify each before reporting DONE)
- [ ] All 5 test cases written FIRST and confirmed RED before implementation
- [ ] All 5 test cases passing GREEN after implementation
- [ ] `pnpm lint` = 0 errors
- [ ] `pnpm typecheck` = 0 errors
- [ ] No files outside the 4 create/modify scope were touched
- [ ] No `any` types introduced
- [ ] Tenant validation present in processor (defense-in-depth, not just L6 reliance)
- [ ] Notification create wrapped in Prisma transaction with audit log writes
- [ ] Branch squash-merged to main and deleted
- [ ] CHANGELOG_AI + IMPLEMENTATION_MAP + STATE.md all updated

---

## Hard rules
- **DO NOT** read PRODUCT.md, lessons.md, or any of the 9 governance docs except those in step 7.
- **DO NOT** make decomposition or scope decisions — follow this scope exactly.
- **DO NOT** add a `helpers/` file or new module unless absolutely required. Inline the match function.
- **DO NOT** modify schema.prisma. If a needed field is missing, STOP and report `BLOCKED — schema gap: [field]`.
- **DO NOT** retry blindly. Two consecutive test failures with same approach → report `NEEDS_CONTEXT` and wait.

---

## Status report format (use exactly one)
- **DONE** — all checklist items pass, merged, governance updated
- **DONE_WITH_CONCERNS** — merged, but [specific concern, e.g. "AlertRule had no recipient field — defaulted to admin role; recommend Phase 7 FU to add explicit recipients"]
- **NEEDS_CONTEXT** — [specific question Opus must answer before you can proceed]
- **BLOCKED** — [specific blocker; do not retry until Opus responds]
