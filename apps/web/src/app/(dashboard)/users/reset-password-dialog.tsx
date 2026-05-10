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
import { trpc } from "@/lib/trpc/client";

interface ResetPasswordDialogProps {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ResetPasswordDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onSuccess,
}: ResetPasswordDialogProps) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const resetPassword = trpc.user.resetPassword.useMutation({
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      void utils.user.list.invalidate();
      onSuccess();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleConfirm() {
    setError(null);
    resetPassword.mutate({ id: userId });
  }

  function handleClose() {
    setTempPassword(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        {tempPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>Password Reset</DialogTitle>
              <DialogDescription>
                A new temporary password has been generated for{" "}
                <span className="font-medium">{userName}</span>. Their active
                sessions have been invalidated.
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
                This password is shown only once. Share it with the user securely.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Are you sure you want to reset the password for{" "}
                <span className="font-medium">{userName}</span>? This will
                immediately invalidate all their active sessions.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirm}
                disabled={resetPassword.isPending}
              >
                {resetPassword.isPending ? "Resetting…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
