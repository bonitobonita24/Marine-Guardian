import { z } from "zod";

export const subjectSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erSubjectId: z.string().min(1),
  name: z.string().min(1).max(255),
  subjectType: z.string().min(1).max(100),
  subjectSubtype: z.string().max(100).nullable(),
  isActive: z.boolean().default(true),
  region: z.string().max(255).nullable(),
  sex: z.string().max(20).nullable(),
  lastPositionLat: z.number().min(-90).max(90).nullable(),
  lastPositionLon: z.number().min(-180).max(180).nullable(),
  lastPositionAt: z.coerce.date().nullable(),
  additionalJson: z.record(z.unknown()).nullable(),
  syncedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
