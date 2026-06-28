// R2 photo cache — Cloudflare R2 used as a 24h-TTL read-through cache for the
// Telegram-stored event photos served by /api/assets/[id].
//
// Design (docs/plans/r2-photo-cache-plan.md, owner-confirmed):
//   R2 is a CACHE, not durable storage. On a route MISS we pull bytes from
//   Telegram (source of truth) and write-through to R2; subsequent views read
//   from R2 and skip the Telegram round-trip. Objects auto-expire 24h after
//   creation via a whole-bucket R2 lifecycle rule (configured once by
//   scripts/setup-r2-cache-bucket.ts), so the footprint stays at the working
//   set only and re-populates on the next access.
//
// This module owns its OWN lazy S3Client — it does NOT reuse the MinIO
// singleton in ./index.ts. R2 is S3-compatible but needs distinct config:
//   - region: "auto"        (R2 has no regions)
//   - forcePathStyle: true  (R2 + custom endpoint use path-style addressing)
//   - requestChecksumCalculation / responseChecksumValidation: "WHEN_REQUIRED"
//     AWS SDK v3.729+ defaults to CRC32 request-integrity checksums that R2
//     rejects on PutObject (and that break DeleteObjects). Forcing
//     WHEN_REQUIRED restores the pre-3.729 behaviour and keeps R2 happy.
//     (Verified against aws-sdk-js-v3 docs — MD5_FALLBACK / flexible-checksums.)
//
// Env (distinct R2_* namespace — never reuse STORAGE_*):
//   R2_CACHE_ENABLED      "true" turns the cache on. Unset/anything-else = off
//                         (route stays byte-for-byte identical to today).
//   R2_ENDPOINT           https://<accountid>.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID      R2 S3 API token access key id
//   R2_SECRET_ACCESS_KEY  R2 S3 API token secret
//   R2_CACHE_BUCKET       optional override for the bucket name
//   R2_ACCOUNT_ID         informational (endpoint already encodes it)
//
// Secrets source (never copied into the repo):
//   Server-Setups/Powerbyte-Hostinger/secrets/cloudflare-r2.enc.yaml

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export interface PutCacheObjectInput {
  key: string;
  body: Buffer;
  contentType?: string;
}

export interface CachedObject {
  body: Buffer;
  contentType: string | undefined;
}

let cachedClient: S3Client | null = null;

/**
 * Is the R2 read-through cache turned on? When false, callers must behave
 * exactly as before (pull straight from Telegram), so the feature ships dark.
 */
export function isR2CacheEnabled(): boolean {
  return process.env.R2_CACHE_ENABLED === "true";
}

/**
 * Lazily build the R2-specific S3Client. Lazy so the package imports cleanly
 * in tests (where @aws-sdk/client-s3 is mocked) and so an env-less import
 * (cache disabled) never throws.
 */
export function getR2CacheClient(): S3Client {
  if (cachedClient !== null) return cachedClient;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (endpoint === undefined || endpoint === "") {
    throw new Error(
      "R2_ENDPOINT is not configured — packages/storage cannot create the R2 cache client",
    );
  }
  if (accessKeyId === undefined || accessKeyId === "") {
    throw new Error(
      "R2_ACCESS_KEY_ID is not configured — packages/storage cannot create the R2 cache client",
    );
  }
  if (secretAccessKey === undefined || secretAccessKey === "") {
    throw new Error(
      "R2_SECRET_ACCESS_KEY is not configured — packages/storage cannot create the R2 cache client",
    );
  }

  cachedClient = new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    // Disable the SDK's default modern request/response checksums (CRC32) that
    // R2 rejects on PutObject (aws-sdk-js-v3 ≥ 3.729). WHEN_REQUIRED restores
    // the older, R2-compatible behaviour.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

/**
 * Test-only hook: drop the cached client so env changes between tests take
 * effect. Mirrors __resetClientForTesting in ./index.ts.
 */
export function __resetR2ClientForTesting(): void {
  cachedClient = null;
}

// APP_ENV (NODE_ENV-style) → bucket env segment, matching ./index.ts so the
// cache bucket lines up with the exports bucket convention. Unknown values
// throw rather than silently writing dev data into a prod-named bucket.
const APP_ENV_TO_BUCKET_ENV: Record<string, string> = {
  development: "dev",
  staging: "staging",
  production: "prod",
};

/**
 * Dedicated cache bucket name: marine-guardian-<env>-photo-cache.
 * Separate from the durable -exports bucket so the 24h lifecycle never touches
 * report PDFs. R2_CACHE_BUCKET overrides for ad-hoc/test buckets.
 */
export function getCacheBucketName(): string {
  const override = process.env.R2_CACHE_BUCKET;
  if (override !== undefined && override !== "") return override;

  const appEnv = process.env.APP_ENV;
  if (appEnv === undefined || appEnv === "") {
    return "marine-guardian-dev-photo-cache";
  }
  const bucketEnv = APP_ENV_TO_BUCKET_ENV[appEnv];
  if (bucketEnv === undefined) {
    throw new Error(
      `[r2-cache] APP_ENV=${appEnv} is not mapped in APP_ENV_TO_BUCKET_ENV. Expected one of: ${Object.keys(
        APP_ENV_TO_BUCKET_ENV,
      ).join(", ")}`,
    );
  }
  return `marine-guardian-${bucketEnv}-photo-cache`;
}

/**
 * Cache key: ${tenantId}/${assetId}. The assetId is an immutable server id
 * (never attacker-chosen); the tenant prefix is defence-in-depth only — the
 * real authorization stays the DB findFirst({ id, tenantId }) at the route.
 */
export function buildCacheKey(tenantId: string, assetId: string): string {
  return `${tenantId}/${assetId}`;
}

/**
 * Write bytes to the cache bucket. Caller treats this as best-effort: a
 * rejection here must be swallowed by the caller so a cache write failure
 * never breaks the served response.
 */
export async function putCacheObject(input: PutCacheObjectInput): Promise<void> {
  const client = getR2CacheClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getCacheBucketName(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
    }),
  );
}

interface S3LikeError {
  $metadata?: { httpStatusCode?: number };
  name?: string;
}

function isNoSuchKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const s3err = err as unknown as S3LikeError;
  if (s3err.name === "NoSuchKey" || s3err.name === "NotFound") return true;
  if (s3err.$metadata?.httpStatusCode === 404) return true;
  return false;
}

/**
 * Read bytes from the cache bucket. Returns null on a cache MISS (NoSuchKey /
 * 404) so callers can cleanly fall through to Telegram. Any OTHER error
 * propagates — the caller wraps the whole read in a swallow-all so even those
 * degrade to a Telegram fetch, but we don't hide them inside this primitive.
 */
export async function getCacheObject(key: string): Promise<CachedObject | null> {
  const client = getR2CacheClient();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: getCacheBucketName(),
        Key: key,
      }),
    );
    const body = response.Body;
    if (body === undefined) return null;
    // In the Node runtime the SDK mixes transformToByteArray() onto Body.
    const bytes = await body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType,
    };
  } catch (err) {
    if (isNoSuchKeyError(err)) return null;
    throw err;
  }
}

/**
 * Delete a cache object. Used by the verify harness to pre-clean a key before
 * proving the MISS → write-through → HIT cycle. NoSuchKey is treated as success
 * (already absent).
 */
export async function deleteCacheObject(key: string): Promise<void> {
  const client = getR2CacheClient();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: getCacheBucketName(),
        Key: key,
      }),
    );
  } catch (err) {
    if (isNoSuchKeyError(err)) return;
    throw err;
  }
}
