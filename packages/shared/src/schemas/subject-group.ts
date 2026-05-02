import { z } from "zod";

export const subjectGroupSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erGroupId: z.string().min(1),
  name: z.string().min(1).max(255),
  parentId: z.string().cuid().nullable(),
  subjectCount: z.number().int().min(0),
  isVisible: z.boolean().default(true),
  syncedAt: z.coerce.date(),
});
