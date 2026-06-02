export { prisma, platformPrisma } from "./client";
export type { ExtendedPrismaClient } from "./client";
export type { PrismaClient, Prisma } from "@prisma/client";
export { writeAuditLog } from "./helpers/audit";
export { withTenant, setCurrentTenantId, getCurrentTenantId } from "./helpers/rls";
export { tenantGuardExtension } from "./middleware/tenant-guard";
export { encryptionExtension, encrypt, decrypt } from "./middleware/encryption";
