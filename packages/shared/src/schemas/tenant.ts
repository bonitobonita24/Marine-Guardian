import { z } from "zod";

export const tenantSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
  earthrangerUrl: z.string().url().nullable(),
  earthrangerUsername: z.string().nullable(),
  earthrangerPassword: z.string().nullable(),
  earthrangerDasToken: z.string().nullable(),
  earthrangerTrackToken: z.string().nullable(),
  timezone: z.string().min(1).default("UTC"),
  description: z.string().max(1000).nullable(),
  isActive: z.boolean().default(true),
  syncFrequencySeconds: z.number().int().min(60).max(86400).default(300),
  currency: z.string().length(3).default("IDR"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createTenantSchema = tenantSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTenantSchema = createTenantSchema.partial();
