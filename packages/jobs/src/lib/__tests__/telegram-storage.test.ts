// R1 — fetchTelegramFileBytes retry/backoff tests.
// Verifies bounded retry on HTTP 429 (getFile + download), the happy path, and
// that non-429 failures are not retried. global.fetch is mocked; fake timers
// drain the backoff sleeps so the suite stays fast.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTelegramFileBytes } from "../telegram-storage";

function jsonRes(body: unknown): { json: () => Promise<unknown> } {
  return { json: () => Promise.resolve(body) };
}

function downloadOk(byteLen: number): {
  ok: boolean;
  status: number;
  headers: { get: () => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
} {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(byteLen)),
  };
}

function download429(): {
  ok: boolean;
  status: number;
  headers: { get: (k: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
} {
  return {
    ok: false,
    status: 429,
    headers: { get: (k: string) => (k === "retry-after" ? "0" : null) },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  };
}

const OK_META = { ok: true, result: { file_path: "photos/x.jpg" } };
const RL_META = { ok: false, error_code: 429, parameters: { retry_after: 0 } };

describe("fetchTelegramFileBytes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns bytes on the happy path (getFile ok → download ok)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(OK_META))
      .mockResolvedValueOnce(downloadOk(4));
    const p = fetchTelegramFileBytes({ botToken: "t", fileId: "f" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.bytes.byteLength).toBe(4);
    expect(result.filePath).toBe("photos/x.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries getFile on a 429 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(RL_META)) // 429
      .mockResolvedValueOnce(jsonRes(OK_META)) // retry ok
      .mockResolvedValueOnce(downloadOk(8));
    const p = fetchTelegramFileBytes({ botToken: "t", fileId: "f" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.bytes.byteLength).toBe(8);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries the download on a 429 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(OK_META))
      .mockResolvedValueOnce(download429()) // 429
      .mockResolvedValueOnce(downloadOk(2)); // retry ok
    const p = fetchTelegramFileBytes({ botToken: "t", fileId: "f" });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.bytes.byteLength).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a non-429 getFile failure", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes({ ok: false, description: "file not found", error_code: 400 }),
    );
    const p = fetchTelegramFileBytes({ botToken: "t", fileId: "f" });
    const assertion = expect(p).rejects.toThrow(/Telegram getFile failed/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on persistent 429", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(RL_META))
      .mockResolvedValueOnce(jsonRes(RL_META));
    const p = fetchTelegramFileBytes({ botToken: "t", fileId: "f", maxRetries: 1 });
    const assertion = expect(p).rejects.toThrow(/Telegram getFile failed/);
    await vi.runAllTimersAsync();
    await assertion;
    // maxRetries=1 → 2 getFile attempts, both 429, then throw.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
