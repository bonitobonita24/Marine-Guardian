# Task: SSE-3c — Hardening: rate-limit + connection metrics on Route Handler
Tier: 1-2 | Estimated tokens: ~20K
Branch: feat/sse-events-and-hardening (continue from 3b — do NOT create new branch)

## Pre-flight (run FIRST in fresh session)
1. `cat .cline/STATE.md` — confirm 3b complete
2. `git status && git branch --show-current` — verify on feat/sse-events-and-hardening
3. Skim ONLY:
   - `apps/web/src/app/api/stream/notifications/route.ts` — the target
   - `apps/web/src/server/lib/rate-limit.ts` — existing rate limiter primitives
   - `apps/web/src/server/lib/route-auth.ts` — existing auth (already used by route)

## Scope

### Files to create
- `apps/web/src/server/lib/sse-metrics.ts` — module-level connection counter + reconnect counter
- `apps/web/src/server/lib/__tests__/sse-metrics.test.ts`
- `apps/web/src/app/api/stream/notifications/__tests__/route.test.ts` (extend if exists)

### Files to modify
- `apps/web/src/app/api/stream/notifications/route.ts` — add rate-limit + metric tracking

### Files to READ ONLY
- `apps/web/src/server/lib/rate-limit.ts`
- `apps/web/src/server/lib/route-auth.ts`
- `apps/web/src/server/lib/realtime-subscriber.ts`

## Implementation steps

### Step 1 — `sse-metrics.ts` (TDD: write test first)
Tests assert:
- `incrementConnection()` increases `getActiveConnectionCount()` by 1
- `decrementConnection()` decreases it (never below 0)
- `recordReconnect()` increments `getReconnectCount()`
- Counters are per-process (module-level state) — explicit by design

Implementation: simple module-level counters, no external store. Document in a header comment that multi-instance prod will need Redis-backed metrics (out of scope for SSE-3c).

```ts
// Process-local SSE connection metrics. For multi-instance prod, replace
// with a Redis-backed counter — see SSE-3c task doc for context.

let activeConnections = 0;
let reconnectCount = 0;

export function incrementConnection(): void {
  activeConnections += 1;
}
export function decrementConnection(): void {
  if (activeConnections > 0) activeConnections -= 1;
}
export function recordReconnect(): void {
  reconnectCount += 1;
}
export function getActiveConnectionCount(): number {
  return activeConnections;
}
export function getReconnectCount(): number {
  return reconnectCount;
}
// Test-only: reset between tests
export function __resetMetricsForTests(): void {
  activeConnections = 0;
  reconnectCount = 0;
}
```

### Step 2 — Wire metrics into route.ts
Inside the `start` of the `ReadableStream`, after successful subscription:
```ts
incrementConnection();
```
Inside `cancel`:
```ts
decrementConnection();
```
If the subscribe step itself fails (the `closed = true` early-return path), do NOT increment.

If the route is being re-hit by the same client (you cannot detect this server-side reliably without a session correlation id — out of scope), skip `recordReconnect()` for now. Document in route.ts header comment that reconnect tracking is client-driven (the hook's `reconnectAttempts` state) and that server-side reconnect detection would require a session correlation header — deferred.

### Step 3 — Rate limiting
Read `apps/web/src/server/lib/rate-limit.ts` to confirm the `rateLimiters.api` (or `.auth` — pick the one most appropriate; for SSE, `.api` tier is correct: authenticated, sustained traffic).

Add at top of `GET` handler, AFTER `requireRouteAuth()` succeeds:
```ts
try {
  rateLimiters.api.check(ctx.userId);
} catch {
  return new NextResponse("Too Many Requests", { status: 429 });
}
```

Rationale for token: `ctx.userId` (not IP) — same authenticated user is the cost center; the rate limiter caps how many concurrent SSE connections a single user can open per minute.

If the existing `rateLimiters` export does NOT have `.api` exported as a usable check function, READ the file fully and adapt — but do not modify `rate-limit.ts` itself.

### Step 4 — Tests for route.ts
Mock dependencies:
- `requireRouteAuth` → returns `{ tenantId: "t1", userId: "u1" }`
- `subscribeToChannel` → returns an object with `unsubscribe` resolving immediately
- `rateLimiters.api.check` → can be made to throw on Nth call

Assert:
- Successful GET returns 200 with `Content-Type: text/event-stream`
- Rate-limited GET (when `.check` throws) returns 429
- Auth failure returns the existing 401 (unchanged behavior)
- `getActiveConnectionCount()` reflects an open stream (use `__resetMetricsForTests()` before each test)

### Step 5 — Run full validation
- [ ] `pnpm --filter @marine-guardian/web typecheck`
- [ ] `pnpm --filter @marine-guardian/web lint`
- [ ] `pnpm --filter @marine-guardian/web test`
- [ ] `pnpm --filter @marine-guardian/web build` — verify Route Handler still compiles cleanly with the existing `runtime = "nodejs"` directive

## Commit
```
feat(realtime): rate-limit and instrument SSE Route Handler (SSE-3c)

- Add process-local SSE connection counter and reconnect metric module
- Wrap /api/stream/notifications GET with rateLimiters.api per userId
- Track active connection lifecycle via increment/decrement around subscribe
- 429 returned when a single user exceeds the api tier rate limit
```

## Output contract — full SSE-3 done
After 3c commits, this branch (`feat/sse-events-and-hardening`) contains 3a + 3b + 3c.

Run the final squash-merge sequence:
1. `git log --oneline main..HEAD` — should list 3 commits
2. Update STATE.md: PHASE="SSE-3 ready to ship; squash-merge feat/sse-events-and-hardening to main"
3. Append CHANGELOG_AI.md (Agent: CLAUDE_CODE) entry summarizing all 3 sub-tasks
4. Update IMPLEMENTATION_MAP.md — Phase 8 Batch 2 fully complete
5. Output: "✅ SSE-3 complete on feat/sse-events-and-hardening. Human: review then squash-merge to main + push origin."

## Rules
- Do NOT touch UI components (header/sidebar/notification-bell) — those are 3a/3b's scope
- Do NOT modify `rate-limit.ts` or `realtime-subscriber.ts`
- Do NOT auto squash-merge — present the ready-to-ship state and STOP
