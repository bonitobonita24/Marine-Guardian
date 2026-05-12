import { prisma } from "@marine-guardian/db";

export interface ExportAuditArgs {
  userId: string;
  tenantId: string;
  entity: string;
  format: "csv" | "pdf";
  filterHash: string;
  rowCount: number;
}

/**
 * Write an immutable AuditLog row for a data-export event.
 *
 * security.md L5 — every data egress is logged. `entityId` stores the filter
 * hash so two exports with identical filters can be correlated, and
 * `changesJson` captures format + row count for reporting.
 */
export async function writeExportAudit(args: ExportAuditArgs): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: "DATA_EXPORT",
      userId: args.userId,
      tenantId: args.tenantId,
      entityType: args.entity,
      entityId: args.filterHash,
      changesJson: { format: args.format, rowCount: args.rowCount },
    },
  });
}
