import { z } from "zod";
import { boundarySourceSchema, geometryTypeSchema } from "./enums";

export const areaBoundarySchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)),
  region: z.string().min(1).max(200),
  source: boundarySourceSchema.default("custom"),
  geometryType: geometryTypeSchema,
  geometryGeojson: z.record(z.unknown()),
  isEnabled: z.boolean().default(true),
  overrideOfficial: z.boolean().default(false),
  arcgisReferenceId: z.string().max(200).nullable(),
  createdByUserId: z.string().cuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createAreaBoundarySchema = areaBoundarySchema.omit({
  id: true,
  tenantId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAreaBoundarySchema = createAreaBoundarySchema.partial();
