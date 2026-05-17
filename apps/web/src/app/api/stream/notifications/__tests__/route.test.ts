// SSE notification stream Route Handler tests (SSE-1).
//
// The handler streams notification events from the per-user pub/sub channel
// to the browser via Server-Sent Events. Tests cover:
//   - 401 when session is missing or has no tenant
//   - 200 text/event-stream with no-cache headers when authed
//   - subscribe is called with `tenant:{tenantId}:user:{userId}:notifications`
//   - published messages are emitted as SSE events with correct shape
//   - unsubscribe is called when the response body is cancelled
//   - heartbeat ping fires on the configured interval
//
// We mock `subscribeToChannel` so tests do not require a running Valkey;
// the mock exposes the `onMessage` callback the handler registered so we can
// drive synthetic publishes from the test body.

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/server/lib/realtime-subscriber", () => ({
  subscribeToChannel: vi.fn(),
}));

import { auth } from "@/server/auth";
import { subscribeToChannel } from "@/server/lib/realtime-subscriber";
import { GET } from "../route";

type MockFn = ReturnType<typeof vi.fn>;
const mockedAuth = auth as unknown as MockFn;
const mockedSubscribe = subscribeToChannel as unknown as MockFn;

interface CapturedSubscription {
  channel: string;
  onMessage: (payload: unknown) => void;
  onError?: (err: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function authedSession() {
  return {
    user: {
      id: "u1",
      tenantId: "t1",
      roles: ["site_admin"],
      email: "test@example.com",
      name: "Test User",
    },
    expires: "2099-01-01",
  };
}

function captureSubscribe(): CapturedSubscription {
  const captured: CapturedSubscription = {
    channel: "",
    onMessage: () => undefined,
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  // The mocked function's loose MockFn type doesn't track the async return
  // signature of subscribeToChannel — disable the misused-promises rule for
  // this single mockImplementation call.
  /* eslint-disable @typescript-eslint/no-misused-promises */
  mockedSubscribe.mockImplementation(
    (opts: {
      channel: string;
      onMessage: (p: unknown) => void;
      onError?: (e: Error) => void;
    }) => {
      captured.channel = opts.channel;
      captured.onMessage = opts.onMessage;
      if (opts.onError !== undefined) captured.onError = opts.onError;
      return Promise.resolve({ unsubscribe: captured.unsubscribe });
    },
  );
  /* eslint-enable @typescript-eslint/no-misused-promises */
  return captured;
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 200,
): Promise<string> {
  const result = await Promise.race([
    reader.read(),
    new Promise<{ done: true; value: undefined }>((resolve) => {
      setTimeout(() => {
        resolve({ done: true, value: undefined });
      }, timeoutMs);
    }),
  ]);
  if (result.done) return "";
  return new TextDecoder().decode(result.value);
}

function getBody(res: Response): ReadableStream<Uint8Array> {
  if (res.body === null) throw new Error("expected response body");
  return res.body;
}

async function readChunkRaw(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const result = await reader.read();
  if (result.done) throw new Error("stream ended unexpectedly");
  return new TextDecoder().decode(result.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/stream/notifications", () => {
  it("returns 401 when no session", async () => {
    mockedAuth.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockedSubscribe).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no tenantId", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "", roles: [], email: "", name: "" },
      expires: "2099-01-01",
    });
    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockedSubscribe).not.toHaveBeenCalled();
  });

  it("returns 200 with text/event-stream and no-cache headers", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    captureSubscribe();

    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    // Drain + cancel to clean up subscription
    await res.body?.cancel();
  });

  it("subscribes to the per-user notification channel using ctx ids", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    const captured = captureSubscribe();

    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);

    expect(mockedSubscribe).toHaveBeenCalledOnce();
    expect(captured.channel).toBe("tenant:t1:user:u1:notifications");

    await res.body?.cancel();
  });

  it("emits a published message as an SSE event with type + data + id lines", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    const captured = captureSubscribe();

    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);
    const reader = getBody(res).getReader();

    // First chunk: the handler writes a connected comment as the opening frame.
    const opening = await readChunk(reader);
    expect(opening).toContain(":"); // SSE comment line begins with `:`

    captured.onMessage({
      type: "notification.created",
      tenantId: "t1",
      userId: "u1",
      alertRuleId: "ar1",
      eventId: "ev1",
      title: "Alert fired",
      message: "Body",
      notificationType: "warning",
    });

    const chunk = await readChunk(reader);
    expect(chunk).toContain("event: notification.created\n");
    expect(chunk).toContain("data: ");
    expect(chunk).toContain('"alertRuleId":"ar1"');
    expect(chunk).toContain('"eventId":"ev1"');

    await reader.cancel();
  });

  it("calls unsubscribe when the response body is cancelled", async () => {
    mockedAuth.mockResolvedValue(authedSession());
    const captured = captureSubscribe();

    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);
    const reader = getBody(res).getReader();
    await readChunk(reader); // opening comment
    await reader.cancel();

    // microtask flush
    await new Promise((r) => setTimeout(r, 10));
    expect(captured.unsubscribe).toHaveBeenCalledOnce();
  });

  it("emits a heartbeat comment after the configured interval", async () => {
    vi.useFakeTimers();
    mockedAuth.mockResolvedValue(authedSession());
    captureSubscribe();

    const req = new NextRequest("http://localhost/api/stream/notifications");
    const res = await GET(req);
    const reader = getBody(res).getReader();

    // opening comment
    const opening = await readChunkRaw(reader);
    expect(opening).toContain(":");

    // Advance past the 30s heartbeat interval
    await vi.advanceTimersByTimeAsync(30_000);

    const beat = await readChunkRaw(reader);
    expect(beat).toMatch(/^: ?ping/);

    vi.useRealTimers();
    await reader.cancel();
  });
});
