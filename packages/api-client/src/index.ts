import {
  createTRPCClient,
  httpBatchLink,
  type CreateTRPCClient,
  type TRPCLink,
} from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import superjson from "superjson";

export type { CreateTRPCClient } from "@trpc/client";
export type { AnyRouter } from "@trpc/server";

export interface CreateClientOptions {
  url: string;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

export function createApiClient<TRouter extends AnyRouter>(
  options: CreateClientOptions,
): CreateTRPCClient<TRouter> {
  const link: TRPCLink<TRouter> = (httpBatchLink as (opts: unknown) => TRPCLink<TRouter>)({
    url: options.url,
    headers: options.headers,
    transformer: superjson,
  });

  return createTRPCClient<TRouter>({ links: [link] });
}

export { superjson };
