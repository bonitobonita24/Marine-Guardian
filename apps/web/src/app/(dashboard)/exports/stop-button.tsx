"use client";

// Stop/Cancel action — admin-only button for pending (queued/rendering)
// ReportExport rows. Mirrors retry-button.tsx (5.3d) shape exactly:
// useSession role gate + shadcn Dialog confirm + trpc mutation +
// utils.reportExport.list.invalidate() on success + inline error. Wraps
// trpc.reportExport.cancel, which best-effort removes the pending BullMQ
// job then flips the row to status=failed with an explicit "Cancelled by
// user" message (no dedicated "cancelled" enum value). Gives a stuck-
// "Queued" (or unwanted "Rendering") row an escape hatch.

import { useState } from "react";
import { useSession } from "next-auth/react";
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

interface StopButtonProps {
  exportId: string;
}

export function StopButton({ exportId }: StopButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "error"; message: string } | null
  >(null);
  const utils = trpc.useUtils();

  const roles = session?.user.roles ?? [];
  const canCancel =
    roles.includes("super_admin") || roles.includes("site_admin");

  const cancel = trpc.reportExport.cancel.useMutation({
    onSuccess: () => {
      void utils.reportExport.list.invalidate();
      setOpen(false);
      setFeedback(null);
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canCancel) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    cancel.mutate({ id: exportId });
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    cancel.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setOpen(true);
        } else {
          handleClose();
        }
      }}
    >
      <Button
        data-testid="stop-export-button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Stop
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stop this export?</DialogTitle>
          <DialogDescription>
            Cancels the pending render and marks this export as failed
            ("Cancelled by user"). Use this for exports stuck in the queue
            or a render you no longer want.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={cancel.isPending}
          >
            Cancel
          </Button>
          <Button
            data-testid="stop-export-confirm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? "Stopping…" : "Confirm Stop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
