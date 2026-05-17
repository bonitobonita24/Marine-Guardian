// notification-store.ts
//
// In-memory Zustand store fed by useNotificationStream and read by the
// notification bell UI. The durable copy lives in Postgres via the
// notification tRPC router — this store is realtime ephemera that drives
// the bell badge between page loads.

import { create } from "zustand";

export type Notification = {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type NotificationStoreState = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clear: () => void;
};

const countUnread = (notifications: Notification[]): number =>
  notifications.reduce((acc, n) => (n.read ? acc : acc + 1), 0);

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) => {
    set((state) => {
      const notifications = [notification, ...state.notifications];
      return { notifications, unreadCount: countUnread(notifications) };
    });
  },
  markAsRead: (id) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return { notifications, unreadCount: countUnread(notifications) };
    });
  },
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
  clear: () => {
    set({ notifications: [], unreadCount: 0 });
  },
}));
