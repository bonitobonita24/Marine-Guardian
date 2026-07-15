// POST /api/cms/media — Route Handler tests (CMS_BUILD_PLAN.md — W3).
// Verifies: an anonymous caller is rejected; a platform admin can upload a
// PNG and a WEBP, each landing at the right key/content-type and returning
// the public serving URL. The storage seam (uploadImage) is MOCKED — this
// environment has no reachable MinIO — so this asserts route wiring/authz
// and the exact call shape into packages/storage, not a live object-storage
// round-trip. See CMS_BUILD_PLAN.md W3 note in the worker report for what
// remains to be exercised against a real MinIO (e.g. via the dev Docker
// stack) before shipping.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequirePlatformAdminRouteAuth, mockRateLimitCheck, mockPrisma, mockUploadImage } =
  vi.hoisted(() => ({
    mockRequirePlatformAdminRouteAuth: vi.fn(),
    mockRateLimitCheck: vi.fn(),
    mockPrisma: {
      cmsMedia: { create: vi.fn() },
    },
    mockUploadImage: vi.fn(),
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
    requirePlatformAdminRouteAuth: mockRequirePlatformAdminRouteAuth,
    RouteAuthError,
  };
});

vi.mock("@/server/lib/rate-limit", () => ({
  rateLimiters: { upload: { check: mockRateLimitCheck } },
}));

vi.mock("@marine-guardian/db", () => ({
  prisma: mockPrisma,
  writeAuditLog: vi.fn(),
}));

vi.mock("@marine-guardian/storage", () => ({
  uploadImage: (...a: unknown[]): unknown => mockUploadImage(...a),
  getExportsBucketName: (): string => "marine-guardian-dev-exports",
  buildCmsMediaKey: (tenantId: string | null, mediaId: string, ext: string): string =>
    `cms/${tenantId ?? "global"}/${mediaId}.${ext}`,
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "../route";
import { RouteAuthError } from "@/server/lib/route-auth";

function makeRequest(body: Uint8Array, contentType: string, scope?: string): NextRequest {
  const url = scope
    ? `http://localhost/api/cms/media?scope=${scope}`
    : "http://localhost/api/cms/media";
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": contentType, "content-length": String(body.byteLength) },
    body: body as BodyInit,
  });
}

describe("POST /api/cms/media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an anonymous (unauthenticated) caller", async () => {
    mockRequirePlatformAdminRouteAuth.mockRejectedValue(
      new RouteAuthError(NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
    );

    const req = makeRequest(new Uint8Array([1, 2, 3]), "image/png");
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockPrisma.cmsMedia.create).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("rejects a non-platform-admin caller (403 from the guard)", async () => {
    mockRequirePlatformAdminRouteAuth.mockRejectedValue(
      new RouteAuthError(NextResponse.json({ error: "Forbidden" }, { status: 403 })),
    );

    const req = makeRequest(new Uint8Array([1, 2, 3]), "image/png");
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("uploads a PNG for a platform admin and returns the public URL", async () => {
    mockRequirePlatformAdminRouteAuth.mockResolvedValue({ userId: "admin-1", roles: ["tenant_manager"] });
    mockUploadImage.mockResolvedValue({ key: "cms/global/fake-id.png" });
    mockPrisma.cmsMedia.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data }),
    );

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const req = makeRequest(pngBytes, "image/png", "docs");
    const res = await POST(req);
    const json = (await res.json()) as { url: string };

    expect(res.status).toBe(201);
    expect(json.url).toMatch(/^\/api\/cms\/media\/cms\/global\/.+\.png$/);

    expect(mockUploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "marine-guardian-dev-exports",
        contentType: "image/png",
      }),
    );
    const uploadArgs = mockUploadImage.mock.calls[0]?.[0];
    expect(uploadArgs.body).toBeInstanceOf(Buffer);
    expect(uploadArgs.body.length).toBe(pngBytes.byteLength);

    const createArgs = mockPrisma.cmsMedia.create.mock.calls[0]?.[0];
    expect(createArgs.data).toMatchObject({
      mimeType: "image/png",
      bytes: pngBytes.byteLength,
      scope: "docs",
      uploadedById: "admin-1",
    });
  });

  it("uploads a WEBP for a platform admin", async () => {
    mockRequirePlatformAdminRouteAuth.mockResolvedValue({ userId: "admin-1", roles: ["tenant_manager"] });
    mockUploadImage.mockResolvedValue({ key: "cms/global/fake-id.webp" });
    mockPrisma.cmsMedia.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data }),
    );

    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 5, 6, 7, 8]);
    const req = makeRequest(webpBytes, "image/webp");
    const res = await POST(req);
    const json = (await res.json()) as { url: string };

    expect(res.status).toBe(201);
    expect(json.url).toMatch(/^\/api\/cms\/media\/cms\/global\/.+\.webp$/);
    expect(mockUploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/webp" }),
    );
    // scope defaults to "docs" when the ?scope= query param is absent.
    const createArgs = mockPrisma.cmsMedia.create.mock.calls[0]?.[0];
    expect(createArgs.data).toMatchObject({ scope: "docs" });
  });

  it("rejects an unsupported content type with 415", async () => {
    mockRequirePlatformAdminRouteAuth.mockResolvedValue({ userId: "admin-1", roles: ["tenant_manager"] });

    const req = makeRequest(new Uint8Array([1, 2, 3]), "image/svg+xml");
    const res = await POST(req);

    expect(res.status).toBe(415);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413", async () => {
    mockRequirePlatformAdminRouteAuth.mockResolvedValue({ userId: "admin-1", roles: ["tenant_manager"] });

    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const req = makeRequest(oversized, "image/png");
    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});
