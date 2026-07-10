import { z } from "zod";
import { router } from "../trpc";
import { tenantProcedure } from "../middleware/tenant";
import { matrixProcedure } from "../middleware/rbac";
import { prisma } from "@marine-guardian/db";

// Single source of truth for notification list filters.
// Re-used by the /api/exports/notifications Route Handler (SS-4).
export const notificationListFilters = z.object({
  isRead: z.boolean().optional(),
  notificationType: z.enum(["critical", "warning", "info", "system"]).optional(),
});

// v2 spec (docs/v2/PRODUCT.md L480-484): per-user read state lives on
// NotificationRecipient, NOT on Notification. Each procedure here queries
// NotificationRecipient WHERE userId=ctx.userId JOIN Notification (tenant-scoped
// via Notification.tenantId). Items are returned in a FLATTENED shape so the UI
// reads `n.title` not `n.notification.title`.
export const notificationRouter = router({
  list: matrixProcedure(tenantProcedure, "notifications", "view")
    .input(
      notificationListFilters.extend({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Build the notification-side filter (tenantId always required; optional
      // notificationType narrows the join). Used twice if notificationType set.
      const notificationFilter = {
        tenantId: ctx.tenantId,
        ...(input.notificationType !== undefined
          ? { notificationType: input.notificationType }
          : {}),
      };

      const recipients = await prisma.notificationRecipient.findMany({
        where: {
          userId: ctx.userId,
          ...(input.isRead !== undefined ? { isRead: input.isRead } : {}),
          notification: notificationFilter,
        },
        take: input.limit + 1,
        ...(input.cursor !== undefined ? { cursor: { id: input.cursor } } : {}),
        orderBy: { notification: { createdAt: "desc" } },
        include: {
          notification: {
            include: {
              event: { select: { id: true, title: true, state: true } },
              patrol: { select: { id: true, title: true, serialNumber: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (recipients.length > input.limit) {
        const next = recipients.pop();
        nextCursor = next?.id;
      }

      // Flattened shape: top-level fields come from the joined Notification;
      // recipient-specific fields (id, isRead, readAt, notificationId) remain.
      // The UI mutates by recipient.id — we surface it as `id` for ergonomics.
      const items = recipients.map((r) => ({
        id: r.id,
        notificationId: r.notificationId,
        isRead: r.isRead,
        readAt: r.readAt,
        // notification fields, flattened:
        tenantId: r.notification.tenantId,
        title: r.notification.title,
        message: r.notification.message,
        notificationType: r.notification.notificationType,
        alertRuleId: r.notification.alertRuleId,
        eventId: r.notification.eventId,
        patrolId: r.notification.patrolId,
        subjectId: r.notification.subjectId,
        createdAt: r.notification.createdAt,
        event: r.notification.event,
        patrol: r.notification.patrol,
      }));

      return { items, nextCursor };
    }),

  // Marks ONE NotificationRecipient row as read. Ownership enforced via userId
  // in WHERE; tenant scoping enforced via notification.tenantId join.
  // input.id is NotificationRecipient.id (NOT Notification.id) — the UI passes
  // the flattened item.id which we surface as recipient.id in list().
  markRead: matrixProcedure(tenantProcedure, "notifications", "update")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.notificationRecipient.updateMany({
        where: {
          id: input.id,
          userId: ctx.userId,
          notification: { tenantId: ctx.tenantId },
        },
        data: { isRead: true, readAt: new Date() },
      });
    }),

  // Bulk mark-all-read for the current user (tenant-scoped via join).
  markAllRead: matrixProcedure(tenantProcedure, "notifications", "update").mutation(async ({ ctx }) => {
    return prisma.notificationRecipient.updateMany({
      where: {
        userId: ctx.userId,
        isRead: false,
        notification: { tenantId: ctx.tenantId },
      },
      data: { isRead: true, readAt: new Date() },
    });
  }),

  // Unread badge in the sidebar polls this. Scoped to current user + tenant.
  unreadCount: matrixProcedure(tenantProcedure, "notifications", "view").query(async ({ ctx }) => {
    return prisma.notificationRecipient.count({
      where: {
        userId: ctx.userId,
        isRead: false,
        notification: { tenantId: ctx.tenantId },
      },
    });
  }),
});
