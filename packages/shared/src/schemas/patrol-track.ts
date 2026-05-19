import { z } from "zod";
import { trackSourceSchema } from "./enums";

export const patrolTrackSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  patrolId: z.string().cuid(),
  subjectId: z.string().nullable(),
  since: z.coerce.date(),
  until: z.coerce.date(),
  trackGeojson: z.record(z.unknown()),
  hasTimestamps: z.boolean().default(false),
  pointCount: z.number().int().nonnegative().default(0),
  lastTrackTime: z.coerce.date().nullable(),
  patrolEnded: z.boolean().default(false),
  source: trackSourceSchema,
  fetchedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const listPatrolTracksInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  patrolId: z.string().optional(),
  patrolEnded: z.boolean().optional(),
});

export const getPatrolTrackByIdInputSchema = z.object({
  id: z.string(),
});

export const getPatrolTrackByPatrolIdInputSchema = z.object({
  patrolId: z.string(),
});
