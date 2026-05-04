export interface PatrolSchedule {
  id: string;
  tenantId: string;
  patrolAreaId: string;
  rangerUserId: string | null;
  rangerName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
