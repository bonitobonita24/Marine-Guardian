import { z } from "zod";

export const auditLogSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid().nullable(),
  userId: z.string().cuid(),
  action: z.string().min(1).max(100),
  entity: z.string().min(1).max(100),
  entityId: z.string().min(1),
  changesJson: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
