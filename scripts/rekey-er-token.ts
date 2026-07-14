#!/usr/bin/env tsx
/**
 * rekey-er-token.ts — re-encrypt tenant ER API tokens from an OLD ENCRYPTION_KEY
 * to the CURRENT ENCRYPTION_KEY.
 *
 * WHY THIS EXISTS
 * The staging data-first validation gate (deploy/staging-refresh-and-deploy.sh)
 * wipes staging's DB and reloads it from a PRODUCTION copy on every run. That
 * copy carries `tenant_er_connections.api_token_enc` ciphertext that was
 * encrypted with PROD's ENCRYPTION_KEY. Staging's app runs with a DIFFERENT
 * ENCRYPTION_KEY, so it cannot decrypt those tokens → ER sync fails with
 * "unable to authenticate data". This script re-keys them so staging can
 * harvest again. It is baked into the gate as a post-refresh step, so the
 * fix is durable across every refresh (not a one-off).
 *
 * The token is AES-256-GCM, base64(iv[12] + authTag[16] + ciphertext), exactly
 * the format written by @marine-guardian/db `encrypt()` / `decrypt()`. This
 * script reimplements the crypto inline so it can hold BOTH keys at once
 * (those helpers read a single key from ENCRYPTION_KEY at import time).
 *
 * SAFETY / IDEMPOTENCY
 *   - For each row it FIRST tries to decrypt with the current key. If that
 *     works, the row is already re-keyed → left untouched. So re-running is a
 *     no-op and running it against prod-keyed OR already-staging-keyed data is
 *     safe.
 *   - Only rows that decrypt with the OLD key (and not the current key) are
 *     re-encrypted. Rows that decrypt with neither are reported and skipped
 *     (never corrupted).
 *   - Token plaintext is NEVER logged.
 *
 * ENV
 *   ENCRYPTION_KEY      — REQUIRED. The CURRENT key (destination — the key the
 *                         target env's app runs with). 64 hex chars (32 bytes).
 *   OLD_ENCRYPTION_KEY  — REQUIRED. The key the ciphertext is currently under
 *                         (source — e.g. prod's key). 64 hex chars.
 *   DATABASE_URL        — REQUIRED. Points at the DB to re-key.
 *
 * USAGE (host-side, via the same tunnel the gate opens for migrations):
 *   NODE_PATH="$REPO/packages/db/node_modules" \
 *     ENCRYPTION_KEY=<current> OLD_ENCRYPTION_KEY=<old> DATABASE_URL=<url> \
 *     pnpm --filter @marine-guardian/jobs exec tsx ../../scripts/rekey-er-token.ts
 *
 * Exit code is always 0 for "nothing to do" / "all re-keyed". It is non-zero
 * only on a hard failure (missing env, DB error) — a row that decrypts with
 * neither key is a WARNING, not a fatal (the gate should still proceed).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { platformPrisma } from "@marine-guardian/db";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function keyBuf(hex: string): Buffer {
  const b = Buffer.from(hex, "hex");
  if (b.length !== 32) {
    throw new Error(`Expected a 32-byte (64 hex char) key, got ${b.length} bytes`);
  }
  return b;
}

function decryptWith(ciphertext: string, key: Buffer): string {
  const buffer = Buffer.from(ciphertext, "base64");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

function encryptWith(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function tryDecrypt(ciphertext: string, key: Buffer): string | null {
  try {
    return decryptWith(ciphertext, key);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const currentHex = process.env.ENCRYPTION_KEY;
  const oldHex = process.env.OLD_ENCRYPTION_KEY;
  if (!currentHex) throw new Error("ENCRYPTION_KEY (current/destination key) is required.");
  if (!oldHex) throw new Error("OLD_ENCRYPTION_KEY (source key) is required.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const currentKey = keyBuf(currentHex);
  const oldKey = keyBuf(oldHex);

  if (currentHex === oldHex) {
    console.log("• ENCRYPTION_KEY === OLD_ENCRYPTION_KEY — nothing to re-key (keys identical).");
    return;
  }

  const rows = await platformPrisma.tenantErConnection.findMany({
    select: { id: true, tenantId: true, apiTokenEnc: true },
  });
  console.log(`• ${rows.length} tenant_er_connections row(s) to inspect`);

  let rekeyed = 0;
  let alreadyOk = 0;
  let unreadable = 0;

  for (const row of rows) {
    // Already under the current key? Leave it — makes this idempotent.
    if (tryDecrypt(row.apiTokenEnc, currentKey) !== null) {
      alreadyOk++;
      continue;
    }
    // Decryptable with the old key? Re-encrypt under the current key.
    const plaintext = tryDecrypt(row.apiTokenEnc, oldKey);
    if (plaintext === null) {
      unreadable++;
      console.warn(`  ⚠ tenant ${row.tenantId}: token decrypts with neither key — left untouched`);
      continue;
    }
    const reEnc = encryptWith(plaintext, currentKey);
    await platformPrisma.tenantErConnection.update({
      where: { id: row.id },
      data: { apiTokenEnc: reEnc },
    });
    rekeyed++;
    console.log(`  ✓ tenant ${row.tenantId}: token re-keyed to current key`);
  }

  console.log(`• done: re-keyed=${rekeyed} already-current=${alreadyOk} unreadable=${unreadable}`);
  // Unreadable rows are a warning, not a fatal — the gate proceeds regardless.
}

main()
  .catch((e) => {
    console.error("✗ rekey-er-token: " + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  })
  .finally(() => platformPrisma.$disconnect());
