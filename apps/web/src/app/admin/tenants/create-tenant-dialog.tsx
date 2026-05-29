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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

export function CreateTenantDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("IDR");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const createTenant = trpc.platform.create.useMutation({
    onSuccess: () => {
      void utils.platform.list.invalidate();
      void utils.platform.metrics.invalidate();
      handleClose();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    createTenant.mutate({ name, slug, timezone, currency });
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setSlug("");
    setTimezone("UTC");
    setCurrency("IDR");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button onClick={() => { setOpen(true); }}>Add Tenant</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Tenant</DialogTitle>
            <DialogDescription>
              Create a new tenant. The slug is permanent and used in URLs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-tenant-name">Name</Label>
              <Input
                id="create-tenant-name"
                value={name}
                onChange={(e) => { setName(e.target.value); }}
                placeholder="Coral Bay Reserve"
                required
                minLength={1}
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-tenant-slug">Slug</Label>
              <Input
                id="create-tenant-slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); }}
                placeholder="coral-bay-reserve"
                required
                pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, digits, and hyphens only. Used in URLs.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-tenant-timezone">Timezone</Label>
              <Input
                id="create-tenant-timezone"
                value={timezone}
                onChange={(e) => { setTimezone(e.target.value); }}
                placeholder="UTC"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-tenant-currency">Currency</Label>
              <Input
                id="create-tenant-currency"
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); }}
                placeholder="IDR"
                maxLength={3}
              />
            </div>
            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTenant.isPending}>
              {createTenant.isPending ? "Creating…" : "Create Tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
