"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import { buildExportUrl } from "@/lib/exports";

const PAGE_SIZE = 50;

function formatFiredAt(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString();
}

function priorityVariant(priority: number): "destructive" | "default" | "secondary" {
  if (priority >= 200) return "destructive";
  if (priority >= 100) return "default";
  return "secondary";
}

export default function AlertHistoryPage() {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  const currentCursor = cursors[pageIndex];
  const historyQuery = trpc.alertHistory.list.useQuery({
    limit: PAGE_SIZE,
    ...(currentCursor !== undefined ? { cursor: currentCursor } : {}),
  });

  const items = historyQuery.data?.items ?? [];
  const nextCursor = historyQuery.data?.nextCursor;

  function goNext() {
    if (nextCursor === undefined) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[pageIndex + 1] = nextCursor;
      return copy;
    });
    setPageIndex((i) => i + 1);
  }

  function goPrev() {
    if (pageIndex === 0) return;
    setPageIndex((i) => i - 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alert History</h1>
          <p className="text-sm text-muted-foreground">
            Every time an alert rule matched an event. Immutable audit trail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={buildExportUrl("alert-history", {}, "csv")} download>
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={buildExportUrl("alert-history", {}, "pdf")} download>
              Export PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/alerts">Back to Alert Rules</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No alert fires recorded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Fired At</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-[110px]">Priority</TableHead>
                  <TableHead className="w-[110px] text-right">Recipients</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {formatFiredAt(row.firedAt)}
                    </TableCell>
                    <TableCell>
                      {row.alertRule ? (
                        <span>{row.alertRule.name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {row.ruleNameSnapshot} (deleted)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.event ? (
                        <Link
                          href={`/events?eventId=${row.event.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.event.title ?? row.event.serialNumber ?? row.event.id}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {row.eventTitleSnapshot} (deleted)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(row.matchedPriority)}>
                        {row.matchedPriority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.recipientCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={goPrev} disabled={pageIndex === 0}>
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={goNext}
          disabled={nextCursor === undefined}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
