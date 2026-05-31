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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";

type Language = "en" | "id" | "ms";

export function CreateTenantDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("IDR");
  const [showAdminSection, setShowAdminSection] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLanguage, setAdminLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const onMutationSuccess = () => {
    void utils.platform.list.invalidate();
    void utils.platform.metrics.invalidate();
    void utils.platformUser.list.invalidate();
    handleClose();
  };

  const onMutationError = (err: { message: string }) => {
    setError(err.message);
  };

  const createTenant = trpc.platform.create.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const createTenantWithAdmin = trpc.platform.createTenantWithAdmin.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const adminFieldsTouched =
    adminEmail.length > 0 ||
    adminFullName.length > 0 ||
    adminPassword.length > 0;
  const wantsAdmin = showAdminSection && adminFieldsTouched;
  const isPending = createTenant.isPending || createTenantWithAdmin.isPending;

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);

    if (wantsAdmin) {
      if (adminEmail.length === 0 || adminFullName.length === 0 || adminPassword.length === 0) {
        setError("All initial admin fields are required when the admin section is filled.");
        return;
      }
      if (adminPassword.length < 12) {
        setError("Initial admin password must be at least 12 characters.");
        return;
      }
      createTenantWithAdmin.mutate({
        tenant: { name, slug, timezone, currency },
        admin: {
          email: adminEmail,
          fullName: adminFullName,
          password: adminPassword,
          languagePreference: adminLanguage,
        },
      });
      return;
    }

    createTenant.mutate({ name, slug, timezone, currency });
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setSlug("");
    setTimezone("UTC");
    setCurrency("IDR");
    setShowAdminSection(false);
    setAdminEmail("");
    setAdminFullName("");
    setAdminPassword("");
    setAdminLanguage("en");
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
                pattern="^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$"
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

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <button
                type="button"
                onClick={() => { setShowAdminSection((v) => !v); }}
                className="flex w-full items-center justify-between text-left text-sm font-medium"
                aria-expanded={showAdminSection}
                aria-controls="initial-admin-section"
              >
                <span>Initial Site Admin (recommended)</span>
                <span className="text-xs text-muted-foreground">
                  {showAdminSection ? "Hide" : "Show"}
                </span>
              </button>
              {showAdminSection && (
                <div id="initial-admin-section" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Create a Site Admin user for this tenant in the same step.
                    All fields below are required if any are filled.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="create-admin-email">Admin Email</Label>
                    <Input
                      id="create-admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => { setAdminEmail(e.target.value); }}
                      placeholder="admin@example.org"
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="create-admin-name">Admin Full Name</Label>
                    <Input
                      id="create-admin-name"
                      value={adminFullName}
                      onChange={(e) => { setAdminFullName(e.target.value); }}
                      placeholder="Jane Doe"
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="create-admin-password">Admin Password</Label>
                    <Input
                      id="create-admin-password"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => { setAdminPassword(e.target.value); }}
                      placeholder="At least 12 characters"
                      maxLength={255}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 12 characters. The admin can change this after first sign-in.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="create-admin-language">Language</Label>
                    <Select
                      value={adminLanguage}
                      onValueChange={(v) => { setAdminLanguage(v as Language); }}
                    >
                      <SelectTrigger id="create-admin-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="id">Bahasa Indonesia</SelectItem>
                        <SelectItem value="ms">Bahasa Melayu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Creating…"
                : wantsAdmin
                  ? "Create Tenant + Admin"
                  : "Create Tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
