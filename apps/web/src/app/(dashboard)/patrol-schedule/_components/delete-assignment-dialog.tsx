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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  id: string;
  rangerName: string;
  areaName: string;
}

export function DeleteAssignmentDialog({
  open,
  onOpenChange,
  onSuccess,
  id,
  rangerName,
  areaName,
}: Props) {
  const utils = trpc.useUtils();
  const [feedback, setFeedback] = useState<{
    kind: "error";
    message: string;
  } | null>(null);

  const remove = trpc.patrolSchedule.delete.useMutation({
    onSuccess: () => {
      void utils.patrolSchedule.list.invalidate();
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function handleCancel() {
    setFeedback(null);
    remove.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete patrol assignment</DialogTitle>
          <DialogDescription>
            Delete the patrol assignment for {rangerName} ({areaName})? This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "error" && (
          <p
            data-testid="patrol-schedule-delete-error"
            className="text-sm text-destructive"
          >
            {feedback.message}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            data-testid="patrol-schedule-delete-cancel"
            onClick={handleCancel}
            disabled={remove.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="patrol-schedule-delete-confirm"
            onClick={() => {
              setFeedback(null);
              remove.mutate({ id });
            }}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
