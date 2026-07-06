"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-service password change (2026-07-06).
 *
 * Calls account.changeOwnPassword, which verifies the current password
 * server-side and bumps securityVersion on success. That bump invalidates
 * EVERY session for this user — including this one — so on success we sign
 * the user out immediately and send them back to /login, matching the
 * existing admin-driven reset-password behavior (a stale session is never
 * left half-valid).
 */
export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const changePassword = trpc.account.changeOwnPassword.useMutation({
    onSuccess: () => {
      setSigningOut(true);
      void signOut({ callbackUrl: "/login?passwordChanged=1" });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit() {
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    changePassword.mutate({ currentPassword, newPassword });
  }

  const busy = changePassword.isPending || signingOut;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          Change Password
        </CardTitle>
        <CardDescription>
          Changing your password signs you out of every session, including
          this one. You will need to sign in again with your new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error !== null && (
          <p
            role="status"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {signingOut ? (
          <p role="status" className="text-sm text-muted-foreground">
            Password changed. Signing you out&hellip;
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); }}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); }}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
            <Button type="submit" className="min-h-[44px]" disabled={busy}>
              {changePassword.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Change Password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
