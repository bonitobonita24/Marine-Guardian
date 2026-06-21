import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { elapsedHm, formatKm, patrolTypeMeta } from "./lib";

/**
 * WAR ROOM "Active Patrols" table.
 * Conforms to docs/v2/mpa-command-center-v6.jsx active-patrols card —
 * Ranger, Type, Area, Time, KM. Data from patrol.list (state: "open").
 */

export type ActivePatrol = {
  id: string;
  patrolType: string;
  areaName: string | null;
  startTime: Date | string | null;
  totalDistanceKm: number | null;
  computedDistanceKm: number | null;
  leaderName: string | null;
};

export function ActivePatrols({
  patrols,
  isLoading,
  now,
}: {
  patrols: ActivePatrol[];
  isLoading: boolean;
  now?: Date | undefined;
}) {
  return (
    <section
      aria-labelledby="warroom-patrols-heading"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span aria-hidden="true">🛡️</span>
        <h2
          id="warroom-patrols-heading"
          className="text-[11px] font-bold uppercase tracking-wide text-foreground"
        >
          Active Patrols
        </h2>
        <span className="ml-auto text-[11px] font-semibold text-foreground">
          {patrols.length}
        </span>
      </div>

      <ScrollArea className="max-h-44">
        {isLoading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Loading patrols…
          </p>
        ) : patrols.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No active patrols
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Ranger</TableHead>
                <TableHead className="text-[10px] uppercase">Type</TableHead>
                <TableHead className="text-[10px] uppercase">Area</TableHead>
                <TableHead className="text-right text-[10px] uppercase">
                  Time
                </TableHead>
                <TableHead className="text-right text-[10px] uppercase">
                  KM
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patrols.map((p) => {
                const t = patrolTypeMeta(p.patrolType);
                const km = p.computedDistanceKm ?? p.totalDistanceKm;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-[11px] font-medium">
                      {p.leaderName ?? "—"}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      <span aria-hidden="true">{t.glyph}</span>{" "}
                      <span className="text-muted-foreground">{t.label}</span>
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {p.areaName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-[11px] tabular-nums">
                      {elapsedHm(p.startTime, now)}
                    </TableCell>
                    <TableCell className="text-right text-[11px] tabular-nums">
                      {formatKm(km)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </section>
  );
}
