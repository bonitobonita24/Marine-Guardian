"use client";

/**
 * EventsList — Milestone 3 (q-ops-01)
 *
 * Replaces the Kanban board with a continuous infinite-scroll vertical list:
 *   • Newest-first (orderBy createdAt desc), 50 records/page, cursor pagination
 *   • Server-side filters: state, category, areaName, dateFrom/dateTo
 *   • Inline state control: Select (New / Active / Resolved) per row
 *   • Row click → EventDetailModal (M2 Edit/History tabs)
 *   • WCAG 2.2 AA: state never by color alone (badge text + icon), keyboard-operable
 *     inline controls, role="list"/role="listitem", focus management
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Circle,
  Play,
  Check,
  Scale,
  Telescope,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EventDetailModal } from "@/components/events/event-detail-modal";
import { trpc } from "@/lib/trpc/client";
import { eventPrimaryLabel, eventTypeLabel } from "@/lib/event-label";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers";

// ── Types ─────────────────────────────────────────────────────────────────

type EventListItem = inferRouterOutputs<AppRouter>["event"]["list"]["items"][number];
type EventState    = "new_event" | "active" | "resolved";

// ── Priority helpers ───────────────────────────────────────────────────────

function priorityLabel(priority: number): string {
  if (priority >= 3) return "Critical";
  if (priority === 2) return "High";
  if (priority === 1) return "Medium";
  return "Low";
}

function priorityVariant(priority: number): "destructive" | "default" | "secondary" | "outline" {
  if (priority >= 3) return "destructive";
  if (priority === 2) return "default";
  return "secondary";
}

// ── State helpers ──────────────────────────────────────────────────────────

const STATE_LABELS: Record<EventState, string> = {
  new_event: "New",
  active:    "Active",
  resolved:  "Resolved",
};

/** WCAG 2.2 AA: text label + icon — state never conveyed by color alone */
const STATE_ICONS: Record<EventState, LucideIcon> = {
  new_event: Circle,
  active:    Play,
  resolved:  Check,
};

function stateBadgeVariant(state: string): "outline" | "secondary" | "default" {
  if (state === "new_event") return "outline";
  if (state === "active")    return "default";
  return "secondary";
}

// ── Category display label ─────────────────────────────────────────────────

// value MUST be the real EarthRanger event_types.category slug — the server
// filters `et.category ILIKE/equals ${input.category}` directly (event.ts list
// + listViaSearch), and the dashboard/map bucket by these same slugs. Using the
// friendly display name here made EVERY category selection return 0 rows
// (owner bug 2026-07-07: "filters not working"). Labels stay human-readable.
const CATEGORY_OPTIONS = [
  { value: "law-enforcement-and-apprehensions",      label: "Law Enforcement" },
  { value: "monitoring_patrolling_and_surveillance", label: "Monitoring & Patrolling" },
];

// ── Subcategories ──────────────────────────────────────────────────────────

// ⚠ THERE IS NO PARENT/CHILD CATEGORY TABLE. `EventType.category` is a flat
// nullable string on the event_types row; "Law Enforcement" and "Monitoring &
// Patrolling" are simply two of the distinct values it takes. The hierarchy
// below is DERIVED, not stored: a "subcategory" is an event type's `display`
// value, and its "parent" is whatever category slug that type carries.
//
// Values MUST be the real `event_types.display` strings — the server filters
// `lower(et.display) IN (…)` (event.ts listViaRawSql) / a case-insensitive
// equals-OR (the Prisma path) against them directly. Same failure mode as the
// CATEGORY_OPTIONS note above: a prettified label here returns 0 rows.
//
// Sourced from the tenant's synced event_types (verified against dev DB
// 2026-07-20). This mirrors the existing hardcoded-CATEGORY_OPTIONS
// convention in this file. A tenant whose EarthRanger instance carries extra
// types will not see them here until this list is updated — the honest fix is
// a tenant-scoped `event.listTypes` endpoint feeding this dropdown, which is
// deliberately out of scope for this change.
const SUBCATEGORY_GROUPS: { category: string; label: string; options: string[] }[] = [
  {
    category: "law-enforcement-and-apprehensions",
    label: "Law Enforcement",
    options: [
      "Compressor Fishing",
      "Destructive Practices",
      "Fishing in a prohibited area (MPA)",
      "Others",
      "Taking of Prohibited Species",
      "Unregistered Illegal Fishing",
      "Use of Prohibited Gears",
    ],
  },
  {
    category: "monitoring_patrolling_and_surveillance",
    label: "Monitoring & Patrolling",
    options: [
      "Community Support",
      "Infrastructure and assets",
      "Marine wildlife sightings",
      "Research and Studies",
      "Threats on Habitat",
    ],
  },
];

