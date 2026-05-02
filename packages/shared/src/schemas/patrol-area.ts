import { z } from "zod";
import { patrolTypeSchema } from "./enums";

export const patrolAreaSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(255),
  polygonGeojson: z.record(z.unknown()),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  patrolType: patrolTypeSchema,
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createPatrolAreaSchema = patrolAreaSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePatrolAreaSchema = createPatrolAreaSchema.partial().omit({
  tenantId: true,
});
