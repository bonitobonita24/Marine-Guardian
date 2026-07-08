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
 * has no municipality filter. Both surfaces default to a 7-day window (the
 * report surface was changed from 30 → 7 days on 2026-06-28 per owner request,
 * so opening the map lands on recent activity by default). Keeping the two
 * providers separate avoids over-coupling the surfaces — the report page owns
 * its own provider.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo(now: Date): Date {
  return new Date(now.getTime() - SEVEN_DAYS_MS);
}

export type ReportFilter = {
  /** Inclusive start of the window. */
  from: Date;
  /** Inclusive end of the window. */
  to: Date;
  /** Active municipality filter; null = all municipalities. */
  municipalityId: string | null;
  /** Active MPA (protected-zone) scope filter; null = all zones. */
  protectedZoneId: string | null;
  /**
   * Active spatial terrain filter; null = all terrain. Geometry-derived
   * classifier (Event.terrain / Patrol.terrain) — DISTINCT from the
   * self-reported Patrol.patrolType (foot/seaborne).
   */
  terrain: "land" | "water" | null;
  /** Replace the active date range. */
  setRange: (next: { from: Date; to: Date }) => void;
  /** Set (or clear, with null) the active municipality. */
  setMunicipalityId: (next: string | null) => void;
  /** Set (or clear, with null) the active MPA scope. */
  setProtectedZoneId: (next: string | null) => void;
  /** Set (or clear, with null) the active terrain filter. */
  setTerrain: (next: "land" | "water" | null) => void;
  /** Reset to the default last-7-days window ending now + all municipalities. */
  resetRange: () => void;
};

const ReportFilterContext = createContext<ReportFilter | null>(null);

export function ReportFilterProvider({ children }: { children: ReactNode }) {
  // Lazy initializers anchor the default window to first render.
  const [from, setFrom] = useState<Date>(() => sevenDaysAgo(new Date()));
  const [to, setTo] = useState<Date>(() => new Date());
  const [municipalityId, setMunicipalityIdState] = useState<string | null>(null);
  const [protectedZoneId, setProtectedZoneIdState] = useState<string | null>(
    null,
  );
  const [terrain, setTerrainState] = useState<"land" | "water" | null>(null);

  const setRange = useCallback((next: { from: Date; to: Date }) => {
    setFrom(next.from);
    setTo(next.to);
  }, []);

  const setMunicipalityId = useCallback((next: string | null) => {
    setMunicipalityIdState(next);
  }, []);

  const setProtectedZoneId = useCallback((next: string | null) => {
    setProtectedZoneIdState(next);
  }, []);

  const setTerrain = useCallback((next: "land" | "water" | null) => {
    setTerrainState(next);
  }, []);

  const resetRange = useCallback(() => {
    const now = new Date();
    setFrom(sevenDaysAgo(now));
    setTo(now);
    setMunicipalityIdState(null);
    setProtectedZoneIdState(null);
    setTerrainState(null);
  }, []);

  const value = useMemo<ReportFilter>(
    () => ({
      from,
      to,
      municipalityId,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProtectedZoneId,
      setTerrain,
      resetRange,
    }),
    [
      from,
      to,
      municipalityId,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProtectedZoneId,
      setTerrain,
      resetRange,
    ],
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
