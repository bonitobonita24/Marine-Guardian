import type { AccompanyingEntityType, RangerType } from "./enums";

export interface AccompanyingRanger {
  id: string;
  tenantId: string;
  entityType: AccompanyingEntityType;
  entityId: string;
  rangerType: RangerType;
  registeredUserId: string | null;
  knownRangerId: string | null;
  freetextName: string | null;
  addedByUserId: string;
  createdAt: Date;
}
