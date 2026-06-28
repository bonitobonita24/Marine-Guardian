// R1 — resolveAssetBytes unit tests.
// Verifies the cache→Telegram→write-through core: flag-off delegation, cache
// HIT short-circuit, MISS write-through, and best-effort failure handling.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIsEnabled,
  mockGetCache,
  mockPutCache,
  mockFetchBytes,
} = vi.hoisted(() => ({
  mockIsEnabled: vi.fn(),
  mockGetCache: vi.fn(),
  mockPutCache: vi.fn(),
  mockFetchBytes: vi.fn(),
}));

vi.mock("@marine-guardian/storage", () => ({
  isR2CacheEnabled: mockIsEnabled,
  buildCacheKey: (t: string, a: string): string => `${t}/${a}`,
  getCacheObject: mockGetCache,
  putCacheObject: mockPutCache,
}));

vi.mock("@marine-guardian/jobs/lib/telegram-storage", () => ({
  fetchTelegramFileBytes: mockFetchBytes,
}));

import { resolveAssetBytes } from "../asset-bytes";

const INPUT = {
  tenantId: "tenant-1",
  assetId: "asset-9",
  telegramFileId: "tg-1",
  botToken: "bot-token",
  contentType: "image/jpeg",
};

describe("resolveAssetBytes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      filePath: "p.jpg",
    });
  });

  it("delegates straight to Telegram when the cache is disabled", async () => {
    mockIsEnabled.mockReturnValue(false);
    const result = await resolveAssetBytes(INPUT);
    expect(result.fromCache).toBe(false);
    expect(result.bytes.equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(mockGetCache).not.toHaveBeenCalled();
    expect(mockPutCache).not.toHaveBeenCalled();
    expect(mockFetchBytes).toHaveBeenCalledTimes(1);
  });

  it("returns cached bytes on a HIT without hitting Telegram", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockGetCache.mockResolvedValueOnce({
      body: Buffer.from([9, 9]),
      contentType: "image/png",
    });
    const result = await resolveAssetBytes(INPUT);
    expect(result.fromCache).toBe(true);
    expect(result.bytes.equals(Buffer.from([9, 9]))).toBe(true);
    expect(mockGetCache).toHaveBeenCalledWith("tenant-1/asset-9");
    expect(mockFetchBytes).not.toHaveBeenCalled();
    expect(mockPutCache).not.toHaveBeenCalled();
  });

  it("fetches Telegram and writes through on a MISS", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockGetCache.mockResolvedValueOnce(null);
    mockPutCache.mockResolvedValueOnce(undefined);
    const result = await resolveAssetBytes(INPUT);
    expect(result.fromCache).toBe(false);
    expect(mockFetchBytes).toHaveBeenCalledTimes(1);
    expect(mockPutCache).toHaveBeenCalledTimes(1);
    const put = mockPutCache.mock.calls[0]?.[0] as {
      key: string;
      body: Buffer;
      contentType?: string;
    };
    expect(put.key).toBe("tenant-1/asset-9");
    expect(put.body.equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(put.contentType).toBe("image/jpeg");
  });

  it("falls through to Telegram when the cache READ throws (best-effort)", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockGetCache.mockRejectedValueOnce(new Error("R2 down"));
    const result = await resolveAssetBytes(INPUT);
    expect(result.fromCache).toBe(false);
    expect(mockFetchBytes).toHaveBeenCalledTimes(1);
  });

  it("still serves Telegram bytes when the cache WRITE throws (best-effort)", async () => {
    mockIsEnabled.mockReturnValue(true);
    mockGetCache.mockResolvedValueOnce(null);
    mockPutCache.mockRejectedValueOnce(new Error("R2 write down"));
    const result = await resolveAssetBytes(INPUT);
    expect(result.fromCache).toBe(false);
    expect(result.bytes.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });
});
