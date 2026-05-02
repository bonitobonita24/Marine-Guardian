export { prisma, platformPrisma } from "./client.js";
export type { ExtendedPrismaClient } from "./client.js";
export { writeAuditLog } from "./helpers/audit.js";
export { withTenant, setCurrentTenantId, getCurrentTenantId } from "./helpers/rls.js";
export { tenantGuardExtension } from "./middleware/tenant-guard.js";
export { encryptionExtension, encrypt, decrypt } from "./middleware/encryption.js";
