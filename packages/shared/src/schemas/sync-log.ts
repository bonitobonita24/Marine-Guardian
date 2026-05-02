import { z } from "zod";
import { syncTypeSchema, syncStatusSchema } from "./enums";

export const syncLogSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  syncType: syncTypeSchema,
  status: syncStatusSchema,
  recordsProcessed: z.number().int().min(0),
  recordsFailed: z.number().int().min(0),
  errorMessage: z.string().max(2000).nullable(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});
