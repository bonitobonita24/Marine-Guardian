import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  priorityDotClass,
  priorityLabel,
  priorityLevel,
  relativeShort,
} from "./lib";

/**
 * WAR ROOM "Live Event Feed".
 * Conforms to docs/v2/mpa-command-center-v6.jsx feed card — priority dots,
 * state badges (new/active/resolved), high-priority row highlight, scroll
 * container.
 */

export type FeedEvent = {
  id: string;
  title: string | null;
  priority: number;
  state: string;
  reportedAt: Date | string | null;
  eventType: { display: string; category: string | null } | null;
};

function stateBadgeVariant(
  state: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "new_event":
      return "default";
    case "active":
      return "secondary";
    case "resolved":
      return "outline";
    default:
      return "outline";
  }
}

function stateLabel(state: string): string {
  return state.replace(/_event$/, "").replace(/_/g, " ");
}

export function EventFeed({
  events,
  isLoading,
  now,
  onSelectEvent,
}: {
  events: FeedEvent[];
  isLoading: boolean;
  now?: Date | undefined;
  onSelectEvent?: (id: string) => void;
}) {
  return (
    <section
      aria-labelledby="warroom-feed-heading"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]"
          aria-hidden="true"
        />
        <h2
          id="warroom-feed-heading"
          className="text-[11px] font-bold uppercase tracking-wide text-foreground"
        >
          Live Event Feed
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <ul className="space-y-0.5 p-2">
          {isLoading ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading events…
            </li>
          ) : events.length === 0 ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No events recorded yet
            </li>
          ) : (
            events.map((e) => {
              const level = priorityLevel(e.priority);
              const isHigh = level === "critical" || level === "high";
              const clickable = onSelectEvent !== undefined;
              const title = e.title ?? e.eventType?.display ?? "Untitled event";
              return (
                <li
                  key={e.id}
                  {...(clickable
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-label": `View event detail: ${title}`,
                        onClick: () => {
                          onSelectEvent(e.id);
                        },
                        onKeyDown: (ev: React.KeyboardEvent) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            onSelectEvent(e.id);
                          }
                        },
                      }
                    : {})}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    isHigh ? "bg-destructive/5" : ""
                  } ${
                    clickable
                      ? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      : ""
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDotClass(e.priority)}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[11px] ${
                        level === "critical"
                          ? "font-bold text-foreground"
                          : "text-foreground"
                      }`}
                    >
                      <span className="sr-only">
                        {priorityLabel(e.priority)} priority:{" "}
                      </span>
                      {e.title ?? e.eventType?.display ?? "Untitled event"}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {e.eventType?.display ?? "Unknown type"} ·{" "}
                      {relativeShort(e.reportedAt, now)} ago
                    </div>
                  </div>
                  <Badge
                    variant={stateBadgeVariant(e.state)}
                    className="shrink-0 text-[9px] capitalize"
                  >
                    {stateLabel(e.state)}
                  </Badge>
                </li>
              );
            })
          )}
        </ul>
      </ScrollArea>
    </section>
  );
}
