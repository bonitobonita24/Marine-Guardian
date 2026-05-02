import { z } from "zod";

export const patrolSegmentSchema = z.object({
  id: z.string().cuid(),
  patrolId: z.string().cuid(),
  erSegmentId: z.string().min(1),
  scheduledStart: z.coerce.date().nullable(),
  scheduledEnd: z.coerce.date().nullable(),
  actualStart: z.coerce.date().nullable(),
  actualEnd: z.coerce.date().nullable(),
  leaderName: z.string().max(255).nullable(),
  leaderErId: z.string().nullable(),
  syncedAt: z.coerce.date(),
});
