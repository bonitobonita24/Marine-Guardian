import type { PatrolType } from "./enums";

export interface PatrolArea {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  patrolType: PatrolType;
  polygonGeojson: Record<string, unknown>;
  colorHex: string;
  createdBy: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
