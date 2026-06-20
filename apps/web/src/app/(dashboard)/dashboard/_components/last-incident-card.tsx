import { relativeShort } from "./lib";

/**
 * WAR ROOM "Last Incident" tile.
 * Conforms to docs/v2/mpa-command-center-v6.jsx last-incident card — large
 * relative-time value + event identifier. Data from dashboard.lastIncident
 * (most recent high-priority event).
 */

export type LastIncident = {
  id: string;
  title: string | null;
  reportedAt: Date | string | null;
  eventType: { display: string; category: string | null } | null;
} | null;

export function LastIncidentCard({
  incident,
  now,
}: {
  incident: LastIncident;
  now?: Date | undefined;
}) {
  return (
    <section
      aria-labelledby="warroom-incident-heading"
      className="flex min-w-[6.5rem] flex-col items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-center"
    >
      <h2
        id="warroom-incident-heading"
        className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        Last Incident
      </h2>
      {incident === null ? (
        <p className="mt-1 text-xs text-muted-foreground">None</p>
      ) : (
        <>
          <p className="text-2xl font-extrabold text-[hsl(var(--warning))]">
            {relativeShort(incident.reportedAt, now)}
            <span className="sr-only"> ago</span>
          </p>
          <p className="truncate text-[9px] text-muted-foreground">
            {incident.title ?? incident.eventType?.display ?? "Incident"}
          </p>
        </>
      )}
    </section>
  );
}
