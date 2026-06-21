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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
const STATE_ICONS: Record<EventState, string> = {
  new_event: "●",
  active:    "▶",
  resolved:  "✓",
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
  state:         EventState | "";
  category:      string;
  areaName:      string;
  monthFilter:   string; // "YYYY-MM" or ""
};

const DEFAULT_FILTERS: Filters = {
  state:       "",
  category:    "",
  areaName:    "",
  monthFilter: "",
};

// ── Main component ─────────────────────────────────────────────────────────

export function EventsList() {
  const utils = trpc.useUtils();

  // ── Filter state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [areaInput, setAreaInput]   = useState("");
  const areaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cursor + accumulated pages
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<EventListItem[]>([]);

  // ── Modal
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Inline state mutation (per-row)
  const updateStateMutation = trpc.event.updateState.useMutation({
    onSuccess: () => {
      // Refresh all pages from top after a state change
      setAccumulated([]);
      setCursor(undefined);
      void utils.event.list.invalidate();
    },
  });

  // Build query input from filters (server-side)
  const queryInput = {
    limit: 50 as const,
    cursor,
    ...(filters.state    !== "" ? { state:    filters.state    } : {}),
    ...(filters.category !== "" ? { category: filters.category } : {}),
    ...(filters.areaName !== "" ? { areaName: filters.areaName } : {}),
    ...(filters.monthFilter !== ""
      ? { dateFrom: monthStart(filters.monthFilter + "-01"), dateTo: monthEnd(filters.monthFilter + "-01") }
      : {}),
  };

  const listQuery = trpc.event.list.useQuery(queryInput);

  // Reset when filters change
  useEffect(() => {
    setAccumulated([]);
    setCursor(undefined);
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

  const handleAreaInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAreaInput(val);
    if (areaDebounceRef.current !== null) clearTimeout(areaDebounceRef.current);
    areaDebounceRef.current = setTimeout(() => {
      setFilter("areaName", val.trim());
    }, 400);
  }, [setFilter]);

  const handleInlineStateChange = useCallback(
    (eventId: string, newState: EventState) => {
      updateStateMutation.mutate({ id: eventId, state: newState });
    },
    [updateStateMutation],
  );

  const isInitialLoading = listQuery.isLoading && accumulated.length === 0;
  const isEmpty          = !listQuery.isLoading && accumulated.length === 0;

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

        {/* Area / municipality filter */}
        <input
          data-testid="area-filter"
          type="text"
          placeholder="Filter by area / municipality"
          aria-label="Filter by area or municipality"
          value={areaInput}
          onChange={handleAreaInputChange}
          className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
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

        {/* Clear filters */}
        {(filters.state !== "" || filters.category !== "" || filters.areaName !== "" || filters.monthFilter !== "") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setAreaInput("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

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
};

function EventRow({ event, onOpenDetail, onStateChange, isStateChangePending }: EventRowProps) {
  const state: EventState = event.state;

  return (
    <li
      role="listitem"
      data-testid={`event-row-${event.id}`}
      className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
    >
      {/* Type icon / category indicator */}
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-base text-muted-foreground"
        title={event.eventType?.category ?? "Event"}
      >
        {event.eventType?.category?.startsWith("Law") === true ? "⚖" : "🔭"}
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
            {event.title ?? "Untitled"}
          </span>
        </div>

        {/* Meta row: reporter · type · area · time */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{event.reportedByName ?? "Unknown reporter"}</span>
          {event.eventType !== null && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span>{event.eventType.display}</span>
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
          className="text-xs"
        >
          <span aria-hidden="true">{STATE_ICONS[state]}</span>{" "}
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
