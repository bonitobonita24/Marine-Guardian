export interface EventType {
  id: string;
  tenantId: string;
  erEventtypeId: string;
  value: string;
  display: string;
  category: string | null;
  defaultPriority: number;
  iconId: string | null;
  isActive: boolean;
  schemaJson: Record<string, unknown> | null;
  syncedAt: Date;
}
