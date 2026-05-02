import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const ENCRYPTED_FIELDS = new Set([
  "earthrangerUrl",
  "earthrangerUsername",
  "earthrangerPassword",
  "earthrangerDasToken",
  "earthrangerTrackToken",
]);

function getEncryptionKey(): Buffer {
  const key = process.env["ENCRYPTION_KEY"];
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const buffer = Buffer.from(ciphertext, "base64");

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}

function encryptFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value !== "") {
      result[field] = encrypt(value);
    }
  }
  return result;
}

function decryptFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field];
    if (typeof value === "string" && value !== "") {
      try {
        result[field] = decrypt(value);
      } catch {
        // Value may not be encrypted yet (migration scenario)
      }
    }
  }
  return result;
}

function decryptResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }
  if (Array.isArray(result)) {
    return result.map((item: unknown) =>
      typeof item === "object" && item !== null
        ? decryptFields(item as Record<string, unknown>)
        : item,
    );
  }
  if (typeof result === "object") {
    return decryptFields(result as Record<string, unknown>);
  }
  return result;
}

export const encryptionExtension = Prisma.defineExtension({
  query: {
    tenant: {
      async $allOperations({ args, query, operation }) {
        const argsRecord = args as Record<string, unknown>;

        if (
          operation === "create" ||
          operation === "update" ||
          operation === "upsert"
        ) {
          if (argsRecord["data"] !== undefined) {
            argsRecord["data"] = encryptFields(
              argsRecord["data"] as Record<string, unknown>,
            );
          }
          if (operation === "upsert" && argsRecord["create"] !== undefined) {
            argsRecord["create"] = encryptFields(
              argsRecord["create"] as Record<string, unknown>,
            );
          }
        }

        const result: unknown = await query(args);
        return decryptResult(result);
      },
    },
  },
});
