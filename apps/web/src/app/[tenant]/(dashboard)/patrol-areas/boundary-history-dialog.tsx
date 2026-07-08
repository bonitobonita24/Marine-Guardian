"use client";

// "History / Rollback" dialog for a single official municipal land/water
// boundary row. Lists prior geometry snapshots (most recent first) and lets
// an admin revert to any of them via municipality.revertBoundaryGeometry.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";

type BoundaryKind = "land" | "water";

const BOUNDARY_KIND_LABELS: Record<BoundaryKind, string> = {
  land: "Land",
  water: "Water",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  municipalityId: string;
  municipalityName: string;
  kind: BoundaryKind;
  onReverted?: () => void;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BoundaryHistoryDialog({
  open,
  onOpenChange,
  municipalityId,
  municipalityName,
  kind,
  onReverted,
}: Props) {
  const utils = trpc.useUtils();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ enqueuedJobs: number } | null>(
    null,
  );

  const snapshotsQuery = trpc.municipality.listBoundarySnapshots.useQuery(
    { municipalityId, kind },
    { enabled: open },
  );

  const revertBoundary = trpc.municipality.revertBoundaryGeometry.useMutation({
    onSuccess: (data) => {
      setSuccess({ enqueuedJobs: data.enqueuedJobs });
      setError(null);
      setConfirmingId(null);
      void utils.municipality.listBoundarySnapshots.invalidate({
        municipalityId,
        kind,
      });
      onReverted?.();
    },
    onError: (err) => {
      setError(err.message);
      setConfirmingId(null);
    },
  });

  function handleClose() {
    onOpenChange(false);
    setConfirmingId(null);
    setError(null);
    setSuccess(null);
    revertBoundary.reset();
  }

  function handleRevertClick(snapshotId: string) {
    setError(null);
    setSuccess(null);
    setConfirmingId(snapshotId);
  }

  function handleConfirmRevert(snapshotId: string) {
    revertBoundary.mutate({ snapshotId });
  }

  const snapshots = snapshotsQuery.data ?? [];
  const kindLabel = BOUNDARY_KIND_LABELS[kind].toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) onOpenChange(true);
        else handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Boundary history</DialogTitle>
          <DialogDescription>
            {municipalityName} — {BOUNDARY_KIND_LABELS[kind]} boundary versions
          </DialogDescription>
        </DialogHeader>

        {success != null && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Reverted {municipalityName} {kindLabel} boundary — {success.enqueuedJobs}{" "}
            re-derivation job{success.enqueuedJobs === 1 ? "" : "s"} queued.
          </p>
        )}

        {error != null && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {snapshotsQuery.isLoading ? (
            <div
              data-testid="boundary-history-loading"
              className="space-y-2 rounded-md border p-4"
            >
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
              No prior versions.
            </p>
          ) : (
            snapshots.map((s) => (
              <div
                key={s.id}
                data-testid="boundary-history-row"
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.createdAt)} · Replaced by{" "}
                    {s.replacedByName ?? "—"}
                  </p>
                </div>
                {confirmingId === s.id ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      data-testid="boundary-history-confirm-revert"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        handleConfirmRevert(s.id);
                      }}
                      disabled={revertBoundary.isPending}
                    >
                      {revertBoundary.isPending ? "Reverting…" : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setConfirmingId(null);
                      }}
                      disabled={revertBoundary.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    data-testid="boundary-history-revert-button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      handleRevertClick(s.id);
                    }}
                    disabled={!s.hasGeometry && kind === "land"}
                    title={
                      !s.hasGeometry && kind === "land"
                        ? "This snapshot has no prior land geometry to revert to."
                        : undefined
                    }
                  >
                    Revert to this
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
