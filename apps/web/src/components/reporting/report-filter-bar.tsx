"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useReportFilter } from "./report-filter-context";

/**
 * Interactive Report Map filter bar (2026-06-27).
 *
 * From/To native date inputs + a municipality Select, all bound to the shared
 * {@link useReportFilter} context so every panel re-queries in lock-step. Native
 * date inputs keep us dependency-free (same pattern as the dashboard's
 * date-range-header); each control carries an explicit <label> for WCAG 2.2 AA.
 *
 * The municipality options are loaded from `municipality.list`. The "all"
 * sentinel maps to a null municipalityId (Radix Select forbids an empty-string
 * value, so we cannot use "" for the all-municipalities option).
 */

const ALL_MUNICIPALITIES = "all";
const ALL_PROVINCES = "__all_provinces__";
const ALL_ZONES = "all";
const ALL_TERRAIN = "all";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Quick day-range presets — set the window to the last N days ending now. */
const RANGE_PRESETS = [
  { label: "30D", days: 30 },
  { label: "15D", days: 15 },
  { label: "7D", days: 7 },
] as const;

/**
 * Format a Date as the `yyyy-MM-dd` value a native date input expects, using
 * LOCAL calendar fields (not UTC) so the displayed day matches the operator's
 * timezone — toISOString() would shift the date across the UTC boundary.
 */
