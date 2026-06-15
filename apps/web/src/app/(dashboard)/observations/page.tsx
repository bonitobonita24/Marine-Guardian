"use client";

import { useState, useEffect } from "react";
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

type ObservationListItem =
  inferRouterOutputs<AppRouter>["observation"]["list"]["items"][number];

function formatDateTime(val: Date | string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Date(val).toLocaleString();
}

export default function ObservationsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<ObservationListItem[]>([]);

  const listQuery = trpc.observation.list.useQuery({
    limit: 50,
    cursor,
  });

  // Append new pages to the accumulated list as the cursor advances
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
        <h1 className="text-2xl font-semibold">Observations</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Field observations synced from EarthRanger, most recent first.
      </p>

      {isInitialLoading ? (
        <div
          data-testid="observations-table-loading"
          className="space-y-2 rounded-md border p-4"
        >
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No observations have been synced yet.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Latitude</TableHead>
                  <TableHead className="text-right">Longitude</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} data-testid={`observation-row-${o.id}`}>
                    <TableCell className="font-medium">
                      {formatDateTime(o.recordedAt)}
                    </TableCell>
                    <TableCell>{o.subject?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">
                      {o.subject?.subjectType ?? "—"}
                    </TableCell>
                    <TableCell>{o.sourceName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.locationLat.toFixed(5)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.locationLon.toFixed(5)}
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
