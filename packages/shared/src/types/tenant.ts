export interface Tenant {
  id: string;
  name: string;
  slug: string;
  earthrangerUrl: string | null;
  earthrangerUsername: string | null;
  earthrangerPassword: string | null;
  earthrangerDasToken: string | null;
  earthrangerTrackToken: string | null;
  timezone: string;
  description: string | null;
  isActive: boolean;
  syncFrequencySeconds: number;
  createdAt: Date;
  updatedAt: Date;
}
