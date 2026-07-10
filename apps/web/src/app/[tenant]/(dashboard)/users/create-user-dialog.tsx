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

type UserRole =
  | "tenant_manager"
  | "tenant_superadmin"
  | "field_coordinator"
  | "operator"
  | "viewer"
  | "tenant_admin";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "tenant_manager", label: "Super Admin" },
  { value: "tenant_superadmin", label: "Site Admin" },
  { value: "tenant_admin", label: "Administrator" },
  { value: "field_coordinator", label: "Field Coordinator" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

interface CreateUserDialogProps {
  onSuccess: () => void;
}

export function CreateUserDialog({ onSuccess }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const createUser = trpc.user.create.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      void utils.user.list.invalidate();
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate({ email, fullName, role });
  }

  function handleClose() {
    setOpen(false);
    setEmail("");
    setFullName("");
    setRole("operator");
    setTempPassword(null);
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button onClick={() => { setOpen(true); }}>Add User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {tempPassword !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>
                Share the temporary password with the new user. They will be prompted to change it on first login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Temporary Password</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm break-all">
                  {tempPassword}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(tempPassword)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This password is shown only once. Store it securely before closing.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create a new user account. A temporary password will be generated.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-fullname">Full Name</Label>
                <Input
                  id="create-fullname"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); }}
                  placeholder="Jane Smith"
                  required
                  minLength={1}
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); }}
                  placeholder="jane@example.com"
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-role">Role</Label>
                <Select value={role} onValueChange={(v) => { setRole(v as UserRole); }}>
                  <SelectTrigger id="create-role">
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
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
