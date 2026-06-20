/**
 * WAR ROOM compact event-breakdown bars.
 * Conforms to docs/v2/mpa-command-center-v6.jsx law-enforcement / monitoring
 * mini-cards (labeled horizontal bars). Data from dashboard.eventBreakdown.
 */

export type BreakdownDatum = { type: string; count: number };

export function BreakdownBars({
  title,
  data,
  barClass,
}: {
  title: string;
  data: BreakdownDatum[];
  /** Tailwind bg-color class for the filled bar. */
  barClass: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);
  return (
    <section
      aria-labelledby={`breakdown-${title.replace(/\s+/g, "-").toLowerCase()}`}
      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2"
    >
      <h3
        id={`breakdown-${title.replace(/\s+/g, "-").toLowerCase()}`}
        className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="py-2 text-[10px] text-muted-foreground">No events</p>
      ) : (
        <ul className="space-y-1">
          {data.map((d) => (
            <li key={d.type} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-right text-[10px] text-muted-foreground">
                {d.type}
              </span>
              <span
                className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted"
                aria-hidden="true"
              >
                <span
                  className={`block h-full rounded-sm ${barClass}`}
                  style={{
                    width: max > 0 ? `${String((d.count / max) * 100)}%` : "0%",
                  }}
                />
              </span>
              <span className="w-5 shrink-0 text-right text-[10px] font-semibold text-foreground tabular-nums">
                {d.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
