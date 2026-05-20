import { z } from "zod";
import { patrolStateSchema, patrolTypeSchema } from "./enums";

export const patrolSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erPatrolId: z.string().min(1),
  serialNumber: z.string().nullable(),
  title: z.string().max(500).nullable(),
  patrolType: patrolTypeSchema,
  state: patrolStateSchema,
  boatName: z.string().max(255).nullable(),
  startTime: z.coerce.date().nullable(),
  endTime: z.coerce.date().nullable(),
  totalDistanceKm: z.number().min(0).nullable(),
  totalHours: z.number().min(0).nullable(),
  areaName: z.string().max(255).nullable(),
  areaBoundaryId: z.string().cuid().nullable(),
  areaDerivedAt: z.coerce.date().nullable(),
  syncedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
