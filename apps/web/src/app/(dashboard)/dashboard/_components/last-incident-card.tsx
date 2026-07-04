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
  onSelect,
  live,
}: {
  incident: LastIncident;
  now?: Date | undefined;
  onSelect?: (id: string) => void;
  /**
   * When true, renders a compact "LIVE · last 48h" badge (2026-07-04 — the
   * Command Center moved this tile into the KPI strip's leading slot as a
   * fixed rolling 48h window, replacing the manual date-range picker).
   */
  live?: boolean;
}) {
  const clickable = incident !== null && onSelect !== undefined;
  const incidentTitle =
    incident?.title ?? incident?.eventType?.display ?? "Incident";

  return (
    <section
      aria-labelledby="warroom-incident-heading"
      {...(clickable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `View last incident detail: ${incidentTitle}`,
            onClick: () => {
              onSelect(incident.id);
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(incident.id);
              }
            },
          }
        : {})}
      className={`flex min-w-[6.5rem] flex-1 self-stretch flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card px-3 py-1.5 text-center ${
        clickable
          ? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <h2
          id="warroom-incident-heading"
          className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          Last Incident
        </h2>
        {live === true && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/10 px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide text-[hsl(var(--destructive))]"
            title="Rolling 48-hour live window"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--destructive))]"
            />
            Live
            <span className="font-medium normal-case text-[hsl(var(--destructive))]/80">
              · last 48h
            </span>
          </span>
        )}
      </div>
      {incident === null ? (
        <p className="mt-1 text-xs text-muted-foreground">None</p>
      ) : (
        <>
          <p className="text-2xl font-extrabold leading-tight text-[hsl(var(--warning))]">
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
