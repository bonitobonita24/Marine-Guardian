import { z } from "zod";

/**
 * FuelEntry — Command Center native (per v2 PRODUCT.md §492).
 *
 * Tracks bulk fuel allocations per municipal area. Both `area_name` (free-text
 * snapshot at logging time) and `area_boundary_id` (nullable FK) are stored
 * for resilience: if the boundary is later renamed or deleted, the name
 * survives on the row.
 *
 * Numeric fields (`liters`, `total_price`) are PostgreSQL decimal and serialized
 * as strings by Prisma — schema uses `z.string()` to mirror that wire shape;
 * presentation layer parses to Number. Validation enforces > 0.
 */
export const fuelEntrySchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid(),
  areaName: z.string().min(1).max(200),
  areaBoundaryId: z.string().cuid().nullable(),
  dateReceived: z.coerce.date(),
  liters: z.string(),
  totalPrice: z.string(),
  currency: z.string().min(1).max(10),
  receiptPhotoUrl: z.string().max(2048).nullable(),
  notes: z.string().max(2000).nullable(),
  loggedByUserId: z.string().cuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const listFuelEntriesInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  areaBoundaryId: z.string().optional(),
  dateReceivedFrom: z.coerce.date().optional(),
  dateReceivedTo: z.coerce.date().optional(),
});

export const getFuelEntryByIdInputSchema = z.object({
  id: z.string(),
});

/**
 * Decimal-as-string for `liters` / `totalPrice` keeps Postgres precision intact
 * from the client → Prisma boundary. UI input components send the value as a
 * string already (e.g. "12.345"). Validation: must parse as a positive number.
 */
const positiveDecimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a positive decimal string")
  .refine((v) => Number(v) > 0, "Must be greater than 0");

export const createFuelEntryInputSchema = z.object({
  areaName: z.string().min(1).max(200),
  areaBoundaryId: z.string().cuid().nullable(),
  dateReceived: z.coerce.date(),
  liters: positiveDecimalString,
  totalPrice: positiveDecimalString,
  receiptPhotoUrl: z.string().max(2048).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateFuelEntryInputSchema = z.object({
  id: z.string(),
  areaName: z.string().min(1).max(200).optional(),
  areaBoundaryId: z.string().cuid().nullable().optional(),
  dateReceived: z.coerce.date().optional(),
  liters: positiveDecimalString.optional(),
  totalPrice: positiveDecimalString.optional(),
  receiptPhotoUrl: z.string().max(2048).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const deleteFuelEntryInputSchema = z.object({
  id: z.string(),
});

export const fuelPeriodGrainSchema = z.enum([
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);
export type FuelPeriodGrain = z.infer<typeof fuelPeriodGrainSchema>;

/**
 * Input for the cross-area /fuel analytics page. areaBoundaryIds undefined or
 * empty → no filter (all tenant areas). dateTo is exclusive.
 */
export const fuelConsumptionAnalyticsInputSchema = z.object({
  areaBoundaryIds: z.array(z.string().cuid()).optional(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  periodGrain: fuelPeriodGrainSchema,
});
