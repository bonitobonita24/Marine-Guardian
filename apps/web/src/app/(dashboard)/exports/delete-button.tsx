"use client";

// Delete action — admin-only button for terminal (failed/ready) ReportExport
// rows. Mirrors retry-button.tsx (5.3d) shape exactly: useSession role gate +
// shadcn Dialog confirm + trpc mutation + utils.reportExport.list.invalidate()
// on success + inline error. Wraps trpc.reportExport.delete, which also
// best-effort clears any lingering BullMQ job for the id server-side.

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

interface DeleteButtonProps {
  exportId: string;
}

export function DeleteButton({ exportId }: DeleteButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "error"; message: string } | null
  >(null);
  const utils = trpc.useUtils();

  const roles = session?.user.roles ?? [];
  const canDelete =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("administrator");

  const del = trpc.reportExport.delete.useMutation({
    onSuccess: () => {
      void utils.reportExport.list.invalidate();
      setOpen(false);
      setFeedback(null);
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canDelete) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    del.mutate({ id: exportId });
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    del.reset();
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
        data-testid="delete-export-button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete export?</DialogTitle>
          <DialogDescription>
            Permanently removes this export record and its generated file.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={del.isPending}
          >
            Cancel
          </Button>
          <Button
            data-testid="delete-export-confirm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Confirm Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
