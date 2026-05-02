export interface AuditLog {
  id: string;
  tenantId: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changesJson: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}
