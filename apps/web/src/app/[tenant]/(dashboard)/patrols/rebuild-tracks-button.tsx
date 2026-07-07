"use client";

// 5.2c — Patrol GPS track rebuild button. Lives in the Patrols page header
// next to the CSV/PDF export buttons. Mirrors the 5.1e RebuildAreaBoundaries
// pattern: confirmation dialog → server enqueues one materializePatrolTrack
// job per state==='open' patrol → toast-style feedback in dialog. Hidden
// from non-admin sessions.

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

export function RebuildTracksButton() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; enqueued: number; action: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  const roles = session?.user.roles ?? [];
  const canRebuild =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("administrator");

  const rebuild = trpc.patrol.rebuildTracks.useMutation({
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
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Rebuild Tracks
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rebuild Patrol GPS Tracks?</DialogTitle>
          <DialogDescription>
            Re-fetches GPS tracks from EarthRanger for every active (open)
            patrol in this tenant. Closed patrols are skipped. For large
            tenants this may take several minutes as jobs flow through the
            EarthRanger API rate limiter.
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
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={rebuild.isPending}
          >
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
