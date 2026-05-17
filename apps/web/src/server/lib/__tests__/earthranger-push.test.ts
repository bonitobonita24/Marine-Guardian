import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushEventUpdateToEarthRanger } from "../earthranger-push";

describe("pushEventUpdateToEarthRanger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true when ER responds 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com",
      token: "tok",
      erEventId: "er-1",
      fields: { title: "Hello" },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://er.example.com/api/v1.0/activity/event/er-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Hello" }),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> } | undefined;
    expect(init?.headers.Authorization).toBe("Bearer tok");
    expect(init?.headers["Content-Type"]).toBe("application/json");
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com///",
      token: "tok",
      erEventId: "er-1",
      fields: { title: "x" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://er.example.com/api/v1.0/activity/event/er-1",
      expect.any(Object),
    );
  });

  it("maps eventDetails to event_details in payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", fetchMock);

    await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com",
      token: "tok",
      erEventId: "er-1",
      fields: {
        title: "T",
        priority: 2,
        eventDetails: { offenderName: "Doe", vesselName: "Boat" },
      },
    });

    const call = fetchMock.mock.calls[0] as
      | [string, { body: string } | undefined]
      | undefined;
    const bodyText = call?.[1]?.body ?? "";
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    expect(body).toEqual({
      title: "T",
      priority: 2,
      event_details: { offenderName: "Doe", vesselName: "Boat" },
    });
  });

  it("returns ok:true without making a request when payload is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com",
      token: "tok",
      erEventId: "er-1",
      fields: {},
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false with status when ER responds non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    const result = await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com",
      token: "tok",
      erEventId: "missing",
      fields: { title: "x" },
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "EarthRanger PATCH failed: 404 Not Found",
    });
  });

  it("returns ok:false when fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await pushEventUpdateToEarthRanger({
      baseUrl: "https://er.example.com",
      token: "tok",
      erEventId: "er-1",
      fields: { title: "x" },
    });

    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });
});
