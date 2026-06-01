import type { Prisma, PrismaClient } from "@prisma/client";

interface AuditLogEntry {
  tenantId: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changesJson?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  // v2 fields — optional, existing call sites unchanged
  actingUserId?: string | null;
  impersonatedAsTenantId?: string | null;
  severity?: "info" | "warning" | "high" | "critical";
  userAgent?: string | null;
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient | PrismaClient,
  entry: AuditLogEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.changesJson != null
        ? { changesJson: entry.changesJson }
        : {}),
      ipAddress: entry.ipAddress ?? null,
      actingUserId: entry.actingUserId ?? null,
      impersonatedAsTenantId: entry.impersonatedAsTenantId ?? null,
      ...(entry.severity != null ? { severity: entry.severity } : {}),
      userAgent: entry.userAgent ?? null,
    },
  });
}
