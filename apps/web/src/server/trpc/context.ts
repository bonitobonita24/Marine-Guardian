import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "../auth";
import { parseImpersonationCookieFromHeader } from "@/lib/auth/impersonation";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const session = await auth();
  const ip =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const impersonationTenantId = parseImpersonationCookieFromHeader(
    opts.req.headers.get("cookie"),
  );

  return {
    session,
    ip,
    impersonationTenantId,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
