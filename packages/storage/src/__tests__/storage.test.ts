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
  NoSuchBucket,
} from "@aws-sdk/client-s3";

import {
  uploadPdf,
  getPdfReadStream,
  deletePdf,
  assertBucketExists,
  getExportsBucketName,
  buildExportKey,
  __resetClientForTesting,
} from "../index";

describe("packages/storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetClientForTesting();
    process.env.APP_ENV = "test";
    process.env.MINIO_ENDPOINT = "http://localhost:9000";
    process.env.MINIO_ACCESS_KEY = "test-access";
    process.env.MINIO_SECRET_KEY = "test-secret";
    process.env.MINIO_REGION = "us-east-1";
  });

  describe("getExportsBucketName", () => {
    it("derives bucket name from APP_ENV using marine-guardian-{env}-exports template", () => {
      process.env.APP_ENV = "staging";
      expect(getExportsBucketName()).toBe("marine-guardian-staging-exports");
    });

    it("defaults to 'dev' when APP_ENV is unset", () => {
      delete process.env.APP_ENV;
      expect(getExportsBucketName()).toBe("marine-guardian-dev-exports");
      // beforeEach re-sets APP_ENV before every other test, so no manual
      // restore needed.
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
});
