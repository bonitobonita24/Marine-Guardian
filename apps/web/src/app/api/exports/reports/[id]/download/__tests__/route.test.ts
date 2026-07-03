// 5.3c — /api/exports/reports/[id]/download Route Handler tests.
//
// Verifies the manual-auth download endpoint:
//   - 401 when no session
//   - 429 when rate-limited
//   - 404 when row missing (cross-tenant or never-created)
//   - 404 when status !== "ready"
//   - 200 with correct Content-Type + Content-Disposition + Content-Length
//   - EXPORT_DOWNLOAD AuditLog written with correct shape before stream
//   - getPdfReadStream called with the env-derived bucket + row.filePath key
//
// All tests use mocked prisma + storage + auth + rate-limit modules. The
// contract being tested is the handler's branching + audit shape + the
// command shapes it passes to its collaborators.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

const {
  mockRequireRouteAuth,
  mockRateLimitCheck,
  mockPrisma,
  mockGetStream,
  mockFetchTelegramFileBytes,
} = vi.hoisted(() => ({
  mockRequireRouteAuth: vi.fn(),
  mockRateLimitCheck: vi.fn(),
  mockPrisma: {
    reportExport: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockGetStream: vi.fn(),
  mockFetchTelegramFileBytes: vi.fn(),
}));

// Fully mock route-auth — `vi.importActual` would pull in next-auth via the
// `auth` import, which then tries to load `next/headers` (unavailable in the
// vitest node environment). The RouteAuthError class is replicated in-test.
vi.mock("@/server/lib/route-auth", () => {
  class RouteAuthError extends Error {
    readonly response: unknown;
    constructor(response: unknown) {
      super("Route handler authentication failed");
      this.response = response;
    }
  }
  return {
    requireRouteAuth: mockRequireRouteAuth,
    RouteAuthError,
  };
});

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: {
    upload: { check: mockRateLimitCheck },
  },
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@marine-guardian/storage", () => ({
  getPdfReadStream: (...args: unknown[]): unknown => mockGetStream(...args),
  getExportsBucketName: (): string => "marine-guardian-test-exports",
}));

vi.mock("@marine-guardian/jobs/lib/telegram-storage", () => ({
  getTelegramBotToken: (): string => "test-bot-token",
  fetchTelegramFileBytes: (...args: unknown[]): unknown =>
    mockFetchTelegramFileBytes(...args),
}));

import { GET } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRouteArgs(id: string): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  return {
    req: {} as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  };
}

const VALID_AUTH = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["coordinator"],
};

