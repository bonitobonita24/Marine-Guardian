import { z } from "zod";

export const eventTypeSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erEventtypeId: z.string().min(1),
  value: z.string().min(1).max(255),
  display: z.string().min(1).max(255),
  category: z.string().max(255).nullable(),
  defaultPriority: z.number().int().min(0).max(300),
  iconId: z.string().max(100).nullable(),
  isActive: z.boolean().default(true),
  schemaJson: z.record(z.unknown()).nullable(),
  syncedAt: z.coerce.date(),
});