function toDateInputValue(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ReportFilterBar({
  layout = "bar",
}: {
  /** "bar" = bordered horizontal toolbar (default). "stacked" = borderless
   *  vertical layout for embedding in the floating map-controls card. */
  layout?: "bar" | "stacked";
} = {}) {
  const {
    from,
    to,
    municipalityId,
    province,
    protectedZoneId,
    terrain,
    setRange,
    setMunicipalityId,
    setProvince,
    setProtectedZoneId,
    setTerrain,
  } = useReportFilter();
  const stacked = layout === "stacked";

  const municipalities = trpc.municipality.list.useQuery();
  const protectedZones = trpc.municipality.protectedZones.useQuery();

  // Zones scoped to the active municipality — "all municipalities" shows every
  // zone (current behavior); a specific municipality narrows the list to zones
  // whose `parentMunicipalityId` matches it. Zones with a null
  // `parentMunicipalityId` (unassigned/orphan zones) never surface under a
  // specific municipality, only under "all". Memoized on the query data +
  // municipalityId so the array reference stays stable across renders where
  // neither input changed (keeps the reset effect below from re-running for
  // no reason).
  const allZones = useMemo(() => protectedZones.data ?? [], [protectedZones.data]);
  const visibleZones = useMemo(() => {
    if (municipalityId === null) return allZones;
    return allZones.filter((z) => z.parentMunicipalityId === municipalityId);
  }, [allZones, municipalityId]);
  // While the zones query is still loading we don't yet know whether the
  // selected municipality has zones, so treat "loading" as "not yet decided"
  // and keep the control visible rather than prematurely hiding it.
  const showZoneFilter =
    municipalityId === null || protectedZones.isLoading || visibleZones.length > 0;

  // Whenever the municipality changes (or the zone list narrows out from
  // under the current selection) a stale protectedZoneId must not silently
  // persist — reset it back to the "all zones" sentinel (null) so a hidden or
  // out-of-scope control can never keep filtering behind the user's back.
  // Guarded on `protectedZones.isLoading` so we don't reset while the zones
  // query hasn't resolved yet, and on `protectedZoneId !== null` /
  // `stillValid` so this never fires (and therefore never loops) once the
  // selection is already valid or already "all".
  useEffect(() => {
    if (protectedZones.isLoading) return;
    if (protectedZoneId === null) return;
    const stillValid = visibleZones.some((z) => z.id === protectedZoneId);
    if (!stillValid) {
      setProtectedZoneId(null);
    }
  }, [protectedZoneId, protectedZones.isLoading, visibleZones, setProtectedZoneId]);

  // Group the (already canonically-ordered) municipalities by province so the
  // Select shows the owner's province headings (Oriental Mindoro → Occidental
  // Mindoro → Palawan). A Map keyed by province preserves first-appearance
  // order, so provinces and their members stay in the canonical sequence
  // returned by municipality.list.
  const provinceGroups = (() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const m of municipalities.data ?? []) {
      const list = groups.get(m.province) ?? [];
      list.push({ id: m.id, name: m.name });
      groups.set(m.province, list);
    }
    return [...groups.entries()];
  })();

  // Distinct province names, canonical order preserved (Map insertion order
  // from provinceGroups above, which itself preserves municipality.list's
  // canonical order).
  const provinceNames = provinceGroups.map(([name]) => name);

  // When a province is selected, the Municipality select narrows to only that
  // province's group; otherwise show every province group (today's behavior).
  const visibleProvinceGroups =
    province === null
      ? provinceGroups
      : provinceGroups.filter(([name]) => name === province);

  const setLastNDays = (days: number) => {
    const now = new Date();
    setRange({ from: new Date(now.getTime() - days * DAY_MS), to: now });
  };
  // Which preset (if any) matches the active window — drives the pressed style.
  const activeDays = Math.round((to.getTime() - from.getTime()) / DAY_MS);

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return; // ignore cleared input
    const next = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from: next, to });
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    // Local end-of-day so the TO bound is inclusive of the chosen day.
    const next = new Date(`${raw}T23:59:59.999`);
    if (Number.isNaN(next.getTime())) return;
    setRange({ from, to: next });
  };

  const handleMunicipalityChange = (value: string) => {
    setMunicipalityId(value === ALL_MUNICIPALITIES ? null : value);
  };

  const handleProvinceChange = (value: string) => {
    if (value === ALL_PROVINCES) {
      setProvince(null);
      return;
    }
    // A province rollup clears any specific municipality selection — the two
    // scopes are mutually exclusive at the "select a province" moment.
    setProvince(value);
    setMunicipalityId(null);
  };

  const handleProtectedZoneChange = (value: string) => {
    setProtectedZoneId(value === ALL_ZONES ? null : value);
  };

  const handleTerrainChange = (value: string) => {
    setTerrain(value === ALL_TERRAIN ? null : (value as "land" | "water"));
  };

  const fieldClass = cn(
    "flex",
    stacked ? "flex-col items-start gap-0.5" : "items-center gap-1.5",
  );

  return (
    <div
      role="region"
      aria-label="Report map filters"
      className={cn(
        stacked
          ? "flex flex-col gap-1"
          : "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2",
      )}
    >
      {/* Quick day-range presets — sit ABOVE From/To so the common windows are
          one click away; the matching preset is highlighted. */}
      <div
        role="group"
        aria-label="Quick date range"
        className={cn(stacked ? "grid grid-cols-3 gap-1" : "flex items-center gap-1")}
      >
        {RANGE_PRESETS.map((p) => {
          const active = activeDays === p.days;
          return (
            <Button
              key={p.days}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              className={cn(stacked ? "h-7 w-full px-0 text-[11px]" : "h-8")}
              onClick={() => {
                setLastNDays(p.days);
              }}
              data-testid={`report-range-preset-${String(p.days)}`}
            >
              Last {p.label}
            </Button>
          );
        })}
      </div>

      <div className={cn(stacked ? "grid grid-cols-2 gap-1" : "contents")}>
        <div className={fieldClass}>
          <Label
            htmlFor="report-range-from"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            From
          </Label>
          <Input
            id="report-range-from"
            data-testid="report-range-from"
            type="date"
            className={cn(
              stacked ? "h-7 w-full text-[11px]" : "h-8 w-[8.5rem] text-xs",
            )}
            value={toDateInputValue(from)}
            max={toDateInputValue(to)}
            onChange={handleFromChange}
          />
        </div>

        <div className={fieldClass}>
          <Label
            htmlFor="report-range-to"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            To
          </Label>
          <Input
            id="report-range-to"
            data-testid="report-range-to"
            type="date"
            className={cn(
              stacked ? "h-7 w-full text-[11px]" : "h-8 w-[8.5rem] text-xs",
            )}
            value={toDateInputValue(to)}
            min={toDateInputValue(from)}
            onChange={handleToChange}
          />
        </div>
      </div>

      {/* Province rollup — narrows the Municipality select to a single
          province's group and clears any specific municipality selection
          (a province-wide report scope). "All provinces" restores every
          group in the Municipality select. */}
      <div className={fieldClass}>
        <Label
          htmlFor="report-province"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Province
        </Label>
        <Select value={province ?? ALL_PROVINCES} onValueChange={handleProvinceChange}>
          <SelectTrigger
            id="report-province"
            data-testid="report-province"
            className={cn(stacked ? "h-7 w-full text-[11px]" : "h-8 w-[12rem] text-xs")}
          >
            <SelectValue placeholder="All provinces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROVINCES}>All provinces</SelectItem>
            {provinceNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={fieldClass}>
        <Label
          htmlFor="report-municipality"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Municipality
        </Label>
        <Select
          value={municipalityId ?? ALL_MUNICIPALITIES}
          onValueChange={handleMunicipalityChange}
        >
          <SelectTrigger
            id="report-municipality"
            data-testid="report-municipality"
            className={cn(stacked ? "h-7 w-full text-[11px]" : "h-8 w-[12rem] text-xs")}
          >
            <SelectValue placeholder="All municipalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MUNICIPALITIES}>All municipalities</SelectItem>
            {visibleProvinceGroups.map(([provinceName, items]) => (
              <SelectGroup key={provinceName}>
                <SelectLabel>{provinceName}</SelectLabel>
                {items.map((m) => (
                  // Indent municipalities under their province heading (owner
                  // request) so they don't left-align with the Region label.
                  <SelectItem key={m.id} value={m.id} className="pl-6">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* MPA scope — narrow events/patrols to a single protected zone (Apo Reef,
          Harka Piloto), scoped to the selected municipality. Hidden entirely
          when the selected municipality has no protected zones. */}
      {showZoneFilter && (
        <div className={fieldClass}>
          <Label
            htmlFor="report-protected-zone"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            MPA Zone
          </Label>
          <Select
            value={protectedZoneId ?? ALL_ZONES}
            onValueChange={handleProtectedZoneChange}
          >
            <SelectTrigger
              id="report-protected-zone"
              data-testid="report-protected-zone"
              className={cn(stacked ? "h-7 w-full text-[11px]" : "h-8 w-[12rem] text-xs")}
            >
              <SelectValue placeholder="All zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ZONES}>All zones</SelectItem>
              {visibleZones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Spatial Terrain filter (2026-07-08) — narrows events/patrols to a
          geometry-derived Land or Water classification (Event.terrain /
          Patrol.terrain). Distinct from the self-reported foot/seaborne
          Patrol.patrolType — deliberately labeled "Terrain" to avoid
          confusion with that field. */}
      <div className={fieldClass}>
        <Label
          htmlFor="report-terrain"
          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Terrain
        </Label>
        <Select value={terrain ?? ALL_TERRAIN} onValueChange={handleTerrainChange}>
          <SelectTrigger
            id="report-terrain"
            data-testid="report-terrain"
            className={cn(stacked ? "h-7 w-full text-[11px]" : "h-8 w-[8rem] text-xs")}
          >
            <SelectValue placeholder="All terrain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TERRAIN}>All</SelectItem>
            <SelectItem value="land">Land</SelectItem>
            <SelectItem value="water">Water</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
