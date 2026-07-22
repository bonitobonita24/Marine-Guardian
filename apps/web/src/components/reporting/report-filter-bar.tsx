"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useReportFilter } from "./report-filter-context";

/**
 * Interactive Report Map filter bar (2026-06-27).
 *
 * From/To date pickers (shadcn Calendar in a Popover) + a municipality Select,
 * all bound to the shared {@link useReportFilter} context so every panel
 * re-queries in lock-step. The custom pickers replaced native
 * `<input type="date">` (2026-07-22) because the native calendar glyph spaced
 * inconsistently across browsers; each trigger carries an explicit <label> for
 * WCAG 2.2 AA.
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
 * Collapse a Date to LOCAL start-of-day (00:00:00.000). The From bound is
 * inclusive from the first instant of the chosen day, in the operator's
 * timezone (never UTC — that would shift the day across the date boundary).
 */
function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Push a Date to LOCAL end-of-day (23:59:59.999) so the To bound is inclusive
 * of every event on the chosen day.
 */
function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * A single From/To date control: a shadcn Button trigger (formatted date +
 * calendar glyph) opening a Popover-hosted shadcn Calendar. Replaces the native
 * `<input type="date">` whose calendar-glyph spacing rendered inconsistently
 * across browsers — this custom picker owns its full appearance, so From and To
 * are pixel-even at every width. Label stays above the trigger for WCAG 2.2 AA.
 */
