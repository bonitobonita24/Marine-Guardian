# Sonnet Task — Resume Alert Engine (post-thrash, tighter scope)

**Tier:** 2 · **Estimated Sonnet workspace:** ~25K (above auto-loaded baseline)
**Branch:** `feat/alerts-evaluation-engine` (ALREADY EXISTS — checkout, do not create)
**Prior state:** Test file at `packages/jobs/src/__tests__/alerts.processor.test.ts` is COMPLETE and fully specifies the processor. Use it as your single source of truth.

---

## Why this is a resume task
A previous Sonnet session built the test file (6.6KB, all 5 cases), then thrashed before implementing the processor. This task picks up exactly where that ended. Scope is now smaller because:
- Schema discovery already done — fields are encoded in the test mocks
- Match logic already chosen — `conditionJson.eventTypeId` + `conditionJson.minPriority`
- Recipient logic already chosen — fallback to admin/super_admin
- Pattern already chosen — `validateTenantContext` helper + Prisma `$transaction`
- DB client already chosen — `platformPrisma`

You are NOT designing. You are writing code that makes the existing test pass.

---

## Scope — ONLY these files

### READ (3 — read in this exact order, no others)
1. `packages/jobs/src/__tests__/alerts.processor.test.ts` — your spec. Every assertion is a behaviour requirement.
2. `packages/jobs/src/queues/types.ts` — for `AlertJobPayload` type
3. `packages/jobs/src/workers/base-worker.ts` — for `validateTenantContext(payload)` signature

### IMPLEMENT (1)
4. `packages/jobs/src/processors/alerts.processor.ts` — REPLACE existing 662-byte stub with full implementation matching the test. Export named function `evaluateAlerts(job: Job<AlertJobPayload>)`.

### MODIFY (1)
5. `packages/jobs/src/workers/index.ts` — register an `alertsWorker` using `evaluateAlerts` as the processor. Mirror the existing `er-sync` worker registration pattern (read first, then add a parallel block).

### DEFERRED to a follow-up task — DO NOT TOUCH
- `apps/web/src/server/trpc/routers/event.ts` (enqueue integration) — deferred
- Any test file (already exists, do not edit)

---

## Implementation guide (the test tells you almost everything)

From the test, the processor must:
1. Call `validateTenantContext(job.data)` first — let it throw if invalid (do not catch).
2. `platformPrisma.event.findFirst({ where: { id, tenantId } })` — load event scoped to tenant.
3. `platformPrisma.alertRule.findMany({ where: { tenantId, isActive: true } })`.
4. Iterate rules. For each, check match:
   - `rule.conditionJson.eventTypeId === event.eventTypeId` (if specified)
   - `event.priority >= rule.conditionJson.minPriority` (if specified)
   - Both must hold if both specified; if only one specified, just that one.
5. If no rules matched → return `{ rulesEvaluated, rulesMatched: 0, notificationsCreated: 0 }` WITHOUT opening transaction.
6. For each matching rule: `platformPrisma.user.findMany({ where: { tenantId, role: { in: ['admin', 'super_admin'] } } })`.
7. If no recipients → skip transaction, count rule as matched but 0 notifications.
8. If recipients exist → open ONE transaction. Inside: `tx.notification.create()` per (rule × recipient), and `tx.auditLog.create({ data: { action: 'ALERT_FIRED', entityType: 'Notification', ... } })` per notification.
9. Return `{ rulesEvaluated, rulesMatched, notificationsCreated }`.

**Severity → notificationType mapping:** infer from the existing `AlertRule` record. The test asserts `notificationType` matches `/^(critical|warning|info|system)$/`. If the AlertRule has a `severity` field, map it; if not, default to `'warning'`. Do NOT read schema.prisma — discover by inspecting what `mockRule` contains in the test (it does not include severity, so default to `'warning'` is fine).

**Title/message:** `title: rule.name` and `message: \`Event "${event.title}" triggered alert rule "${rule.name}"\``. Test only asserts `expect.any(String)` on these.

