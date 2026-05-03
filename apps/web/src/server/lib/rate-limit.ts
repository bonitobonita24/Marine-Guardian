import { LRUCache } from "lru-cache";
import { TRPCError } from "@trpc/server";

type Options = {
  uniqueTokenPerInterval?: number;
  interval?: number;
  limit?: number;
};

export function rateLimit(options?: Options) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval ?? 500,
    ttl: options?.interval ?? 60_000,
  });

  return {
    check: (token: string, limit?: number) => {
      const maxRequests = limit ?? options?.limit ?? 60;
      const tokenCount = tokenCache.get(token) ?? [];
      const now = Date.now();
      const windowStart = now - (options?.interval ?? 60_000);
      const requestsInWindow = tokenCount.filter((t) => t > windowStart);

      if (requestsInWindow.length >= maxRequests) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Try again later.",
        });
      }

      tokenCache.set(token, [...requestsInWindow, now]);
    },
  };
}

export const rateLimiters = {
  public: rateLimit({ interval: 60_000, limit: 30 }),
  auth: rateLimit({ interval: 60_000, limit: 10 }),
  api: rateLimit({ interval: 60_000, limit: 120 }),
  upload: rateLimit({ interval: 60_000, limit: 20 }),
};
