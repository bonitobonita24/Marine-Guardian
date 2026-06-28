// R1 — resolveAssetBytes: the shared cache→Telegram→write-through core used by
// /api/assets/[id] (and the verify harness). See docs/plans/r2-photo-cache-plan.md.
//
// Flow:
//   1. If the R2 cache is enabled, try to read the bytes from R2 (best-effort —
//      any read error falls through to Telegram).
//   2. Fetch from Telegram (source of truth; the helper retries on 429).
//   3. If the cache is enabled, write the bytes back to R2 (best-effort — a
//      write error is swallowed so the served response never depends on it).
//      Only a MISS pays the extra PUT.
//
// The cache stores/serves raw bytes only. The route keeps deciding inline-vs-
// attachment from the DB row.mimeType (NOT the cached contentType) so the cache
// can never widen the inline-serve allowlist.

import {
  isR2CacheEnabled,
  buildCacheKey,
  getCacheObject,
  putCacheObject,
} from "@marine-guardian/storage";
import { fetchTelegramFileBytes } from "@marine-guardian/jobs/lib/telegram-storage";

export interface ResolveAssetBytesInput {
  tenantId: string;
  assetId: string;
  telegramFileId: string;
  botToken: string;
  /** Row-derived content type, stored as R2 object metadata on write-through. */
  contentType?: string;
}

export interface ResolvedAsset {
  bytes: Buffer;
  fromCache: boolean;
}

export async function resolveAssetBytes(
  input: ResolveAssetBytesInput,
): Promise<ResolvedAsset> {
  const { tenantId, assetId, telegramFileId, botToken, contentType } = input;
  const cacheOn = isR2CacheEnabled();
  const key = buildCacheKey(tenantId, assetId);

  // 1. Cache read (best-effort).
  if (cacheOn) {
    try {
      const hit = await getCacheObject(key);
      if (hit !== null) {
        return { bytes: hit.body, fromCache: true };
      }
    } catch {
      // Swallow — degrade to a Telegram fetch on any cache read failure.
    }
  }

  // 2. Telegram (source of truth). Throws on >20MB / unrecoverable failure;
  //    the route maps that to a clean non-200 rather than crashing.
  const { bytes } = await fetchTelegramFileBytes({
    botToken,
    fileId: telegramFileId,
  });
  const buf = Buffer.from(bytes);

  // 3. Write-through (best-effort; only a MISS reaches here).
  if (cacheOn) {
    try {
      // Conditional spread: with exactOptionalPropertyTypes we must omit
      // contentType entirely rather than pass an explicit undefined.
      await putCacheObject({
        key,
        body: buf,
        ...(contentType !== undefined ? { contentType } : {}),
      });
    } catch {
      // Swallow — the next request is simply another miss.
    }
  }

  return { bytes: buf, fromCache: false };
}
