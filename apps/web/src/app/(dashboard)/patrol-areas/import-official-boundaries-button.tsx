"use client";

// Owner-facing trigger for the "one source feeds both" official-boundary import
// (areaBoundary.importOfficial). Upserts ~34 official AreaBoundary records
// (municipality land/water + MPA outlines) from the tenant's seeded
// Municipality + ProtectedZone geometry. Idempotent — safe to re-run. On
// success it invalidates the boundary list + the map overlay so both refresh.

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

export function ImportOfficialBoundariesButton() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; created: number; updated: number; total: number }
    | { kind: "error"; message: string }
    | null
  >(null);

  const roles = session?.user.roles ?? [];
  const canImport =
    roles.includes("super_admin") || roles.includes("site_admin");

  const importOfficial = trpc.areaBoundary.importOfficial.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        created: data.created,
        updated: data.updated,
        total: data.total,
      });
      void utils.areaBoundary.list.invalidate();
      void utils.map.officialBoundaries.list.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  if (!canImport) {
    return null;
  }

  function handleConfirm() {
    setFeedback(null);
    importOfficial.mutate();
  }

  function handleClose() {
    setOpen(false);
    setFeedback(null);
    importOfficial.reset();
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
        data-testid="import-official-boundaries-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Import Official Boundaries
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Official Boundaries?</DialogTitle>
          <DialogDescription>
            Imports the official municipality land and water boundaries plus
            protected-zone (MPA) outlines for this tenant, sourced from the
            trusted coverage dataset. Existing official boundaries are refreshed
            in place — this is safe to run again at any time. It does not change
            event or patrol area assignments (use Rebuild Area Derivation for
            that).
          </DialogDescription>
        </DialogHeader>
        {feedback?.kind === "success" && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Imported {feedback.total} official boundar
            {feedback.total === 1 ? "y" : "ies"} — {feedback.created} created,{" "}
            {feedback.updated} updated.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p className="text-sm text-destructive">{feedback.message}</p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={importOfficial.isPending}
          >
            {feedback?.kind === "success" ? "Close" : "Cancel"}
          </Button>
          {feedback?.kind !== "success" && (
            <Button onClick={handleConfirm} disabled={importOfficial.isPending}>
              {importOfficial.isPending ? "Importing…" : "Confirm Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