---

## Step-by-step

### Step 1 — Branch checkout
```bash
git checkout feat/alerts-evaluation-engine
```
Branch already exists from prior session. Do NOT create new.

### Step 2 — Read the 3 files in order (no others)
Test file → types.ts → base-worker.ts. Stop reading after these three. Do not read er-sync.processor.ts (too large; you have everything you need from the test).

### Step 3 — Write processor
Implement `evaluateAlerts` in `packages/jobs/src/processors/alerts.processor.ts`. Replace the entire 662-byte stub.

### Step 4 — Run test
```bash
pnpm --filter @marine-guardian/jobs test alerts.processor
```
All 5 cases must pass. Iterate ONCE if a test fails. If it fails twice → STOP and report `BLOCKED` with the failure output.

### Step 5 — Register worker
Modify `packages/jobs/src/workers/index.ts` to add `alertsWorker` next to `erSyncWorker` (or however existing workers are registered). Concurrency: 5.

### Step 6 — Lint + typecheck
```bash
pnpm --filter @marine-guardian/jobs lint
pnpm --filter @marine-guardian/jobs typecheck
```
Both must show 0 errors.

### Step 7 — Commit + merge
```bash
git add packages/jobs/src/processors/alerts.processor.ts packages/jobs/src/workers/index.ts
git commit -m "feat(alerts): rule evaluation engine — processor body + worker registration"
git checkout main
git merge --squash feat/alerts-evaluation-engine
git commit -m "feat(alerts): rule evaluation engine"
git branch -D feat/alerts-evaluation-engine
```

**Working-tree caveat:** ONLY add the 2 files above. There is large unrelated framework churn in the working tree — do NOT include it. Use explicit `git add` paths, never `git add -A`.

### Step 8 — Test file too
The test file `packages/jobs/src/__tests__/alerts.processor.test.ts` is currently untracked (it was written by the prior thrashed session, never committed). Add it to your commit:
```bash
# Adjust step 7 to also stage the test file:
git add packages/jobs/src/__tests__/alerts.processor.test.ts
```

### Step 9 — Governance
- `docs/CHANGELOG_AI.md` — append entry: Agent CLAUDE_CODE, Phase 8 Batch 2 alert engine. Note: event.ts enqueue integration deferred to follow-up task.
- `docs/IMPLEMENTATION_MAP.md` — move "Alert rule evaluation engine" to a new "Phase 8 Batch 2" completed section. Note "enqueue from event.create — DEFERRED to follow-up".
- `.cline/STATE.md` — full rewrite: PHASE = "Phase 8 Batch 2 — Alert Engine processor complete", LAST_DONE = brief summary, NEXT = "Wire alerts queue enqueue into event.create — separate task .cline/tasks/phase8-batch2-alerts-enqueue.md (Opus to write)".

DO NOT touch: `lessons.md` (no new gotcha — except the vitest hoisting one is already in memory), `agent-log.md`, `DECISIONS_LOG.md`.

---

## Hard rules
- DO NOT read more than 3 source files (test, types.ts, base-worker.ts). PRODUCT.md, schema.prisma, er-sync.processor.ts, lessons.md, all other files are FORBIDDEN.
- DO NOT use `any` type. If a type is unclear, use `unknown` and narrow.
- DO NOT modify `event.ts`, the test file, or any file outside the 2 implement/modify list.
- DO NOT retry the same failing approach more than once.
- If the existing 662-byte stub at `alerts.processor.ts` has any imports or scaffolding worth preserving, you MAY keep them. Otherwise replace fully.

---

## Status report — exactly one line
- **DONE** — merged, governance updated, all tests pass, zero lint/typecheck errors
- **DONE_WITH_CONCERNS: [one line]** — merged but flag something for Opus
- **NEEDS_CONTEXT: [specific question]** — Opus must answer before you proceed
- **BLOCKED: [specific blocker + last error output]** — do not retry; wait for Opus

End of task.
