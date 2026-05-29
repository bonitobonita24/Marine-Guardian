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

interface DeactivateTenantDialogProps {
  tenant: { id: string; name: string };
  open: boolean;
  onClose: () => void;
}

export function DeactivateTenantDialog({
  tenant,
  open,
  onClose,
}: DeactivateTenantDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const deactivate = trpc.platform.deactivate.useMutation({
    onSuccess: () => {
      void utils.platform.list.invalidate();
      void utils.platform.metrics.invalidate();
      onClose();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleOpenChange(v: boolean) {
    if (!v) {
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Tenant</DialogTitle>
          <DialogDescription>
            Deactivate &ldquo;{tenant.name}&rdquo;? Users will lose access
            immediately. This cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>
        {error !== null && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setError(null);
              deactivate.mutate({ id: tenant.id });
            }}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
