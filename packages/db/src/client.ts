import { PrismaClient } from "@prisma/client";
import { tenantGuardExtension } from "./middleware/tenant-guard.js";
import { encryptionExtension } from "./middleware/encryption.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

export const prisma = basePrisma
  .$extends(encryptionExtension)
  .$extends(tenantGuardExtension);

export type ExtendedPrismaClient = typeof prisma;

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = basePrisma;
}

export const platformPrisma = new PrismaClient();
