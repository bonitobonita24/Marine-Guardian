import { z } from "zod";

export const observationSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erObservationId: z.string().min(1),
  subjectId: z.string().cuid().nullable(),
  locationLat: z.number().min(-90).max(90),
  locationLon: z.number().min(-180).max(180),
  recordedAt: z.coerce.date(),
  sourceName: z.string().max(255).nullable(),
  additionalJson: z.record(z.unknown()).nullable(),
  syncedAt: z.coerce.date(),
});
