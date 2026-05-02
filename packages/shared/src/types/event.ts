import type { EventPriority, EventState } from "./enums";

export interface Event {
  id: string;
  tenantId: string;
  erEventId: string;
  serialNumber: string | null;
  eventType: string;
  eventCategory: string | null;
  priority: EventPriority;
  state: EventState;
  title: string | null;
  locationLat: number | null;
  locationLon: number | null;
  time: Date;
  endTime: Date | null;
  reportedByName: string | null;
  eventDetailsJson: Record<string, unknown> | null;
  notesJson: Record<string, unknown>[] | null;
  areaName: string | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
