import { ClockCard } from "./clock-card";

/**
 * WAR ROOM KPI strip — 5 stat tiles + live clock.
 * Conforms to docs/v2/mpa-command-center-v6.jsx header row.
 *
 * Each tile pairs an emoji glyph (aria-hidden) with a micro-cap uppercase label
 * and a bold value. Color encodes operational meaning; the label always carries
 * the same meaning in text (never color-alone) for WCAG 2.2 AA.
 */

type Kpi = {
  label: string;
  value: number;
  glyph: string;
  /** Tailwind text-color class for the value. */
  valueClass: string;
  /** Optional sub-line, e.g. month delta. */
  sub?: string | undefined;
  subClass?: string | undefined;
};

export function KpiStrip({
  kpis,
  lastSyncedAt,
}: {
  kpis: Kpi[];
  lastSyncedAt?: number | undefined;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="flex min-w-[8rem] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="text-lg" aria-hidden="true">
            {k.glyph}
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {k.label}
            </div>
            <div className={`text-xl font-extrabold ${k.valueClass}`}>
              {k.value}
            </div>
            {k.sub !== undefined && (
              <div className={`text-[10px] ${k.subClass ?? "text-muted-foreground"}`}>
                {k.sub}
              </div>
            )}
          </div>
        </div>
      ))}
      <ClockCard lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
