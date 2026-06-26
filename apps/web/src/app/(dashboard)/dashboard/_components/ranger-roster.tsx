import { Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeShort } from "./lib";

/**
 * WAR ROOM "Ranger Roster" panel (Command Center redesign, sub-batch C).
 *
 * Live who-is-where view derived from dashboard.rangerRoster. Each ranger shows
 * a status dot + text label (never color-alone — WCAG 2.2 AA), last-seen, and
 * patrols-in-range count. A summary line in the header counts each status.
 * Mirrors the section/header/ScrollArea idiom of ActivePatrols / EventFeed.
 */

export type RangerStatus = "on_patrol" | "active" | "idle";

export type RosterRanger = {
  id: string;
  name: string;
  status: RangerStatus;
  lastSeenAt: Date | string | null;
  patrolsInRange: number;
};

export type RosterSummary = {
  total: number;
  onPatrol: number;
  active: number;
  idle: number;
};

const STATUS_META: Record<
  RangerStatus,
  { label: string; dot: string; text: string }
> = {
  // Cyan = live/on-patrol, green = recently active, muted = idle.
  on_patrol: {
    label: "On patrol",
    dot: "bg-[hsl(var(--info))] cc-glow-live",
    text: "text-[hsl(var(--info))]",
  },
  active: {
    label: "Active",
    dot: "bg-[hsl(var(--success))]",
    text: "text-[hsl(var(--success))]",
  },
  idle: {
    label: "Idle",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
};

export function RangerRoster({
  rangers,
  summary,
  isLoading,
  now,
}: {
  rangers: RosterRanger[];
  summary: RosterSummary;
  isLoading: boolean;
  now?: Date | undefined;
}) {
  return (
    <section
      aria-labelledby="warroom-roster-heading"
      className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2
          id="warroom-roster-heading"
          className="text-[11px] font-bold uppercase tracking-wide text-foreground"
        >
          Ranger Roster
        </h2>
        <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground">
          {summary.onPatrol} on patrol · {summary.active} active · {summary.idle}{" "}
          idle
        </span>
      </div>

      <ScrollArea className="max-h-44">
        {isLoading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Loading roster…
          </p>
        ) : rangers.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No rangers on record
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rangers.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                    {r.name}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${meta.text}`}
                  >
                    {meta.label}
                  </span>
                  <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                    {relativeShort(r.lastSeenAt, now)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
