import { z } from "zod";
import { rangerTypeSchema, accompanyingEntityTypeSchema } from "./enums";

export const accompanyingRangerSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  entityType: accompanyingEntityTypeSchema,
  entityId: z.string().cuid(),
  rangerType: rangerTypeSchema,
  knownRangerId: z.string().cuid().nullable(),
  freeTextName: z.string().max(255).nullable(),
  createdAt: z.coerce.date(),
});

export const createAccompanyingRangerSchema = accompanyingRangerSchema.omit({
  id: true,
  createdAt: true,
});
