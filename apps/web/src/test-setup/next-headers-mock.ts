/**
 * Global vitest setup — auto-mock next/headers so that `cookies()` and
 * `headers()` do not throw "called outside a request scope" when tests run
 * requireRouteAuth() directly (without a Next.js request context).
 *
 * Tests that need to control the cookie value should call vi.mock("next/headers", ...)
 * explicitly in their own file — that file-level mock takes precedence over this
 * global auto-mock because vitest resolves per-file mocks first.
 *
 * Tests that do NOT care about cookies (e.g. SSE notifications, exports) get a
 * safe default: no impersonation cookie present → existing behavior preserved.
 */
import { vi } from "vitest";

vi.mock("next/headers", () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  cookies: vi.fn(async () => ({
    get: vi.fn().mockReturnValue(undefined),
  })),
  // eslint-disable-next-line @typescript-eslint/require-await
  headers: vi.fn(async () => new Headers()),
}));
