"use client";

import type { KeyboardEvent } from "react";
import { Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { priorityLabel, priorityLevel, relativeShort } from "./lib";

/**
 * WAR ROOM "Alerts & Escalations" panel.
 * Conforms to docs/v2/mpa-command-center-v6.jsx alerts card.
 *
 * ACK support (owner-approved 2026-06-21):
 *   - Unacknowledged alerts show an ACK button (admin/site_admin only — canAck prop).
 *   - Acknowledged alerts show who acknowledged + when instead of the button.
 *   - WCAG 2.2 AA: button has aria-label; ack state is never colour-alone (text label added).
 *
 * Click→detail (2026-06-25, T5/War Room): each fired-alert row is clickable and
 * opens a detail Dialog (rule name, fired time, ack state, event link). The ACK
 * button stops click propagation so acknowledging never also opens the modal.
 * WCAG 2.2 AA: rows are role="button", tabIndex 0, Enter/Space activate, with an
 * aria-label describing the alert.
 */

export type AlertItem = {
  id: string;
  firedAt: Date | string;
  matchedPriority: number;
  ruleName: string;
  eventTitle: string;
  /** Linked event id, if the alert fired against a known event (for the detail modal). */
  eventId?: string | null;
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
  onSelectAlert,
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
  /** Called when the user activates an alert row — opens the detail modal. */
  onSelectAlert?: (alert: AlertItem) => void;
}) {
  const unackedCount = alerts.filter((a) => a.acknowledgedAt == null).length;

  return (
    <Card
      aria-labelledby="warroom-alerts-heading"
      className="gap-0 overflow-hidden border-destructive/40 py-0"
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border bg-[var(--danger-bg)] px-3 py-2">
        <Siren className="h-4 w-4 text-destructive" aria-hidden="true" />
        <CardTitle
          id="warroom-alerts-heading"
          className="text-xs font-semibold uppercase tracking-wide text-destructive"
        >
          Alerts &amp; Escalations
        </CardTitle>
        <Badge variant="destructive" className="ml-auto rounded-full text-xs">
          {unackedCount} unacked
        </Badge>
      </CardHeader>

      <CardContent className="max-h-44 overflow-y-auto p-0 pb-2">
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
              const clickable = onSelectAlert !== undefined;
              const alertLabel = a.eventTitle || a.ruleName;
              const open = () => onSelectAlert?.(a);
              const onKeyDown = (ev: KeyboardEvent) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  open();
                }
              };

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
                  <div
                    className={`min-w-0 flex-1 ${
                      clickable
                        ? "cursor-pointer rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        : ""
                    }`}
                    {...(clickable
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-label": `View alert detail: ${alertLabel}`,
                          onClick: open,
                          onKeyDown,
                        }
                      : {})}
                  >
                    <div
                      className={`truncate text-xs font-bold ${
                        isAcked
                          ? "text-muted-foreground line-through"
                          : isHigh
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {alertLabel}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.ruleName} · {priorityLabel(a.matchedPriority)} ·{" "}
                      {relativeShort(a.firedAt, now)} ago
                    </div>
                    {isAcked && a.acknowledgedAt != null && (
                      <div className="text-xs text-muted-foreground">
                        Acknowledged {relativeShort(a.acknowledgedAt, now)} ago
                      </div>
                    )}
                  </div>

                  {/* ACK control — visible to admins only; acked alerts show badge */}
                  {isAcked ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      ACK
                    </Badge>
                  ) : canAck ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-xs"
                      aria-label={`Acknowledge alert: ${alertLabel}`}
                      disabled={isAcking}
                      onClick={(ev) => {
                        // Keep ACK separate from row-click→detail-modal.
                        ev.stopPropagation();
                        onAcknowledge?.(a.id);
                      }}
                    >
                      {isAcking ? "…" : "ACK"}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {priorityLabel(a.matchedPriority)}
                    </Badge>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
