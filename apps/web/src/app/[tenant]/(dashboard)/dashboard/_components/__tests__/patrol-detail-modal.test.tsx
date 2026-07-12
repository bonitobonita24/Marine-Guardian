// @vitest-environment jsdom

/**
 * PatrolDetailModal + War Room click→detail wiring tests (T5).
 *
 * Covers:
 *   - PatrolDetailModal renders the row fields when a patrol is selected
 *   - PatrolDetailModal is closed (not rendered) when patrol is null
 *   - ActivePatrols rows are keyboard-accessible buttons that fire onSelectPatrol
 *     on click, Enter and Space
 *   - EventFeed rows fire onSelectEvent on click and keyboard
 *   - LastIncidentCard fires onSelect on click when an incident exists
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { PatrolDetailModal } from "../patrol-detail-modal";
import { ActivePatrols, type ActivePatrol } from "../active-patrols";
import { EventFeed, type FeedEvent } from "../event-feed";
import { LastIncidentCard, type LastIncident } from "../last-incident-card";

afterEach(() => {
  cleanup();
});

const patrol: ActivePatrol = {
  id: "p-1",
  title: null,
  boatName: null,
  patrolType: "seaborne",
  areaName: "Reef North",
  startTime: new Date("2026-06-25T08:00:00Z"),
  totalDistanceKm: 12.34,
  computedDistanceKm: null,
  totalHours: 4.5,
  computedDurationHours: null,
  startLocationLat: 13.7565,
  startLocationLon: 121.0583,
  endLocationLat: 13.7601,
  endLocationLon: 121.0702,
  leaderName: "Ranger Cruz",
};

describe("PatrolDetailModal", () => {
  it("renders the patrol fields when a patrol is selected", () => {
    const { getByText } = render(
      <PatrolDetailModal patrol={patrol} onClose={vi.fn()} />,
    );
    expect(getByText("Patrol Detail")).toBeTruthy();
    expect(getByText("Seaborne")).toBeTruthy();
    expect(getByText("Reef North")).toBeTruthy();
    expect(getByText("Ranger Cruz")).toBeTruthy();
    expect(getByText("12.3 km")).toBeTruthy();
  });

  it("prefers computedDistanceKm over totalDistanceKm", () => {
    const { getByText } = render(
      <PatrolDetailModal
        patrol={{ ...patrol, computedDistanceKm: 9.99 }}
        onClose={vi.fn()}
      />,
    );
    expect(getByText("10.0 km")).toBeTruthy();
  });

  it("does not render dialog content when patrol is null", () => {
    const { queryByText } = render(
      <PatrolDetailModal patrol={null} onClose={vi.fn()} />,
    );
    expect(queryByText("Patrol Detail")).toBeNull();
  });
});

describe("ActivePatrols — click→detail", () => {
  it("rows are keyboard-accessible buttons with a descriptive aria-label", () => {
    const { getByRole } = render(
      <ActivePatrols
        patrols={[patrol]}
        isLoading={false}
        onSelectPatrol={vi.fn()}
      />,
    );
    const row = getByRole("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.getAttribute("aria-label")).toMatch(/view patrol detail/i);
    expect(row.getAttribute("aria-label")).toContain("Ranger Cruz");
  });

  it("fires onSelectPatrol on click, Enter and Space", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <ActivePatrols
        patrols={[patrol]}
        isLoading={false}
        onSelectPatrol={onSelect}
      />,
    );
    const row = getByRole("button");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledWith(patrol);
  });

  it("rows are not buttons when no handler is supplied", () => {
    const { queryByRole } = render(
      <ActivePatrols patrols={[patrol]} isLoading={false} />,
    );
    expect(queryByRole("button")).toBeNull();
  });
});

describe("EventFeed — click→detail", () => {
  const event: FeedEvent = {
    id: "e-1",
    title: "Poaching reported",
    priority: 300,
    state: "active",
    reportedAt: new Date("2026-06-25T07:00:00Z"),
    eventType: { display: "Illegal Fishing", category: "Law Enforcement" },
  };

  it("fires onSelectEvent with the event id on click and keyboard", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <EventFeed
        events={[event]}
        isLoading={false}
        onSelectEvent={onSelect}
      />,
    );
    const row = getByRole("button");
    expect(row.getAttribute("aria-label")).toContain("Poaching reported");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith("e-1");
  });
});

describe("LastIncidentCard — click→detail", () => {
  const incident: LastIncident = {
    id: "e-9",
    title: "Vessel intrusion",
    reportedAt: new Date("2026-06-25T06:00:00Z"),
    eventType: { display: "Intrusion", category: "Law Enforcement" },
  };

  it("fires onSelect with the incident id when clicked", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <LastIncidentCard incident={incident} onSelect={onSelect} />,
    );
    const card = getByRole("button");
    expect(card.getAttribute("aria-label")).toContain("Vessel intrusion");
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith("e-9");
  });

  it("is not a button when there is no incident", () => {
    const { queryByRole } = render(
      <LastIncidentCard incident={null} onSelect={vi.fn()} />,
    );
    expect(queryByRole("button")).toBeNull();
  });
});
