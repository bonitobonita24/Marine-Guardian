"use client";

// 5.1e — Minimal stub button. The full /admin/area-boundaries page (list +
// create/edit/delete + map) does not yet exist; this lives on the existing
// patrol-areas placeholder so the rebuild mutation has an end-to-end
// consumer. When the full admin UI is built later, move this button into
// that page's header.

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

export function RebuildAreaBoundariesButton() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; enqueued: number; action: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const roles = session?.user.roles ?? [];
  const canRebuild =
    roles.includes("tenant_manager") ||
    roles.includes("tenant_superadmin") ||
    roles.includes("tenant_admin");

  const rebuild = trpc.areaBoundary.rebuild.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        enqueued: data.enqueued,
        action: data.action,
      });
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canRebuild) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    rebuild.mutate({});
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    rebuild.reset();
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
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Rebuild Area Derivation
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rebuild Area Derivation?</DialogTitle>
          <DialogDescription>
            Re-runs area derivation for every event, patrol, and fuel entry
            in this tenant. For large tenants this may take several minutes
            to complete as jobs flow through the 50/sec rate limiter.
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "success" && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Rebuild queued — {feedback.enqueued} job
            {feedback.enqueued === 1 ? "" : "s"} enqueued ({feedback.action}).
          </p>
        )}
        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={rebuild.isPending}>
            {feedback?.kind === "success" ? "Close" : "Cancel"}
          </Button>
          {feedback?.kind !== "success" && (
            <Button onClick={handleConfirm} disabled={rebuild.isPending}>
              {rebuild.isPending ? "Queuing…" : "Confirm Rebuild"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
