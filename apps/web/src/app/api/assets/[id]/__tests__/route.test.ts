// Stage 4 — /api/assets/[id] Route Handler tests.
// Verifies the manual-auth Telegram-proxy endpoint: 401/429/404 branching,
// ASSET_DOWNLOAD audit shape + ordering, 200 headers, and the Telegram fetch
// call shape. prisma + auth + rate-limit + telegram-storage are mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

const {
  mockRequireRouteAuth,
  mockRateLimitCheck,
  mockPrisma,
  mockGetToken,
  mockFetchBytes,
} = vi.hoisted(() => ({
  mockRequireRouteAuth: vi.fn(),
  mockRateLimitCheck: vi.fn(),
  mockPrisma: {
    eventAsset: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockGetToken: vi.fn(),
  mockFetchBytes: vi.fn(),
}));

vi.mock("@/server/lib/route-auth", () => {
  class RouteAuthError extends Error {
    readonly response: unknown;
    constructor(response: unknown) {
      super("Route handler authentication failed");
      this.response = response;
    }
  }
  return { requireRouteAuth: mockRequireRouteAuth, RouteAuthError };
});

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: { assetRead: { check: mockRateLimitCheck } },
}));

vi.mock("@marine-guardian/db", () => ({ prisma: mockPrisma }));

vi.mock("@marine-guardian/jobs/lib/telegram-storage", () => ({
  getTelegramBotToken: (...a: unknown[]): unknown => mockGetToken(...a),
  fetchTelegramFileBytes: (...a: unknown[]): unknown => mockFetchBytes(...a),
}));

import { GET } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRouteArgs(
  id: string,
  headers?: Record<string, string>,
): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  return {
    req: { headers: new Headers(headers) } as unknown as Parameters<
      typeof GET
    >[0],
    ctx: { params: Promise.resolve({ id }) },
  };
}

const VALID_AUTH = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["coordinator"],
};
const READY_ASSET = {
  id: "asset-1",
  tenantId: "tenant-1",
  eventId: "event-1",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  telegramFileId: "tg-file-123",
};

