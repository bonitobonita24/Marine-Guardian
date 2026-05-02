export interface Observation {
  id: string;
  tenantId: string;
  erObservationId: string;
  subjectId: string | null;
  locationLat: number;
  locationLon: number;
  recordedAt: Date;
  sourceName: string | null;
  additionalJson: Record<string, unknown> | null;
  syncedAt: Date;
}
