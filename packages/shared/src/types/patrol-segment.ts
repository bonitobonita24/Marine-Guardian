export interface PatrolSegment {
  id: string;
  patrolId: string;
  erSegmentId: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  leaderName: string | null;
  leaderErId: string | null;
  syncedAt: Date;
}
