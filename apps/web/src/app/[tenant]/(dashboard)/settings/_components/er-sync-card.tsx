"use client";

/**
 * ErSyncCard — Settings page card for EarthRanger recurring sync controls (M2).
 *
 * Wires:
 *   settings.updateErSyncConfig  — recurring toggle + interval input
 *   settings.syncNow             — admin-only manual "Sync now" button
 *   settings.getSyncLogs         — last-10 sync log entries table
 *   settings.getErConnection     — read connection status to gate recurring controls
 *
 * WCAG 2.2 AA: all interactive elements ≥44×44px minimum touch target.
 * shadcn/ui components only. No external UI libraries.
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSession } from "next-auth/react";

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(val: Date | string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Date(val).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success")
    return (
      <Badge
        variant="outline"
        className="border-[hsl(var(--success))] text-[hsl(var(--success))]"
      >
        success
      </Badge>
    );
  if (status === "failed")
    return <Badge variant="destructive">failed</Badge>;
  if (status === "running")
    return <Badge variant="secondary">running</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ── component ─────────────────────────────────────────────────────────────────

export function ErSyncCard() {
  const { data: session } = useSession();
  const isAdmin =
    session?.user.roles.some((r: string) =>
      ["tenant_manager", "tenant_superadmin", "tenant_admin"].includes(r),
    ) ?? false;

  const utils = trpc.useUtils();

  const connQuery = trpc.settings.getErConnection.useQuery();
  const syncLogsQuery = trpc.settings.getSyncLogs.useQuery();

  const updateConfig = trpc.settings.updateErSyncConfig.useMutation({
    onSuccess: () => {
      void utils.settings.getErConnection.invalidate();
    },
  });

  const syncNow = trpc.settings.syncNow.useMutation({
    onSuccess: () => {
      // Refresh the sync log table after a manual trigger.
      setTimeout(() => {
        void utils.settings.getSyncLogs.invalidate();
      }, 1500);
    },
  });

  const conn = connQuery.data;
  const isConnected = conn?.status === "connected";

  // Local form state for interval (ms) so the user can type before saving.
  const [intervalMs, setIntervalMs] = useState<number>(300_000);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn) return;
    setIntervalMs(conn.intervalMs);
    setRecurringEnabled(conn.recurringEnabled);
  }, [conn]);

  const handleToggleRecurring = (enabled: boolean) => {
    setConfigError(null);
    setRecurringEnabled(enabled);
    updateConfig.mutate(
      { recurringEnabled: enabled, intervalMs },
      {
        onError: (err) => {
          setConfigError(err.message);
          // Revert optimistic state
          setRecurringEnabled(!enabled);
        },
      },
    );
  };

  const handleIntervalSave = () => {
    setConfigError(null);
    if (intervalMs < 60_000) {
      setConfigError("Minimum interval is 60 000 ms (1 minute).");
      return;
    }
    updateConfig.mutate(
      { recurringEnabled, intervalMs },
      {
        onError: (err) => {
          setConfigError(err.message);
        },
      },
    );
  };

  const handleSyncNow = () => {
    syncNow.mutate();
  };

  if (connQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ER Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (!conn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ER Sync</CardTitle>
          <CardDescription>
            No EarthRanger connection configured. Configure one above first.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>EarthRanger Sync</CardTitle>
        <CardDescription>
          Control automatic data sync from your EarthRanger instance.
          Recurring sync runs in the background at the specified interval.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Connection status gate */}
        {!isConnected && (
          <div
            role="alert"
            className="rounded-md border border-[hsl(var(--warning))] bg-[hsl(var(--warning-bg))] px-4 py-3 text-sm text-foreground"
          >
            EarthRanger connection is not verified. Test your connection above
            before enabling recurring sync.
          </div>
        )}

        {/* Recurring toggle */}
        {isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor="recurring-toggle"
                  className="text-sm font-medium"
                >
                  Recurring sync
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically pull updates from EarthRanger on a schedule.
                  Requires a verified connection.
                </p>
              </div>
              <Switch
                id="recurring-toggle"
                checked={recurringEnabled}
                onCheckedChange={handleToggleRecurring}
                disabled={
                  !isConnected ||
                  updateConfig.isPending ||
                  connQuery.isLoading
                }
                aria-label="Enable recurring EarthRanger sync"
                className="shrink-0"
              />
            </div>

            {/* Interval */}
            <div className="space-y-2">
              <Label htmlFor="sync-interval" className="text-sm">
                Sync interval (milliseconds)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="sync-interval"
                  type="number"
                  min={60_000}
                  max={86_400_000}
                  step={60_000}
                  value={intervalMs}
                  onChange={(e) => {
                    setIntervalMs(Number(e.target.value));
                  }}
                  className="w-40"
                  aria-describedby="sync-interval-hint"
                  disabled={updateConfig.isPending}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleIntervalSave}
                  disabled={updateConfig.isPending}
                  className="min-h-[44px]"
                >
                  {updateConfig.isPending ? "Saving…" : "Save interval"}
                </Button>
              </div>
              <p
                id="sync-interval-hint"
                className="text-xs text-muted-foreground"
              >
                Default: 300 000 ms (5 min). Minimum: 60 000 ms (1 min).
                Currently:{" "}
                <span className="font-mono">
                  {(intervalMs / 60_000).toFixed(1)} min
                </span>
              </p>
            </div>

            {configError !== null && (
              <p role="alert" className="text-sm text-destructive">
                {configError}
              </p>
            )}

            {/* Sync now */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Manual sync</p>
              <p className="text-xs text-muted-foreground">
                Triggers an immediate delta sync of all data types (events,
                patrols, observations, subjects, event types). This is a
                one-shot trigger independent of the recurring schedule.
              </p>
              <Button
                variant="outline"
                onClick={handleSyncNow}
                disabled={
                  !isConnected || syncNow.isPending || !isAdmin
                }
                className="min-h-[44px]"
                aria-label="Trigger immediate EarthRanger sync"
              >
                {syncNow.isPending ? "Queuing…" : "Sync now"}
              </Button>
              {syncNow.isSuccess && (
                <p
                  className="text-sm text-[hsl(var(--success))]"
                  aria-live="polite"
                >
                  {syncNow.data.enqueued} sync jobs enqueued.
                </p>
              )}
              {syncNow.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {syncNow.error.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sync log table */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent sync activity</p>
          {syncLogsQuery.isLoading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {syncLogsQuery.data && syncLogsQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No sync runs recorded yet.
            </p>
          )}
          {syncLogsQuery.data && syncLogsQuery.data.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Records
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Started
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {syncLogsQuery.data.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono">{log.syncType}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {log.recordsSynced}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fmt(log.startedAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fmt(log.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
