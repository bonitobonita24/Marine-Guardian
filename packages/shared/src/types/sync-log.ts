import type { SyncStatus, SyncType } from "./enums";

export interface SyncLog {
  id: string;
  tenantId: string;
  syncType: SyncType;
  status: SyncStatus;
  recordsSynced: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}
