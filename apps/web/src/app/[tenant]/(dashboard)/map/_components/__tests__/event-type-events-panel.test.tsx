// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  EventTypeEventsPanel,
  type EventTypeEventsPanelEvent,
} from "../event-type-events-panel";

function makeEvent(
  overrides: Partial<EventTypeEventsPanelEvent> = {},
): EventTypeEventsPanelEvent {
  return {
    id: "evt-1",
    title: "Illegal fishing report",
    typeDisplay: "Blast Fishing",
    reportedAt: "2026-07-01T00:00:00.000Z",
    municipalityName: "Calapan",
    lat: 13.4,
    lon: 121.2,
    ...overrides,
  };
}

describe("EventTypeEventsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the type heading, count, and each event row", () => {
    const events = [
      makeEvent({ id: "e1", title: "First incident" }),
      makeEvent({ id: "e2", title: "Second incident" }),
    ];
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={events}
        onLocate={vi.fn()}
        onSelectEvent={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Heading + count appear (heading text may repeat in row municipality —
    // scope the count check to the specific "2" total in the header).
    expect(screen.getAllByText("Blast Fishing").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("First incident")).toBeTruthy();
    expect(screen.getByText("Second incident")).toBeTruthy();
  });

  it("clicking a row calls onSelectEvent with that event's id", () => {
    const onSelectEvent = vi.fn();
    const events = [makeEvent({ id: "e1", title: "Row One" })];
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={events}
        onLocate={vi.fn()}
        onSelectEvent={onSelectEvent}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Row One"));
    expect(onSelectEvent).toHaveBeenCalledWith("e1");
  });

  it("clicking the locate (map pin) button calls onLocate with that event's coordinates", () => {
    const onLocate = vi.fn();
    const events = [makeEvent({ id: "e1", title: "Row One", lat: 13.41, lon: 121.05 })];
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={events}
        onLocate={onLocate}
        onSelectEvent={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Show Row One on the map/i }));
    expect(onLocate).toHaveBeenCalledWith(13.41, 121.05);
  });

  it("hides the locate button when the event has no coordinates", () => {
    const onLocate = vi.fn();
    const events = [
      makeEvent({ id: "e1", title: "No Coords", lat: null, lon: null }),
    ];
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={events}
        onLocate={onLocate}
        onSelectEvent={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Show No Coords on the map/i }),
    ).toBeNull();
  });

  it("clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={[]}
        onLocate={vi.fn()}
        onSelectEvent={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Close Blast Fishing events/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders an empty-state message when there are no events", () => {
    render(
      <EventTypeEventsPanel
        display="Blast Fishing"
        events={[]}
        onLocate={vi.fn()}
        onSelectEvent={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no blast fishing events/i)).toBeTruthy();
  });
});