// ── Sort options ───────────────────────────────────────────────────────────

// Encoded as a single "field:direction" token so the whole control is one
// native <select>, matching the other filter-bar controls. The first entry is
// the DEFAULT and reproduces the list's historical ordering exactly.
const SORT_OPTIONS = [
  { value: "date:desc",         label: "Newest first" },
  { value: "date:asc",          label: "Oldest first" },
  { value: "municipality:asc",  label: "Municipality (A–Z)" },
  { value: "municipality:desc", label: "Municipality (Z–A)" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];
const DEFAULT_SORT: SortValue = "date:desc";

// eventTypeLabel is imported from "@/lib/event-label" (shared with
// event-detail-modal.tsx so both surfaces stay in sync — see eventPrimaryLabel).

// ── Date-range helpers (From/To filter) ────────────────────────────────────

/**
 * Expands a "YYYY-MM-DD" `dateTo` value to the END of that day (inclusive),
 * so a range like To=2026-06-30 still includes events reported later that
 * same day. The server does `reportedAt <= dateTo`, so a bare date string
 * (which parses as that day's midnight) would incorrectly EXCLUDE the rest
 * of the day — this is a correctness requirement, not cosmetic.
 */
function endOfDayIso(dateStr: string): string {
  return `${dateStr}T23:59:59.999`;
}

// ── EventsListFilters — the filter bar ────────────────────────────────────

type Filters = {
  state:           EventState | "";
  category:        string;
  // Subcategory multi-select — event_types.display values. Empty = no filter.
  typeDisplays:    string[];
  search:          string;
  dateFrom:        string; // "YYYY-MM-DD" or ""
  dateTo:          string; // "YYYY-MM-DD" or ""
  includeSkylight: boolean;
  // Surfaces only events with no municipality assigned — the manual
  // attribution work queue (see event.ts `unattributedOnly`).
  unattributedOnly: boolean;
  sort:            SortValue;
};

const DEFAULT_FILTERS: Filters = {
  state:           "",
  category:        "",
  typeDisplays:    [],
  search:          "",
  dateFrom:        "",
  dateTo:          "",
  includeSkylight: false,
  unattributedOnly: false,
  sort:            DEFAULT_SORT,
};

// ── Exported filter shape (used by EventsPage to wire export URLs) ──────────

/**
 * The resolved, export-ready filter values derived from the active filter bar
 * state. `dateFrom` and `dateTo` are pre-expanded ISO strings so the page does
 * not need to know about the monthFilter→date expansion logic.
 */
export type EventsListExportFilters = {
  state?:    string;
  category?: string;
  areaName?: string;
  dateFrom?: string;
  dateTo?:   string;
};

// ── Main component ─────────────────────────────────────────────────────────

interface EventsListProps {
  /**
   * When set, the EventDetailModal opens immediately for this event ID.
   * Used for deep-linking from Alert History / Notifications via
   * `/events?eventId=<id>`.
   */
  initialEventId?: string | null;
  /**
   * Called whenever the active filter state changes so the parent page can
   * keep its export URLs in sync with the currently-applied filters.
   */
  onFiltersChange?: (filters: EventsListExportFilters) => void;
}

export function EventsList({ initialEventId, onFiltersChange }: EventsListProps = {}) {
  const utils = trpc.useUtils();

  // ── Filter state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cursor + accumulated pages
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<EventListItem[]>([]);

  // ── Modal — seed from deep-link query param when present
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null);

  // ── Bulk selection + bulk-action bar
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolveAllConfirmOpen, setResolveAllConfirmOpen] = useState(false);

  // ── Inline state mutation (per-row)
  const updateStateMutation = trpc.event.updateState.useMutation({
    onSuccess: () => {
      // Refresh all pages from top after a state change
      setAccumulated([]);
      setCursor(undefined);
      void utils.event.list.invalidate();
    },
  });

  // ── Bulk state mutation (selection bar)
  const bulkUpdateStateMutation = trpc.event.bulkUpdateState.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      setAccumulated([]);
      setCursor(undefined);
      void utils.event.list.invalidate();
      void utils.event.stats.invalidate();
    },
  });

  // ── "Resolve all" one-time action
  const resolveAllMutation = trpc.event.resolveAllEvents.useMutation({
    onSuccess: () => {
      setResolveAllConfirmOpen(false);
      setSelectedIds(new Set());
      setAccumulated([]);
      setCursor(undefined);
      void utils.event.list.invalidate();
      void utils.event.stats.invalidate();
    },
  });

  // Notify parent whenever active filters change so it can sync export URLs
  useEffect(() => {
    if (onFiltersChange === undefined) return;
    const exportFilters: EventsListExportFilters = {
      ...(filters.state    !== "" ? { state:    filters.state    } : {}),
      ...(filters.category !== "" ? { category: filters.category } : {}),
      // Note: /api/exports/events still only understands the legacy `areaName`
      // filter — the fuzzy `search` box is a list-only enhancement (T4) and is
      // intentionally not forwarded to the export URL.
      ...(filters.dateFrom !== "" ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo   !== "" ? { dateTo: endOfDayIso(filters.dateTo) } : {}),
    };
    onFiltersChange(exportFilters);
  }, [filters, onFiltersChange]);

  // Build query input from filters (server-side).
  // `sort` is a UI-only "field:direction" token — split into the server's
  // separate sortBy / sortDir inputs here.
  const [sortBy, sortDir] = filters.sort.split(":") as ["date" | "municipality", "asc" | "desc"];
  const queryInput = {
    limit: 50 as const,
    cursor,
    ...(filters.state    !== "" ? { state:    filters.state    } : {}),
    ...(filters.category !== "" ? { category: filters.category } : {}),
    ...(filters.typeDisplays.length > 0 ? { typeDisplays: filters.typeDisplays } : {}),
    ...(filters.search   !== "" ? { search:   filters.search   } : {}),
    ...(filters.dateFrom !== "" ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo   !== "" ? { dateTo: endOfDayIso(filters.dateTo) } : {}),
    includeSkylight: filters.includeSkylight,
    unattributedOnly: filters.unattributedOnly,
    sortBy,
    sortDir,
  };

  const listQuery = trpc.event.list.useQuery(queryInput);

  // Reset when filters change
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
    setSelectedIds(new Set());
  }, [filters]);

  // Accumulate pages
  useEffect(() => {
    if (listQuery.data?.items !== undefined) {
      if (cursor === undefined) {
        setAccumulated(listQuery.data.items);
      } else {
        setAccumulated((prev) => [...prev, ...(listQuery.data?.items ?? [])]);
      }
    }
  }, [listQuery.data, cursor]);

  // ── IntersectionObserver sentinel for auto-load-more
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasNextPage  = listQuery.data?.nextCursor !== undefined;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting === true &&
          hasNextPage &&
          !listQuery.isFetching
        ) {
          setCursor(listQuery.data?.nextCursor);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => { observer.disconnect(); };
  }, [hasNextPage, listQuery.isFetching, listQuery.data?.nextCursor]);

  // ── Filter change helpers
  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Subcategory multi-select — toggle one event-type display in/out of the set.
  const toggleTypeDisplay = useCallback((display: string, checked: boolean) => {
    setFilters((prev) => ({
      ...prev,
      typeDisplays: checked
        ? [...prev.typeDisplays, display]
        : prev.typeDisplays.filter((d) => d !== display),
    }));
  }, []);

  // Select / clear every subcategory under one parent category in one click.
  const toggleSubcategoryGroup = useCallback((options: string[], checked: boolean) => {
    setFilters((prev) => ({
      ...prev,
      typeDisplays: checked
        ? [...new Set([...prev.typeDisplays, ...options])]
        : prev.typeDisplays.filter((d) => !options.includes(d)),
    }));
  }, []);

  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchDebounceRef.current !== null) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFilter("search", val.trim());
    }, 400);
  }, [setFilter]);

  const handleInlineStateChange = useCallback(
    (eventId: string, newState: EventState) => {
      updateStateMutation.mutate({ id: eventId, state: newState });
    },
    [updateStateMutation],
  );

  const toggleSelected = useCallback((eventId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(eventId); else next.delete(eventId);
      return next;
    });
  }, []);

  const toggleSelectAllLoaded = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(accumulated.map((e) => e.id)) : new Set());
  }, [accumulated]);

  const handleBulkResolve = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkUpdateStateMutation.mutate({ ids: [...selectedIds], state: "resolved" });
  }, [selectedIds, bulkUpdateStateMutation]);

  const isInitialLoading = listQuery.isLoading && accumulated.length === 0;
  const isEmpty          = !listQuery.isLoading && accumulated.length === 0;
  const allLoadedSelected = accumulated.length > 0 && selectedIds.size === accumulated.length;

  return (
    <div className="space-y-4">
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* State filter */}
        <select
          data-testid="state-filter"
          aria-label="Filter by state"
          value={filters.state}
          onChange={(e) => { setFilter("state", e.target.value as EventState | ""); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All States</option>
          <option value="new_event">New</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
        </select>

        {/* Category filter */}
        <select
          data-testid="category-filter"
          aria-label="Filter by category"
          value={filters.category}
          onChange={(e) => { setFilter("category", e.target.value); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Subcategory multi-select — individual event types, grouped under
            their parent category. Popover + Checkbox (shadcn/ui). */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              data-testid="subcategory-filter-trigger"
              aria-label="Filter by subcategory"
              className="h-9 justify-between gap-2 px-3 text-sm font-normal"
            >
              {filters.typeDisplays.length === 0
                ? "All Subcategories"
                : `${String(filters.typeDisplays.length)} subcategor${filters.typeDisplays.length === 1 ? "y" : "ies"}`}
              <ChevronsUpDown className="h-4 w-4 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="max-h-80 overflow-y-auto p-1" data-testid="subcategory-filter-panel">
              {SUBCATEGORY_GROUPS.map((group) => {
                const allChecked = group.options.every((o) => filters.typeDisplays.includes(o));
                return (
                  <div key={group.category} className="px-1 py-1.5">
                    {/* Parent row — selects/clears the whole group */}
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={(checked) => { toggleSubcategoryGroup([...group.options], checked === true); }}
                        aria-label={`Select all ${group.label} subcategories`}
                      />
                      <span className="text-sm font-medium">{group.label}</span>
                    </label>
                    {/* Child rows — individually selectable subcategories */}
                    {group.options.map((option) => (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 hover:bg-accent"
                      >
                        <Checkbox
                          data-testid={`subcategory-option-${option}`}
                          checked={filters.typeDisplays.includes(option)}
                          onCheckedChange={(checked) => { toggleTypeDisplay(option, checked === true); }}
                          aria-label={option}
                        />
                        <span className="text-sm text-muted-foreground">{option}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort control */}
        <select
          data-testid="sort-control"
          aria-label="Sort events"
          value={filters.sort}
          onChange={(e) => { setFilter("sort", e.target.value as SortValue); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Fuzzy full-content search — replaces the old area/municipality box (T4) */}
        <input
          data-testid="search-filter"
          type="text"
          placeholder="Search all event details…"
          aria-label="Search all event details"
          value={searchInput}
          onChange={handleSearchInputChange}
          className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
        />

        {/* From/To date-range filter */}
        <div className="flex items-center gap-1">
          <Label htmlFor="date-from-filter" className="text-sm font-normal text-muted-foreground">
            From
          </Label>
          <input
            id="date-from-filter"
            data-testid="date-from-filter"
            type="date"
            aria-label="Filter events from date"
            value={filters.dateFrom}
            max={filters.dateTo !== "" ? filters.dateTo : undefined}
            onChange={(e) => { setFilter("dateFrom", e.target.value); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Label htmlFor="date-to-filter" className="text-sm font-normal text-muted-foreground">
            To
          </Label>
          <input
            id="date-to-filter"
            data-testid="date-to-filter"
            type="date"
            aria-label="Filter events to date"
            value={filters.dateTo}
            min={filters.dateFrom !== "" ? filters.dateFrom : undefined}
            onChange={(e) => { setFilter("dateTo", e.target.value); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        {/* Skylight / Marine Entry toggle — default OFF (mirrors map.ts SKY-1) */}
        <div className="flex items-center gap-2 pl-1">
          <Switch
            id="include-skylight"
            data-testid="include-skylight-toggle"
            checked={filters.includeSkylight}
            onCheckedChange={(checked) => { setFilter("includeSkylight", checked); }}
            aria-label="Show Skylight / Marine Entry events"
          />
          <Label htmlFor="include-skylight" className="text-sm font-normal text-muted-foreground">
            Show Skylight / Marine Entry events
          </Label>
        </div>

        {/* Unattributed-only toggle — the manual-attribution work queue.
            Matches the Skylight toggle's Switch pattern rather than adding a
            municipality dropdown, which does not exist on this page yet. */}
        <div className="flex items-center gap-2 pl-1">
          <Switch
            id="unattributed-only"
            data-testid="unattributed-only-toggle"
            checked={filters.unattributedOnly}
            onCheckedChange={(checked) => { setFilter("unattributedOnly", checked); }}
            aria-label="Show only events with no municipality assigned"
          />
          <Label htmlFor="unattributed-only" className="text-sm font-normal text-muted-foreground">
            Unattributed only
          </Label>
        </div>

        {/* Clear filters */}
        {(filters.state !== "" || filters.category !== "" || filters.typeDisplays.length > 0 || filters.search !== "" || filters.dateFrom !== "" || filters.dateTo !== "" || filters.includeSkylight || filters.unattributedOnly || filters.sort !== DEFAULT_SORT) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchInput("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Bulk-action bar ─────────────────────────────────────────────── */}
      {accumulated.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <Checkbox
            id="select-all-loaded"
            data-testid="select-all-checkbox"
            checked={allLoadedSelected}
            onCheckedChange={(checked) => { toggleSelectAllLoaded(checked === true); }}
            aria-label="Select all loaded events"
          />
          <Label htmlFor="select-all-loaded" className="cursor-pointer font-normal">
            {selectedIds.size > 0 ? `${String(selectedIds.size)} selected` : "Select all loaded"}
          </Label>

          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="secondary"
              data-testid="bulk-resolve-button"
              disabled={bulkUpdateStateMutation.isPending}
              onClick={handleBulkResolve}
            >
              {bulkUpdateStateMutation.isPending ? "Resolving…" : "Mark resolved"}
            </Button>
          )}

          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              data-testid="resolve-all-button"
              onClick={() => { setResolveAllConfirmOpen(true); }}
            >
              Resolve all
            </Button>
          </div>
        </div>
      )}

      {/* ── Resolve-all confirm dialog ──────────────────────────────────── */}
      <Dialog open={resolveAllConfirmOpen} onOpenChange={setResolveAllConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve ALL events?</DialogTitle>
            <DialogDescription>
              This marks every event in this tenant that is not already Resolved as
              Resolved. This action is repeatable but cannot be undone in bulk — you
              would need to change events back individually. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setResolveAllConfirmOpen(false); }}
              disabled={resolveAllMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="resolve-all-confirm-button"
              onClick={() => { resolveAllMutation.mutate(); }}
              disabled={resolveAllMutation.isPending}
            >
              {resolveAllMutation.isPending ? "Resolving…" : "Resolve all events"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── List body ───────────────────────────────────────────────────── */}
      {isInitialLoading ? (
        <div data-testid="events-list-loading" className="space-y-2 rounded-md border p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : isEmpty ? (
        <div
          data-testid="events-list-empty"
          className="rounded-md border p-8 text-center text-sm text-muted-foreground"
        >
          No events match the current filters.
        </div>
      ) : (
        <>
          <ol
            role="list"
            aria-label="Operations events"
            className="divide-y divide-border rounded-md border"
          >
            {accumulated.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onOpenDetail={setSelectedEventId}
                onStateChange={handleInlineStateChange}
                isStateChangePending={
                  updateStateMutation.isPending &&
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  updateStateMutation.variables?.id === event.id
                }
                isSelected={selectedIds.has(event.id)}
                onToggleSelected={toggleSelected}
              />
            ))}
          </ol>

          {/* Sentinel — triggers auto-load as user scrolls toward bottom */}
          <div ref={sentinelRef} aria-hidden="true" />

          {/* Fallback "Load more" button for keyboard/no-JS contexts */}
          {hasNextPage && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="load-more-button"
                onClick={() => { setCursor(listQuery.data?.nextCursor); }}
                disabled={listQuery.isFetching}
              >
                {listQuery.isFetching ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}

          {listQuery.isFetching && accumulated.length > 0 && (
            <p className="py-2 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading more events…
            </p>
          )}
        </>
      )}

      {/* ── Detail modal (M2 Edit/History tabs) ─────────────────────────── */}
      <EventDetailModal
        eventId={selectedEventId}
        onClose={() => { setSelectedEventId(null); }}
      />
    </div>
  );
}

// ── EventRow — single list item ────────────────────────────────────────────

type EventRowProps = {
  event:                EventListItem;
  onOpenDetail:         (id: string) => void;
  onStateChange:        (id: string, state: EventState) => void;
  isStateChangePending: boolean;
  isSelected:           boolean;
  onToggleSelected:     (id: string, checked: boolean) => void;
};

function EventRow({
  event,
  onOpenDetail,
  onStateChange,
  isStateChangePending,
  isSelected,
  onToggleSelected,
}: EventRowProps) {
  const state: EventState = event.state;

  return (
    <li
      role="listitem"
      data-testid={`event-row-${event.id}`}
      className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
    >
      {/* Bulk-select checkbox */}
      <div className="mt-1 shrink-0" onClick={(e) => { e.stopPropagation(); }}>
        <Checkbox
          data-testid={`select-event-${event.id}`}
          checked={isSelected}
          onCheckedChange={(checked) => { onToggleSelected(event.id, checked === true); }}
          aria-label={`Select ${eventPrimaryLabel(event)} for bulk action`}
        />
      </div>

      {/* Type icon / category indicator */}
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted-foreground"
        title={event.eventType?.category ?? "Event"}
      >
        {event.eventType?.category?.startsWith("Law") === true ? (
          <Scale className="h-4 w-4" />
        ) : (
          <Telescope className="h-4 w-4" />
        )}
      </span>

      {/* Main content — clickable to open detail */}
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
        aria-label={`Open details for ${eventPrimaryLabel(event)}${event.serialNumber !== null ? ` #${event.serialNumber}` : ""}`}
        onClick={() => { onOpenDetail(event.id); }}
      >
        {/* Title row */}
        <div className="flex w-full items-center gap-2">
          {event.serialNumber !== null && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              #{event.serialNumber}
            </span>
          )}
          <span className="truncate text-sm font-medium">
            {eventPrimaryLabel(event)}
          </span>
        </div>

        {/* Meta row: reporter · type · area · time */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{event.reportedByName ?? "Unknown reporter"}</span>
          {eventTypeLabel(event.eventType?.display) !== null && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span>{eventTypeLabel(event.eventType?.display)}</span>
            </>
          )}
          {(event.areaName ?? null) !== null && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span>{event.areaName}</span>
            </>
          )}
          {event.reportedAt !== null && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <time dateTime={new Date(event.reportedAt).toISOString()}>
                {new Date(event.reportedAt).toLocaleDateString()}
              </time>
            </>
          )}
        </div>
      </button>

      {/* Right-side controls */}
      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Priority badge */}
        <Badge variant={priorityVariant(event.priority)} className="text-xs">
          {priorityLabel(event.priority)}
        </Badge>

        {/* State badge — WCAG 2.2 AA: icon + text, no color-only signaling */}
        <Badge
          variant={stateBadgeVariant(state)}
          aria-label={`State: ${STATE_LABELS[state]}`}
          className="inline-flex items-center gap-1 text-xs"
        >
          {(() => {
            const StateIcon = STATE_ICONS[state];
            return <StateIcon className="h-3 w-3" aria-hidden="true" />;
          })()}
          {STATE_LABELS[state]}
        </Badge>

        {/* Inline state control — keyboard-operable Select */}
        <Select
          value={state}
          onValueChange={(val) => { onStateChange(event.id, val as EventState); }}
          disabled={isStateChangePending}
        >
          <SelectTrigger
            className="h-7 w-28 text-xs"
            aria-label={`Change state for ${eventPrimaryLabel(event)}`}
            data-testid={`state-select-${event.id}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new_event">New</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}
