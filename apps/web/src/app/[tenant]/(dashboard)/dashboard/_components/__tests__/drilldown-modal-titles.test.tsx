// @vitest-environment jsdom

/**
 * KpiDrilldownModal + BreakdownDrilldownModal — event-title fallback (bug fix).
 *
 * Both modals rendered `ev.title ?? "Untitled event"`, but `title` is null for
 * most EarthRanger-synced events, so every row showed "Untitled event" even
 * though the list query already joins `eventType: { display, category }`.
 * The fix reuses the canonical event-display-title expression from
 * event-feed.tsx: `ev.title ?? ev.eventType?.display ?? "Untitled event"`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

const { stubs } = vi.hoisted(() => {
  const s: {
    eventListData: { items: unknown[] };
    patrolListData: { items: unknown[] };
  } = {
    eventListData: { items: [] },
    patrolListData: { items: [] },
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    event: {
      list: {
        useQuery: () => ({
          data: stubs.eventListData,
          isLoading: false,
        }),
      },
    },
    patrol: {
      list: {
        useQuery: () => ({
          data: stubs.patrolListData,
          isLoading: false,
        }),
      },
    },
  },
}));

import { KpiDrilldownModal } from "../kpi-drilldown-modal";
import { BreakdownDrilldownModal } from "../breakdown-drilldown-modal";

const titlelessEvent = {
  id: "e-1",
  title: null,
  areaName: "Reef North",
  reportedAt: null,
  state: "active",
  eventType: { display: "Illegal Fishing", category: "Law Enforcement" },
};

const titledEvent = {
  id: "e-2",
  title: "Poaching reported",
  areaName: "Reef South",
  reportedAt: null,
  state: "active",
  eventType: { display: "Illegal Fishing", category: "Law Enforcement" },
};

beforeEach(() => {
  stubs.eventListData = { items: [] };
  stubs.patrolListData = { items: [] };
});

afterEach(() => {
  cleanup();
});

describe("KpiDrilldownModal — event title fallback", () => {
  it("falls back to eventType.display when title is null", () => {
    stubs.eventListData = { items: [titlelessEvent] };
    render(
      <KpiDrilldownModal
        drilldown={{ kind: "eventsThisMonth" }}
        dateFrom="2026-06-01T00:00:00.000Z"
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Illegal Fishing")).toBeTruthy();
    expect(screen.queryByText("Untitled event")).toBeNull();
  });

  it("still renders the event's own title when present", () => {
    stubs.eventListData = { items: [titledEvent] };
    render(
      <KpiDrilldownModal
        drilldown={{ kind: "eventsThisMonth" }}
        dateFrom="2026-06-01T00:00:00.000Z"
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Poaching reported")).toBeTruthy();
  });
});

describe("BreakdownDrilldownModal — event title fallback", () => {
  it("falls back to eventType.display when title is null", () => {
    stubs.eventListData = { items: [titlelessEvent] };
    render(
      <BreakdownDrilldownModal
        typeDisplay="Illegal Fishing"
        dateFrom="2026-06-01T00:00:00.000Z"
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Illegal Fishing").length).toBeGreaterThan(0);
    expect(screen.queryByText("Untitled event")).toBeNull();
  });

  it("still renders the event's own title when present", () => {
    stubs.eventListData = { items: [titledEvent] };
    render(
      <BreakdownDrilldownModal
        typeDisplay="Illegal Fishing"
        dateFrom="2026-06-01T00:00:00.000Z"
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Poaching reported")).toBeTruthy();
  });
});
