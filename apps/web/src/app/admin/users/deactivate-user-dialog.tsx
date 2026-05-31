"use client";

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
import { useState } from "react";

interface DeactivateUserDialogProps {
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DeactivateUserDialog({
  user,
  open,
  onOpenChange,
}: DeactivateUserDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const deactivate = trpc.platformUser.deactivate.useMutation({
    onSuccess: () => {
      void utils.platformUser.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleOpenChange(v: boolean) {
    if (!v) {
      setError(null);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate User</DialogTitle>
          <DialogDescription>
            This action will prevent the user from signing in.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm">
            Deactivate <strong>{user.fullName}</strong> ({user.email})? They
            will be unable to sign in until reactivated.
          </p>
          {error !== null && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deactivate.isPending}
            onClick={() => { deactivate.mutate({ id: user.id }); }}
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
