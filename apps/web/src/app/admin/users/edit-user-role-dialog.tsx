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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";

type UserRole =
  | "super_admin"
  | "site_admin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "administrator";

interface EditUserRoleDialogProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    tenantId: string | null;
  };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditUserRoleDialog({
  user,
  open,
  onOpenChange,
}: EditUserRoleDialogProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [tenantId, setTenantId] = useState<string | null>(user.tenantId);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const tenantList = trpc.platform.list.useQuery();

  const updateRole = trpc.platformUser.updateRole.useMutation({
    onSuccess: () => {
      void utils.platformUser.list.invalidate();
      onOpenChange(false);
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

    if (role !== "super_admin" && tenantId === null) {
      setTenantError("Select a tenant for this role.");
      return;
    }

    updateRole.mutate({ id: user.id, role, tenantId });
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setRole(user.role);
      setTenantId(user.tenantId);
      setError(null);
      setTenantError(null);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change role for {user.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-role">Role</Label>
              <Select value={role} onValueChange={handleRoleChange}>
                <SelectTrigger id="edit-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="site_admin">Site Admin</SelectItem>
                  <SelectItem value="administrator">Administrator</SelectItem>
                  <SelectItem value="field_coordinator">Field Coordinator</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-tenant">Tenant</Label>
              <Select
                value={tenantId ?? ""}
                onValueChange={(v) => {
                  setTenantId(v === "" ? null : v);
                  setTenantError(null);
                }}
                disabled={role === "super_admin"}
              >
                <SelectTrigger id="edit-user-tenant">
                  <SelectValue
                    placeholder={
                      role === "super_admin"
                        ? "Platform (no tenant)"
                        : "Select tenant"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Platform (no tenant)</SelectItem>
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
            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateRole.isPending}>
              {updateRole.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
