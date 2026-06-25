"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AlertItem } from "./alerts-panel";
import { priorityLabel, relativeShort } from "./lib";

/**
 * WAR ROOM alert detail modal (2026-06-25, T5).
 *
 * A lightweight read-only dialog surfacing the fields already present on a fired
 * alert row (no new tRPC query). Opened when an operator clicks an alert row in
 * the Alerts & Escalations panel. Shows the rule name, fired time, priority,
 * acknowledgement state, and — when the alert is linked to an event — a button
 * that opens the shared EventDetailModal.
 */
export function AlertDetailModal({
  alert,
  now,
  onClose,
  onOpenEvent,
}: {
  alert: AlertItem | null;
  now?: Date | undefined;
  onClose: () => void;
  /** Open the linked event's detail modal. Only rendered when alert.eventId is set. */
  onOpenEvent?: (eventId: string) => void;
}) {
  const open = alert !== null;
  const eventId = alert?.eventId ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alert Detail</DialogTitle>
          <DialogDescription>
            Summary of the selected alert from the War Room.
          </DialogDescription>
        </DialogHeader>

        {alert && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 pt-2 text-sm">
            <dt className="font-medium text-muted-foreground">Rule</dt>
            <dd>{alert.ruleName || "—"}</dd>

            <dt className="font-medium text-muted-foreground">Event</dt>
            <dd>{alert.eventTitle || "—"}</dd>

            <dt className="font-medium text-muted-foreground">Priority</dt>
            <dd>{priorityLabel(alert.matchedPriority)}</dd>

            <dt className="font-medium text-muted-foreground">Fired</dt>
            <dd className="tabular-nums">
              {new Date(alert.firedAt).toLocaleString()}{" "}
              <span className="text-muted-foreground">
                ({relativeShort(alert.firedAt, now)} ago)
              </span>
            </dd>

            <dt className="font-medium text-muted-foreground">Status</dt>
            <dd>
              {alert.acknowledgedAt != null ? (
                <span>
                  Acknowledged{" "}
                  <span className="text-muted-foreground tabular-nums">
                    ({relativeShort(alert.acknowledgedAt, now)} ago)
                  </span>
                </span>
              ) : (
                <span className="font-medium text-destructive">
                  Unacknowledged
                </span>
              )}
            </dd>
          </dl>
        )}

        {eventId !== null && onOpenEvent !== undefined && (
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenEvent(eventId);
              }}
            >
              View linked event
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
