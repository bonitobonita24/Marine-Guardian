import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PdfRendererError,
  renderPdfViaService,
} from "../pdf-renderer-client";

const ORIGINAL_FETCH = globalThis.fetch;

describe("pdf-renderer-client", () => {
  beforeEach(() => {
    process.env.PDF_RENDERER_SERVICE_URL = "http://pdf-renderer:4000";
    process.env.PDF_RENDERER_SERVICE_TOKEN =
      "test-token-must-be-at-least-thirty-two-chars-long-ok";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("posts to /render with X-PDF-Renderer-Token header and correct body", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    globalThis.fetch = fetchSpy;

    await renderPdfViaService({
      printUrl: "http://web:3000/_print/acme/coverage/exp-123",
      paperSize: "A4",
      landscape: true,
      exportId: "exp-123",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("unreachable");
    const [calledUrl, calledInit] = call;
    expect(calledUrl).toBe("http://pdf-renderer:4000/render");
    expect(calledInit).toBeDefined();
    if (!calledInit) throw new Error("unreachable");
    expect(calledInit.method).toBe("POST");
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["X-PDF-Renderer-Token"]).toBe(
      "test-token-must-be-at-least-thirty-two-chars-long-ok",
    );
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calledInit.body as string)).toEqual({
      printUrl: "http://web:3000/_print/acme/coverage/exp-123",
      paperSize: "A4",
      landscape: true,
      exportId: "exp-123",
    });
  });

  it("returns a Buffer containing the rendered PDF bytes on 200", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    globalThis.fetch = (() =>
      Promise.resolve(new Response(pdfBytes, { status: 200 })));

    const buf = await renderPdfViaService({
      printUrl: "http://web:3000/_print/acme/coverage/exp-1",
      paperSize: "A4",
      landscape: false,
      exportId: "exp-1",
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBe(pdfBytes.length);
  });

  it("throws PdfRendererError with status code on non-200 response", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("upstream failure", { status: 502 })));

    await expect(
      renderPdfViaService({
        printUrl: "http://web:3000/_print/acme/coverage/exp-x",
        paperSize: "A4",
        landscape: true,
        exportId: "exp-x",
      }),
    ).rejects.toMatchObject({
      name: "PdfRendererError",
      status: 502,
    });
  });

  it("wraps network errors in PdfRendererError", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed")));

    await expect(
      renderPdfViaService({
        printUrl: "http://web:3000/_print/acme/coverage/exp-x",
        paperSize: "A4",
        landscape: true,
        exportId: "exp-x",
      }),
    ).rejects.toBeInstanceOf(PdfRendererError);
  });

  it("throws if PDF_RENDERER_SERVICE_URL is missing", async () => {
    delete process.env.PDF_RENDERER_SERVICE_URL;

    await expect(
      renderPdfViaService({
        printUrl: "http://web:3000/_print/acme/coverage/exp-x",
        paperSize: "Letter",
        landscape: false,
        exportId: "exp-x",
      }),
    ).rejects.toThrow(/PDF_RENDERER_SERVICE_URL/);
  });
});
