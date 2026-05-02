export interface SubjectGroup {
  id: string;
  tenantId: string;
  erGroupId: string;
  name: string;
  parentId: string | null;
  subjectCount: number;
  isVisible: boolean;
  syncedAt: Date;
}
