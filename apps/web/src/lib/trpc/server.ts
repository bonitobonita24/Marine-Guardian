import "server-only";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/routers";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

export async function getServerTrpc() {
  const context = await createTRPCContext({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    info: {
      isBatchCall: false,
      calls: [],
      accept: null,
      type: "unknown",
      connectionParams: null,
      signal: AbortSignal.abort(),
      url: new URL("http://localhost"),
    },
  });
  return createCaller(context);
}
