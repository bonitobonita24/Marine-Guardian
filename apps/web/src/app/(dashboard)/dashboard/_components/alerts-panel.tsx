"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { priorityLabel, priorityLevel, relativeShort } from "./lib";

/**
 * WAR ROOM "Alerts & Escalations" panel.
 * Conforms to docs/v2/mpa-command-center-v6.jsx alerts card.
 *
 * ACK support (owner-approved 2026-06-21):
 *   - Unacknowledged alerts show an ACK button (admin/site_admin only — canAck prop).
 *   - Acknowledged alerts show who acknowledged + when instead of the button.
 *   - WCAG 2.2 AA: button has aria-label; ack state is never colour-alone (text label added).
 */

export type AlertItem = {
  id: string;
  firedAt: Date | string;
  matchedPriority: number;
  ruleName: string;
  eventTitle: string;
  acknowledgedAt?: Date | string | null;
  acknowledgedBy?: string | null;
};

export function AlertsPanel({
  alerts,
  isLoading,
  now,
  canAck = false,
  ackingId,
  onAcknowledge,
}: {
  alerts: AlertItem[];
  isLoading: boolean;
  now?: Date | undefined;
  /** True when the current user has admin/site_admin role — shows the ACK button. */
  canAck?: boolean;
  /** ID of the alert currently being acknowledged (optimistic spinner). */
  ackingId?: string | null;
  /** Called when the user clicks ACK on an unacknowledged alert. */
  onAcknowledge?: (id: string) => void;
}) {
  const unackedCount = alerts.filter((a) => a.acknowledgedAt == null).length;

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
          {unackedCount} unacked
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
              const isAcked = a.acknowledgedAt != null;
              const isAcking = ackingId === a.id;

              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                    isAcked
                      ? "opacity-60"
                      : isHigh
                        ? "bg-destructive/10"
                        : ""
                  }`}
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      isAcked
                        ? "bg-muted-foreground"
                        : "bg-destructive " + (isHigh ? "animate-warroom-pulse" : "")
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[11px] font-bold ${
                        isAcked
                          ? "text-muted-foreground line-through"
                          : isHigh
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {a.eventTitle || a.ruleName}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {a.ruleName} · {priorityLabel(a.matchedPriority)} ·{" "}
                      {relativeShort(a.firedAt, now)} ago
                    </div>
                    {isAcked && a.acknowledgedAt != null && (
                      <div className="text-[9px] text-muted-foreground">
                        Acknowledged {relativeShort(a.acknowledgedAt, now)} ago
                      </div>
                    )}
                  </div>

                  {/* ACK control — visible to admins only; acked alerts show badge */}
                  {isAcked ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[9px] text-muted-foreground"
                    >
                      ACK
                    </Badge>
                  ) : canAck ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-[9px]"
                      aria-label={`Acknowledge alert: ${a.eventTitle || a.ruleName}`}
                      disabled={isAcking}
                      onClick={() => onAcknowledge?.(a.id)}
                    >
                      {isAcking ? "…" : "ACK"}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[9px]">
                      {priorityLabel(a.matchedPriority)}
                    </Badge>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </ScrollArea>
    </section>
  );
}
