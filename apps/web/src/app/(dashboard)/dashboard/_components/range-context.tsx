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
 * on the page. Defaults to the last 7 days ([now - 7d, now]) per the War Room
 * spec in docs/PRODUCT.md. The picker (T3) and panels (T4) read/write through
 * this single shared context so all panels re-query in lock-step when the range
 * changes.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo(now: Date): Date {
  return new Date(now.getTime() - SEVEN_DAYS_MS);
}

export type DashboardRange = {
  /** Inclusive start of the window. */
  from: Date;
  /** Inclusive end of the window. */
  to: Date;
  /** Replace the active range. */
  setRange: (next: { from: Date; to: Date }) => void;
  /** Reset to the default last-7-days window ending now. */
  resetTo7d: () => void;
};

const DashboardRangeContext = createContext<DashboardRange | null>(null);

export function DashboardRangeProvider({ children }: { children: ReactNode }) {
  // Initialize once to [now - 7 days, now]. Lazy initializer keeps the default
  // anchored to first render rather than re-deriving on every render.
  const [from, setFrom] = useState<Date>(() => sevenDaysAgo(new Date()));
  const [to, setTo] = useState<Date>(() => new Date());

  const setRange = useCallback((next: { from: Date; to: Date }) => {
    setFrom(next.from);
    setTo(next.to);
  }, []);

  const resetTo7d = useCallback(() => {
    const now = new Date();
    setFrom(sevenDaysAgo(now));
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
