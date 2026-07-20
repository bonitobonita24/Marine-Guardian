// 5.3c — packages/storage MinIO S3 client tests.
//
// Verifies the storage surface for the pdf-render pipeline:
//   uploadPdf       — PUT a pdf buffer at (bucket, key) with correct ContentType
//   getPdfReadStream — GET a stream back for the Route Handler to pipe
//   deletePdf       — DELETE a key (used by 5.3d retry / future cleanup)
//   assertBucketExists — idempotent bucket creation (HEAD → CREATE on 404)
//   getExportsBucketName — env-derived bucket name (single source of truth)
//   buildExportKey  — env-independent key shape per spec
//
// All tests use mocked S3Client.send to avoid network calls. The contract
// being tested is the COMMAND shape we send, not S3's response handling.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-s3", async () => {
  const actual =
    await vi.importActual<typeof import("@aws-sdk/client-s3")>(
      "@aws-sdk/client-s3",
    );
  // Need a real constructor because packages/storage uses `new S3Client(...)`.
  // vi.fn().mockImplementation returns a non-constructable function in v4.
  class FakeS3Client {
    public send = mockSend;
    constructor(_config: unknown) {
      void _config;
    }
  }
  return {
    ...actual,
    S3Client: FakeS3Client,
  };
});

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  NoSuchBucket,
  NoSuchKey,
} from "@aws-sdk/client-s3";

import {
  uploadPdf,
  getPdfReadStream,
  deletePdf,
  assertBucketExists,
  getExportsBucketName,
  buildExportKey,
  buildPptxExportKey,
  buildLogoKey,
  uploadImage,
  getImageReadStream,
  getImageBytes,
  uploadObject,
  getObjectBytes,
  deleteObject,
  listExpiredObjectKeys,
  __resetClientForTesting,
} from "../index";

