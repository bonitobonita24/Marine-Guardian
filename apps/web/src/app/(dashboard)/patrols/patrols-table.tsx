"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers";
type PatrolListItem = inferRouterOutputs<AppRouter>["patrol"]["list"]["items"][number];

type StateFilter = "all" | "open" | "done" | "cancelled";
type TypeFilter = "all" | "foot" | "seaborne";

export function PatrolsTable() {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [includeTest, setIncludeTest] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const [accumulated, setAccumulated] = useState<PatrolListItem[]>([]);

  // When filters change, reset accumulated + cursor
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
  }, [stateFilter, typeFilter, includeTest]);

  const listQuery = trpc.patrol.list.useQuery({
    limit: 50,
    cursor,
    ...(stateFilter !== "all" ? { state: stateFilter } : {}),
    ...(typeFilter !== "all" ? { patrolType: typeFilter } : {}),
    includeTest,
  });

  // Append new pages to accumulated
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="state-filter"
          aria-label="Filter by state"
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value as StateFilter); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All States</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          data-testid="type-filter"
          aria-label="Filter by patrol type"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Types</option>
          <option value="foot">Foot</option>
          <option value="seaborne">Seaborne</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="include-test-toggle"
            checked={includeTest}
            onChange={(e) => { setIncludeTest(e.target.checked); }}
            className="h-4 w-4 rounded border-input"
          />
          Show test patrols
        </label>
      </div>

      {isInitialLoading ? (
        <div
          data-testid="patrols-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No patrols match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} data-testid={`patrol-row-${p.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{p.title ?? "(untitled)"}</span>
                        {p.isTestPatrol && (
                          <Badge
                            variant="secondary"
                            data-testid={`test-badge-${p.id}`}
                          >
                            Test
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{p.patrolType}</TableCell>
                    <TableCell className="capitalize">{p.state}</TableCell>
                    <TableCell>
                      {p.startTime !== null
                        ? new Date(p.startTime).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {p.endTime !== null
                        ? new Date(p.endTime).toLocaleString()
                        : "—"}
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
