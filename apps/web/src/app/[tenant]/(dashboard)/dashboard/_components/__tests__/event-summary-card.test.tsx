// @vitest-environment jsdom

/**
 * EventSummaryCard — geo-anchored MapPopup summary card (Q3 Command Center map).
 * Pure render, no mocks — mirrors the sibling __tests__ vitest+RTL pattern.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { EventSummaryCard } from "../event-summary-card";
import type { SelectedMonthEvent } from "../events-this-month-panel";

const baseEvent: SelectedMonthEvent = {
  id: "e-1",
  lat: 13.1,
  lon: 121.2,
  displayTitle: "Illegal Fishing",
  eventTypeDisplay: "Illegal Fishing",
  reportedAt: "2026-06-15T08:00:00.000Z",
  areaName: "Baco Bay",
  offenderName: null,
  vesselName: null,
  state: "under_review",
};

afterEach(() => {
  cleanup();
});

describe("EventSummaryCard", () => {
  it("shows displayTitle, type, and status", () => {
    render(<EventSummaryCard event={baseEvent} onClose={vi.fn()} />);
    expect(screen.getAllByText("Illegal Fishing").length).toBeGreaterThan(0);
    expect(screen.getByText("Under Review")).toBeTruthy();
    expect(screen.getByText("Baco Bay")).toBeTruthy();
  });

  it("omits Offender and Vessel rows when null", () => {
    render(<EventSummaryCard event={baseEvent} onClose={vi.fn()} />);
    expect(screen.queryByText("Offender")).toBeNull();
    expect(screen.queryByText("Vessel")).toBeNull();
  });

  it("renders Offender and Vessel rows when present", () => {
    const eventWithDetails: SelectedMonthEvent = {
      ...baseEvent,
      offenderName: "Juan Dela Cruz",
      vesselName: "MV Bantay Dagat",
    };
    render(<EventSummaryCard event={eventWithDetails} onClose={vi.fn()} />);
    expect(screen.getByText("Offender")).toBeTruthy();
    expect(screen.getByText("Juan Dela Cruz")).toBeTruthy();
    expect(screen.getByText("Vessel")).toBeTruthy();
    expect(screen.getByText("MV Bantay Dagat")).toBeTruthy();
  });

  it("calls onClose when the close (X) button is clicked", () => {
    const onClose = vi.fn();
    render(<EventSummaryCard event={baseEvent} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
