"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

/**
 * Command Center map municipality selector (2026-07-04).
 *
 * A compact, CC-local municipality filter for the floating "Map controls"
 * card — mirrors the Interactive Report Map's municipality Select
 * (report-filter-bar.tsx) but stays scoped to ONLY the municipality control
 * (no From/To, no MPA-zone) since the Command Center is not wrapped in
 * ReportFilterProvider.
 *
 * The "all" sentinel maps to a null municipalityId (Radix Select forbids an
 * empty-string item value), matching the report-filter-bar convention.
 */

const ALL_MUNICIPALITIES = "all";

export function MapMunicipalitySelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const municipalities = trpc.municipality.list.useQuery();

  // Group by province (same first-appearance-order pattern as
  // report-filter-bar) so the CC select shows the same province headings.
  const provinceGroups = (() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const m of municipalities.data ?? []) {
      const list = groups.get(m.province) ?? [];
      list.push({ id: m.id, name: m.name });
      groups.set(m.province, list);
    }
    return [...groups.entries()];
  })();

  const handleChange = (next: string) => {
    onChange(next === ALL_MUNICIPALITIES ? null : next);
  };

  return (
    <div className="flex flex-col items-start gap-0.5">
      <Label
        htmlFor="cc-map-municipality"
        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        Municipality
      </Label>
      <Select value={value ?? ALL_MUNICIPALITIES} onValueChange={handleChange}>
        <SelectTrigger
          id="cc-map-municipality"
          data-testid="cc-map-municipality"
          className="h-7 w-full text-[11px]"
        >
          <SelectValue placeholder="All municipalities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MUNICIPALITIES}>All municipalities</SelectItem>
          {provinceGroups.map(([province, items]) => (
            <SelectGroup key={province}>
              <SelectLabel>{province}</SelectLabel>
              {items.map((m) => (
                <SelectItem key={m.id} value={m.id} className="pl-6">
                  {m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
