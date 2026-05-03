import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "../auth";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const session = await auth();
  const ip =
    opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  return {
    session,
    ip,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
