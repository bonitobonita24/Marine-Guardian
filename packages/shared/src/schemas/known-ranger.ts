import { z } from "zod";
import { knownRangerSourceSchema } from "./enums";

export const knownRangerSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erUserId: z.string().nullable(),
  displayName: z.string().min(1).max(255),
  source: knownRangerSourceSchema,
  isActive: z.boolean().default(true),
  syncedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createKnownRangerSchema = knownRangerSchema.omit({
  id: true,
  syncedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const updateKnownRangerSchema = createKnownRangerSchema.partial().omit({
  tenantId: true,
  source: true,
});
