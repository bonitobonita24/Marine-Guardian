// @vitest-environment jsdom

/**
 * EventsThisMonthPanel — Q3 floating list panel (Command Center map).
 *
 * Mirrors the mock/test pattern of the sibling drilldown-modal-titles.test.tsx:
 * a vi.hoisted mutable stub feeding trpc.event.list.useQuery, mocked BEFORE
 * the component import.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

interface StubEvent {
  id: string;
  title: string | null;
  reportedAt: string | null;
  eventType: { display: string; category: string } | null;
  locationLat: number | null;
  locationLon: number | null;
}

const { stubs } = vi.hoisted(() => {
  const s: { eventListData: { items: StubEvent[] } } = {
    eventListData: { items: [] },
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
  },
}));

import { EventsThisMonthPanel } from "../events-this-month-panel";

const titlelessEventWithCoords: StubEvent = {
  id: "e-1",
  title: null,
  reportedAt: null,
  eventType: { display: "Illegal Fishing", category: "Law Enforcement" },
  locationLat: 13.1,
  locationLon: 121.2,
};

const eventWithoutCoords: StubEvent = {
  id: "e-2",
  title: "Poaching reported",
  reportedAt: null,
  eventType: { display: "Illegal Fishing", category: "Law Enforcement" },
  locationLat: null,
  locationLon: null,
};

beforeEach(() => {
  stubs.eventListData = { items: [] };
});

afterEach(() => {
  cleanup();
});

describe("EventsThisMonthPanel", () => {
  it("falls back to eventType.display when title is null", () => {
    stubs.eventListData = { items: [titlelessEventWithCoords] };
    render(
      <EventsThisMonthPanel
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );
    expect(screen.getByText("Illegal Fishing")).toBeTruthy();
    expect(screen.queryByText("Untitled event")).toBeNull();
  });

  it("renders a row with coordinates as clickable and calls onSelectEvent with id/lat/lon", () => {
    stubs.eventListData = { items: [titlelessEventWithCoords] };
    const onSelectEvent = vi.fn();
    render(
      <EventsThisMonthPanel
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
        onSelectEvent={onSelectEvent}
      />,
    );
    const row = screen.getByRole("button", { name: /Illegal Fishing/i });
    fireEvent.click(row);
    expect(onSelectEvent).toHaveBeenCalledWith({
      id: "e-1",
      lat: 13.1,
      lon: 121.2,
    });
  });

  it("renders a row with null coordinates as non-clickable (no button, no call)", () => {
    stubs.eventListData = { items: [eventWithoutCoords] };
    const onSelectEvent = vi.fn();
    render(
      <EventsThisMonthPanel
        dateTo="2026-06-30T23:59:59.999Z"
        onClose={vi.fn()}
        onSelectEvent={onSelectEvent}
      />,
    );
    expect(screen.getByText("Poaching reported")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Poaching reported/i }),
    ).toBeNull();
    expect(onSelectEvent).not.toHaveBeenCalled();
  });
});
