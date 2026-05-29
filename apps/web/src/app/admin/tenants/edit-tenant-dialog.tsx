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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

interface EditTenantDialogProps {
  tenant: { id: string; name: string; timezone: string; currency: string };
  open: boolean;
  onClose: () => void;
}

export function EditTenantDialog({
  tenant,
  open,
  onClose,
}: EditTenantDialogProps) {
  const [name, setName] = useState(tenant.name);
  const [timezone, setTimezone] = useState(tenant.timezone);
  const [currency, setCurrency] = useState(tenant.currency);
  const [syncFrequencySeconds, setSyncFrequencySeconds] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const update = trpc.platform.update.useMutation({
    onSuccess: () => {
      void utils.platform.list.invalidate();
      onClose();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);

    const input: {
      id: string;
      name?: string;
      timezone?: string;
      currency?: string;
      syncFrequencySeconds?: number;
    } = { id: tenant.id };

    if (name !== tenant.name) input.name = name;
    if (timezone !== tenant.timezone) input.timezone = timezone;
    if (currency !== tenant.currency) input.currency = currency;
    if (syncFrequencySeconds.trim() !== "") {
      input.syncFrequencySeconds = Number(syncFrequencySeconds);
    }

    update.mutate(input);
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setName(tenant.name);
      setTimezone(tenant.timezone);
      setCurrency(tenant.currency);
      setSyncFrequencySeconds("");
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Editing &ldquo;{tenant.name}&rdquo;. The slug cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-name">Name</Label>
              <Input
                id="edit-tenant-name"
                value={name}
                onChange={(e) => { setName(e.target.value); }}
                required
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-timezone">Timezone</Label>
              <Input
                id="edit-tenant-timezone"
                value={timezone}
                onChange={(e) => { setTimezone(e.target.value); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-currency">Currency</Label>
              <Input
                id="edit-tenant-currency"
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); }}
                maxLength={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenant-sync">Sync Frequency (seconds)</Label>
              <Input
                id="edit-tenant-sync"
                type="number"
                min={30}
                max={86400}
                value={syncFrequencySeconds}
                onChange={(e) => { setSyncFrequencySeconds(e.target.value); }}
                placeholder="Leave blank to keep current"
              />
            </div>
            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
