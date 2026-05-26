"use client";

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
import type { FuelEntryRow } from "./fuel-entry-table";

interface Props {
  entry: FuelEntryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteFuelEntryDialog({
  entry,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();
  const [feedback, setFeedback] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  const del = trpc.fuelEntry.delete.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.fuelEntry.list.invalidate();
      void utils.fuelEntry.consumptionAnalytics.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function handleConfirm() {
    setFeedback(null);
    del.mutate({ id: entry.id });
  }

  function handleClose() {
    setFeedback(null);
    del.reset();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    setFeedback(null);
    del.reset();
    onSuccess();
  }

  const areaLabel = entry.areaBoundary?.name ?? entry.areaName;
  const dateLabel =
    entry.dateReceived instanceof Date
      ? entry.dateReceived.toISOString().slice(0, 10)
      : new Date(entry.dateReceived).toISOString().slice(0, 10);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete fuel entry?</DialogTitle>
          <DialogDescription>
            Delete the fuel entry for <strong>{areaLabel}</strong> on{" "}
            <strong>{dateLabel}</strong>. This cannot be undone. Consumption
            analytics will refresh after the delete completes.
          </DialogDescription>
        </DialogHeader>

        {feedback?.kind === "success" && (
          <p
            data-testid="fuel-delete-success"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Deleted.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p
            data-testid="fuel-delete-error"
            className="text-sm text-destructive"
          >
            {feedback.message}
          </p>
        )}

        <DialogFooter>
          {feedback?.kind === "success" ? (
            <Button
              data-testid="fuel-delete-success-close"
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={del.isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="fuel-delete-submit"
                variant="destructive"
                onClick={handleConfirm}
                disabled={del.isPending}
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
