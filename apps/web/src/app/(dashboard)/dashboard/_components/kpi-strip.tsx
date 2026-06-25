import type { LucideIcon } from "lucide-react";
import { ClockCard } from "./clock-card";

/**
 * WAR ROOM KPI strip — 5 stat tiles + live clock.
 * Conforms to docs/v2/mpa-command-center-v6.jsx header row.
 *
 * Each tile pairs a lucide icon (aria-hidden) with a micro-cap uppercase label
 * and a bold value. Color encodes operational meaning; the label always carries
 * the same meaning in text (never color-alone) for WCAG 2.2 AA.
 */

/**
 * Identifies which list a KPI tile drills into when clicked (T5b). Tiles whose
 * underlying records are list-backed carry one of these; the rest are not
 * interactive (we never fake a drill-down for an aggregate with no record list).
 */
export type KpiDrilldown =
  | { kind: "activeEvents" }
  | { kind: "activePatrols" }
  | { kind: "eventsThisMonth" };

type Kpi = {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Tailwind text-color class for the value. */
  valueClass: string;
  /** Optional sub-line, e.g. month delta. */
  sub?: string | undefined;
  subClass?: string | undefined;
  /** When set, the tile is clickable and opens the matching drill-down list. */
  drilldown?: KpiDrilldown | undefined;
};

export function KpiStrip({
  kpis,
  lastSyncedAt,
  onSelectKpi,
}: {
  kpis: Kpi[];
  lastSyncedAt?: number | undefined;
  /** Called with a tile's drill-down descriptor when a clickable tile fires. */
  onSelectKpi?: (drilldown: KpiDrilldown) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {kpis.map((k) => {
        const clickable = k.drilldown !== undefined && onSelectKpi !== undefined;
        const drilldown = k.drilldown;
        return (
          <div
            key={k.label}
            {...(clickable && drilldown !== undefined
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `View ${String(k.value)} ${k.label}`,
                  onClick: () => {
                    onSelectKpi(drilldown);
                  },
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectKpi(drilldown);
                    }
                  },
                }
              : {})}
            className={`flex min-w-[8rem] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 ${
              clickable
                ? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                : ""
            }`}
          >
            <k.icon className={`h-5 w-5 shrink-0 ${k.valueClass}`} aria-hidden="true" />
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
        );
      })}
      <ClockCard lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
