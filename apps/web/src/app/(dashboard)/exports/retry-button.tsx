"use client";

// 5.3d — admin-only retry button for ReportExport rows. Wraps
// trpc.reportExport.retry mutation in a shadcn Dialog confirm. Hidden from
// non-admin sessions client-side (and enforced server-side via adminProcedure).
// Mirrors the rebuild-tracks-button.tsx (5.2c) shape: useSession role gate +
// dialog confirm + inline success/error feedback.

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

interface RetryButtonProps {
  exportId: string;
}

export function RetryButton({ exportId }: RetryButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "error"; message: string } | null
  >(null);
  const utils = trpc.useUtils();

  const roles = session?.user.roles ?? [];
  const canRetry =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("administrator");

  const retry = trpc.reportExport.retry.useMutation({
    onSuccess: () => {
      void utils.reportExport.list.invalidate();
      setOpen(false);
      setFeedback(null);
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canRetry) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    retry.mutate({ id: exportId });
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    retry.reset();
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
        data-testid="retry-export-button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Retry
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retry export?</DialogTitle>
          <DialogDescription>
            Resets this export to the queued state and re-enqueues the PDF
            render job. Any prior file is dropped. Use this for exports that
            have failed or are stuck waiting.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={retry.isPending}
          >
            Cancel
          </Button>
          <Button
            data-testid="retry-export-confirm"
            onClick={handleConfirm}
            disabled={retry.isPending}
          >
            {retry.isPending ? "Retrying…" : "Confirm Retry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
