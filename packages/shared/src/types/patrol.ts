import type { PatrolState, PatrolType } from "./enums";

export interface Patrol {
  id: string;
  tenantId: string;
  erPatrolId: string;
  serialNumber: string | null;
  title: string | null;
  patrolType: PatrolType;
  state: PatrolState;
  boatName: string | null;
  startTime: Date | null;
  endTime: Date | null;
  totalDistanceKm: number | null;
  totalHours: number | null;
  areaName: string | null;
  areaBoundaryId: string | null;
  areaDerivedAt: Date | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
