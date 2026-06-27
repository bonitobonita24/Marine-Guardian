#!/usr/bin/env tsx
/**
 * archive-er-assets.ts
 *
 * Stage 3 — Incremental EarthRanger → Telegram asset archiver.
 *
 * For each ER event that has attached files, downloads the file from the ER API
 * and uploads it to the tenant's Telegram channel. Records the result in the
 * eventAssets table (idempotent via tenantId_erFileId unique constraint) so
 * re-runs are safe and only new/unarchived files are processed.
 *
 * Usage:
 *   pnpm tsx scripts/archive-er-assets.ts [options]
 *
 * Options:
 *   --tenantId <id>   Tenant to process (default: cmoruubw20000gmx3jx7zudmy)
 *   --limit <n>       Max number of ER *events* with files to process (default: 5)
 *   --dry-run         Print planned actions without downloading or uploading
 *
 * Requires in .env.dev (or environment):
 *   DAS_WEB_TOKEN        EarthRanger Bearer token
 *   TELEGRAM_BOT_TOKEN   Telegram bot token
 *   DATABASE_URL         Prisma connection string (platformPrisma reads this)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Dotenv-less env loader — reads ../.env.dev relative to this script so the
// archiver works from a plain `pnpm tsx scripts/archive-er-assets.ts` call
// without any separate dotenv dependency.
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");

if (!fs.existsSync(envPath)) {
  console.error(
    `[archive-er-assets] ERROR: .env.dev not found at ${envPath}`,
  );
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (key && !process.env[key]) {
    process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Late imports — after env is populated so Prisma picks up DATABASE_URL and
// the jobs lib picks up TELEGRAM_BOT_TOKEN.
// ---------------------------------------------------------------------------
import { platformPrisma } from "@marine-guardian/db";
import {
  uploadDocumentToTelegram,
  getTelegramBotToken,
} from "@marine-guardian/jobs";

// ---------------------------------------------------------------------------
// Typed interfaces for ER API responses — no `any` anywhere.
// ---------------------------------------------------------------------------
interface ErFile {
  id: string;
  filename: string;
  file_type?: string;
  url?: string;
  images?: { original?: string };
}

interface ErEvent {
  id: string;
  serial_number?: number;
  files?: ErFile[];
}

interface ErEventsResponse {
  data: {
    results: ErEvent[];
  };
}

interface WorkItem {
  erEventId: string;
  erFileId: string;
  filename: string;
  fileType: string | undefined;
  downloadUrl: string;
  serialNumber: number | undefined;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function parseArgs(): {
  tenantId: string;
  limit: number;
  dryRun: boolean;
} {
  const argv = process.argv.slice(2);
  let tenantId = "cmoruubw20000gmx3jx7zudmy";
  let limit = 5;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tenantId" && argv[i + 1]) {
      tenantId = argv[i + 1]!;
      i++;
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      const parsed = parseInt(argv[i + 1]!, 10);
      if (!isNaN(parsed) && parsed > 0) limit = parsed;
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { tenantId, limit, dryRun };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { tenantId, limit, dryRun } = parseArgs();

  const ER_BASE = process.env.ER_BASE_URL ?? "https://mindoro.pamdas.org";
  const ER_TOKEN = process.env.DAS_WEB_TOKEN;
  if (!ER_TOKEN) {
    throw new Error(
      "[archive-er-assets] DAS_WEB_TOKEN is not set — cannot authenticate with EarthRanger",
    );
  }

  const botToken = getTelegramBotToken();

  console.log(
    `[archive-er-assets] Starting${dryRun ? " (DRY RUN)" : ""} — tenantId=${tenantId} limit=${limit}`,
  );

  // 1. Load tenant and verify it has a Telegram channel configured.
  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, telegramChannelId: true, slug: true },
  });

  if (!tenant) {
    throw new Error(
      `[archive-er-assets] Tenant ${tenantId} not found`,
    );
  }
  if (!tenant.telegramChannelId) {
    throw new Error(
      `[archive-er-assets] Tenant ${tenantId} (${tenant.slug}) has no telegramChannelId — configure it first`,
    );
  }

  const chatId = tenant.telegramChannelId;
  console.log(`[archive-er-assets] Tenant: ${tenant.slug} → chatId=${chatId}`);

  // 2. Fetch ER events (page_size=100 to minimise round-trips).
  const erUrl = `${ER_BASE}/api/v1.0/activity/events/?page_size=100`;
  console.log(`[archive-er-assets] Fetching ER events from ${erUrl}`);

  const erRes = await fetch(erUrl, {
    headers: { Authorization: `Bearer ${ER_TOKEN}` },
  });

  if (!erRes.ok) {
    throw new Error(
      `[archive-er-assets] ER API returned ${erRes.status} ${erRes.statusText}`,
    );
  }

  const erJson = (await erRes.json()) as ErEventsResponse;
  const events = erJson.data.results;
  console.log(`[archive-er-assets] ER returned ${events.length} events`);

  // 3. Build work list: events with attached files, capped at `limit` events.
  const workItems: WorkItem[] = [];
  let eventsWithFiles = 0;

  for (const event of events) {
    if (!event.files || event.files.length === 0) continue;

    eventsWithFiles++;
    if (eventsWithFiles > limit) break;

    for (const file of event.files) {
      const downloadUrl = file.images?.original ?? file.url;
      if (!downloadUrl) continue;

      workItems.push({
        erEventId: event.id,
        erFileId: file.id,
        filename: file.filename,
        fileType: file.file_type,
        downloadUrl,
        serialNumber: event.serial_number,
      });
    }
  }

  console.log(
    `[archive-er-assets] Work list: ${workItems.length} file(s) from ${Math.min(eventsWithFiles, limit)} event(s)`,
  );

  // 4. Process each work item.
  let archived = 0;
  let skippedAlready = 0;
  let skippedNotSynced = 0;
  let errors = 0;

  for (const item of workItems) {
    const label = `event=${item.erEventId} file=${item.erFileId} (${item.filename})`;

    try {
      // 4a. Resolve local event — must exist in our DB.
      const localEvent = await platformPrisma.event.findFirst({
        where: { tenantId, erEventId: item.erEventId },
        select: { id: true },
      });

      if (!localEvent) {
        console.log(`[archive-er-assets]   SKIP (not-synced) ${label}`);
        skippedNotSynced++;
        continue;
      }

      // 4b. Idempotency — if already uploaded, skip.
      const existing = await platformPrisma.eventAsset.findUnique({
        where: {
          tenantId_erFileId: { tenantId, erFileId: item.erFileId },
        },
        select: { id: true, uploadedAt: true },
      });

      if (existing?.uploadedAt != null) {
        console.log(`[archive-er-assets]   SKIP (already-archived) ${label}`);
        skippedAlready++;
        continue;
      }

      // 4c. Dry-run path.
      if (dryRun) {
        console.log(
          `[archive-er-assets]   PLAN archive ${label} → chatId=${chatId}`,
        );
        archived++;
        continue;
      }

      // 4d. Download from ER.
      console.log(`[archive-er-assets]   Downloading ${label}`);
      const dlRes = await fetch(item.downloadUrl, {
        headers: { Authorization: `Bearer ${ER_TOKEN}` },
      });

      if (!dlRes.ok) {
        throw new Error(
          `Download failed: ${dlRes.status} ${dlRes.statusText}`,
        );
      }

      const bytes = new Uint8Array(await dlRes.arrayBuffer());
      const mimeType = dlRes.headers.get("content-type") ?? undefined;

      // 4e. Upload to Telegram.
      console.log(`[archive-er-assets]   Uploading ${label} (${bytes.length} bytes)`);
      const up = await uploadDocumentToTelegram({
        botToken,
        chatId,
        bytes,
        filename: item.filename,
        mimeType,
        caption: `ER event #${item.serialNumber ?? item.erEventId} — ${item.filename}`,
      });

      // 4f. Record in DB.
      await platformPrisma.eventAsset.upsert({
        where: {
          tenantId_erFileId: { tenantId, erFileId: item.erFileId },
        },
        update: {
          telegramMessageId: BigInt(up.messageId),
          telegramFileId: up.fileId,
          uploadedAt: new Date(),
        },
        create: {
          tenantId,
          eventId: localEvent.id,
          erFileId: item.erFileId,
          filename: item.filename,
          fileType: item.fileType ?? null,
          telegramMessageId: BigInt(up.messageId),
          telegramFileId: up.fileId,
          uploadedAt: new Date(),
        },
      });

      console.log(
        `[archive-er-assets]   OK ${label} → messageId=${up.messageId} fileId=${up.fileId}`,
      );
      archived++;
    } catch (err) {
      console.error(
        `[archive-er-assets]   ERROR ${label}:`,
        err instanceof Error ? err.message : String(err),
      );
      errors++;
    }
  }

  // 5. Summary.
  console.log("\n[archive-er-assets] ── Summary ──────────────────────────────");
  console.log(`  Events scanned (with files, capped at limit): ${Math.min(eventsWithFiles, limit)}`);
  console.log(`  Files found in work list:                     ${workItems.length}`);
  console.log(`  Archived${dryRun ? " (planned)" : ""}:                        ${archived}`);
  console.log(`  Skipped (already archived):                   ${skippedAlready}`);
  console.log(`  Skipped (event not yet synced to DB):         ${skippedNotSynced}`);
  console.log(`  Errors:                                       ${errors}`);
  console.log("[archive-er-assets] ─────────────────────────────────────────\n");

  if (errors > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(
      "[archive-er-assets] FATAL:",
      err instanceof Error ? err.message : String(err),
    );
    void platformPrisma.$disconnect();
    process.exit(1);
  })
  .finally(() => {
    void platformPrisma.$disconnect();
  });
