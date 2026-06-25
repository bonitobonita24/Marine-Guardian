"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivePatrol } from "./active-patrols";
import { elapsedHm, formatKm, patrolTypeMeta } from "./lib";

/**
 * WAR ROOM patrol detail modal.
 *
 * A lightweight read-only dialog that surfaces the fields already present on an
 * active-patrols row (no new tRPC query). Opened when an operator clicks a row
 * in the Active Patrols table. Reuses the shared War Room helpers so the
 * displayed values match the table exactly.
 */
export function PatrolDetailModal({
  patrol,
  now,
  onClose,
}: {
  patrol: ActivePatrol | null;
  now?: Date | undefined;
  onClose: () => void;
}) {
  const open = patrol !== null;
  const meta = patrol ? patrolTypeMeta(patrol.patrolType) : null;
  const km = patrol ? (patrol.computedDistanceKm ?? patrol.totalDistanceKm) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Patrol Detail</DialogTitle>
          <DialogDescription>
            Summary of the selected patrol from the War Room.
          </DialogDescription>
        </DialogHeader>

        {patrol && meta && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 pt-2 text-sm">
            <dt className="font-medium text-muted-foreground">Type</dt>
            <dd className="inline-flex items-center gap-1.5">
              <meta.icon
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>{meta.label}</span>
            </dd>

            <dt className="font-medium text-muted-foreground">Area</dt>
            <dd>{patrol.areaName ?? "—"}</dd>

            <dt className="font-medium text-muted-foreground">Leader</dt>
            <dd>{patrol.leaderName ?? "—"}</dd>

            <dt className="font-medium text-muted-foreground">Start time</dt>
            <dd>
              {patrol.startTime === null
                ? "—"
                : new Date(patrol.startTime).toLocaleString()}
            </dd>

            <dt className="font-medium text-muted-foreground">Elapsed</dt>
            <dd className="tabular-nums">{elapsedHm(patrol.startTime, now)}</dd>

            <dt className="font-medium text-muted-foreground">Distance</dt>
            <dd className="tabular-nums">
              {km === null ? "—" : `${formatKm(km)} km`}
            </dd>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
