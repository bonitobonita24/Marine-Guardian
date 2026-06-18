"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc/client";
import { buildExportUrl } from "@/lib/exports";

type ChannelValue = "in_app" | "email";

const CHANNEL_OPTIONS: { value: ChannelValue; label: string }[] = [
  { value: "in_app", label: "In-App" },
  { value: "email", label: "Email" },
];

const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

function channelBadges(channels: string[]) {
  return channels.map((ch) => (
    <Badge key={ch} variant="outline" className="text-xs">
      {ch === "in_app" ? "In-App" : "Email"}
    </Badge>
  ));
}

export default function AlertsPage() {
  const rulesQuery = trpc.alertRule.list.useQuery({ limit: 100 });
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formSeverity, setFormSeverity] = useState("critical");
  const [formChannels, setFormChannels] = useState<ChannelValue[]>(["in_app"]);
  // Surface mutation failures in the dialog instead of leaving the Save button
  // stuck on "Saving…" with no feedback when the request rejects (or hangs).
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setFormName("");
    setFormSeverity("critical");
    setFormChannels(["in_app"]);
    setEditingId(null);
    setFormError(null);
  }

  // Success/error handling lives at the HOOK level so it always fires and
  // deterministically closes the dialog + clears the saving state on success,
  // or surfaces the error (dialog stays open) on failure. Relying only on the
  // inline `.mutate(_, { onSuccess })` callback could leave the dialog stuck.
  function handleMutationSuccess() {
    void utils.alertRule.list.invalidate();
    setDialogOpen(false);
    resetForm();
  }

  const createMutation = trpc.alertRule.create.useMutation({
    onSuccess: handleMutationSuccess,
    onError: (err) => { setFormError(err.message); },
  });
  const updateMutation = trpc.alertRule.update.useMutation({
    onError: (err) => { setFormError(err.message); },
  });
  const deleteMutation = trpc.alertRule.delete.useMutation();

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(rule: {
    id: string;
    name: string;
    conditionJson: unknown;
    notificationChannels: unknown;
  }) {
    setEditingId(rule.id);
    setFormName(rule.name);
    const cond = rule.conditionJson as Record<string, unknown>;
    setFormSeverity(
      typeof cond.severity === "string" ? cond.severity : "critical"
    );
    const channels = rule.notificationChannels as string[];
    setFormChannels(
      Array.isArray(channels)
        ? channels.filter(
            (c): c is ChannelValue => c === "in_app" || c === "email"
          )
        : ["in_app"]
    );
    setDialogOpen(true);
  }

  function toggleChannel(ch: ChannelValue) {
    setFormChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  function handleSave() {
    if (formChannels.length === 0) return;
    setFormError(null);

    const conditionJson = { severity: formSeverity };
    const notificationChannels = formChannels;

    if (editingId !== null) {
      // Inline onSuccess closes the edit path (hook-level onSuccess is reserved
      // by createMutation; updateMutation is shared with the row toggle which
      // must NOT close the dialog). onError is handled at the hook level.
      updateMutation.mutate(
        { id: editingId, name: formName, conditionJson, notificationChannels },
        { onSuccess: handleMutationSuccess }
      );
    } else {
      createMutation.mutate({
        name: formName,
        conditionJson,
        notificationChannels,
      });
    }
  }

  function handleToggleActive(id: string, currentActive: boolean) {
    updateMutation.mutate(
      { id, isActive: !currentActive },
      { onSuccess: () => void utils.alertRule.list.invalidate() }
    );
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          void utils.alertRule.list.invalidate();
          setDeleteConfirmId(null);
        },
      }
    );
  }

  if (rulesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Alert Rules</h1>
        <p className="text-sm text-muted-foreground">Loading rules...</p>
      </div>
    );
  }

  const rules = rulesQuery.data?.items ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alert Rules</h1>
          <p className="text-sm text-muted-foreground">
            Configure automated alert triggers and notification channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={buildExportUrl("alert-rules", {}, "csv")} download>
              Export CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={buildExportUrl("alert-rules", {}, "pdf")} download>
              Export PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/alerts/history">View History</Link>
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreate}>New Rule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId !== null ? "Edit Rule" : "Create Rule"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); }}
                  placeholder="e.g. Critical Zone Breach"
                />
              </div>

              <div className="space-y-2">
                <Label>Severity Trigger</Label>
                <Select value={formSeverity} onValueChange={setFormSeverity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notification Channels</Label>
                <div className="flex items-center gap-4">
                  {CHANNEL_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={formChannels.includes(opt.value)}
                        onChange={() => { toggleChannel(opt.value); }}
                        className="rounded border-input"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {formChannels.length === 0 && (
                  <p className="text-xs text-destructive">
                    Select at least one channel.
                  </p>
                )}
              </div>

              <Separator />

              {formError !== null && (
                <p
                  data-testid="alert-rule-form-error"
                  className="text-sm text-destructive"
                >
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={
                    formName.trim() === "" ||
                    formChannels.length === 0 ||
                    isSaving
                  }
                >
                  {isSaving ? "Saving..." : editingId !== null ? "Update" : "Create"}
                </Button>
              </div>
            </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No alert rules configured yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const cond = rule.conditionJson as Record<string, unknown>;
            const severity =
              typeof cond.severity === "string" ? cond.severity : "—";
            const channels = Array.isArray(rule.notificationChannels)
              ? (rule.notificationChannels as string[])
              : [];

            return (
              <Card key={rule.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">{rule.name}</CardTitle>
                      <Badge
                        variant={rule.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => {
                          handleToggleActive(rule.id, rule.isActive);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { openEdit(rule); }}
                      >
                        Edit
                      </Button>
                      {deleteConfirmId === rule.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => { handleDelete(rule.id); }}
                            disabled={deleteMutation.isPending}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setDeleteConfirmId(null); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => { setDeleteConfirmId(rule.id); }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      Severity:{" "}
                      <span className="font-medium text-foreground">
                        {severity}
                      </span>
                    </span>
                    <span className="h-4 w-px bg-border" />
                    <span className="flex items-center gap-1">
                      Channels: {channelBadges(channels)}
                    </span>
                    <span className="h-4 w-px bg-border" />
                    <span>Created by {rule.creator.fullName}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
