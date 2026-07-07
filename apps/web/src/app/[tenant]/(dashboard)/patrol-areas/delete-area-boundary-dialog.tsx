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
import type { AreaBoundaryRow } from "./area-boundary-table";

interface Props {
  boundary: AreaBoundaryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteAreaBoundaryDialog({
  boundary,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();
  const [feedback, setFeedback] = useState<
    | { kind: "success"; enqueued: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  const del = trpc.areaBoundary.delete.useMutation({
    onSuccess: (data) => {
      setFeedback({ kind: "success", enqueued: data.fanOut.enqueued });
      void utils.areaBoundary.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function handleConfirm() {
    setFeedback(null);
    del.mutate({ id: boundary.id });
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete area boundary?</DialogTitle>
          <DialogDescription>
            Delete <strong>{boundary.name}</strong>. This fans out an
            area-rederive job for every Event, Patrol, and FuelEntry in this
            tenant. For large tenants this may take several minutes to
            complete as jobs flow through the 50/sec rate limiter.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "success" && (
          <p
            data-testid="delete-success"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Deleted — {feedback.enqueued} rederive job
            {feedback.enqueued === 1 ? "" : "s"} enqueued.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p data-testid="delete-error" className="text-sm text-destructive">
            {feedback.message}
          </p>
        )}
        <DialogFooter>
          {feedback?.kind === "success" ? (
            <Button
              data-testid="delete-success-close"
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
                variant="destructive"
                onClick={handleConfirm}
                disabled={del.isPending}
              >
                {del.isPending ? "Deleting…" : "Confirm Delete"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
