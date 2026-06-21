export { prisma, platformPrisma } from "./client";
export type { ExtendedPrismaClient } from "./client";
export { Prisma } from "@prisma/client";
export type { PrismaClient } from "@prisma/client";
export { writeAuditLog } from "./helpers/audit";
export { withTenant, setCurrentTenantId, getCurrentTenantId } from "./helpers/rls";
export { tenantGuardExtension } from "./middleware/tenant-guard";
export { encryptionExtension, encrypt, decrypt } from "./middleware/encryption";
