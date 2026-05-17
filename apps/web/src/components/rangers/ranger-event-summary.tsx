import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CategoryRow {
  category: string;
  reported: number;
  accompanied: number;
  total: number;
}

interface RangerEventSummaryProps {
  eventStats: {
    reportedCount: number;
    accompaniedCount: number;
    totalCredit: number;
    categoryBreakdown: CategoryRow[];
  };
}

export function RangerEventSummary({ eventStats }: RangerEventSummaryProps) {
  const sortedBreakdown = [...eventStats.categoryBreakdown].sort(
    (a, b) => b.total - a.total,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Event summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          <span className="font-medium">Reported:</span>{" "}
          <span className="tabular-nums">{eventStats.reportedCount}</span>{" "}
          events
          <span className="mx-2 text-muted-foreground">|</span>
          <span className="font-medium">Accompanied:</span>{" "}
          <span className="tabular-nums">{eventStats.accompaniedCount}</span>{" "}
          events
          <span className="mx-2 text-muted-foreground">|</span>
          <span className="font-medium">Total credit:</span>{" "}
          <span className="tabular-nums font-semibold">
            {eventStats.totalCredit}
          </span>
        </p>

        {sortedBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events credited to this ranger yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Reported</TableHead>
                <TableHead className="text-right">Accompanied</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBreakdown.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.reported}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.accompanied}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {row.total}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
