import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { priorityLabel, priorityLevel, relativeShort } from "./lib";

/**
 * WAR ROOM "Alerts & Escalations" panel.
 * Conforms to docs/v2/mpa-command-center-v6.jsx alerts card.
 *
 * READ-ONLY by design: AlertHistory has no acknowledgement field and no ack
 * mutation exists, so there is nothing to acknowledge against. The mockup's ACK
 * button is intentionally omitted and an honest caption explains why. Adding ack
 * tracking is logged as an owner [WHAT] (requires a schema change).
 */

export type AlertItem = {
  id: string;
  firedAt: Date | string;
  matchedPriority: number;
  ruleName: string;
  eventTitle: string;
};

export function AlertsPanel({
  alerts,
  isLoading,
  now,
}: {
  alerts: AlertItem[];
  isLoading: boolean;
  now?: Date | undefined;
}) {
  return (
    <section
      aria-labelledby="warroom-alerts-heading"
      className="overflow-hidden rounded-xl border border-destructive/40 bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border bg-[var(--danger-bg)] px-3 py-2">
        <span aria-hidden="true">🚨</span>
        <h2
          id="warroom-alerts-heading"
          className="text-[11px] font-bold uppercase tracking-wide text-destructive"
        >
          Alerts &amp; Escalations
        </h2>
        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {alerts.length}
        </span>
      </div>

      <ScrollArea className="max-h-44">
        <ul className="space-y-1 p-2">
          {isLoading ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading alerts…
            </li>
          ) : alerts.length === 0 ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No alerts fired recently
            </li>
          ) : (
            alerts.map((a) => {
              const level = priorityLevel(a.matchedPriority);
              const isHigh = level === "critical" || level === "high";
              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                    isHigh ? "bg-destructive/10" : ""
                  }`}
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive ${
                      isHigh ? "animate-warroom-pulse" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[11px] font-bold ${
                        isHigh ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {a.eventTitle || a.ruleName}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {a.ruleName} · {priorityLabel(a.matchedPriority)} ·{" "}
                      {relativeShort(a.firedAt, now)} ago
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[9px]">
                    {priorityLabel(a.matchedPriority)}
                  </Badge>
                </li>
              );
            })
          )}
        </ul>
      </ScrollArea>

      <p className="border-t border-border px-3 py-1.5 text-[9px] leading-snug text-muted-foreground">
        Read-only — alert acknowledgement is not yet tracked in this system.
      </p>
    </section>
  );
}
