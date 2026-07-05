"use client";

// 5.3d — Exports admin list page.
//
// Lists ReportExport rows for the current tenant with status badge, paginated
// loader, and per-row Download / Retry actions. RBAC-gated client-side to
// coordinator+ — operators have no business creating or managing exports
// (the underlying list procedure is tenantProcedure, so this is a UX gate
// not a security gate; admin actions like retry are still server-side
// enforced via adminProcedure).
//
// Polling lives inside each ExportRow (not the list query) — only in-flight
// rows poll. Once a row reaches ready, its row stops polling and we fetch
// its download URL on-demand.

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { ExportRow, type ExportRowItem } from "./export-row";
import type { ExportStatus } from "./status-badge";

type StatusFilter = "all" | ExportStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "rendering", label: "Rendering" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
];

export default function ExportsPage() {
  const { data: session } = useSession();
  const roles = session?.user.roles ?? [];
  const canViewExports =
    roles.includes("super_admin") ||
    roles.includes("site_admin") ||
    roles.includes("field_coordinator");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<ExportRowItem[]>([]);

  // Reset pagination on filter change
  useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [statusFilter]);

  const queryInput = useMemo(() => {
    const base: {
      limit: number;
      cursor?: string;
      status?: ExportStatus;
    } = { limit: 50 };
    if (cursor !== undefined) base.cursor = cursor;
    if (statusFilter !== "all") base.status = statusFilter;
    return base;
  }, [cursor, statusFilter]);

  const listQuery = trpc.reportExport.list.useQuery(queryInput, {
    enabled: canViewExports,
  });

  // Merge paginated pages
  useEffect(() => {
    const data = listQuery.data;
    if (data === undefined) return;
    if (cursor === undefined) {
      setAccumulated(data.items);
    } else {
      setAccumulated((prev) => {
        const existing = new Set(prev.map((u) => u.id));
        const next = data.items.filter((u) => !existing.has(u.id));
        return [...prev, ...next];
      });
    }
  }, [listQuery.data, cursor]);

  function handleStatusFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value as StatusFilter);
  }

  function handleLoadMore() {
    if (listQuery.data?.nextCursor !== undefined) {
      setCursor(listQuery.data.nextCursor);
    }
  }

  if (!canViewExports) {
    return (
      <div
        data-testid="exports-access-denied"
        className="rounded-md border p-8 text-center text-sm text-muted-foreground"
      >
        You do not have permission to view exports. Field coordinators or
        administrators can manage report exports.
      </div>
    );
  }

  const rows = accumulated;
  const isInitialLoading = listQuery.isLoading && rows.length === 0;
  const hasNextPage = listQuery.data?.nextCursor !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Exports</h1>
        <p className="text-sm text-muted-foreground">
          Use the &quot;Generate Report&quot; button on the Patrols page to
          start a new export.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="status-filter"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={handleStatusFilterChange}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isInitialLoading ? (
        <div
          data-testid="exports-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div
          data-testid="exports-empty-state"
          className="rounded-md border p-8 text-center text-sm text-muted-foreground"
        >
          No exports match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Report Summary</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ExportRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                data-testid="exports-load-more"
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
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
