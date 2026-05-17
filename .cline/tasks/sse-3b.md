# Task: SSE-3b — Replace sidebar polling with SSE-driven invalidation
Tier: 1 | Estimated tokens: ~15K
Branch: feat/sse-events-and-hardening (continue from 3a — do NOT create new branch)

## Pre-flight (run FIRST in fresh session)
1. `cat .cline/STATE.md` — confirm 3a complete
2. `git status && git branch --show-current` — verify on feat/sse-events-and-hardening
3. Skim ONLY:
   - `apps/web/src/components/layout/sidebar.tsx` — the target
   - `apps/web/src/lib/realtime/notification-store.ts` — store contract (already familiar from 3a)

## Scope

### Files to modify
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/__tests__/sidebar.test.tsx` (create if missing — extend if exists)

### Files to READ ONLY
- `apps/web/src/lib/realtime/notification-store.ts`

## Implementation steps

### Step 1 — RED test first
Add tests asserting:
- Sidebar `unreadCount` query is NOT configured with `refetchInterval` (verify via the query options or by mocking trpc and asserting no interval property is passed)
- When `notification-store.notifications.length` changes, the `unreadCount` query is invalidated
- The numeric badge still renders correctly for `unread > 0`

Run tests → confirm RED.

### Step 2 — Modify sidebar.tsx
Current (line 45):
```tsx
const unreadCountQuery = trpc.notification.unreadCount.useQuery(undefined, {
  refetchInterval: 30_000,
});
```

Change to:
```tsx
const utils = trpc.useUtils();
const unreadCountQuery = trpc.notification.unreadCount.useQuery();
const notificationsLength = useNotificationStore((s) => s.notifications.length);
useEffect(() => {
  void utils.notification.unreadCount.invalidate();
}, [notificationsLength, utils]);
```

Add imports:
```tsx
import { useEffect } from "react";
import { useNotificationStore } from "@/lib/realtime/notification-store";
```

### Step 3 — Re-run tests → GREEN

### Step 4 — Run full validation
- [ ] `pnpm --filter @marine-guardian/web typecheck` — 0 errors
- [ ] `pnpm --filter @marine-guardian/web lint` — 0 errors
- [ ] `pnpm --filter @marine-guardian/web test` — all pass

## Commit
```
feat(realtime): replace sidebar polling with SSE-driven invalidation (SSE-3b)

- Drop 30s refetchInterval on notification.unreadCount query
- Invalidate query when notification-store receives new realtime events
- Reduces background tRPC load and gives near-instant badge updates
```

## Output contract
- [ ] Sidebar tests green
- [ ] No `refetchInterval` remains in sidebar.tsx
- [ ] Only sidebar.tsx + its tests modified
- [ ] STATE.md updated: PHASE="SSE-3b complete", NEXT="Open sse-3c.md in NEW session"
- [ ] CHANGELOG_AI.md entry appended

## Rules
- Do NOT touch header, layout, notification-bell, or Route Handler
- Do NOT modify the store or hook
- Branch stays open — no merge yet
- STOP after 3b — human opens NEW session for 3c
