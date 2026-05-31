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

type UserRole = "super_admin" | "site_admin" | "field_coordinator" | "operator";

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
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const updateRole = trpc.platformUser.updateRole.useMutation({
    onSuccess: () => {
      void utils.platformUser.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    updateRole.mutate({ id: user.id, role });
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setRole(user.role);
      setError(null);
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
              <Select value={role} onValueChange={(v) => { setRole(v as UserRole); }}>
                <SelectTrigger id="edit-user-role">
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
            {error !== null && (
              <p className="text-sm text-destructive">{error}</p>
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
            <Button type="submit" disabled={updateRole.isPending}>
              {updateRole.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
