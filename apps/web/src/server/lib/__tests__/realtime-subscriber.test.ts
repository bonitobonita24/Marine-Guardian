// realtime-subscriber.test.ts
//
// Unit tests for the Valkey/Redis SUBSCRIBE wrapper used by the SSE Route
// Handler at /api/stream/notifications to receive notification events
// published by the alerts processor in packages/jobs.
//
// Subscribe creates a DEDICATED Redis connection per subscription because
// ioredis SUBSCRIBE puts the connection into pub/sub mode where regular
// commands are not allowed. Callers MUST call unsubscribe() in the SSE
// ReadableStream cancel handler to release the connection.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscribeToChannel,
  type RealtimeSubscription,
  type RedisFactory,
} from "../realtime-subscriber";

// Loose mock shape — vitest's vi.fn() return type doesn't satisfy the
// concrete RedisLikeSubscriber function signatures structurally, so we cast
// at the factory boundary instead of extending the interface.
interface MockRedis {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  __emit: (event: string, ...args: unknown[]) => void;
}

function makeMockRedis(): MockRedis {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const mock: MockRedis = {
    subscribe: vi.fn().mockResolvedValue(1),
    unsubscribe: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue("OK"),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(handler);
      return mock;
    }),
    __emit: (event: string, ...args: unknown[]) => {
      for (const h of handlers[event] ?? []) h(...args);
    },
  };
  return mock;
}

describe("subscribeToChannel", () => {
  let mockRedis: MockRedis;
  let factory: ReturnType<typeof vi.fn>;
  // Use this when passing to subscribeToChannel — preserves the vi.fn() API
  // for `expect(factory).toHaveBeenCalledOnce()` while satisfying the RedisFactory
  // contract at the call site.
  const asFactory = (): RedisFactory => factory as unknown as RedisFactory;

  beforeEach(() => {
    mockRedis = makeMockRedis();
    factory = vi.fn(() => mockRedis);
  });

  it("creates a client via factory and subscribes to the channel", async () => {
    await subscribeToChannel(
      {
        channel: "tenant:t1:user:u1:notifications",
        onMessage: vi.fn(),
      },
      asFactory(),
    );

    expect(factory).toHaveBeenCalledOnce();
    expect(mockRedis.subscribe).toHaveBeenCalledOnce();
    expect(mockRedis.subscribe).toHaveBeenCalledWith(
      "tenant:t1:user:u1:notifications",
    );
  });

  it("invokes onMessage with the parsed JSON payload when a message arrives", async () => {
    const onMessage = vi.fn();
    await subscribeToChannel(
      { channel: "tenant:t1:user:u1:notifications", onMessage },
      asFactory(),
    );

    const payload = { type: "notification.created", id: "n1" };
    mockRedis.__emit(
      "message",
      "tenant:t1:user:u1:notifications",
      JSON.stringify(payload),
    );

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it("ignores messages on channels other than the subscribed one", async () => {
    const onMessage = vi.fn();
    await subscribeToChannel(
      { channel: "tenant:t1:user:u1:notifications", onMessage },
      asFactory(),
    );

    mockRedis.__emit(
      "message",
      "tenant:t1:user:OTHER:notifications",
      JSON.stringify({ id: "x" }),
    );

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("invokes onError if the message body is invalid JSON (does not crash)", async () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    await subscribeToChannel(
      {
        channel: "tenant:t1:user:u1:notifications",
        onMessage,
        onError,
      },
      asFactory(),
    );

    mockRedis.__emit(
      "message",
      "tenant:t1:user:u1:notifications",
      "{not-valid-json",
    );

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    const errArg = onError.mock.calls[0]?.[0] as unknown;
    expect(errArg).toBeInstanceOf(Error);
  });

  it("unsubscribe() unsubscribes from the channel and quits the client", async () => {
    const sub: RealtimeSubscription = await subscribeToChannel(
      {
        channel: "tenant:t1:user:u1:notifications",
        onMessage: vi.fn(),
      },
      asFactory(),
    );

    await sub.unsubscribe();

    expect(mockRedis.unsubscribe).toHaveBeenCalledOnce();
    expect(mockRedis.unsubscribe).toHaveBeenCalledWith(
      "tenant:t1:user:u1:notifications",
    );
    expect(mockRedis.quit).toHaveBeenCalledOnce();
  });

  it("unsubscribe() is idempotent (safe to call twice)", async () => {
    const sub = await subscribeToChannel(
      {
        channel: "tenant:t1:user:u1:notifications",
        onMessage: vi.fn(),
      },
      asFactory(),
    );

    await sub.unsubscribe();
    await sub.unsubscribe();

    expect(mockRedis.quit).toHaveBeenCalledOnce();
  });
});
