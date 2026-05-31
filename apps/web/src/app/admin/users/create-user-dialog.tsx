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

type UserRole = "super_admin" | "site_admin" | "field_coordinator" | "operator";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [languagePreference, setLanguagePreference] = useState<"en" | "id" | "ms">("en");
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const tenantList = trpc.platform.list.useQuery();

  const createUser = trpc.platformUser.create.useMutation({
    onSuccess: () => {
      void utils.platformUser.list.invalidate();
      handleClose();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleRoleChange(value: string) {
    const next = value as UserRole;
    setRole(next);
    if (next === "super_admin") {
      setTenantId(null);
      setTenantError(null);
    }
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setTenantError(null);

    if (role !== "super_admin" && (tenantId === null || tenantId === "")) {
      setTenantError("Select a tenant for this role.");
      return;
    }

    createUser.mutate({
      email,
      fullName,
      role,
      tenantId: role === "super_admin" ? null : tenantId,
      languagePreference,
    });
  }

  function handleClose() {
    setOpen(false);
    setEmail("");
    setFullName("");
    setRole("operator");
    setTenantId(null);
    setLanguagePreference("en");
    setTenantError(null);
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
        <Button onClick={() => { setOpen(true); }}>Add User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a new platform user. Assign a role and tenant as needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-user-fullname">Full Name</Label>
              <Input
                id="create-user-fullname"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); }}
                placeholder="Jane Doe"
                required
                minLength={1}
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-user-role">Role</Label>
              <Select value={role} onValueChange={handleRoleChange}>
                <SelectTrigger id="create-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="site_admin">Site Admin</SelectItem>
                  <SelectItem value="field_coordinator">Field Coordinator</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-user-tenant">Tenant</Label>
              <Select
                value={tenantId ?? ""}
                onValueChange={(v) => { setTenantId(v === "" ? null : v); setTenantError(null); }}
                disabled={role === "super_admin"}
              >
                <SelectTrigger id="create-user-tenant">
                  <SelectValue placeholder={role === "super_admin" ? "N/A (platform user)" : "Select tenant"} />
                </SelectTrigger>
                <SelectContent>
                  {tenantList.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tenantError !== null && (
                <p className="text-sm text-destructive">{tenantError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-user-language">Language</Label>
              <Select
                value={languagePreference}
                onValueChange={(v) => { setLanguagePreference(v as "en" | "id" | "ms"); }}
              >
                <SelectTrigger id="create-user-language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="id">Indonesian</SelectItem>
                  <SelectItem value="ms">Malay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
