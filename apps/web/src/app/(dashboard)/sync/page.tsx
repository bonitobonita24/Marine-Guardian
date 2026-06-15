"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers";

type SyncLogListItem =
  inferRouterOutputs<AppRouter>["syncLog"]["list"]["items"][number];

function formatDateTime(val: Date | string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Date(val).toLocaleString();
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

const SYNC_TYPE_OPTIONS = [
  "events",
  "subjects",
  "patrols",
  "observations",
  "event_types",
] as const;
type SyncTypeFilter = "all" | (typeof SYNC_TYPE_OPTIONS)[number];

export default function SyncPage() {
  const [syncTypeFilter, setSyncTypeFilter] = useState<SyncTypeFilter>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<SyncLogListItem[]>([]);

  // Connection health: most recent sync attempts
  const latestQuery = trpc.syncLog.latest.useQuery();
  const lastSync = latestQuery.data?.[0];

  // Reset pagination when the filter changes
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
  }, [syncTypeFilter]);

  const listQuery = trpc.syncLog.list.useQuery({
    limit: 50,
    cursor,
    ...(syncTypeFilter !== "all" ? { syncType: syncTypeFilter } : {}),
  });

  useEffect(() => {
    if (listQuery.data?.items !== undefined) {
      if (cursor === undefined) {
        setAccumulated(listQuery.data.items);
      } else {
        setAccumulated((prev) => [...prev, ...(listQuery.data?.items ?? [])]);
      }
    }
  }, [listQuery.data, cursor]);

  const rows = accumulated;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasNextPage = listQuery.data?.nextCursor !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sync Status</h1>
      </div>

      {/* Connection health indicator */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border p-4"
        data-testid="sync-health"
      >
        {lastSync === undefined ? (
          <span className="text-sm text-muted-foreground">
            No sync activity recorded yet.
          </span>
        ) : (
          <>
            <Badge
              variant={statusVariant(lastSync.status)}
              data-testid="sync-health-badge"
            >
              {lastSync.status === "success"
                ? "Connected"
                : lastSync.status === "failed"
                  ? "Disconnected"
                  : "Partial"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Last sync: {formatDateTime(lastSync.startedAt)}
            </span>
          </>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={syncTypeFilter}
          onChange={(e) => {
            setSyncTypeFilter(e.target.value as SyncTypeFilter);
          }}
          aria-label="Filter by sync type"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All sync types</option>
          {SYNC_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Sync log table */}
      {isInitialLoading ? (
        <div
          data-testid="sync-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No sync activity matches the current filter.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Records synced</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id} data-testid={`sync-row-${s.id}`}>
                    <TableCell className="font-medium capitalize">
                      {s.syncType.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant(s.status)}
                        data-testid={`sync-status-badge-${s.id}`}
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.recordsSynced}
                    </TableCell>
                    <TableCell>{formatDateTime(s.startedAt)}</TableCell>
                    <TableCell>{formatDateTime(s.completedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {s.errorMessage ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => { setCursor(listQuery.data?.nextCursor); }}
                disabled={listQuery.isFetching}
              >
                {listQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
