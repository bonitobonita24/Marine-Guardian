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
 * REPORTING filter state for the Interactive Report Map (2026-06-27).
 *
 * Extends the dashboard's range-only context with a MUNICIPALITY dimension:
 * the report surface (presented to the Mayor / investors) scopes every panel —
 * map markers, patrol tracks, breakdown + coverage + time charts, KPI tiles —
 * by a shared {from, to, municipalityId} filter. `municipalityId === null`
 * means "all municipalities".
 *
 * Distinct from the Command Center's DashboardRangeProvider on purpose: the CC
 * has no municipality filter and defaults to a 7-day window, while the report
 * surface defaults to the last 30 days (matching the municipality-coverage
 * aggregation window). Keeping them separate avoids over-coupling the two
 * surfaces — the report page owns its own provider.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function thirtyDaysAgo(now: Date): Date {
  return new Date(now.getTime() - THIRTY_DAYS_MS);
}

export type ReportFilter = {
  /** Inclusive start of the window. */
  from: Date;
  /** Inclusive end of the window. */
  to: Date;
  /** Active municipality filter; null = all municipalities. */
  municipalityId: string | null;
  /** Replace the active date range. */
  setRange: (next: { from: Date; to: Date }) => void;
  /** Set (or clear, with null) the active municipality. */
  setMunicipalityId: (next: string | null) => void;
  /** Reset to the default last-30-days window ending now + all municipalities. */
  resetTo30d: () => void;
};

const ReportFilterContext = createContext<ReportFilter | null>(null);

export function ReportFilterProvider({ children }: { children: ReactNode }) {
  // Lazy initializers anchor the default window to first render.
  const [from, setFrom] = useState<Date>(() => thirtyDaysAgo(new Date()));
  const [to, setTo] = useState<Date>(() => new Date());
  const [municipalityId, setMunicipalityIdState] = useState<string | null>(null);

  const setRange = useCallback((next: { from: Date; to: Date }) => {
    setFrom(next.from);
    setTo(next.to);
  }, []);

  const setMunicipalityId = useCallback((next: string | null) => {
    setMunicipalityIdState(next);
  }, []);

  const resetTo30d = useCallback(() => {
    const now = new Date();
    setFrom(thirtyDaysAgo(now));
    setTo(now);
    setMunicipalityIdState(null);
  }, []);

  const value = useMemo<ReportFilter>(
    () => ({
      from,
      to,
      municipalityId,
      setRange,
      setMunicipalityId,
      resetTo30d,
    }),
    [from, to, municipalityId, setRange, setMunicipalityId, resetTo30d],
  );

  return (
    <ReportFilterContext.Provider value={value}>
      {children}
    </ReportFilterContext.Provider>
  );
}

/**
 * Read the active report filter. Must be called inside a
 * {@link ReportFilterProvider}.
 */
export function useReportFilter(): ReportFilter {
  const ctx = useContext(ReportFilterContext);
  if (ctx === null) {
    throw new Error(
      "useReportFilter must be used within a ReportFilterProvider",
    );
  }
  return ctx;
}
