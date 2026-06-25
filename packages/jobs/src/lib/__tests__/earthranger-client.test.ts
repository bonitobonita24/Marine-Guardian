// EarthRangerClient.request() — fetch timeout + data/results envelope unwrap.
// The processor/materialization suites mock the whole EarthRangerClient class,
// so request()'s internals (the AbortSignal timeout + envelope handling) are
// exercised only here, against a stubbed global fetch.

import { describe, it, expect, vi, afterEach } from "vitest";
import { EarthRangerClient } from "../earthranger-client";

describe("EarthRangerClient.request (timeout + envelope)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes an AbortSignal (timeout) to fetch and unwraps the data/results envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: { results: [{ id: "s1" }], count: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EarthRangerClient("https://er.test", "tok");
    const subjects = await client.getSubjects();

    expect(subjects).toEqual([{ id: "s1" }]);
    const opts = fetchMock.mock.calls[0]?.[1] as { signal?: unknown };
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("wraps a fetch TimeoutError into a clear ER timeout error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "TimeoutError",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new EarthRangerClient("https://er.test", "tok");
    await expect(client.getSubjects()).rejects.toThrow(/timed out after/i);
  });

  it("propagates non-timeout fetch errors unchanged", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new EarthRangerClient("https://er.test", "tok");
    await expect(client.getSubjects()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("throws on a non-ok HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new EarthRangerClient("https://er.test", "tok");
    await expect(client.getSubjects()).rejects.toThrow(/403/);
  });
});
