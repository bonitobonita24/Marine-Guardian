/**
 * WAR ROOM "LIVE" status tile.
 * A dedicated, prominent status indicator (not a metric tile) that tells the
 * viewer the whole Command Center is a fixed rolling 48-hour live window
 * (2026-07-04 — split out of LastIncidentCard, which previously carried this
 * as an inline badge, into its own far-left strip tile). Purely presentational:
 * no props, no click behaviour.
 */
export function LiveTile({ className }: { className?: string } = {}) {
  return (
    <section
      aria-label="Live status: rolling last 48 hours"
      className={`flex min-w-[6.5rem] flex-1 self-stretch flex-col items-center justify-center gap-1 rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 px-3 py-1.5 text-center ${
        className ?? ""
      }`}
    >
      <div className="flex items-center gap-1.5" role="status" aria-live="off">
        <span
          aria-hidden="true"
          className="motion-safe:animate-pulse h-2.5 w-2.5 rounded-full bg-[hsl(var(--success))]"
        />
        <span className="text-base font-extrabold uppercase tracking-wide text-[hsl(var(--success))]">
          Live
        </span>
      </div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        Last 48hrs
      </p>
    </section>
  );
}
