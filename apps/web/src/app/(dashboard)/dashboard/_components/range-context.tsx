"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * WAR ROOM date-range state (2026-06-25, goal items 3-4 / T2).
 *
 * Holds the active FROM/TO range that scopes every range-aware dashboard query
 * on the page. Fixed to a rolling LIVE window of the last 48 hours
 * ([now - 48h, now]) — the Command Center is a live-ops board, not a
 * historical report, so there is no manual date picker (owner decision
 * 2026-07-04). `setRange` is kept for API compatibility (e.g. programmatic
 * callers), but no UI currently drives it.
 */

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function fortyEightHoursAgo(now: Date): Date {
  return new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);
}

export type DashboardRange = {
  /** Inclusive start of the window. */
  from: Date;
  /** Inclusive end of the window. */
  to: Date;
  /** Replace the active range. */
  setRange: (next: { from: Date; to: Date }) => void;
  /**
   * Reset to the default last-48-hours window ending now. Kept as `resetTo7d`
   * for API-shape compatibility with existing callers (e.g. the retired
   * date-range-header.tsx, no longer rendered but still present in the tree)
   * even though the semantics moved from 7 days to 48 hours (2026-07-04).
   */
  resetTo7d: () => void;
};

const DashboardRangeContext = createContext<DashboardRange | null>(null);

export function DashboardRangeProvider({ children }: { children: ReactNode }) {
  // Initialize once to [now - 48 hours, now]. Lazy initializer keeps the
  // default anchored to first render rather than re-deriving on every render.
  const [from, setFrom] = useState<Date>(() => fortyEightHoursAgo(new Date()));
  const [to, setTo] = useState<Date>(() => new Date());

  const setRange = useCallback((next: { from: Date; to: Date }) => {
    setFrom(next.from);
    setTo(next.to);
  }, []);

  const resetTo7d = useCallback(() => {
    const now = new Date();
    setFrom(fortyEightHoursAgo(now));
    setTo(now);
  }, []);

  const value = useMemo<DashboardRange>(
    () => ({ from, to, setRange, resetTo7d }),
    [from, to, setRange, resetTo7d],
  );

  return (
    <DashboardRangeContext.Provider value={value}>
      {children}
    </DashboardRangeContext.Provider>
  );
}

/**
 * Read the active dashboard range. Must be called inside a
 * {@link DashboardRangeProvider}.
 */
export function useDashboardRange(): DashboardRange {
  const ctx = useContext(DashboardRangeContext);
  if (ctx === null) {
    throw new Error(
      "useDashboardRange must be used within a DashboardRangeProvider",
    );
  }
  return ctx;
}
