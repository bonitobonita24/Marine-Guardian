// realtime-publisher.test.ts
//
// Unit tests for the Valkey/Redis PUBLISH wrapper used by the alerts processor
// to push notification events to SSE subscribers in apps/web.
//
// Channel scheme:
//   tenant:{tenantId}:user:{userId}:notifications   — per-user notification stream
//   tenant:{tenantId}:events                        — tenant-wide event feed (SSE-3)
//
// The publisher is intentionally stateless: it takes a client with a `publish`
// method and a payload. The processor wires in a real ioredis client; tests
// inject a mock.

import { describe, it, expect, vi } from "vitest";
import {
  createRealtimePublisher,
  notificationChannel,
  eventChannel,
  type RealtimePublisher,
  type RealtimeClient,
} from "../realtime-publisher";

interface MockClient extends RealtimeClient {
  publish: RealtimeClient["publish"] & ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockClient {
  return { publish: vi.fn().mockResolvedValue(1) as MockClient["publish"] };
}

describe("notificationChannel", () => {
  it("builds the per-user notification channel name", () => {
    expect(notificationChannel("t1", "u1")).toBe(
      "tenant:t1:user:u1:notifications",
    );
  });

  it("preserves identifiers verbatim (no escaping)", () => {
    expect(notificationChannel("tenant-abc", "user-xyz-123")).toBe(
      "tenant:tenant-abc:user:user-xyz-123:notifications",
    );
  });
});

describe("eventChannel", () => {
  it("builds the per-tenant event channel name", () => {
    expect(eventChannel("t1")).toBe("tenant:t1:events");
  });
});

describe("createRealtimePublisher", () => {
  it("calls client.publish with the channel and JSON-stringified payload", async () => {
    const client = makeMockClient();
    const pub: RealtimePublisher = createRealtimePublisher(client);

    const payload = {
      type: "notification.created" as const,
      id: "notif-1",
      title: "Alert fired",
      notificationType: "warning",
    };
    await pub.publish(notificationChannel("t1", "u1"), payload);

    expect(client.publish).toHaveBeenCalledOnce();
    expect(client.publish).toHaveBeenCalledWith(
      "tenant:t1:user:u1:notifications",
      JSON.stringify(payload),
    );
  });

  it("returns the subscriber count from the underlying client", async () => {
    const client = makeMockClient();
    client.publish.mockResolvedValueOnce(3);
    const pub = createRealtimePublisher(client);

    const count = await pub.publish("tenant:t1:user:u1:notifications", {});

    expect(count).toBe(3);
  });

  it("propagates client errors to the caller (publisher does not swallow)", async () => {
    const client = makeMockClient();
    client.publish.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const pub = createRealtimePublisher(client);

    await expect(
      pub.publish("tenant:t1:user:u1:notifications", { foo: 1 }),
    ).rejects.toThrow("ECONNREFUSED");
  });
});
