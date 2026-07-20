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
   * Fold the selected scope's child boundaries (MPAs, hotspots, custom zones)
   * into the report. Applies to a specific municipality AND to a province
   * rollup (the server resolves child zones for every municipality in the
   * province). Default false. Cleared when the scope is broadened back to
   * "all municipalities" or the filter is reset.
   */
  includeChildren: boolean;
  /**
   * Also include patrols that merely TRAVERSE (pass through, without starting
   * in) the selected scope — a specific municipality OR a province rollup.
   * Patrol COUNT never moves: a patrol is counted only where it started.
   * Default false. Cleared when the scope is broadened back to "all
   * municipalities" or the filter is reset.
   */
  includeTraversing: boolean;
  /**
   * ZONE SCOPE ONLY. Count every patrol whose track ENTERS the selected
   * protected zone (+1 each), and credit its FULL patrol distance and FULL
   * patrol time — including the transit that never entered the zone.
   *
   * This SUPERSEDES {@link includeTraversing}'s clipped inside-the-boundary
   * crediting for those same patrols: a traversing patrol contributes EITHER
   * its inside-zone portion (this flag off) OR its full distance/time (this
   * flag on), never both. The server enforces that exclusivity — see
   * `resolveReportScope`, which is also the single place the zone-scope-only
   * guardrail is applied.
   *
   * Rationale (owner, 2026-07-20): you cannot reach Apo Reef without departing
   * Sablayan port, so for a small offshore MPA an origin-in-zone-only count
   * reports almost nothing. The transit IS part of that zone's patrol effort.
   *
   * Accepted consequence: the same patrol is then counted in full in BOTH its
   * origin municipality's report and the zone's report, so the two must never
   * be summed — which is why the printed report is stamped when this is on.
   *
   * Default false. Cleared whenever the zone selection is cleared, the scope
   * is broadened back to "all municipalities", or the filter is reset.
   */
  includeTraversingFull: boolean;
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
  /** Set (or clear) whether full-traversing crediting applies at zone scope. */
  setIncludeTraversingFull: (next: boolean) => void;
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
  const [includeTraversingFull, setIncludeTraversingFullState] =
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
      // Same reason for the zone-scoped full-traversing toggle: broadening to
      // "all municipalities" also drops the MPA-zone selection it depends on,
      // so a stale ON would otherwise keep asking the server for a crediting
      // mode whose target no longer exists.
      setIncludeTraversingFullState(false);
    }
  }, []);

  const setProvince = useCallback((next: string | null) => {
    setProvinceState(next);
    // NOTE (2026-07-20): selecting a province deliberately does NOT clear
    // includeChildren or includeTraversing any more. Both are meaningful at
    // province scope and the server already supports it — resolveChildZoneIds
    // takes a multi-id array and resolveMunicipalityScope returns every
    // municipality in the province, and the bar has enabled the traversing
    // switch for province scope since 2026-07-09. Clearing them here meant
    // picking a province silently flipped an ON toggle back OFF. Broadening
    // back to "all municipalities" (setMunicipalityId(null)) and resetRange()
    // still clear both — those really do leave the toggles without a target.
  }, []);

  const setIncludeChildren = useCallback((next: boolean) => {
    setIncludeChildrenState(next);
  }, []);

  const setIncludeTraversing = useCallback((next: boolean) => {
    setIncludeTraversingState(next);
  }, []);

  const setIncludeTraversingFull = useCallback((next: boolean) => {
    setIncludeTraversingFullState(next);
  }, []);

  const setProtectedZoneId = useCallback((next: string | null) => {
    setProtectedZoneIdState(next);
    // includeTraversingFull is ZONE-SCOPE ONLY: with no zone selected the bar
    // hides its switch and the server refuses the flag, so clearing back to
    // "all zones" must clear it too — never let a hidden toggle keep applying.
    // (Selecting a DIFFERENT zone deliberately keeps it on: the toggle still
    // has a valid target, exactly as picking a province keeps includeChildren
    // / includeTraversing on — see the 2026-07-20 note in setProvince.)
    if (next === null) {
      setIncludeTraversingFullState(false);
    }
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
    setIncludeTraversingFullState(false);
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
      includeTraversingFull,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProvince,
      setIncludeChildren,
      setIncludeTraversing,
      setIncludeTraversingFull,
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
      includeTraversingFull,
      protectedZoneId,
      terrain,
      setRange,
      setMunicipalityId,
      setProvince,
      setIncludeChildren,
      setIncludeTraversing,
      setIncludeTraversingFull,
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
