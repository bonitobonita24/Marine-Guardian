# Task: SSE-3a — Wire SSE into UI (header bell + dashboard layout mount + page integration)
Tier: 2 | Estimated tokens: ~25K (within Sonnet 30K budget)
Branch: feat/sse-events-and-hardening (create from main)

## Pre-flight (run FIRST in fresh session)
1. `cat .cline/STATE.md` — orient
2. `git checkout main && git pull && git checkout -b feat/sse-events-and-hardening`
3. Skim ONLY these (no full PRODUCT.md read):
   - `apps/web/src/hooks/useNotificationStream.ts` — hook contract
   - `apps/web/src/lib/realtime/notification-store.ts` — store contract
   - `apps/web/src/components/layout/header.tsx` — current header
   - `apps/web/src/app/(dashboard)/layout.tsx` — mount site

## Scope

### Files to create
- `apps/web/src/components/layout/notification-bell.tsx` — header bell button + badge + dropdown
- `apps/web/src/components/layout/__tests__/notification-bell.test.tsx`

### Files to modify
- `apps/web/src/components/layout/header.tsx` — render `<NotificationBell />` on the right side
- `apps/web/src/app/(dashboard)/layout.tsx` — call `useNotificationStream()` once at the top of a new `RealtimeProvider` client component wrapper (must be a `"use client"` component since hook needs DOM); SessionProvider remains the outer wrapper
- `apps/web/src/app/(dashboard)/notifications/page.tsx` — invalidate `trpc.notification.list` + `notification.unreadCount` queries when a new notification arrives via the store (subscribe to store in a useEffect, call `utils.notification.list.invalidate()` and `utils.notification.unreadCount.invalidate()` on each new entry)

### Files to create (provider)
- `apps/web/src/components/realtime/realtime-provider.tsx` — `"use client"` wrapper that calls `useNotificationStream()` and renders `{children}`; this is the single mount point for the hook so it doesn't fire per-route
- `apps/web/src/components/realtime/__tests__/realtime-provider.test.tsx`

### Files to READ ONLY (do not modify)
- `apps/web/src/lib/realtime/notification-store.ts`
- `apps/web/src/hooks/useNotificationStream.ts`
- `apps/web/src/lib/trpc/client.ts` (or wherever `trpc.useUtils` comes from — find via grep)

## Implementation steps

### Step 1 — `realtime-provider.tsx`
```tsx
"use client";
import { useNotificationStream } from "@/hooks/useNotificationStream";
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useNotificationStream();
  return <>{children}</>;
}
```

### Step 2 — Wire provider into dashboard layout
In `apps/web/src/app/(dashboard)/layout.tsx`:
```tsx
<SessionProvider>
  <RealtimeProvider>
    <div className="flex h-screen overflow-hidden">
      {/* ... existing children ... */}
    </div>
  </RealtimeProvider>
</SessionProvider>
```

### Step 3 — `notification-bell.tsx`
Requirements:
- Reads `unreadCount` from `useNotificationStore`
- Renders a Button (ghost variant) with `BellRing` icon from lucide-react
- Shows a small badge with the count when `unreadCount > 0` (cap display at "9+" for >9)
- Clicking the bell navigates to `/notifications` via `next/link`
- `aria-label={`${unreadCount} unread notifications`}` for a11y
- Use shadcn primitives only (Button, Badge) — see `apps/web/src/components/ui/`

### Step 4 — Place bell in header
In `header.tsx`, add `<NotificationBell />` to the right cluster, BEFORE the email/role badges.

### Step 5 — Realtime invalidation in `/notifications` page
In `notifications/page.tsx`:
```tsx
const notificationsLength = useNotificationStore((s) => s.notifications.length);
useEffect(() => {
  void utils.notification.list.invalidate();
  void utils.notification.unreadCount.invalidate();
}, [notificationsLength, utils]);
```
The DB-backed list remains the source of truth; the store length acts as a "new event arrived" trigger.

### Step 6 — Tests (TDD: write RED first)
- `notification-bell.test.tsx`:
  - Renders no badge when `unreadCount === 0`
  - Renders badge with count when `unreadCount === 3`
  - Renders "9+" when `unreadCount === 15`
  - Has correct aria-label
  - Link points to `/notifications`
- `realtime-provider.test.tsx`:
  - Renders children
  - Calls `useNotificationStream` exactly once on mount (mock the hook)

Use vitest + @testing-library/react. Mock `useNotificationStore` with `vi.mock("@/lib/realtime/notification-store", ...)`.

## Validation checklist (run before commit)
- [ ] `pnpm --filter @marine-guardian/web typecheck` — 0 errors
- [ ] `pnpm --filter @marine-guardian/web lint` — 0 errors
- [ ] `pnpm --filter @marine-guardian/web test` — all tests pass including new ones
- [ ] No `any` types introduced
- [ ] Only files in scope modified (run `git status` — confirm)
- [ ] `useNotificationStream` mounted exactly once in the dashboard tree

## Commit
```
feat(realtime): wire SSE notification stream into dashboard UI (SSE-3a)

- Add RealtimeProvider mounting useNotificationStream once at dashboard layout
- Add NotificationBell in header with badge driven by notification-store
- Invalidate notification list + unreadCount tRPC queries on new realtime events
```

## Output contract — verify before reporting done
- [ ] Branch created from main
- [ ] All scoped files exist with correct exports
- [ ] All tests green
- [ ] No files outside scope touched
- [ ] STATE.md updated: PHASE="SSE-3a complete", NEXT="Open sse-3b.md in NEW session"
- [ ] CHANGELOG_AI.md entry appended (Agent: CLAUDE_CODE)

## Rules
- Do NOT read full PRODUCT.md — Opus already validated scope alignment
- Do NOT read governance docs (DECISIONS_LOG, IMPLEMENTATION_MAP) — not needed for this task
- Do NOT make decomposition decisions — execute exactly the scope above
- Do NOT touch sidebar.tsx (that's 3b's scope)
- Do NOT modify the SSE Route Handler (that's 3c's scope)
- Do NOT squash-merge to main — branch stays open across 3a/3b/3c, single squash at end
- STOP after 3a — human opens NEW session for 3b
