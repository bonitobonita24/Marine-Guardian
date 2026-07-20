// Phase 4 S4 — /api/exports/reports/[id]/pptx Route Handler tests.
//
// Mirrors the PDF download route's test suite (see
// ../../download/__tests__/route.test.ts) — same auth/rate-limit/404/410/502
// posture, applied to the pptx* columns.
//
// Verifies:
//   - 401 when no session
//   - 429 when rate-limited
//   - 404 when row missing (cross-tenant or never-created)
//   - 404 when pptxStatus !== "ready"
//   - 200 with correct Content-Type + Content-Disposition + Content-Length
//   - the DERIVED KEY CONTRACT: the key handed to getObjectBytes is exactly
//     buildPptxExportKey(tenantId, id, <now>). There is no pptx key column,
//     so this derivation is the only thing linking reader to writer — it is
//     the single most likely thing to silently drift.
//   - 410 when the row is ready but getObjectBytes returns null (purged)
//   - 502 when getObjectBytes throws
//   - EXPORT_PPTX_DOWNLOAD AuditLog written before the read

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";

const {
  mockRequireRouteAuth,
  mockRateLimitCheck,
  mockPrisma,
  mockGetObjectBytes,
} = vi.hoisted(() => ({
  mockRequireRouteAuth: vi.fn(),
  mockRateLimitCheck: vi.fn(),
  mockPrisma: {
    reportExport: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockGetObjectBytes: vi.fn(),
}));

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

// buildPptxExportKey is mocked with the REAL shape (not a stub) so the
// derived-key assertion below actually pins the produced key string.
vi.mock("@marine-guardian/storage", () => ({
  getExportsBucketName: (): string => "marine-guardian-dev-exports",
  buildPptxExportKey: (tenantId: string, exportId: string, at: Date): string => {
    const year = String(at.getUTCFullYear());
    const month = String(at.getUTCMonth() + 1).padStart(2, "0");
    return `${tenantId}/${year}/${month}/${exportId}.pptx`;
  },
  getObjectBytes: (...args: unknown[]): unknown => mockGetObjectBytes(...args),
}));

import { GET } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRouteArgs(id: string): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  const url = new URL(`http://localhost/api/exports/reports/${id}/pptx`);
  return {
    req: { nextUrl: url } as unknown as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  };
}

const VALID_AUTH = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["coordinator"],
};

const READY_ROW = {
  id: "export-pptx",
  tenantId: "tenant-1",
  pptxStatus: "ready",
  pptxFileSizeBytes: 7,
  reportType: "report_map",
  completedAt: new Date(Date.UTC(2026, 6, 3)), // 2026-07-03
};

describe("GET /api/exports/reports/[id]/pptx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRouteAuth.mockResolvedValue(VALID_AUTH);
    mockRateLimitCheck.mockReturnValue(undefined);
    mockPrisma.reportExport.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockGetObjectBytes.mockResolvedValue(Buffer.from("PK-pptx"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when no session (requireRouteAuth throws RouteAuthError)", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockRequireRouteAuth.mockRejectedValueOnce(new RouteAuthError(unauthorized));

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.reportExport.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
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
    const call = mockPrisma.reportExport.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing-export");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when row exists but pptxStatus !== 'ready'", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...READY_ROW,
      pptxStatus: "rendering",
      pptxFileSizeBytes: null,
      completedAt: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when pptxStatus is null (pptx never requested)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...READY_ROW,
      pptxStatus: null,
      pptxFileSizeBytes: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it("on ready row: streams the MinIO bytes and returns 200 with PPTX headers", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(Buffer.from("PK-pptx"));

    const { req, ctx } = makeRouteArgs("export-pptx");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report_map-2026-07-03.pptx"',
    );
    expect(res.headers.get("Content-Length")).toBe("7");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("PK-pptx");
  });

  // The derived-key contract. There is NO pptx key column — reader and writer
  // are linked only by both calling buildPptxExportKey(tenantId, id, <date>).
  it("reads the object at exactly buildPptxExportKey(tenantId, id, now), from the exports bucket", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 20, 12, 0, 0))); // 2026-07-20
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-pptx");
    await GET(req, ctx);

    expect(mockGetObjectBytes).toHaveBeenCalledTimes(1);
    const call = mockGetObjectBytes.mock.calls[0]?.[0] as {
      bucket: string;
      key: string;
    };
    expect(call.bucket).toBe("marine-guardian-dev-exports");
    expect(call.key).toBe("tenant-1/2026/07/export-pptx.pptx");
  });

  it("derives the key with the CURRENT date, not the row's completedAt (documents the month-boundary hazard)", async () => {
    vi.useFakeTimers();
    // Row completed in July; the download happens in August. The derived key
    // follows NOW, so it lands under the August prefix. This is the known
    // consequence of not persisting the pptx key — pinned here so the
    // behaviour cannot change silently.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 1, 0, 1, 0))); // 2026-08-01
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-pptx");
    await GET(req, ctx);

    const call = mockGetObjectBytes.mock.calls[0]?.[0] as { key: string };
    expect(call.key).toBe("tenant-1/2026/08/export-pptx.pptx");
  });

  it("on ready row: writes EXPORT_PPTX_DOWNLOAD AuditLog with reportType + fileSizeBytes in changesJson", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-pptx");
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
    expect(auditCall.data.action).toBe("EXPORT_PPTX_DOWNLOAD");
    expect(auditCall.data.userId).toBe("user-1");
    expect(auditCall.data.tenantId).toBe("tenant-1");
    expect(auditCall.data.entityType).toBe("ReportExport");
    expect(auditCall.data.entityId).toBe("export-pptx");
    expect(auditCall.data.changesJson.reportType).toBe("report_map");
    expect(auditCall.data.changesJson.fileSizeBytes).toBe(7);
  });

  it("AuditLog write fires BEFORE the storage read", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-pptx");
    await GET(req, ctx);

    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const readOrder =
      mockGetObjectBytes.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(readOrder);
  });

  it("returns 410 GONE when the row is ready but the object was already purged", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("export-pptx");
    const res = await GET(req, ctx);

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This report has expired. Generate it again.");
  });

  it("410 path still records the AuditLog (the download attempt happened)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("export-pptx");
    const res = await GET(req, ctx);

    expect(res.status).toBe(410);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns a clean 502 (never 500) when getObjectBytes throws", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockRejectedValueOnce(new Error("connection refused"));

    const { req, ctx } = makeRouteArgs("export-pptx");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PowerPoint file temporarily unavailable");
  });

  it("never exposes the internal object key in any response body", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-pptx");
    const res = await GET(req, ctx);

    const body = await res.text();
    expect(body).not.toContain("export-pptx.pptx");
  });
});