describe("GET /api/assets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Keep the R2 read-through cache OFF in these route tests so resolveAssetBytes
    // delegates straight to the mocked Telegram fetch (cache paths are unit-tested
    // separately in server/lib/__tests__/asset-bytes.test.ts).
    delete process.env.R2_CACHE_ENABLED;
    delete process.env.PDF_RENDERER_SERVICE_TOKEN;
    mockRequireRouteAuth.mockResolvedValue(VALID_AUTH);
    mockRateLimitCheck.mockReturnValue(undefined);
    mockPrisma.eventAsset.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockGetToken.mockReturnValue("bot-token");
    mockFetchBytes.mockResolvedValue({
      bytes: new ArrayBuffer(8),
      filePath: "photos/x.jpg",
    });
  });

  it("returns 401 when no session", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireRouteAuth.mockRejectedValueOnce(new RouteAuthError(unauthorized));
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    expect(mockPrisma.eventAsset.findFirst).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimitCheck.mockImplementationOnce(() => {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "rate limit" });
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(429);
    expect(mockPrisma.eventAsset.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when asset missing — tenant scope via session", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(null);
    const { req, ctx } = makeRouteArgs("missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const call = mockPrisma.eventAsset.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockFetchBytes).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 when asset has no telegramFileId (not archived)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      telegramFileId: null,
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(mockFetchBytes).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("writes ASSET_DOWNLOAD AuditLog with eventId + filename in changesJson", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    const { req, ctx } = makeRouteArgs("asset-1");
    await GET(req, ctx);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockPrisma.auditLog.create.mock.calls[0]?.[0] as {
      data: {
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
        changesJson: { eventId: string; filename: string };
      };
    };
    expect(audit.data.action).toBe("ASSET_DOWNLOAD");
    expect(audit.data.userId).toBe("user-1");
    expect(audit.data.tenantId).toBe("tenant-1");
    expect(audit.data.entityType).toBe("EventAsset");
    expect(audit.data.entityId).toBe("asset-1");
    expect(audit.data.changesJson.eventId).toBe("event-1");
    expect(audit.data.changesJson.filename).toBe("photo.jpg");
  });

  it("returns 200 with mimeType Content-Type, inline Content-Disposition, Content-Length", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new ArrayBuffer(8),
      filePath: "p.jpg",
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="photo.jpg"',
    );
    expect(res.headers.get("Content-Length")).toBe("8");
  });

  it("sets a private, immutable, 1-day Cache-Control (browser-private; never shared/CDN cache)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    // `private` is security-critical: these are auth/tenant-scoped photos that
    // must NEVER land in a shared CDN/edge cache. `max-age=86400, immutable`
    // lets each authenticated browser reuse the immutable bytes for a day.
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=86400, immutable",
    );
  });

  it("fetches bytes from Telegram with the bot token + row.telegramFileId", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    const { req, ctx } = makeRouteArgs("asset-1");
    await GET(req, ctx);
    expect(mockFetchBytes).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetchBytes.mock.calls[0]?.[0] as {
      botToken: string;
      fileId: string;
    };
    expect(fetchCall.botToken).toBe("bot-token");
    expect(fetchCall.fileId).toBe("tg-file-123");
  });

  it("AuditLog write fires BEFORE the Telegram fetch", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    const { req, ctx } = makeRouteArgs("asset-1");
    await GET(req, ctx);
    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const fetchOrder = mockFetchBytes.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(fetchOrder);
  });

  it("defaults Content-Type to octet-stream when mimeType is null and extension is unknown", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      mimeType: null,
      filename: "doc.bin",
    });
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new ArrayBuffer(4),
      filePath: "d.bin",
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("derives Content-Type from the filename when mimeType is null (archiver gap)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      mimeType: null,
      filename: "community_support-01.jpg",
    });
    mockFetchBytes.mockResolvedValueOnce({
      bytes: new ArrayBuffer(8),
      filePath: "c.jpg",
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("sets a sandbox CSP + nosniff on every served response", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; sandbox; frame-ancestors 'none'",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("forces attachment + octet-stream for a stored HTML mimeType (stored-XSS guard)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      mimeType: "text/html",
      filename: "evil.html",
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="evil.html"',
    );
  });

  it("forces attachment + octet-stream for a stored SVG mimeType (SVG XSS guard)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      mimeType: "image/svg+xml",
      filename: "logo.svg",
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="logo.svg"',
    );
  });

  it("returns a clean 502 (not an unhandled 500) when the Telegram fetch fails", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
    // e.g. Telegram down, rate-limited beyond retries, or the >20MB getFile cap.
    mockFetchBytes.mockRejectedValueOnce(new Error("Telegram getFile failed"));
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(502);
    // The egress audit still fired before the failed fetch.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("sanitizes quote/CRLF in the filename (Content-Disposition injection guard)", async () => {
    mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
      ...READY_ASSET,
      filename: 'a".jpg\r\nSet-Cookie: x=1',
    });
    const { req, ctx } = makeRouteArgs("asset-1");
    const res = await GET(req, ctx);
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).not.toContain("\r");
    expect(cd).not.toContain("\n");
    expect(cd).toBe('inline; filename="a_.jpg__Set-Cookie: x=1"');
  });

  // ── Renderer-service mode (print-render <img> thumbnails, 2026-07-03) ──────
  describe("X-PDF-Renderer-Token renderer-service mode", () => {
    const SERVICE_TOKEN = "render-secret-token-0123456789abcdef";

    it("serves the asset without session auth, rate limit, or audit on a valid token", async () => {
      process.env.PDF_RENDERER_SERVICE_TOKEN = SERVICE_TOKEN;
      mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
      const { req, ctx } = makeRouteArgs("asset-1", {
        "x-pdf-renderer-token": SERVICE_TOKEN,
      });
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      expect(mockRequireRouteAuth).not.toHaveBeenCalled();
      expect(mockRateLimitCheck).not.toHaveBeenCalled();
      // No user identity exists — egress is covered by the export's own audit.
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      // Lookup is id-only in renderer mode (trusted internal service).
      const call = mockPrisma.eventAsset.findFirst.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({ id: "asset-1" });
    });

    it("rejects an invalid presented token with 401 — never falls back to session auth", async () => {
      process.env.PDF_RENDERER_SERVICE_TOKEN = SERVICE_TOKEN;
      const { req, ctx } = makeRouteArgs("asset-1", {
        "x-pdf-renderer-token": "wrong-token-0123456789abcdef-wrong!",
      });
      const res = await GET(req, ctx);
      expect(res.status).toBe(401);
      expect(mockRequireRouteAuth).not.toHaveBeenCalled();
      expect(mockPrisma.eventAsset.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a presented token with 401 when the server has no expected token configured", async () => {
      // verifyServiceToken never grants access on a missing expected secret.
      const { req, ctx } = makeRouteArgs("asset-1", {
        "x-pdf-renderer-token": SERVICE_TOKEN,
      });
      const res = await GET(req, ctx);
      expect(res.status).toBe(401);
      expect(mockPrisma.eventAsset.findFirst).not.toHaveBeenCalled();
    });

    it("404s non-image types in renderer mode (thumbnails are the only use case)", async () => {
      process.env.PDF_RENDERER_SERVICE_TOKEN = SERVICE_TOKEN;
      mockPrisma.eventAsset.findFirst.mockResolvedValueOnce({
        ...READY_ASSET,
        mimeType: "application/pdf",
        filename: "report.pdf",
      });
      const { req, ctx } = makeRouteArgs("asset-1", {
        "x-pdf-renderer-token": SERVICE_TOKEN,
      });
      const res = await GET(req, ctx);
      expect(res.status).toBe(404);
      expect(mockFetchBytes).not.toHaveBeenCalled();
    });

    it("uses normal session auth when no token header is presented", async () => {
      process.env.PDF_RENDERER_SERVICE_TOKEN = SERVICE_TOKEN;
      mockPrisma.eventAsset.findFirst.mockResolvedValueOnce(READY_ASSET);
      const { req, ctx } = makeRouteArgs("asset-1");
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      expect(mockRequireRouteAuth).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      const call = mockPrisma.eventAsset.findFirst.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({ id: "asset-1", tenantId: "tenant-1" });
    });
  });
});
