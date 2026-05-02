export interface Subject {
  id: string;
  tenantId: string;
  erSubjectId: string;
  name: string;
  subjectType: string;
  subjectSubtype: string | null;
  isActive: boolean;
  region: string | null;
  sex: string | null;
  lastPositionLat: number | null;
  lastPositionLon: number | null;
  lastPositionAt: Date | null;
  additionalJson: Record<string, unknown> | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
