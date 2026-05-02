import type { KnownRangerSource } from "./enums";

export interface KnownRanger {
  id: string;
  tenantId: string;
  name: string;
  source: KnownRangerSource;
  erSubjectId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
