// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AlertsPanel, type AlertItem } from "../_components/alerts-panel";
import { EventFeed, type FeedEvent } from "../_components/event-feed";
import { ActivePatrols, type ActivePatrol } from "../_components/active-patrols";
import { LastIncidentCard } from "../_components/last-incident-card";

const NOW = new Date("2026-06-21T12:00:00Z");

afterEach(() => {
  cleanup();
});

describe("AlertsPanel", () => {
  const alerts: AlertItem[] = [
    {
      id: "a1",
      firedAt: new Date("2026-06-21T11:58:00Z"),
      matchedPriority: 300,
      ruleName: "Blast fishing",
      eventTitle: "#14063 — BLAST FISHING",
    },
    {
      id: "a2",
      firedAt: new Date("2026-06-21T09:00:00Z"),
      matchedPriority: 100,
      ruleName: "Outreach",
      eventTitle: "Community outreach",
    },
  ];

  it("renders a labelled region with the alert count", () => {
    render(<AlertsPanel alerts={alerts} isLoading={false} now={NOW} />);
    const region = screen.getByRole("region", { name: /alerts & escalations/i });
    expect(region).toBeTruthy();
    expect(within(region).getByText("2")).toBeTruthy();
  });

  it("is read-only: shows the no-acknowledgement caption and no ACK button", () => {
    render(<AlertsPanel alerts={alerts} isLoading={false} now={NOW} />);
    expect(screen.getByText(/acknowledgement is not yet tracked/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ack/i })).toBeNull();
  });

  it("pairs priority color with a text label (not color-alone)", () => {
    render(<AlertsPanel alerts={alerts} isLoading={false} now={NOW} />);
    // High-priority alert renders its label text somewhere in the row.
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("applies the pulse class only to high-priority unread indicators", () => {
    const { container } = render(
      <AlertsPanel alerts={alerts} isLoading={false} now={NOW} />,
    );
    expect(container.querySelectorAll(".animate-warroom-pulse").length).toBe(1);
  });

  it("renders an empty state", () => {
    render(<AlertsPanel alerts={[]} isLoading={false} now={NOW} />);
    expect(screen.getByText(/no alerts fired recently/i)).toBeTruthy();
  });
});

describe("EventFeed", () => {
  const events: FeedEvent[] = [
    {
      id: "e1",
      title: "Destructive — Explosives",
      priority: 300,
      state: "new_event",
      reportedAt: new Date("2026-06-21T11:58:00Z"),
      eventType: { display: "Use of Explosives", category: "law_enforcement" },
    },
    {
      id: "e2",
      title: "Wildlife Sighting",
      priority: 0,
      state: "active",
      reportedAt: new Date("2026-06-21T09:00:00Z"),
      eventType: { display: "Wildlife", category: "monitoring" },
    },
  ];

  it("renders events with state badges", () => {
    render(<EventFeed events={events} isLoading={false} now={NOW} />);
    expect(screen.getByText("Destructive — Explosives")).toBeTruthy();
    expect(screen.getByText("new")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
  });

  it("exposes priority as screen-reader text (not color-alone)", () => {
    render(<EventFeed events={events} isLoading={false} now={NOW} />);
    expect(screen.getByText(/Critical priority:/i)).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<EventFeed events={[]} isLoading={false} now={NOW} />);
    expect(screen.getByText(/no events recorded yet/i)).toBeTruthy();
  });
});

describe("ActivePatrols", () => {
  const patrols: ActivePatrol[] = [
    {
      id: "p1",
      patrolType: "seaborne",
      areaName: "A12a",
      startTime: new Date("2026-06-21T05:48:00Z"),
      totalDistanceKm: 80,
      computedDistanceKm: 87.3,
      leaderName: "Pottoli Tobin 2",
    },
  ];

  it("renders the column headers and a patrol row", () => {
    render(<ActivePatrols patrols={patrols} isLoading={false} now={NOW} />);
    expect(screen.getByText("Ranger")).toBeTruthy();
    expect(screen.getByText("KM")).toBeTruthy();
    expect(screen.getByText("Pottoli Tobin 2")).toBeTruthy();
    // Prefers computedDistanceKm over totalDistanceKm.
    expect(screen.getByText("87.3")).toBeTruthy();
    expect(screen.getByText("6h12m")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<ActivePatrols patrols={[]} isLoading={false} now={NOW} />);
    expect(screen.getByText(/no active patrols/i)).toBeTruthy();
  });
});

describe("LastIncidentCard", () => {
  it("shows relative time for a present incident", () => {
    render(
      <LastIncidentCard
        incident={{
          id: "e1",
          title: "#14063 · Blast",
          reportedAt: new Date("2026-06-21T11:58:00Z"),
          eventType: { display: "Blast", category: "law_enforcement" },
        }}
        now={NOW}
      />,
    );
    expect(screen.getByText("2m")).toBeTruthy();
    expect(screen.getByText(/#14063/)).toBeTruthy();
  });

  it("shows None when there is no incident", () => {
    render(<LastIncidentCard incident={null} now={NOW} />);
    expect(screen.getByText("None")).toBeTruthy();
  });
});
