#!/usr/bin/env tsx
/**
 * verify-r2-cache.ts — Mode-A live harness for the R2 photo cache.
 *
 * Synchronous read-through proof (NOT a BullMQ job):
 *   1. Pick a real archived EventAsset (telegramFileId present).
 *   2. Pre-clean its cache key in R2.
 *   3. getCacheObject → expect null              (MISS proof)
 *   4. Fetch the bytes from Telegram ONCE → putCacheObject (write-through)
 *   5. getCacheObject → expect identical bytes   (HIT proof, Telegram not re-hit)
 *
 * Usage:
 *   set -a; source .env.dev; set +a            # or rely on the built-in loader
 *   R2_CACHE_ENABLED=true APP_ENV=development \
 *     pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/verify-r2-cache.ts \
 *     [--tenantId <id>] [--assetId <id>]
 *
 * Requires: R2_* creds, TELEGRAM_BOT_TOKEN, DATABASE_URL (all in .env.dev).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── 1. Load .env.dev (no dotenv dep) ──────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
// The harness exercises the cache regardless of the dark-ship flag default.
process.env.R2_CACHE_ENABLED = "true";
if (!process.env.APP_ENV) process.env.APP_ENV = "development";

import { platformPrisma } from "@marine-guardian/db";
import {
  buildCacheKey,
  getCacheObject,
  putCacheObject,
  deleteCacheObject,
  getCacheBucketName,
} from "@marine-guardian/storage";
import {
  getTelegramBotToken,
  fetchTelegramFileBytes,
} from "@marine-guardian/jobs/lib/telegram-storage";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1) return process.argv[idx + 1];
  return undefined;
}

const DEFAULT_TENANT = "cmoruubw20000gmx3jx7zudmy"; // demo-site

async function main(): Promise<void> {
  const tenantId = getArg("--tenantId") ?? DEFAULT_TENANT;
  const assetIdArg = getArg("--assetId");

  console.log(`[verify-r2-cache] bucket: ${getCacheBucketName()}`);

  const asset = await platformPrisma.eventAsset.findFirst({
    where: {
      tenantId,
      telegramFileId: { not: null },
      ...(assetIdArg !== undefined ? { id: assetIdArg } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      telegramFileId: true,
    },
  });

  if (asset === null || asset.telegramFileId === null) {
    throw new Error(
      `No archived EventAsset found for tenant ${tenantId}` +
        (assetIdArg !== undefined ? ` / asset ${assetIdArg}` : ""),
    );
  }
  console.log(
    `[verify-r2-cache] asset ${asset.id} (${asset.filename}, mime=${asset.mimeType ?? "null"}, sizeBytes=${asset.sizeBytes ?? "null"})`,
  );

  const key = buildCacheKey(asset.tenantId, asset.id);
  console.log(`[verify-r2-cache] cache key: ${key}`);

  // 2. Pre-clean.
  await deleteCacheObject(key);

  // 3. MISS proof.
  const miss = await getCacheObject(key);
  if (miss !== null) throw new Error("MISS proof FAILED — key not empty after delete");
  console.log(`[verify-r2-cache] MISS proof ✓ (key empty after pre-clean)`);

  // 4. Fetch from Telegram ONCE → write-through.
  const botToken = getTelegramBotToken();
  const { bytes } = await fetchTelegramFileBytes({
    botToken,
    fileId: asset.telegramFileId,
  });
  const tgBuf = Buffer.from(bytes);
  console.log(`[verify-r2-cache] fetched ${tgBuf.length} bytes from Telegram`);
  await putCacheObject({
    key,
    body: tgBuf,
    ...(asset.mimeType !== null ? { contentType: asset.mimeType } : {}),
  });
  console.log(`[verify-r2-cache] wrote ${tgBuf.length} bytes to R2`);

  // 5. HIT proof.
  const hit = await getCacheObject(key);
  if (hit === null) throw new Error("HIT proof FAILED — object missing after write");
  if (hit.body.length !== tgBuf.length) {
    throw new Error(
      `HIT proof FAILED — length mismatch (R2 ${hit.body.length} vs Telegram ${tgBuf.length})`,
    );
  }
  if (!hit.body.equals(tgBuf)) {
    throw new Error("HIT proof FAILED — bytes differ between R2 and Telegram");
  }
  console.log(
    `[verify-r2-cache] HIT proof ✓ (${hit.body.length} bytes, identical; contentType=${hit.contentType ?? "null"})`,
  );

  console.log(`[verify-r2-cache] PASS — R2 read-through round-trip verified.`);
  await platformPrisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(
    `[verify-r2-cache] FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
