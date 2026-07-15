// GET /api/cms/media/[...key] — Route Handler tests (CMS_BUILD_PLAN.md — W3).
// Verifies: a missing/unknown key 404s; path-traversal-shaped segments 404
// before any DB lookup; a known PNG and a known WEBP key stream back with
// the correct Content-Type + bytes. The storage seam (getImageReadStream) is
// MOCKED — this environment has no reachable MinIO — so this asserts the
// route's serving hygiene (mime lookup, headers, streaming plumbing), not a
// live object-storage round-trip. See the worker report for what remains to
// be exercised against a real MinIO before shipping.

import { Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockGetImageReadStream } = vi.hoisted(() => ({
  mockPrisma: {
    cmsMedia: { findUnique: vi.fn() },
  },
  mockGetImageReadStream: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({ prisma: mockPrisma }));

vi.mock("@marine-guardian/storage", () => ({
  getImageReadStream: (...a: unknown[]): unknown => mockGetImageReadStream(...a),
  getExportsBucketName: (): string => "marine-guardian-dev-exports",
}));

import { GET } from "../route";

function makeParams(segments: string[]): { params: Promise<{ key: string[] }> } {
  return { params: Promise.resolve({ key: segments }) };
}

async function readAll(res: Response): Promise<Buffer> {
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

describe("GET /api/cms/media/[...key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the key segments look like path traversal", async () => {
    const res = await GET(undefined as never, makeParams(["cms", "..", "secret.png"]));
    expect(res.status).toBe(404);
    expect(mockPrisma.cmsMedia.findUnique).not.toHaveBeenCalled();
  });

  it("404s when the key does not live under the cms/ prefix", async () => {
    const res = await GET(undefined as never, makeParams(["not-cms", "global", "x.png"]));
    expect(res.status).toBe(404);
    expect(mockPrisma.cmsMedia.findUnique).not.toHaveBeenCalled();
  });

  it("404s when no CmsMedia row matches the key", async () => {
    mockPrisma.cmsMedia.findUnique.mockResolvedValue(null);
    const res = await GET(undefined as never, makeParams(["cms", "global", "missing.png"]));
    expect(res.status).toBe(404);
    expect(mockGetImageReadStream).not.toHaveBeenCalled();
  });

  it("streams a PNG back with the correct Content-Type", async () => {
    mockPrisma.cmsMedia.findUnique.mockResolvedValue({
      key: "cms/global/img-1.png",
      mimeType: "image/png",
    });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]);
    mockGetImageReadStream.mockResolvedValue(Readable.from([pngBytes]));

    const res = await GET(undefined as never, makeParams(["cms", "global", "img-1.png"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await readAll(res)).equals(pngBytes)).toBe(true);
    expect(mockGetImageReadStream).toHaveBeenCalledWith({
      bucket: "marine-guardian-dev-exports",
      key: "cms/global/img-1.png",
    });
  });

  it("streams a WEBP back with the correct Content-Type", async () => {
    mockPrisma.cmsMedia.findUnique.mockResolvedValue({
      key: "cms/global/img-2.webp",
      mimeType: "image/webp",
    });
    const webpBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 7, 7]);
    mockGetImageReadStream.mockResolvedValue(Readable.from([webpBytes]));

    const res = await GET(undefined as never, makeParams(["cms", "global", "img-2.webp"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect((await readAll(res)).equals(webpBytes)).toBe(true);
  });

  it("404s (defense-in-depth) if a stored mimeType somehow isn't in the safe-inline allowlist", async () => {
    mockPrisma.cmsMedia.findUnique.mockResolvedValue({
      key: "cms/global/weird.bin",
      mimeType: "application/octet-stream",
    });

    const res = await GET(undefined as never, makeParams(["cms", "global", "weird.bin"]));
    expect(res.status).toBe(404);
    expect(mockGetImageReadStream).not.toHaveBeenCalled();
  });
});