describe("GET /api/exports/reports/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRouteAuth.mockResolvedValue(VALID_AUTH);
    mockRateLimitCheck.mockReturnValue(undefined);
    mockPrisma.reportExport.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("returns 401 when no session (requireRouteAuth throws RouteAuthError)", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireRouteAuth.mockRejectedValueOnce(
      new RouteAuthError(unauthorized),
    );

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.reportExport.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimitCheck.mockImplementationOnce(() => {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "rate limit" });
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(429);
    expect(mockPrisma.reportExport.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when ReportExport row is missing (cross-tenant or never created)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("missing-export");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    // Tenant scope enforced via session.tenantId, not the URL.
    const call = mockPrisma.reportExport.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing-export");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("returns 404 when row exists but status !== 'ready'", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "rendering",
      filePath: null,
      telegramFileId: null,
      fileSizeBytes: null,
      reportType: "coverage",
      completedAt: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("returns 404 when status=ready but BOTH filePath and telegramFileId are null (defensive)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      filePath: null,
      telegramFileId: null,
      fileSizeBytes: 1234,
      reportType: "coverage",
      completedAt: new Date(),
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("on ready row: writes EXPORT_DOWNLOAD AuditLog with reportType + fileSizeBytes in changesJson", async () => {
    const completedAt = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      filePath: "tenant-1/2026/05/export-1.pdf",
      telegramFileId: null,
      fileSizeBytes: 123_456,
      reportType: "coverage",
      completedAt,
    });
    mockGetStream.mockResolvedValueOnce(Readable.from([Buffer.from("pdf")]));

    const { req, ctx } = makeRouteArgs("export-1");
    await GET(req, ctx);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditLog.create.mock.calls[0]?.[0] as {
      data: {
        action: string;
        userId: string;
        tenantId: string;
        entityType: string;
        entityId: string;
        changesJson: { reportType: string; fileSizeBytes: number };
      };
    };
    expect(auditCall.data.action).toBe("EXPORT_DOWNLOAD");
    expect(auditCall.data.userId).toBe("user-1");
    expect(auditCall.data.tenantId).toBe("tenant-1");
    expect(auditCall.data.entityType).toBe("ReportExport");
    expect(auditCall.data.entityId).toBe("export-1");
    expect(auditCall.data.changesJson.reportType).toBe("coverage");
    expect(auditCall.data.changesJson.fileSizeBytes).toBe(123_456);
  });

  it("on ready row: returns 200 with Content-Type application/pdf + attachment Content-Disposition + Content-Length", async () => {
    const completedAt = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      filePath: "tenant-1/2026/05/export-1.pdf",
      telegramFileId: null,
      fileSizeBytes: 123_456,
      reportType: "coverage",
      completedAt,
    });
    mockGetStream.mockResolvedValueOnce(Readable.from([Buffer.from("pdf")]));

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="coverage-2026-05-21.pdf"',
    );
    expect(res.headers.get("Content-Length")).toBe("123456");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("on ready row: calls getPdfReadStream with env-derived bucket + row.filePath key", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      filePath: "tenant-1/2026/05/export-1.pdf",
      telegramFileId: null,
      fileSizeBytes: 1234,
      reportType: "per-area",
      completedAt: new Date(),
    });
    mockGetStream.mockResolvedValueOnce(Readable.from([Buffer.from("pdf")]));

    const { req, ctx } = makeRouteArgs("export-1");
    await GET(req, ctx);

    expect(mockGetStream).toHaveBeenCalledTimes(1);
    const streamCall = mockGetStream.mock.calls[0]?.[0] as {
      bucket: string;
      key: string;
    };
    expect(streamCall.bucket).toBe("marine-guardian-test-exports");
    expect(streamCall.key).toBe("tenant-1/2026/05/export-1.pdf");
  });

  it("AuditLog write fires BEFORE the storage stream is opened", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      id: "export-1",
      tenantId: "tenant-1",
      status: "ready",
      filePath: "tenant-1/2026/05/export-1.pdf",
      telegramFileId: null,
      fileSizeBytes: 1234,
      reportType: "coverage",
      completedAt: new Date(),
    });
    mockGetStream.mockResolvedValueOnce(Readable.from([Buffer.from("pdf")]));

    const { req, ctx } = makeRouteArgs("export-1");
    await GET(req, ctx);

    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const streamOrder = mockGetStream.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(streamOrder);
  });

  // ---------------------------------------------------------------------
  // Phase 4 S1 — Telegram-primary storage (dual-read).
  // ---------------------------------------------------------------------

  const TELEGRAM_ROW = {
    id: "export-tg",
    tenantId: "tenant-1",
    status: "ready",
    filePath: null,
    telegramFileId: "BQACAgUAAxkDAAII_file_id",
    fileSizeBytes: 9,
    reportType: "report_map",
    completedAt: new Date(Date.UTC(2026, 6, 3)), // 2026-07-03
  };

  it("on ready row with telegramFileId: fetches bytes from Telegram and returns 200 with PDF headers (MinIO NOT touched)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    const pdfBytes = new TextEncoder().encode("%PDF-tele").buffer;
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: pdfBytes,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report_map-2026-07-03.pdf"',
    );
    // Content-Length reflects the ACTUAL fetched bytes, not row.fileSizeBytes.
    expect(res.headers.get("Content-Length")).toBe("9");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    expect(mockFetchTelegramFileBytes).toHaveBeenCalledTimes(1);
    const call = mockFetchTelegramFileBytes.mock.calls[0]?.[0] as {
      botToken: string;
      fileId: string;
    };
    expect(call.botToken).toBe("test-bot-token");
    expect(call.fileId).toBe("BQACAgUAAxkDAAII_file_id");
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("prefers Telegram over MinIO when BOTH telegramFileId and filePath are set (fallback-mirror rows)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...TELEGRAM_ROW,
      filePath: "tenant-1/2026/07/export-tg.pdf",
    });
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("%PDF-tele").buffer,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(mockFetchTelegramFileBytes).toHaveBeenCalledTimes(1);
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("returns a clean 502 (never 500) when the Telegram fetch fails", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(
      new Error("Telegram getFile failed: file is too big"),
    );

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(mockGetStream).not.toHaveBeenCalled();
  });

  it("writes the EXPORT_DOWNLOAD AuditLog BEFORE the Telegram fetch", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockResolvedValueOnce({
      bytes: new TextEncoder().encode("%PDF-tele").buffer,
      filePath: "documents/file_1.pdf",
    });

    const { req, ctx } = makeRouteArgs("export-tg");
    await GET(req, ctx);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const fetchOrder =
      mockFetchTelegramFileBytes.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(fetchOrder);
  });

  it("AuditLog is still written even when the Telegram fetch subsequently fails (attempt is recorded)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("never exposes telegramFileId in any response body", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(TELEGRAM_ROW);
    mockFetchTelegramFileBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    const body = await res.text();
    expect(body).not.toContain("BQACAgUAAxkDAAII_file_id");
  });

  it("legacy rows (telegramFileId null, filePath set) still stream from MinIO", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...TELEGRAM_ROW,
      telegramFileId: null,
      filePath: "tenant-1/2026/07/export-tg.pdf",
    });
    mockGetStream.mockResolvedValueOnce(Readable.from([Buffer.from("pdf")]));

    const { req, ctx } = makeRouteArgs("export-tg");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(mockGetStream).toHaveBeenCalledTimes(1);
    expect(mockFetchTelegramFileBytes).not.toHaveBeenCalled();
  });
});
