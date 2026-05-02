import { z } from "zod";
import { eventPrioritySchema, eventStateSchema } from "./enums";

export const eventSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  erEventId: z.string().min(1),
  serialNumber: z.string().nullable(),
  eventType: z.string().min(1).max(255),
  eventCategory: z.string().max(255).nullable(),
  priority: eventPrioritySchema,
  state: eventStateSchema,
  title: z.string().max(500).nullable(),
  locationLat: z.number().min(-90).max(90).nullable(),
  locationLon: z.number().min(-180).max(180).nullable(),
  time: z.coerce.date(),
  endTime: z.coerce.date().nullable(),
  reportedByName: z.string().max(255).nullable(),
  eventDetailsJson: z.record(z.unknown()).nullable(),
  notesJson: z.array(z.record(z.unknown())).nullable(),
  areaName: z.string().max(255).nullable(),
  syncedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
