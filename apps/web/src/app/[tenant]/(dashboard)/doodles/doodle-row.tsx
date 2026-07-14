"use client";

// Doodles feature — single Doodle row. Mirrors exports/export-row.tsx shape
// (table row + admin-gated Delete confirm dialog), simplified since Doodle
// has no in-flight/polling states — it's a static saved record.

import { useState } from "react";
import { useSession } from "next-auth/react";
import { TableCell, TableRow } from "@/components/ui/table";
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

export interface DoodleRowItem {
  id: string;
  name: string;
  surface: string;
  createdAt: Date;
  createdByUserId: string;
}

interface DoodleRowProps {
  row: DoodleRowItem;
  onView: (id: string) => void;
}

/** Doodle.surface is stored as "command-center" | "report-map" (see
 * DoodleToolbar's callers) — map each to the human-readable page name shown
 * in the sidebar nav (Command Center / Interactive Report Map). */
function humanizeSurface(surface: string): string {
  if (surface === "command-center") return "Command Center";
  if (surface === "report-map") return "Interactive Report Map";
  return surface;
}

function formatDate(date: Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export function DoodleRow({ row, onView }: DoodleRowProps) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const roles = session?.user.roles ?? [];
  // Doodle actions are gated under the "exports" RBAC feature key (owner
  // instruction, doodle.ts router) — write actions (delete) mirror the same
  // admin-tier gate as reportExport's DeleteButton.
  const canDelete =
    roles.includes("tenant_manager") ||
    roles.includes("tenant_superadmin") ||
    roles.includes("tenant_admin");

  const createdByLabel =
    session?.user.id !== undefined && session.user.id === row.createdByUserId
      ? "You"
      : "—";

  const del = trpc.doodle.delete.useMutation({
    onSuccess: () => {
      void utils.doodle.list.invalidate();
      setDeleteOpen(false);
      setFeedback(null);
    },
    onError: (err) => {
      setFeedback(err.message);
    },
  });

  function handleConfirmDelete() {
    setFeedback(null);
    del.mutate({ id: row.id });
  }

  function handleCloseDeleteDialog() {
    setDeleteOpen(false);
    setFeedback(null);
    del.reset();
  }

  return (
    <TableRow data-testid={`doodle-row-${row.id}`}>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {humanizeSurface(row.surface)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(row.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {createdByLabel}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="doodle-view-button"
            onClick={() => {
              onView(row.id);
            }}
          >
            View
          </Button>
          {canDelete && (
            <Dialog
              open={deleteOpen}
              onOpenChange={(v) => {
                if (v) setDeleteOpen(true);
                else handleCloseDeleteDialog();
              }}
            >
              <Button
                size="sm"
                variant="outline"
                data-testid="doodle-delete-button"
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                Delete
              </Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete doodle?</DialogTitle>
                  <DialogDescription>
                    Permanently removes &quot;{row.name}&quot;. This cannot be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                {feedback !== null && (
                  <p className="text-sm text-destructive">{feedback}</p>
                )}
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={handleCloseDeleteDialog}
                    disabled={del.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    data-testid="doodle-delete-confirm"
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={del.isPending}
                  >
                    {del.isPending ? "Deleting…" : "Confirm Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
