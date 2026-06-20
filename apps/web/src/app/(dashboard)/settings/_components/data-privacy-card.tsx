"use client";

import { useState } from "react";
import { Download, Loader2, ShieldCheck, Trash2, UserCog } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";

/**
 * Data & Privacy self-service (V32.9 / RA 10173 §16).
 * Lets the signed-in user exercise their data-subject rights against their own
 * data: access, portable export, rectification, objection, and erasure request.
 *
 * WCAG 2.2 AA: every control is a 44px-min target, labels are associated with
 * inputs, status messages use role="status", and focus-visible is inherited
 * from the shared Button/Input components.
 */

function triggerJsonDownload(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DataPrivacyCard() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [erasureReason, setErasureReason] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);

  const requestsQuery = trpc.dsr.myRequests.useQuery();

  const accessMut = trpc.dsr.access.useMutation({
    onSuccess: (data) => {
      triggerJsonDownload(data, "marine-guardian-my-data.json");
      setStatus("Your data export has been downloaded.");
      void utils.dsr.myRequests.invalidate();
    },
    onError: (e) => { setStatus(e.message); },
  });

  const portMut = trpc.dsr.port.useMutation({
    onSuccess: (data) => {
      triggerJsonDownload(data, "marine-guardian-portable-export.json");
      setStatus("Your portable export has been downloaded.");
      void utils.dsr.myRequests.invalidate();
    },
    onError: (e) => { setStatus(e.message); },
  });

  const rectifyMut = trpc.dsr.rectify.useMutation({
    onSuccess: () => {
      setStatus("Your profile has been updated.");
      setFullName("");
      setEmail("");
      void utils.dsr.myRequests.invalidate();
    },
    onError: (e) => { setStatus(e.message); },
  });

  const erasureMut = trpc.dsr.requestErasure.useMutation({
    onSuccess: () => {
      setStatus("Your erasure request has been submitted for review.");
      setErasureReason("");
      setConfirmErase(false);
      void utils.dsr.myRequests.invalidate();
    },
    onError: (e) => { setStatus(e.message); },
  });

  const busy =
    accessMut.isPending ||
    portMut.isPending ||
    rectifyMut.isPending ||
    erasureMut.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Data &amp; Privacy
        </CardTitle>
        <CardDescription>
          Exercise your data-subject rights under the PH Data Privacy Act (RA
          10173). Requests are answered within 15 calendar days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {status !== null && (
          <p
            role="status"
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            {status}
          </p>
        )}

        {/* Access + portability */}
        <section aria-labelledby="dsr-export-heading" className="space-y-3">
          <h3 id="dsr-export-heading" className="text-sm font-semibold">
            Access &amp; export your data
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              onClick={() => { accessMut.mutate(); }}
            >
              {accessMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              Download a copy of my data
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              onClick={() => { portMut.mutate(); }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Portable export (JSON)
            </Button>
          </div>
        </section>

        {/* Rectification */}
        <section aria-labelledby="dsr-rectify-heading" className="space-y-3">
          <h3
            id="dsr-rectify-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Correct your details
          </h3>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const payload: { fullName?: string; email?: string } = {};
              if (fullName.trim() !== "") payload.fullName = fullName.trim();
              if (email.trim() !== "") payload.email = email.trim();
              if (payload.fullName === undefined && payload.email === undefined) {
                setStatus("Enter a new name or email to update.");
                return;
              }
              rectifyMut.mutate(payload);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="dsr-fullname">Full name</Label>
              <Input
                id="dsr-fullname"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); }}
                placeholder="New full name"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dsr-email">Email</Label>
              <Input
                id="dsr-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                placeholder="new@example.com"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                Changing your email signs you out of other sessions.
              </p>
            </div>
            <Button type="submit" className="min-h-[44px]" disabled={busy}>
              {rectifyMut.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Save changes
            </Button>
          </form>
        </section>

        {/* Erasure request */}
        <section aria-labelledby="dsr-erase-heading" className="space-y-3">
          <h3
            id="dsr-erase-heading"
            className="flex items-center gap-2 text-sm font-semibold text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Request erasure of your data
          </h3>
          <p className="text-xs text-muted-foreground">
            Erasure is reviewed by an administrator. Some records (audit logs,
            operational data) are kept for legally-required retention periods even
            after your account is closed.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = erasureReason.trim();
              erasureMut.mutate(reason === "" ? {} : { reason });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="dsr-erase-reason">Reason (optional)</Label>
              <Textarea
                id="dsr-erase-reason"
                value={erasureReason}
                onChange={(e) => { setErasureReason(e.target.value); }}
                rows={3}
                placeholder="Why are you requesting erasure?"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="dsr-erase-confirm"
                type="checkbox"
                checked={confirmErase}
                onChange={(e) => { setConfirmErase(e.target.checked); }}
                className="h-5 w-5 rounded border-border accent-destructive"
              />
              <Label htmlFor="dsr-erase-confirm" className="text-sm font-normal">
                I understand this submits an erasure request for review.
              </Label>
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="min-h-[44px]"
              disabled={busy || !confirmErase}
            >
              {erasureMut.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Submit erasure request
            </Button>
          </form>
        </section>

        {/* Request history */}
        <section aria-labelledby="dsr-history-heading" className="space-y-3">
          <h3 id="dsr-history-heading" className="text-sm font-semibold">
            Your request history
          </h3>
          {requestsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading&hellip;</p>
          ) : (requestsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not made any data-subject requests yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {requestsQuery.data?.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="font-medium capitalize">{r.type}</span>
                  <span className="capitalize text-muted-foreground">
                    {r.status.replace(/_/g, " ")}
                  </span>
                  <time
                    dateTime={new Date(r.requestedAt).toISOString()}
                    className="text-xs text-muted-foreground"
                  >
                    {new Date(r.requestedAt).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