describe("packages/storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetClientForTesting();
    // APP_ENV must be one of the mapped values (see APP_ENV_TO_BUCKET_ENV
    // in ../index.ts). "development" mirrors local pnpm dev defaults.
    process.env.APP_ENV = "development";
    process.env.STORAGE_ENDPOINT = "http://localhost:9000";
    process.env.STORAGE_ACCESS_KEY = "test-access";
    process.env.STORAGE_SECRET_KEY = "test-secret";
    process.env.STORAGE_REGION = "us-east-1";
  });

  describe("getExportsBucketName", () => {
    it("maps APP_ENV=development → marine-guardian-dev-exports (DECISIONS_LOG §142)", () => {
      process.env.APP_ENV = "development";
      expect(getExportsBucketName()).toBe("marine-guardian-dev-exports");
    });

    it("maps APP_ENV=staging → marine-guardian-staging-exports", () => {
      process.env.APP_ENV = "staging";
      expect(getExportsBucketName()).toBe("marine-guardian-staging-exports");
    });

    it("maps APP_ENV=production → marine-guardian-prod-exports", () => {
      process.env.APP_ENV = "production";
      expect(getExportsBucketName()).toBe("marine-guardian-prod-exports");
    });

    it("defaults to marine-guardian-dev-exports when APP_ENV is unset", () => {
      delete process.env.APP_ENV;
      expect(getExportsBucketName()).toBe("marine-guardian-dev-exports");
      // beforeEach re-sets APP_ENV before every other test, so no manual
      // restore needed.
    });

    it("throws on unknown APP_ENV values (silent fallthrough would mask misconfig)", () => {
      process.env.APP_ENV = "preview";
      expect(() => getExportsBucketName()).toThrow(/APP_ENV=preview/);
    });
  });

  describe("buildExportKey", () => {
    it("produces ${tenantId}/${YYYY}/${MM}/${exportId}.pdf key shape", () => {
      const at = new Date(Date.UTC(2026, 2, 7)); // 2026-03-07 UTC
      expect(buildExportKey("tenant-abc", "exp-123", at)).toBe(
        "tenant-abc/2026/03/exp-123.pdf",
      );
    });

    it("zero-pads single-digit months", () => {
      const at = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01 UTC
      expect(buildExportKey("t1", "e1", at)).toBe("t1/2026/01/e1.pdf");
    });
  });

  describe("uploadPdf", () => {
    it("sends a PutObjectCommand with bucket, key, body, contentType, contentLength", async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from("%PDF-1.4 test bytes");

      const result = await uploadPdf({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pdf",
        body,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      const input = cmd.input;
      expect(input.Bucket).toBe("marine-guardian-test-exports");
      expect(input.Key).toBe("tenant-1/2026/05/export-1.pdf");
      expect(input.Body).toBe(body);
      expect(input.ContentType).toBe("application/pdf");
      expect(input.ContentLength).toBe(body.length);
      expect(result.key).toBe("tenant-1/2026/05/export-1.pdf");
    });
  });

  describe("getPdfReadStream", () => {
    it("returns the Body stream from GetObjectCommand response", async () => {
      const fakeStream = Readable.from([Buffer.from("pdf-bytes")]);
      mockSend.mockResolvedValueOnce({ Body: fakeStream });

      const stream = await getPdfReadStream({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pdf",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as GetObjectCommand;
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("tenant-1/2026/05/export-1.pdf");
      expect(stream).toBe(fakeStream);
    });

    it("throws when Body is missing from S3 response (defensive)", async () => {
      mockSend.mockResolvedValueOnce({});
      await expect(
        getPdfReadStream({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/missing.pdf",
        }),
      ).rejects.toThrow(/no body/i);
    });
  });

  describe("deletePdf", () => {
    it("sends a DeleteObjectCommand with bucket+key", async () => {
      mockSend.mockResolvedValueOnce({});
      await deletePdf({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pdf",
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as DeleteObjectCommand;
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("tenant-1/2026/05/export-1.pdf");
    });
  });

  describe("assertBucketExists", () => {
    it("returns immediately when HeadBucketCommand succeeds (bucket present)", async () => {
      mockSend.mockResolvedValueOnce({});
      await assertBucketExists("marine-guardian-test-exports");
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as HeadBucketCommand;
      expect(cmd).toBeInstanceOf(HeadBucketCommand);
    });

    it("creates the bucket when HeadBucketCommand throws NoSuchBucket (idempotent)", async () => {
      mockSend.mockRejectedValueOnce(
        new NoSuchBucket({ $metadata: {}, message: "" }),
      );
      mockSend.mockResolvedValueOnce({});

      await assertBucketExists("marine-guardian-test-exports");

      expect(mockSend).toHaveBeenCalledTimes(2);
      const headCmd = mockSend.mock.calls[0]?.[0] as HeadBucketCommand;
      const createCmd = mockSend.mock.calls[1]?.[0] as CreateBucketCommand;
      expect(headCmd).toBeInstanceOf(HeadBucketCommand);
      expect(createCmd).toBeInstanceOf(CreateBucketCommand);
      expect(createCmd.input.Bucket).toBe("marine-guardian-test-exports");
    });

    it("also creates the bucket when HEAD returns 404 (MinIO style)", async () => {
      // MinIO does not always throw NoSuchBucket; sometimes a 404 metadata.
      const notFound = Object.assign(new Error("Not Found"), {
        $metadata: { httpStatusCode: 404 },
        name: "NotFound",
      });
      mockSend.mockRejectedValueOnce(notFound);
      mockSend.mockResolvedValueOnce({});

      await assertBucketExists("marine-guardian-test-exports");

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[1]?.[0]).toBeInstanceOf(CreateBucketCommand);
    });

    it("re-throws non-404 errors from HeadBucketCommand", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          $metadata: { httpStatusCode: 403 },
          name: "AccessDenied",
        }),
      );

      await expect(
        assertBucketExists("marine-guardian-test-exports"),
      ).rejects.toThrow(/Access Denied/);

      // Should NOT attempt to create the bucket on a non-404 error.
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("buildLogoKey", () => {
    it("produces logos/${tenantId}/${templateId}.${ext} key shape", () => {
      expect(buildLogoKey("tenant-abc", "tmpl-1", "png")).toBe(
        "logos/tenant-abc/tmpl-1.png",
      );
    });

    it("works with jpeg extension", () => {
      expect(buildLogoKey("tenant-xyz", "default", "jpeg")).toBe(
        "logos/tenant-xyz/default.jpeg",
      );
    });

    it("includes logos/ prefix so PDF and logo keys never collide", () => {
      const logoKey = buildLogoKey("tenant-abc", "tmpl-1", "png");
      expect(logoKey.startsWith("logos/")).toBe(true);
    });

    it("strips a leading dot from ext so callers deriving ext from filename do not produce double-dot keys", () => {
      // path.extname("logo.png") returns ".png" — normalise to avoid "id..png"
      expect(buildLogoKey("tenant-abc", "tmpl-1", ".png")).toBe(
        "logos/tenant-abc/tmpl-1.png",
      );
    });
  });

  describe("uploadImage", () => {
    it("sends PutObjectCommand with image/png content-type", async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

      const result = await uploadImage({
        bucket: "marine-guardian-test-exports",
        key: "logos/tenant-1/tmpl-1.png",
        body,
        contentType: "image/png",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("logos/tenant-1/tmpl-1.png");
      expect(cmd.input.Body).toBe(body);
      expect(cmd.input.ContentType).toBe("image/png");
      expect(cmd.input.ContentLength).toBe(body.length);
      expect(result.key).toBe("logos/tenant-1/tmpl-1.png");
    });

    it("sends PutObjectCommand with image/jpeg content-type", async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from([0xff, 0xd8, 0xff]); // JPEG magic bytes

      const result = await uploadImage({
        bucket: "marine-guardian-test-exports",
        key: "logos/tenant-1/tmpl-1.jpeg",
        body,
        contentType: "image/jpeg",
      });

      const cmd = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
      expect(cmd.input.ContentType).toBe("image/jpeg");
      expect(result.key).toBe("logos/tenant-1/tmpl-1.jpeg");
    });

    it("throws before calling S3 when body exceeds 10 MiB size guard", async () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      await expect(
        uploadImage({
          bucket: "marine-guardian-test-exports",
          key: "logos/tenant-1/big.png",
          body: oversized,
          contentType: "image/png",
        }),
      ).rejects.toThrow(/exceeds maximum/);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("accepts a body exactly at the 10 MiB size limit", async () => {
      mockSend.mockResolvedValueOnce({});
      const atLimit = Buffer.alloc(10 * 1024 * 1024);
      await expect(
        uploadImage({
          bucket: "marine-guardian-test-exports",
          key: "logos/tenant-1/at-limit.png",
          body: atLimit,
          contentType: "image/png",
        }),
      ).resolves.toEqual({ key: "logos/tenant-1/at-limit.png" });
    });
  });

  describe("getImageReadStream", () => {
    it("returns the Body stream from GetObjectCommand response", async () => {
      const fakeStream = Readable.from([Buffer.from("png-bytes")]);
      mockSend.mockResolvedValueOnce({ Body: fakeStream });

      const stream = await getImageReadStream({
        bucket: "marine-guardian-test-exports",
        key: "logos/tenant-1/tmpl-1.png",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as GetObjectCommand;
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("logos/tenant-1/tmpl-1.png");
      expect(stream).toBe(fakeStream);
    });

    it("throws when Body is missing from S3 response (defensive)", async () => {
      mockSend.mockResolvedValueOnce({});
      await expect(
        getImageReadStream({
          bucket: "marine-guardian-test-exports",
          key: "logos/tenant-1/missing.png",
        }),
      ).rejects.toThrow(/no body/i);
    });
  });

  describe("getImageBytes", () => {
    it("collects the stream into a Buffer", async () => {
      const originalBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const fakeStream = Readable.from([originalBytes]);
      mockSend.mockResolvedValueOnce({ Body: fakeStream });

      const result = await getImageBytes({
        bucket: "marine-guardian-test-exports",
        key: "logos/tenant-1/tmpl-1.png",
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(originalBytes);
    });

    it("concatenates multiple stream chunks into one Buffer", async () => {
      const chunk1 = Buffer.from([0x01, 0x02]);
      const chunk2 = Buffer.from([0x03, 0x04]);
      const fakeStream = Readable.from([chunk1, chunk2]);
      mockSend.mockResolvedValueOnce({ Body: fakeStream });

      const result = await getImageBytes({
        bucket: "marine-guardian-test-exports",
        key: "logos/tenant-1/multi-chunk.png",
      });

      expect(result).toEqual(Buffer.concat([chunk1, chunk2]));
    });
  });

  // -------------------------------------------------------------------------
  // Generic ephemeral-object surface (report exports on a ~30 min MinIO TTL).
  // -------------------------------------------------------------------------

  describe("buildPptxExportKey", () => {
    it("produces ${tenantId}/${YYYY}/${MM}/${exportId}.pptx key shape", () => {
      const at = new Date(Date.UTC(2026, 2, 7)); // 2026-03-07 UTC
      expect(buildPptxExportKey("tenant-abc", "exp-123", at)).toBe(
        "tenant-abc/2026/03/exp-123.pptx",
      );
    });

    it("zero-pads single-digit months", () => {
      const at = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01 UTC
      expect(buildPptxExportKey("t1", "e1", at)).toBe("t1/2026/01/e1.pptx");
    });

    it("shares the tenant/year/month prefix with buildExportKey", () => {
      const at = new Date(Date.UTC(2026, 4, 9));
      const pdf = buildExportKey("t1", "e1", at);
      const pptx = buildPptxExportKey("t1", "e1", at);
      expect(pdf.replace(/\.pdf$/, "")).toBe(pptx.replace(/\.pptx$/, ""));
    });
  });

  describe("uploadObject", () => {
    it("passes the given ContentType through to PutObjectCommand", async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from("PK fake pptx");
      const pptxType =
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      const result = await uploadObject({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pptx",
        body,
        contentType: pptxType,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("tenant-1/2026/05/export-1.pptx");
      expect(cmd.input.Body).toBe(body);
      expect(cmd.input.ContentType).toBe(pptxType);
      expect(cmd.input.ContentLength).toBe(body.length);
      expect(result.key).toBe("tenant-1/2026/05/export-1.pptx");
    });
  });

  describe("getObjectBytes", () => {
    it("returns a Buffer on success", async () => {
      const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      mockSend.mockResolvedValueOnce({ Body: Readable.from([bytes]) });

      const result = await getObjectBytes({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pdf",
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(bytes);
      const cmd = mockSend.mock.calls[0]?.[0] as GetObjectCommand;
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input.Key).toBe("tenant-1/2026/05/export-1.pdf");
    });

    it("returns null (not throws) on a NoSuchKey error — powers a clean 410 Gone", async () => {
      mockSend.mockRejectedValueOnce(
        new NoSuchKey({ $metadata: {}, message: "" }),
      );

      await expect(
        getObjectBytes({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/purged.pdf",
        }),
      ).resolves.toBeNull();
    });

    it("returns null on a bare 404 $metadata error (MinIO style)", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Not Found"), {
          $metadata: { httpStatusCode: 404 },
          name: "SomeOtherName",
        }),
      );

      await expect(
        getObjectBytes({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/purged.pdf",
        }),
      ).resolves.toBeNull();
    });

    it("rethrows a non-404 error (a real storage failure must not read as purged)", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          $metadata: { httpStatusCode: 403 },
          name: "AccessDenied",
        }),
      );

      await expect(
        getObjectBytes({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/export-1.pdf",
        }),
      ).rejects.toThrow(/Access Denied/);
    });

    it("throws when the response has no Body at all (defensive)", async () => {
      mockSend.mockResolvedValueOnce({});
      await expect(
        getObjectBytes({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/no-body.pdf",
        }),
      ).rejects.toThrow(/no body/i);
    });
  });

  describe("deleteObject", () => {
    it("sends a DeleteObjectCommand with bucket+key", async () => {
      mockSend.mockResolvedValueOnce({});
      await deleteObject({
        bucket: "marine-guardian-test-exports",
        key: "tenant-1/2026/05/export-1.pptx",
      });
      const cmd = mockSend.mock.calls[0]?.[0] as DeleteObjectCommand;
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Key).toBe("tenant-1/2026/05/export-1.pptx");
    });

    it("swallows a 404 so a concurrent janitor sweep cannot fail", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Not Found"), {
          $metadata: { httpStatusCode: 404 },
          name: "NoSuchKey",
        }),
      );

      await expect(
        deleteObject({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/already-gone.pdf",
        }),
      ).resolves.toBeUndefined();
    });

    it("rethrows a non-404 error", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          $metadata: { httpStatusCode: 403 },
          name: "AccessDenied",
        }),
      );

      await expect(
        deleteObject({
          bucket: "marine-guardian-test-exports",
          key: "tenant-1/2026/05/export-1.pdf",
        }),
      ).rejects.toThrow(/Access Denied/);
    });
  });

  describe("listExpiredObjectKeys", () => {
    const cutoff = new Date(Date.UTC(2026, 6, 20, 12, 0, 0));

    it("returns only keys whose LastModified is strictly older than olderThan", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "old-1.pdf", LastModified: new Date(Date.UTC(2026, 6, 20, 11, 0, 0)) },
          { Key: "fresh.pdf", LastModified: new Date(Date.UTC(2026, 6, 20, 11, 59, 59)) },
          { Key: "boundary.pdf", LastModified: cutoff },
          { Key: "newer.pdf", LastModified: new Date(Date.UTC(2026, 6, 20, 13, 0, 0)) },
        ],
        IsTruncated: false,
      });

      const keys = await listExpiredObjectKeys({
        bucket: "marine-guardian-test-exports",
        prefix: "tenant-1/",
        olderThan: cutoff,
      });

      // boundary.pdf is exactly at the cutoff — "strictly older" excludes it.
      expect(keys).toEqual(["old-1.pdf", "fresh.pdf"]);

      const cmd = mockSend.mock.calls[0]?.[0] as ListObjectsV2Command;
      expect(cmd).toBeInstanceOf(ListObjectsV2Command);
      expect(cmd.input.Bucket).toBe("marine-guardian-test-exports");
      expect(cmd.input.Prefix).toBe("tenant-1/");
    });

    it("skips entries with an undefined LastModified (never guess at age)", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "unknown-age.pdf" },
          { Key: "old.pdf", LastModified: new Date(Date.UTC(2026, 6, 19)) },
        ],
        IsTruncated: false,
      });

      const keys = await listExpiredObjectKeys({
        bucket: "marine-guardian-test-exports",
        olderThan: cutoff,
      });

      expect(keys).toEqual(["old.pdf"]);
      expect(keys).not.toContain("unknown-age.pdf");
    });

    it("follows a ContinuationToken across two pages", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "page1-old.pdf", LastModified: new Date(Date.UTC(2026, 6, 18)) },
        ],
        IsTruncated: true,
        NextContinuationToken: "token-2",
      });
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "page2-old.pdf", LastModified: new Date(Date.UTC(2026, 6, 19)) },
        ],
        IsTruncated: false,
      });

      const keys = await listExpiredObjectKeys({
        bucket: "marine-guardian-test-exports",
        olderThan: cutoff,
      });

      expect(keys).toEqual(["page1-old.pdf", "page2-old.pdf"]);
      expect(mockSend).toHaveBeenCalledTimes(2);
      const first = mockSend.mock.calls[0]?.[0] as ListObjectsV2Command;
      const second = mockSend.mock.calls[1]?.[0] as ListObjectsV2Command;
      expect(first.input.ContinuationToken).toBeUndefined();
      expect(second.input.ContinuationToken).toBe("token-2");
    });

    it("stops collecting once limit keys are reached and does not fetch more pages", async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "a.pdf", LastModified: new Date(Date.UTC(2026, 6, 18)) },
          { Key: "b.pdf", LastModified: new Date(Date.UTC(2026, 6, 18)) },
          { Key: "c.pdf", LastModified: new Date(Date.UTC(2026, 6, 18)) },
        ],
        IsTruncated: true,
        NextContinuationToken: "token-2",
      });

      const keys = await listExpiredObjectKeys({
        bucket: "marine-guardian-test-exports",
        olderThan: cutoff,
        limit: 2,
      });

      expect(keys).toEqual(["a.pdf", "b.pdf"]);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("returns an empty array when the bucket page is empty", async () => {
      mockSend.mockResolvedValueOnce({ IsTruncated: false });

      const keys = await listExpiredObjectKeys({
        bucket: "marine-guardian-test-exports",
        olderThan: cutoff,
      });

      expect(keys).toEqual([]);
    });
  });
});
