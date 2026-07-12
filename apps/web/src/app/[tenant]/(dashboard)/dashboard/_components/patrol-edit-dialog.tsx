"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import type { ActivePatrol } from "./active-patrols";

/**
 * WAR ROOM "Recent Patrols" inline edit dialog (2026-07-13).
 *
 * Opened from the "Update" button on the currently-selected Active Patrols
 * row. Edits Title / Boat name / Area via the existing patrol.update
 * mutation, then invalidates dashboard.activePatrols so the tile refreshes.
 * Ranger editing is intentionally NOT part of this dialog.
 */
export function PatrolEditDialog({
  patrol,
  onClose,
}: {
  patrol: ActivePatrol | null;
  onClose: () => void;
}) {
  const open = patrol !== null;
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [boatName, setBoatName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (!patrol) return;
    setTitle(patrol.title ?? "");
    setBoatName(patrol.boatName ?? "");
    setAreaName(patrol.areaName ?? "");
    setTitleError(null);
  }, [patrol]);

  const updatePatrol = trpc.patrol.update.useMutation({
    onSuccess: () => {
      void utils.dashboard.activePatrols.invalidate();
      onClose();
    },
  });

  const handleSave = () => {
    if (!patrol) return;
    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      return;
    }
    setTitleError(null);
    updatePatrol.mutate({ id: patrol.id, title, boatName, areaName });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Patrol</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pt-2">
          <div className="grid gap-1.5">
            <Label htmlFor="patrol-edit-title">Title</Label>
            <Input
              id="patrol-edit-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
            {titleError !== null && (
              <p className="text-xs text-destructive">{titleError}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="patrol-edit-boat">Boat name</Label>
            <Input
              id="patrol-edit-boat"
              value={boatName}
              onChange={(e) => {
                setBoatName(e.target.value);
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="patrol-edit-area">Area</Label>
            <Input
              id="patrol-edit-area"
              value={areaName}
              onChange={(e) => {
                setAreaName(e.target.value);
              }}
            />
          </div>

          {updatePatrol.isError && (
            <p className="text-xs text-destructive">
              {updatePatrol.error.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={updatePatrol.isPending}
            onClick={handleSave}
          >
            {updatePatrol.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
