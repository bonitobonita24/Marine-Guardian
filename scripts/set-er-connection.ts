#!/usr/bin/env tsx
/**
 * set-er-connection.ts — set/update a tenant's EarthRanger connection.
 *
 * Writes the per-tenant ER credential the way the app does it: the DAS token is
 * AES-256-GCM encrypted (via @marine-guardian/db `encrypt`, ENCRYPTION_KEY) and
 * stored in tenant_er_connections.api_token_enc alongside base_url. This is the
 * SAME row the ER sync worker + Settings UI read. Reusable for any tenant.
 *
 * status is set to "unchecked" (matching the Settings save path) — validate it
 * via the Settings "Test connection" button (or testErConnection) which probes
 * /api/v1.0/subjects and flips status. Recurring sync stays gated on a verified
 * connection, so this does NOT silently start auto-syncing.
 *
 * Usage (run from packages/jobs so workspace deps resolve):
 *   pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/set-er-connection.ts \
 *     [--tenantId <id>] [--base-url <url>] [--token <DAS token>]
 *   Token resolution: --token > $DAS_WEB_TOKEN. Base url: --base-url > $ER_BASE_URL
 *   > https://mindoro.pamdas.org. Requires ENCRYPTION_KEY + DATABASE_URL (from .env.dev).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Load .env.dev (no dotenv dep) ──────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.dev");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

import { platformPrisma, encrypt } from "@marine-guardian/db";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = arg("--tenantId") ?? "cmoruubw20000gmx3jx7zudmy"; // demo-site
  const baseUrl = (arg("--base-url") ?? process.env.ER_BASE_URL ?? "https://mindoro.pamdas.org").replace(/\/+$/, "");
  const token = arg("--token") ?? process.env.DAS_WEB_TOKEN;

  if (!token) throw new Error("No token: pass --token or set DAS_WEB_TOKEN.");
  if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY missing (expected in .env.dev).");

  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);

  const apiTokenEnc = encrypt(token);

  const conn = await platformPrisma.tenantErConnection.upsert({
    where: { tenantId },
    update: { baseUrl, apiTokenEnc, status: "unchecked" },
    create: { tenantId, baseUrl, apiTokenEnc, status: "unchecked" },
    select: { id: true, baseUrl: true, status: true, recurringEnabled: true },
  });

  console.log(`✅ ER connection set for tenant ${tenant.slug} (${tenantId})`);
  console.log(`   baseUrl=${conn.baseUrl}  status=${conn.status}  recurring=${conn.recurringEnabled}`);
  console.log(`   token stored encrypted in tenant_er_connections.api_token_enc (not logged).`);
  console.log(`   Validate via Settings → Test connection (flips status to verified).`);
}

main()
  .catch((e) => {
    console.error("✗ " + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(() => platformPrisma.$disconnect());
