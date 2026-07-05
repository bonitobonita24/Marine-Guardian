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
  | "viewer";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "site_admin", label: "Site Admin" },
  { value: "field_coordinator", label: "Field Coordinator" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

interface EditRoleDialogProps {
  userId: string;
  currentRole: UserRole;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditRoleDialog({
  userId,
  currentRole,
  userName,
  open,
  onOpenChange,
  onSuccess,
}: EditRoleDialogProps) {
  const [role, setRole] = useState<UserRole>(currentRole);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const updateRole = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      void utils.user.list.invalidate();
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    updateRole.mutate({ id: userId, role });
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setRole(currentRole);
      setError(null);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for <span className="font-medium">{userName}</span>.
              This will immediately invalidate their active sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">New Role</Label>
              <Select value={role} onValueChange={(v) => { setRole(v as UserRole); }}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
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
              onClick={() => { handleOpenChange(false); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateRole.isPending || role === currentRole}
            >
              {updateRole.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
