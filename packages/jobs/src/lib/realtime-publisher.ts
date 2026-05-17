// realtime-publisher.ts
//
// Valkey/Redis PUBLISH wrapper used by the alerts processor to fan out
// notification events to SSE subscribers running in apps/web Route Handlers.
//
// The publisher is intentionally stateless and client-agnostic: it accepts any
// object with a `publish(channel, message)` method (ioredis instance, BullMQ
// connection, mock in tests). The processor wires a real ioredis client in via
// `getDefaultPublisher()` at module load.
//
// Channel scheme (locked in DECISIONS_LOG.md):
//   tenant:{tenantId}:user:{userId}:notifications   — per-user notification stream
//   tenant:{tenantId}:events                        — tenant-wide event feed (SSE-3)
//
// Subscribers join one channel per (tenant, user) tuple. PUBLISH returns the
// integer subscriber count for the channel — the publisher surfaces this for
// observability but does not act on it (zero subscribers is normal — the user
// may simply have no open SSE connection right now; the notification row in DB
// is the durable source of truth).

import Redis from "ioredis";

export interface RealtimeClient {
  publish: (channel: string, message: string) => Promise<number>;
}

export interface RealtimePublisher {
  publish: (channel: string, payload: unknown) => Promise<number>;
}

export function notificationChannel(tenantId: string, userId: string): string {
  return `tenant:${tenantId}:user:${userId}:notifications`;
}

export function eventChannel(tenantId: string): string {
  return `tenant:${tenantId}:events`;
}

export function createRealtimePublisher(
  client: RealtimeClient,
): RealtimePublisher {
  return {
    async publish(channel, payload) {
      return client.publish(channel, JSON.stringify(payload));
    },
  };
}

// Lazy singleton — one ioredis client shared across all processor invocations
// in a worker process. Created on first use so module import is side-effect free.
let cachedClient: Redis | null = null;
let cachedPublisher: RealtimePublisher | null = null;

export function getDefaultPublisher(): RealtimePublisher {
  if (cachedPublisher !== null) return cachedPublisher;
  const host = process.env["REDIS_HOST"] ?? "localhost";
  const port = Number(process.env["REDIS_PORT"]) || 6379;
  const password = process.env["REDIS_PASSWORD"];
  cachedClient = new Redis({
    host,
    port,
    ...(password !== undefined && password !== "" ? { password } : {}),
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
  cachedPublisher = createRealtimePublisher(cachedClient);
  return cachedPublisher;
}

/** Test-only — reset cached singleton between test runs. */
export async function _resetDefaultPublisherForTests(): Promise<void> {
  if (cachedClient !== null) {
    await cachedClient.quit().catch(() => undefined);
  }
  cachedClient = null;
  cachedPublisher = null;
}
