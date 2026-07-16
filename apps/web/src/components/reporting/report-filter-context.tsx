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
  /** Active province rollup filter; null = all provinces. */
  province: string | null;
  /**
   * When a specific municipality is selected, fold in that municipality's
   * child boundaries (MPAs, hotspots, custom zones) into the scope. Default
   * false. Meaningless (and always cleared) outside a specific-municipality
   * selection.
   */
  includeChildren: boolean;
  /**
   * When a specific municipality is selected, also include patrols that
   * merely TRAVERSE (pass through, without starting in) that municipality.
   * Default false. Meaningless (and always cleared) outside a
   * specific-municipality selection — backend traversing computation is
   * single-municipality only.
   */
  includeTraversing: boolean;
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
  /** Set (or clear, with null) the active province rollup. */
  setProvince: (next: string | null) => void;
  /** Set (or clear) whether child boundaries are folded into the scope. */
  setIncludeChildren: (next: boolean) => void;
  /** Set (or clear) whether traversing patrols are folded into the scope. */
  setIncludeTraversing: (next: boolean) => void;
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
  const [province, setProvinceState] = useState<string | null>(null);
  const [includeChildren, setIncludeChildrenState] = useState<boolean>(false);
  const [includeTraversing, setIncludeTraversingState] =
    useState<boolean>(false);
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
    // Clearing back to "all municipalities" hides the include-children /
    // include-traversing toggles — never let a stale ON silently keep
    // applying once hidden.
    if (next === null) {
      setIncludeChildrenState(false);
      setIncludeTraversingState(false);
    }
  }, []);

  const setProvince = useCallback((next: string | null) => {
    setProvinceState(next);
    // A province rollup is mutually exclusive with a specific-municipality
    // selection (see handleProvinceChange) — the include-children /
    // include-traversing toggles are only meaningful for a specific
    // municipality, so clear them here too.
    if (next !== null) {
      setIncludeChildrenState(false);
      setIncludeTraversingState(false);
    }
  }, []);

  const setIncludeChildren = useCallback((next: boolean) => {
    setIncludeChildrenState(next);
  }, []);

  const setIncludeTraversing = useCallback((next: boolean) => {
    setIncludeTraversingState(next);
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
    setProvinceState(null);
    setIncludeChildrenState(false);
    setIncludeTraversingState(false);
    setProtectedZoneIdState(null);
    setTerrainState(null);
  }, []);

  const value = useMemo<ReportFilter>(
    () => ({
      from,
      to,
      municipalityId,
      province,
      includeChildren,
      includeTraversing,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProvince,
      setIncludeChildren,
      setIncludeTraversing,
      setProtectedZoneId,
      setTerrain,
      resetRange,
    }),
    [
      from,
      to,
      municipalityId,
      province,
      includeChildren,
      includeTraversing,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProvince,
      setIncludeChildren,
      setIncludeTraversing,
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
