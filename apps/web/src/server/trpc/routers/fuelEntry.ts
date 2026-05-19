import { TRPCError } from "@trpc/server";
import {
  createFuelEntryInputSchema,
  deleteFuelEntryInputSchema,
  getFuelEntryByIdInputSchema,
  listFuelEntriesInputSchema,
  updateFuelEntryInputSchema,
} from "@marine-guardian/shared/schemas";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import {
  adminProcedure,
  coordinatorProcedure,
  operatorProcedure,
} from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

/**
 * FuelEntry router — full CRUD lifecycle per v2 PRODUCT.md §167-196, §492-493.
 *
 * RBAC matrix (per spec §405-408):
 *   fuel.log        : operator+    (operatorProcedure on create)
 *   fuel.edit_own   : operator+    (operatorProcedure on update, with ownership check)
 *   fuel.edit_any   : coordinator+ (coordinatorProcedure on updateAny)
 *   fuel.delete     : site_admin+  (adminProcedure on delete)
 *
 * Tenant scoping: every where-clause includes tenantId explicitly (defense
 * in depth alongside the L6 Prisma guardrail). cross-tenant getById returns
 * null via findFirst.
 *
 * Currency snapshot (spec §196): create reads the tenant's current currency
 * and persists it on the row. Historical entries keep their original currency
 * even if the tenant later changes the configured value.
 */
export const fuelEntryRouter = router({
  list: tenantProcedure
    .input(listFuelEntriesInputSchema)
    .query(async ({ ctx, input }) => {
      const items = await prisma.fuelEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.areaBoundaryId !== undefined
            ? { areaBoundaryId: input.areaBoundaryId }
            : {}),
          ...(input.dateReceivedFrom !== undefined ||
          input.dateReceivedTo !== undefined
            ? {
                dateReceived: {
                  ...(input.dateReceivedFrom !== undefined
                    ? { gte: input.dateReceivedFrom }
                    : {}),
                  ...(input.dateReceivedTo !== undefined
                    ? { lte: input.dateReceivedTo }
                    : {}),
                },
              }
            : {}),
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { dateReceived: "desc" },
        include: {
          loggedBy: { select: { id: true, fullName: true } },
          areaBoundary: { select: { id: true, name: true } },
        },
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  getById: tenantProcedure
    .input(getFuelEntryByIdInputSchema)
    .query(async ({ ctx, input }) => {
      return prisma.fuelEntry.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          loggedBy: { select: { id: true, fullName: true } },
          areaBoundary: { select: { id: true, name: true } },
        },
      });
    }),

  create: operatorProcedure
    .input(createFuelEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Per spec §196: snapshot the tenant's current currency onto the row.
      const tenant = await prisma.tenant.findFirst({
        where: { id: ctx.tenantId },
        select: { currency: true },
      });
      if (!tenant) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Tenant not found.",
        });
      }
      return prisma.fuelEntry.create({
        data: {
          tenantId: ctx.tenantId,
          areaName: input.areaName,
          areaBoundaryId: input.areaBoundaryId,
          dateReceived: input.dateReceived,
          liters: input.liters,
          totalPrice: input.totalPrice,
          currency: tenant.currency,
          ...(input.receiptPhotoUrl !== undefined
            ? { receiptPhotoUrl: input.receiptPhotoUrl }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          loggedByUserId: ctx.userId,
        },
      });
    }),

  /**
   * update — operator+ may update their OWN entries only (fuel.edit_own).
   * Coordinator+ should use `updateAny` to edit entries owned by others.
   * Ownership check happens BEFORE the write to avoid leaking a row's
   * existence cross-tenant or cross-user (returns NOT_FOUND uniformly).
   */
  update: operatorProcedure
    .input(updateFuelEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.fuelEntry.findFirst({
        where: { id: input.id, tenantId: ctx.tenantId },
        select: { loggedByUserId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (existing.loggedByUserId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Use updateAny to edit another user's fuel entry.",
        });
      }
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      return prisma.fuelEntry.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  updateAny: coordinatorProcedure
    .input(updateFuelEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      return prisma.fuelEntry.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data,
      });
    }),

  delete: adminProcedure
    .input(deleteFuelEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.fuelEntry.deleteMany({
        where: { id: input.id, tenantId: ctx.tenantId },
      });
    }),
});
