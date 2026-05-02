import { z } from "zod";

export const patrolScheduleSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  patrolAreaId: z.string().cuid(),
  assignedUserId: z.string().cuid().nullable(),
  assignedRangerName: z.string().max(255).nullable(),
  scheduledDate: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notes: z.string().max(1000).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createPatrolScheduleSchema = patrolScheduleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePatrolScheduleSchema = createPatrolScheduleSchema.partial().omit({
  tenantId: true,
});