function DateRangeField({
  id,
  testId,
  label,
  value,
  onSelect,
  disabled,
  triggerClass,
}: {
  id: string;
  testId: string;
  label: string;
  value: Date;
  onSelect: (day: Date) => void;
  /** Days the calendar must not allow (keeps From ≤ To). */
  disabled?: (date: Date) => boolean;
  /** Height/width/text classes so From and To align in either layout. */
  triggerClass: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            data-testid={testId}
            type="button"
            variant="outline"
            className={cn("justify-start gap-1.5 px-2 font-normal", triggerClass)}
          >
            <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{format(value, "MMM d, yyyy")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            required
            selected={value}
            defaultMonth={value}
            disabled={disabled}
            onSelect={(day) => {
              onSelect(day);
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </>
  );
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
  } = useReportFilter();
  const stacked = layout === "stacked";

  const municipalities = trpc.municipality.list.useQuery();
  const protectedZones = trpc.municipality.protectedZones.useQuery();

  // Zones scoped to the active PROVINCE + municipality filters. A zone carries
  // no province of its own — it inherits one via parentMunicipalityId →
  // municipality.province. The three scopes:
  //   • specific municipality → zones whose parentMunicipalityId matches it;
  //   • province rollup (municipality "all") → zones whose parent municipality
  //     is in that province (fixes 2026-07-12 owner report: an Occidental-Mindoro
  //     zone appearing while the Province filter was Oriental Mindoro);
  //   • all provinces + all municipalities → every zone.
  // Orphan zones (null parentMunicipalityId) can't be attributed to a province,
  // so they surface only under the "all provinces + all municipalities" scope.
  // Memoized on the query data + municipalityId + province so the array
  // reference stays stable across unrelated renders (keeps the reset effect
  // below from re-running for no reason).
  const allZones = useMemo(() => protectedZones.data ?? [], [protectedZones.data]);
  const visibleZones = useMemo(() => {
    if (municipalityId !== null) {
      return allZones.filter((z) => z.parentMunicipalityId === municipalityId);
    }
    if (province !== null) {
      const muniIdsInProvince = new Set(
        (municipalities.data ?? [])
          .filter((m) => m.province === province)
          .map((m) => m.id),
      );
      return allZones.filter(
        (z) =>
          z.parentMunicipalityId !== null &&
          muniIdsInProvince.has(z.parentMunicipalityId),
      );
    }
    return allZones;
  }, [allZones, municipalityId, province, municipalities.data]);
  // Does the CURRENT scope actually have child boundaries to fold in? Only
  // decidable once the zones query has resolved — until then we deliberately
  // report false so the "Include child boundaries" switch stays HIDDEN rather
  // than flashing in and then out when the data lands (chosen over rendering
  // it disabled: a control that appears then vanishes is more jarring than one
  // that simply arrives a beat late, and this panel already mounts collapsed).
  // (`isLoading` / `includeChildren` are strict booleans, so they are used
  // directly — the repo lints `=== true` / `=== false` on a boolean as an
  // unnecessary literal compare. strict-boolean-expressions is still honoured:
  // every non-boolean below is compared explicitly, e.g. `visibleZones.length > 0`.)
  const scopeHasChildBoundaries =
    !protectedZones.isLoading && visibleZones.length > 0;

  // Rule 3(c) — never a dead toggle. The switch renders only when a scope is
  // selected (a specific municipality OR a province rollup) AND that scope
  // provably has child boundaries. In dev data 14 of 16 municipalities have
  // zero child zones, so without this guard ~87.5% of municipality selections
  // showed a live switch that folded in nothing.
  const showIncludeChildrenToggle =
    (municipalityId !== null || province !== null) && scopeHasChildBoundaries;

  // Scope-accurate switch label (2026-07-20 fix). The label was hard-coded to
  // "this municipality's" and stayed that way after province scope was
  // enabled, where the toggle actually folds in the PROVINCE's zones. A
  // specific municipality still wins over the province (selecting a
  // municipality narrows the scope), matching visibleZones above.
  const includeChildrenAriaLabel =
    municipalityId !== null
      ? "Include child boundaries — fold in this municipality's MPAs, hotspots & custom zones"
      : "Include child boundaries — fold in this province's MPAs, hotspots & custom zones";

  // Rule 3(b) — at a SPECIFIC municipality the MPA/zone dropdown is gated on
  // the "Include child boundaries" toggle being ON (you opt into the children
  // before you can narrow to one of them). The province-rollup and
  // all-municipality tiers are unchanged from 2026-07-12 (they fixed a real
  // owner report about an unreachable Occidental-Mindoro zone): while the
  // zones query is still loading we don't yet know whether the scope has
  // zones, so "loading" stays "not yet decided" and the control remains
  // visible rather than prematurely hiding.
  const showZoneFilter =
    municipalityId === null
      ? true
      : includeChildren && scopeHasChildBoundaries;

  // Whenever the municipality changes (or the zone list narrows out from
  // under the current selection) a stale protectedZoneId must not silently
  // persist — reset it back to the "all zones" sentinel (null) so a hidden or
  // out-of-scope control can never keep filtering behind the user's back.
  // Guarded on `protectedZones.isLoading` so we don't reset while the zones
  // query hasn't resolved yet, and on `protectedZoneId !== null` /
  // `stillValid` so this never fires (and therefore never loops) once the
  // selection is already valid or already "all".
  // Extended (Rule 3(b)): switching "Include child boundaries" OFF while a
  // municipality is selected hides the zone dropdown, so the selection must be
  // dropped too — otherwise an invisible zone filter keeps narrowing the whole
  // report. Handled inside this same effect rather than a competing one so
  // there is exactly one owner of the stale-selection reset.
  useEffect(() => {
    if (protectedZones.isLoading) return;
    if (protectedZoneId === null) return;
    const gatedOff = municipalityId !== null && !includeChildren;
    const stillValid = visibleZones.some((z) => z.id === protectedZoneId);
    if (gatedOff || !stillValid) {
      setProtectedZoneId(null);
    }
  }, [
    protectedZoneId,
    protectedZones.isLoading,
    visibleZones,
    municipalityId,
    includeChildren,
    setProtectedZoneId,
  ]);

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

  const handleFromSelect = (day: Date) => {
    // Local start-of-day so the FROM bound includes the whole chosen day.
    setRange({ from: startOfLocalDay(day), to });
  };

  const handleToSelect = (day: Date) => {
    // Local end-of-day so the TO bound is inclusive of the chosen day.
    setRange({ from, to: endOfLocalDay(day) });
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

  /* Switch fields do NOT use `fieldClass`'s stacked `flex-col`. That column
     layout is correct for a Select (the trigger needs the full width UNDER its
     label) but wrong for a Switch: it pushed "Include child boundaries" and
     "Include traversing patrols" onto a second row, diverging from every other
     toggle in the MAP CONTROLS card. Those rows (TrackLegend's Boundaries /
     Skylight events / Photo thumbnails) are all label-left, switch-right on ONE
     row via `flex min-h-7 items-center justify-between gap-2` — mirrored here so
     the embedded filter header matches the panel it sits in.
     In `bar` layout the inner row collapses to `display:contents`, leaving the
     original single-flex-line DOM box behaviour byte-for-byte unchanged. */
  const toggleFieldClass = cn(
    "flex",
    stacked ? "flex-col items-stretch gap-0.5" : "items-center gap-1.5",
  );
  const toggleRowClass = stacked
    ? "flex min-h-7 items-center justify-between gap-2"
    : "contents";
  const toggleHintClass = cn(
    "text-[10px] text-muted-foreground",
    stacked ? "" : "ml-1",
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

      <div className={cn(stacked ? "flex flex-col gap-1.5" : "contents")}>
        <div className={fieldClass}>
          <DateRangeField
            id="report-range-from"
            testId="report-range-from"
            label="From"
            value={from}
            onSelect={handleFromSelect}
            disabled={(date) => date > to}
            triggerClass={
              stacked ? "h-7 w-[8.5rem] text-[11px]" : "h-8 w-40 text-xs"
            }
          />
        </div>

        <div className={fieldClass}>
          <DateRangeField
            id="report-range-to"
            testId="report-range-to"
            label="To"
            value={to}
            onSelect={handleToSelect}
            disabled={(date) => date < startOfLocalDay(from)}
            triggerClass={
              stacked ? "h-7 w-[8.5rem] text-[11px]" : "h-8 w-40 text-xs"
            }
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

      {/* Include child boundaries (Phase 4B) — meaningful for a SPECIFIC
          municipality OR a PROVINCE rollup (the server's resolveChildZoneIds
          accepts a multi-id array and resolveMunicipalityScope returns every
          municipality in a province, so a province-scoped report can fold in
          its MPA zones). Rendered ONLY when the selected scope actually HAS
          child boundaries (Rule 3(c) — no dead toggle). Cleared automatically
          by the context whenever the municipality selection is broadened back
          to "all". */}
      {showIncludeChildrenToggle && (
        <div className={toggleFieldClass} data-testid="report-include-children-field">
          <div className={toggleRowClass}>
            <Label
              htmlFor="report-include-children"
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Include child boundaries
            </Label>
            <Switch
              id="report-include-children"
              data-testid="report-include-children"
              checked={includeChildren}
              onCheckedChange={setIncludeChildren}
              aria-label={includeChildrenAriaLabel}
            />
          </div>
        </div>
      )}

      {/* Include traversing patrols — folds in patrols that merely pass through
          (but did not START in) the selected scope. Meaningful for a SPECIFIC
          municipality OR a PROVINCE rollup (the backend credits coverage to
          every municipality in the province a traversing patrol passes
          through, while the patrol's count still stays at its origin
          municipality) — disabled + hinted, not hidden, only when NEITHER a
          municipality nor a province is selected ("all municipalities" /
          "all provinces"), so the control's presence doesn't jump around
          while its target is unavailable. */}
      <div className={toggleFieldClass} data-testid="report-include-traversing-field">
        <div className={toggleRowClass}>
          <Label
            htmlFor="report-include-traversing"
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            Include traversing patrols
          </Label>
          <Switch
            id="report-include-traversing"
            data-testid="report-include-traversing"
            checked={includeTraversing}
            disabled={municipalityId === null && province === null}
            onCheckedChange={setIncludeTraversing}
            aria-label="Include traversing patrols — fold in patrols that pass through this municipality or province without starting here"
          />
        </div>
        {municipalityId === null && province === null && (
          <span className={toggleHintClass}>
            Select a municipality or province to enable
          </span>
        )}
        {municipalityId === null && province !== null && (
          <span className={toggleHintClass}>
            Credits coverage across {province}&apos;s municipalities — patrol
            count stays at origin
          </span>
        )}
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

          {/* Count full traversing patrols (2026-07-20, owner request) — ZONE
              SCOPE ONLY, and only once a SPECIFIC zone is chosen (not "All
              zones"), which is why it is nested inside the zone block and
              additionally gated on `protectedZoneId !== null` rather than
              rendered disabled: at "All zones" there is no single zone whose
              transit could be credited, so the control has no target at all.
              When ON, every patrol whose track enters the zone is COUNTED and
              contributes its FULL distance/time — superseding (never adding
              to) the clipped inside-the-boundary crediting of "Include
              traversing patrols". Deliberately NOT coupled to that switch:
              the two are independent, and the server resolves the exclusivity.
              Cleared by the context whenever the zone selection is dropped. */}
          {protectedZoneId !== null && (
            <div
              className={toggleFieldClass}
              data-testid="report-include-traversing-full-field"
            >
              <div className={toggleRowClass}>
                <Label
                  htmlFor="report-include-traversing-full"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Count full traversing patrols
                </Label>
                <Switch
                  id="report-include-traversing-full"
                  data-testid="report-include-traversing-full"
                  checked={includeTraversingFull}
                  onCheckedChange={setIncludeTraversingFull}
                  aria-label="Count full traversing patrols — count patrols that pass through this zone and add their full distance and time, even though they started elsewhere"
                />
              </div>
              <span className={toggleHintClass}>
                Counts patrols that only pass through — full distance &amp; time
              </span>
            </div>
          )}
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
