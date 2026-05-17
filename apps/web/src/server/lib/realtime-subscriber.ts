// realtime-subscriber.ts
//
// Valkey/Redis SUBSCRIBE wrapper used by the SSE Route Handler at
// /api/stream/notifications to receive notification events published by the
// alerts processor in packages/jobs.
//
// Each SSE connection MUST create its own subscription (and therefore its own
// Redis connection) because ioredis SUBSCRIBE puts the connection into pub/sub
// mode where regular commands are not allowed. Callers MUST call
// `unsubscribe()` in the SSE ReadableStream cancel handler to release the
// underlying TCP connection — failing to do so will leak file descriptors
// proportional to the number of cancelled connections.
//
// Channel naming and payload shape are owned by
// `@marine-guardian/jobs/realtime-publisher` — this module only consumes them.

import Redis from "ioredis";

/**
 * Minimal subset of the ioredis API surface used by `subscribeToChannel`.
 * Lets tests inject a mock without spinning up a real Redis.
 */
export interface RedisLikeSubscriber {
  subscribe: (channel: string) => Promise<unknown>;
  unsubscribe: (channel: string) => Promise<unknown>;
  quit: () => Promise<unknown>;
  on: (
    event: "message" | "error",
    handler: (...args: never[]) => void,
  ) => unknown;
}

export interface SubscribeOptions {
  channel: string;
  onMessage: (payload: unknown) => void;
  /**
   * Invoked when a published message cannot be parsed as JSON, or when the
   * underlying client emits an `error` event. The SSE Route Handler logs
   * these but does not terminate the stream — transient parse failures should
   * not kill an otherwise healthy connection.
   */
  onError?: (err: Error) => void;
}

export interface RealtimeSubscription {
  unsubscribe: () => Promise<void>;
}

export type RedisFactory = () => RedisLikeSubscriber;

const defaultFactory: RedisFactory = () => {
  const host = process.env["REDIS_HOST"] ?? "localhost";
  const port = Number(process.env["REDIS_PORT"]) || 6379;
  const password = process.env["REDIS_PASSWORD"];
  return new Redis({
    host,
    port,
    ...(password !== undefined && password !== "" ? { password } : {}),
    maxRetriesPerRequest: null,
    lazyConnect: false,
  }) as unknown as RedisLikeSubscriber;
};

export async function subscribeToChannel(
  opts: SubscribeOptions,
  factory: RedisFactory = defaultFactory,
): Promise<RealtimeSubscription> {
  const client = factory();
  let closed = false;

  client.on("message", (channel: string, message: string) => {
    if (channel !== opts.channel) return;
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch (e) {
      opts.onError?.(
        e instanceof Error ? e : new Error("Invalid JSON in pub/sub message"),
      );
      return;
    }
    opts.onMessage(payload);
  });

  client.on("error", (err: Error) => {
    opts.onError?.(err);
  });

  await client.subscribe(opts.channel);

  return {
    async unsubscribe() {
      if (closed) return;
      closed = true;
      try {
        await client.unsubscribe(opts.channel);
      } catch {
        // best-effort — connection may already be torn down
      }
      try {
        await client.quit();
      } catch {
        // best-effort
      }
    },
  };
}
