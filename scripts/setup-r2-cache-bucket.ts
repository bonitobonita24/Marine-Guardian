#!/usr/bin/env tsx
/**
 * setup-r2-cache-bucket.ts
 *
 * One-time (idempotent) provisioning of the Cloudflare R2 photo-cache bucket
 * used by the /api/assets/[id] read-through cache (docs/plans/r2-photo-cache-plan.md).
 *
 * It:
 *   1. HEADs the cache bucket; creates it if absent (idempotent).
 *   2. Installs a whole-bucket lifecycle rule that expires every object 1 day
 *      after creation. R2's minimum granularity is 1 day — safe because the
 *      bucket is cache-only (source of truth = Telegram). Hot assets re-populate
 *      on the next miss; cold assets fall out → working-set-only footprint.
 *
 * The bucket is a CACHE, never durable storage. Re-running is harmless.
 *
 * Usage:
 *   set -a; source .env.dev; set +a
 *   pnpm tsx scripts/setup-r2-cache-bucket.ts [--bucket <name>]
 *
 * Requires (R2 S3 API token — Server-Setups Powerbyte-Hostinger cloudflare-r2):
 *   R2_ENDPOINT           https://<accountid>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_CACHE_BUCKET       optional; otherwise derived from APP_ENV
 *   APP_ENV               development | staging | production (bucket env segment)
 */

import {
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

import {
  getR2CacheClient,
  getCacheBucketName,
} from "@marine-guardian/storage";

const LIFECYCLE_RULE_ID = "expire-photo-cache-1d";

function parseBucketArg(): string | undefined {
  const idx = process.argv.indexOf("--bucket");
  if (idx !== -1) {
    const v = process.argv[idx + 1];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

interface S3LikeError {
  $metadata?: { httpStatusCode?: number };
  name?: string;
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as unknown as S3LikeError;
  if (e.name === "NotFound" || e.name === "NoSuchBucket") return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}

async function main(): Promise<void> {
  const override = parseBucketArg();
  if (override !== undefined) process.env.R2_CACHE_BUCKET = override;

  const bucket = getCacheBucketName();
  const client = getR2CacheClient();

  console.log(`[setup-r2-cache] target bucket: ${bucket}`);
  console.log(`[setup-r2-cache] endpoint: ${process.env.R2_ENDPOINT ?? "(unset)"}`);

  // 1. Ensure the bucket exists.
  let exists = true;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[setup-r2-cache] bucket already exists ✓`);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    exists = false;
  }
  if (!exists) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[setup-r2-cache] bucket created ✓`);
  }

  // 2. Install the 1-day expiry lifecycle rule (whole bucket).
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: LIFECYCLE_RULE_ID,
            Status: "Enabled",
            Filter: { Prefix: "" },
            Expiration: { Days: 1 },
          },
        ],
      },
    }),
  );
  console.log(
    `[setup-r2-cache] lifecycle rule '${LIFECYCLE_RULE_ID}' (expire 1 day after creation) applied ✓`,
  );

  // 3. Read it back to confirm.
  try {
    const cfg = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    const days = cfg.Rules?.find((r) => r.ID === LIFECYCLE_RULE_ID)?.Expiration
      ?.Days;
    console.log(
      `[setup-r2-cache] verified lifecycle: rule present, Expiration.Days=${days ?? "?"}`,
    );
  } catch (err) {
    console.warn(
      `[setup-r2-cache] could not read back lifecycle (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  console.log(`[setup-r2-cache] DONE — ${bucket} is ready as a 24h-TTL cache.`);
}

main().catch((err: unknown) => {
  console.error(
    `[setup-r2-cache] FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
  );
  process.exit(1);
});
