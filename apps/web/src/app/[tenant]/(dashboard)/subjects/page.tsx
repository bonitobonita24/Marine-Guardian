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

type SubjectListItem =
  inferRouterOutputs<AppRouter>["subject"]["list"]["items"][number];

function formatDate(val: Date | string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Date(val).toLocaleDateString();
}

export default function SubjectsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<SubjectListItem[]>([]);

  // Debounce the search input so we don't fire on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => { clearTimeout(timer); };
  }, [search]);

  // Reset pagination when filters change
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
  }, [debouncedSearch, isActiveFilter]);

  const listQuery = trpc.subject.list.useQuery({
    limit: 50,
    cursor,
    ...(debouncedSearch.trim() !== "" ? { search: debouncedSearch.trim() } : {}),
    ...(isActiveFilter === "active"
      ? { isActive: true }
      : isActiveFilter === "inactive"
        ? { isActive: false }
        : {}),
  });

  // Append new pages to accumulated list
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
        <h1 className="text-2xl font-semibold">Subjects</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-56"
          aria-label="Search subjects by name"
        />
        <select
          value={isActiveFilter}
          onChange={(e) => {
            setIsActiveFilter(e.target.value as "all" | "active" | "inactive");
          }}
          aria-label="Filter by active status"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All subjects</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {/* Table */}
      {isInitialLoading ? (
        <div
          data-testid="subjects-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No subjects match the current filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id} data-testid={`subject-row-${s.id}`}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="capitalize">{s.subjectType ?? "—"}</TableCell>
                    <TableCell>{s.subjectSubtype ?? "—"}</TableCell>
                    <TableCell>{s.group?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.isActive ? "default" : "secondary"}
                        data-testid={`status-badge-${s.id}`}
                      >
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(s.lastPositionAt)}</TableCell>
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
