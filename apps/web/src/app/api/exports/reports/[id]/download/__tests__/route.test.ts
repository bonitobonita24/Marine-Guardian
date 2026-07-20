// Phase 4 S4 — /api/exports/reports/[id]/download Route Handler tests.
//
// Verifies the manual-auth download endpoint after the Telegram→MinIO
// storage swap:
//   - 401 when no session
//   - 429 when rate-limited
//   - 404 when row missing (cross-tenant or never-created)
//   - 404 when status !== "ready"
//   - 404 when status=ready but filePath is null (no retrievable object)
//   - 200 with correct Content-Type + Content-Disposition + Content-Length,
//     streamed from MinIO using the key stored in row.filePath
//   - 410 when the row is ready but getObjectBytes returns null (the object
//     was purged by dialog-close or the TTL janitor — the deletion race).
//     This must NOT collapse into 404 or 500.
//   - 502 when getObjectBytes throws (a genuine storage failure)
//   - EXPORT_DOWNLOAD / EXPORT_VIEW AuditLog written before the read
//
// All tests use mocked prisma + @marine-guardian/storage + auth + rate-limit
// modules. The contract being tested is the handler's branching + audit
// shape + the command shapes it passes to its collaborators.

import { describe, it, expect, vi, beforeEach } from "vitest";
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
  getExportsBucketName: (): string => "marine-guardian-dev-exports",
  getObjectBytes: (...args: unknown[]): unknown => mockGetObjectBytes(...args),
}));

import { GET } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRouteArgs(
  id: string,
  disposition?: "inline",
): {
  req: Parameters<typeof GET>[0];
  ctx: Parameters<typeof GET>[1];
} {
  const url = new URL(`http://localhost/api/exports/reports/${id}/download`);
  if (disposition !== undefined) {
    url.searchParams.set("disposition", disposition);
  }
  return {
    // The route reads only `_req.nextUrl.searchParams`; a plain URL supplies it.
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
  id: "export-minio",
  tenantId: "tenant-1",
  status: "ready",
  filePath: "tenant-1/2026/07/export-minio.pdf",
  fileSizeBytes: 9,
  reportType: "report_map",
  completedAt: new Date(Date.UTC(2026, 6, 3)), // 2026-07-03
};

describe("GET /api/exports/reports/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRouteAuth.mockResolvedValue(VALID_AUTH);
    mockRateLimitCheck.mockReturnValue(undefined);
    mockPrisma.reportExport.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockGetObjectBytes.mockResolvedValue(Buffer.from("%PDF-mini"));
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
    // Tenant scope enforced via session.tenantId, not the URL.
    const call = mockPrisma.reportExport.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; tenantId: string };
    };
    expect(call.where.id).toBe("missing-export");
    expect(call.where.tenantId).toBe("tenant-1");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when row exists but status !== 'ready'", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...READY_ROW,
      status: "rendering",
      filePath: null,
      fileSizeBytes: null,
      completedAt: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  it("returns 404 when status=ready but filePath is null (no object key to read)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce({
      ...READY_ROW,
      filePath: null,
    });

    const { req, ctx } = makeRouteArgs("export-1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetObjectBytes).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Phase 4 S4 — MinIO-backed streaming + the purge race.
  // ---------------------------------------------------------------------

  it("on ready row: streams the MinIO bytes and returns 200 with PDF headers", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(Buffer.from("%PDF-mini"));

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report_map-2026-07-03.pdf"',
    );
    // Content-Length reflects the ACTUAL fetched bytes, not row.fileSizeBytes.
    expect(res.headers.get("Content-Length")).toBe("9");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("%PDF-mini");
  });

  it("reads the object using the key stored in row.filePath, from the exports bucket", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-minio");
    await GET(req, ctx);

    expect(mockGetObjectBytes).toHaveBeenCalledTimes(1);
    const call = mockGetObjectBytes.mock.calls[0]?.[0] as {
      bucket: string;
      key: string;
    };
    expect(call.bucket).toBe("marine-guardian-dev-exports");
    // The stored key is authoritative — never recomputed from createdAt.
    expect(call.key).toBe("tenant-1/2026/07/export-minio.pdf");
  });

  it("on ready row: writes EXPORT_DOWNLOAD AuditLog with reportType + fileSizeBytes in changesJson", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-minio");
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
    expect(auditCall.data.entityId).toBe("export-minio");
    expect(auditCall.data.changesJson.reportType).toBe("report_map");
    expect(auditCall.data.changesJson.fileSizeBytes).toBe(9);
  });

  it("with ?disposition=inline: serves the same bytes inline and audits as EXPORT_VIEW", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-minio", "inline");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // inline (not attachment) — the browser renders the PDF instead of saving.
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="report_map-2026-07-03.pdf"',
    );
    expect(mockGetObjectBytes).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditLog.create.mock.calls[0]?.[0] as {
      data: { action: string };
    };
    expect(auditCall.data.action).toBe("EXPORT_VIEW");
  });

  it("AuditLog write fires BEFORE the storage read", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);

    const { req, ctx } = makeRouteArgs("export-minio");
    await GET(req, ctx);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditOrder =
      mockPrisma.auditLog.create.mock.invocationCallOrder[0] ?? Infinity;
    const readOrder =
      mockGetObjectBytes.mock.invocationCallOrder[0] ?? -Infinity;
    expect(auditOrder).toBeLessThan(readOrder);
  });

  it("returns 410 GONE when the row is ready but the object was already purged", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    // NOT 404 (that means "no such row for you") and NOT 500 — the deletion
    // race is a normal outcome for an ephemeral export and must stay
    // distinguishable in production logs.
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This report has expired. Generate it again.");
  });

  it("410 path still records the AuditLog (the download attempt happened)", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockResolvedValueOnce(null);

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    expect(res.status).toBe(410);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns a clean 502 (never 500) when getObjectBytes throws", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockRejectedValueOnce(new Error("connection refused"));

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Report file temporarily unavailable");
  });

  it("AuditLog is still written even when the storage read subsequently fails", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    expect(res.status).toBe(502);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("never exposes the internal object key in any response body", async () => {
    mockPrisma.reportExport.findFirst.mockResolvedValueOnce(READY_ROW);
    mockGetObjectBytes.mockRejectedValueOnce(new Error("down"));

    const { req, ctx } = makeRouteArgs("export-minio");
    const res = await GET(req, ctx);

    const body = await res.text();
    expect(body).not.toContain("tenant-1/2026/07/export-minio.pdf");
  });
});
