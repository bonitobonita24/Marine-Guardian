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
import { EventDetailModal } from "@/components/events/event-detail-modal";
import { trpc } from "@/lib/trpc/client";
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

const CATEGORY_OPTIONS = [
  { value: "Law Enforcement",                      label: "Law Enforcement" },
  { value: "Monitoring, Patrolling & Surveillance", label: "Monitoring & Patrolling" },
];

/** Humanize a raw snake_case/kebab code into Title Case. */
function humanizeCode(code: string): string {
  return code
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Readable label for an event type. EarthRanger stores `display` as the raw
 * code (e.g. "poacher_in_mpa") for custom types that have no friendly name —
 * humanize those so the list never shows a raw code. Returns null when there
 * is no usable label so callers can choose their own fallback.
 */
function eventTypeLabel(display: string | null | undefined): string | null {
  if (display === null || display === undefined || display === "") return null;
  return /^[a-z0-9]+([_-][a-z0-9]+)+$/i.test(display)
    ? humanizeCode(display)
    : display;
}

// ── Month helpers (monthly-accomplishment filter) ──────────────────────────

function monthStart(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function monthEnd(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

// Current month in YYYY-MM format
function currentYearMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── EventsListFilters — the filter bar ────────────────────────────────────

type Filters = {
  state:           EventState | "";
  category:        string;
  search:          string;
  monthFilter:     string; // "YYYY-MM" or ""
  includeSkylight: boolean;
};

const DEFAULT_FILTERS: Filters = {
  state:           "",
  category:        "",
  search:          "",
  monthFilter:     "",
  includeSkylight: false,
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
      ...(filters.monthFilter !== ""
        ? {
            dateFrom: monthStart(filters.monthFilter + "-01"),
            dateTo:   monthEnd(filters.monthFilter + "-01"),
          }
        : {}),
    };
    onFiltersChange(exportFilters);
  }, [filters, onFiltersChange]);

  // Build query input from filters (server-side)
  const queryInput = {
    limit: 50 as const,
    cursor,
    ...(filters.state    !== "" ? { state:    filters.state    } : {}),
    ...(filters.category !== "" ? { category: filters.category } : {}),
    ...(filters.search   !== "" ? { search:   filters.search   } : {}),
    ...(filters.monthFilter !== ""
      ? { dateFrom: monthStart(filters.monthFilter + "-01"), dateTo: monthEnd(filters.monthFilter + "-01") }
      : {}),
    includeSkylight: filters.includeSkylight,
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

        {/* Monthly-accomplishment filter — resolved events by month */}
        <input
          data-testid="month-filter"
          type="month"
          aria-label="Filter resolved events by month"
          value={filters.monthFilter}
          max={currentYearMonth()}
          onChange={(e) => { setFilter("monthFilter", e.target.value); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />

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

        {/* Clear filters */}
        {(filters.state !== "" || filters.category !== "" || filters.search !== "" || filters.monthFilter !== "" || filters.includeSkylight) && (
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
          aria-label={`Select ${event.title ?? "this event"} for bulk action`}
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
        aria-label={`Open details for ${event.title ?? "Untitled event"}${event.serialNumber !== null ? ` #${event.serialNumber}` : ""}`}
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
            {event.title ?? eventTypeLabel(event.eventType?.display) ?? "Untitled"}
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
            aria-label={`Change state for ${event.title ?? "this event"}`}
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
