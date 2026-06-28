// R0 — packages/storage R2 photo-cache client tests.
//
// Verifies the R2 read-through cache surface:
//   isR2CacheEnabled   — flag gate (ship-dark default)
//   getR2CacheClient   — lazy client, throws on missing R2_* env
//   getCacheBucketName — APP_ENV-derived name + R2_CACHE_BUCKET override
//   buildCacheKey      — ${tenantId}/${assetId} shape
//   putCacheObject     — PUT command shape (bucket/key/body/contentType/length)
//   getCacheObject     — HIT bytes via transformToByteArray; null on NoSuchKey/404
//   deleteCacheObject  — DELETE command; swallows NoSuchKey; re-throws other
//
// S3Client.send is mocked — the contract under test is the COMMAND shape we
// send, not R2's wire behaviour. Mirrors storage.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-s3", async () => {
  const actual =
    await vi.importActual<typeof import("@aws-sdk/client-s3")>(
      "@aws-sdk/client-s3",
    );
  // Real constructor — r2-cache.ts uses `new S3Client(...)`.
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
} from "@aws-sdk/client-s3";

import {
  isR2CacheEnabled,
  getR2CacheClient,
  getCacheBucketName,
  buildCacheKey,
  putCacheObject,
  getCacheObject,
  deleteCacheObject,
  __resetR2ClientForTesting,
} from "../r2-cache";

describe("packages/storage r2-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetR2ClientForTesting();
    process.env.APP_ENV = "development";
    process.env.R2_ENDPOINT = "https://acct.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = "r2-access";
    process.env.R2_SECRET_ACCESS_KEY = "r2-secret";
    delete process.env.R2_CACHE_BUCKET;
    delete process.env.R2_CACHE_ENABLED;
  });

  describe("isR2CacheEnabled", () => {
    it("is false when R2_CACHE_ENABLED is unset (ships dark)", () => {
      expect(isR2CacheEnabled()).toBe(false);
    });
    it("is true only when R2_CACHE_ENABLED is exactly 'true'", () => {
      process.env.R2_CACHE_ENABLED = "true";
      expect(isR2CacheEnabled()).toBe(true);
      process.env.R2_CACHE_ENABLED = "1";
      expect(isR2CacheEnabled()).toBe(false);
    });
  });

  describe("getR2CacheClient", () => {
    it("throws when R2_ENDPOINT is missing", () => {
      delete process.env.R2_ENDPOINT;
      expect(() => getR2CacheClient()).toThrow(/R2_ENDPOINT/);
    });
    it("throws when R2_ACCESS_KEY_ID is missing", () => {
      delete process.env.R2_ACCESS_KEY_ID;
      expect(() => getR2CacheClient()).toThrow(/R2_ACCESS_KEY_ID/);
    });
    it("throws when R2_SECRET_ACCESS_KEY is missing", () => {
      delete process.env.R2_SECRET_ACCESS_KEY;
      expect(() => getR2CacheClient()).toThrow(/R2_SECRET_ACCESS_KEY/);
    });
    it("returns a singleton across calls", () => {
      expect(getR2CacheClient()).toBe(getR2CacheClient());
    });
  });

  describe("getCacheBucketName", () => {
    it("maps APP_ENV=development → marine-guardian-dev-photo-cache", () => {
      process.env.APP_ENV = "development";
      expect(getCacheBucketName()).toBe("marine-guardian-dev-photo-cache");
    });
    it("maps APP_ENV=staging → marine-guardian-staging-photo-cache", () => {
      process.env.APP_ENV = "staging";
      expect(getCacheBucketName()).toBe("marine-guardian-staging-photo-cache");
    });
    it("maps APP_ENV=production → marine-guardian-prod-photo-cache", () => {
      process.env.APP_ENV = "production";
      expect(getCacheBucketName()).toBe("marine-guardian-prod-photo-cache");
    });
    it("defaults to dev when APP_ENV is unset", () => {
      delete process.env.APP_ENV;
      expect(getCacheBucketName()).toBe("marine-guardian-dev-photo-cache");
    });
    it("honours R2_CACHE_BUCKET override", () => {
      process.env.R2_CACHE_BUCKET = "custom-cache-bucket";
      expect(getCacheBucketName()).toBe("custom-cache-bucket");
    });
    it("throws on unknown APP_ENV (no silent fallthrough)", () => {
      process.env.APP_ENV = "preview";
      expect(() => getCacheBucketName()).toThrow(/APP_ENV=preview/);
    });
  });

  describe("buildCacheKey", () => {
    it("produces ${tenantId}/${assetId}", () => {
      expect(buildCacheKey("tenant-1", "asset-9")).toBe("tenant-1/asset-9");
    });
  });

  describe("putCacheObject", () => {
    it("sends a PutObjectCommand with bucket/key/body/contentType/length", async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from("jpeg-bytes");

      await putCacheObject({
        key: "tenant-1/asset-9",
        body,
        contentType: "image/jpeg",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-dev-photo-cache");
      expect(cmd.input.Key).toBe("tenant-1/asset-9");
      expect(cmd.input.Body).toBe(body);
      expect(cmd.input.ContentType).toBe("image/jpeg");
      expect(cmd.input.ContentLength).toBe(body.length);
    });
  });

  describe("getCacheObject", () => {
    it("returns the bytes + contentType on a cache HIT", async () => {
      const raw = new Uint8Array([1, 2, 3, 4]);
      mockSend.mockResolvedValueOnce({
        Body: { transformToByteArray: vi.fn().mockResolvedValue(raw) },
        ContentType: "image/png",
      });

      const result = await getCacheObject("tenant-1/asset-9");

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as GetObjectCommand;
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-dev-photo-cache");
      expect(cmd.input.Key).toBe("tenant-1/asset-9");
      expect(result?.body.equals(Buffer.from(raw))).toBe(true);
      expect(result?.contentType).toBe("image/png");
    });

    it("returns null on a cache MISS (NoSuchKey)", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("no key"), { name: "NoSuchKey" }),
      );
      expect(await getCacheObject("tenant-1/missing")).toBeNull();
    });

    it("returns null when the error metadata is 404 (R2/MinIO style)", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Not Found"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      );
      expect(await getCacheObject("tenant-1/missing")).toBeNull();
    });

    it("returns null when the response has no Body", async () => {
      mockSend.mockResolvedValueOnce({});
      expect(await getCacheObject("tenant-1/asset-9")).toBeNull();
    });

    it("re-throws non-404 read errors", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      );
      await expect(getCacheObject("tenant-1/asset-9")).rejects.toThrow(
        /Access Denied/,
      );
    });
  });

  describe("deleteCacheObject", () => {
    it("sends a DeleteObjectCommand with bucket+key", async () => {
      mockSend.mockResolvedValueOnce({});
      await deleteCacheObject("tenant-1/asset-9");
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0]?.[0] as DeleteObjectCommand;
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect(cmd.input.Bucket).toBe("marine-guardian-dev-photo-cache");
      expect(cmd.input.Key).toBe("tenant-1/asset-9");
    });

    it("swallows NoSuchKey (already absent = success)", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("no key"), { name: "NoSuchKey" }),
      );
      await expect(deleteCacheObject("tenant-1/gone")).resolves.toBeUndefined();
    });

    it("re-throws non-404 delete errors", async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      );
      await expect(deleteCacheObject("tenant-1/asset-9")).rejects.toThrow(
        /Access Denied/,
      );
    });
  });
});
