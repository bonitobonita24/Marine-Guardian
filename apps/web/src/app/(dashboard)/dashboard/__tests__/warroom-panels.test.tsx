// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AlertsPanel, type AlertItem } from "../_components/alerts-panel";
import { EventFeed, type FeedEvent } from "../_components/event-feed";
import { ActivePatrols, type ActivePatrol } from "../_components/active-patrols";
import { LastIncidentCard } from "../_components/last-incident-card";
import { BreakdownBars } from "../_components/breakdown-bars";

// Recharts ResponsiveContainer requires a measured DOM container. In jsdom that
// is always 0×0 so we stub it to render children directly.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-responsive-container">{children}</div>
    ),
  };
});

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

  it("renders a labelled region with the unacked alert count", () => {
    render(<AlertsPanel alerts={alerts} isLoading={false} now={NOW} />);
    const region = screen.getByRole("region", { name: /alerts & escalations/i });
    expect(region).toBeTruthy();
    // Both alerts are unacknowledged (no acknowledgedAt) → "2 unacked" badge
    expect(within(region).getByText(/2 unacked/i)).toBeTruthy();
  });

  it("hides ACK buttons when canAck=false (default) — no interactive controls", () => {
    render(<AlertsPanel alerts={alerts} isLoading={false} now={NOW} />);
    // canAck defaults to false — no ACK buttons rendered for non-admins
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
      totalHours: 6,
      computedDurationHours: 6.2,
      startLocationLat: 13.5,
      startLocationLon: 120.9,
      endLocationLat: 13.6,
      endLocationLon: 121.0,
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

  it("calls onSelectPatrol when a row is clicked (CC-2 map focus wiring)", () => {
    const onSelectPatrol = vi.fn();
    render(
      <ActivePatrols
        patrols={patrols}
        isLoading={false}
        now={NOW}
        onSelectPatrol={onSelectPatrol}
      />,
    );
    screen.getByText("Pottoli Tobin 2").closest('[role="button"]')?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(onSelectPatrol).toHaveBeenCalledWith(patrols[0]);
  });

  it("marks the row matching selectedPatrolId as selected (CC-2 map focus highlight)", () => {
    render(
      <ActivePatrols
        patrols={patrols}
        isLoading={false}
        now={NOW}
        onSelectPatrol={() => {}}
        selectedPatrolId="p1"
      />,
    );
    const row = screen.getByText("Pottoli Tobin 2").closest('[role="button"]');
    expect(row?.getAttribute("aria-selected")).toBe("true");
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

// Issue B — EventFeed must NOT surface Skylight events (owner decision 2026-06-23).
// The dashboard.recentEvents query excludes them server-side; these component
// tests verify that the EventFeed component renders only what it receives (the
// server filter is tested separately in the dashboard router tests).
describe("EventFeed — Skylight events excluded by server (Issue B)", () => {
  it("does not render a Skylight-sourced event when the feed prop omits it", () => {
    // Simulate server already filtering: only non-skylight event is in the feed.
    const events: FeedEvent[] = [
      {
        id: "e-good",
        title: "Illegal fishing report",
        priority: 200,
        state: "active",
        reportedAt: new Date("2026-06-23T08:00:00Z"),
        eventType: { display: "Illegal Fishing", category: "law_enforcement" },
      },
    ];
    render(<EventFeed events={events} isLoading={false} now={NOW} />);
    expect(screen.getByText("Illegal fishing report")).toBeTruthy();
    // A Skylight event titled "Vessel AIS Detection" is NOT in the list.
    expect(screen.queryByText("Vessel AIS Detection")).toBeNull();
  });
});

// BreakdownBars renders a labelled horizontal bar LIST (CSS, not recharts):
// each row = a left-anchored bar with the event name inside + the count in a
// fixed right-hand column (owner design 2026-06-28).
describe("BreakdownBars — labelled bar list", () => {
  const data = [
    { type: "Blast Fishing", count: 12 },
    { type: "Illegal Nets", count: 7 },
    { type: "Poaching", count: 3 },
  ];

  it("renders the section heading", () => {
    render(
      <BreakdownBars
        title="Law Enforcement"
        data={data}
        variant="law_enforcement"
      />,
    );
    expect(screen.getByText("Law Enforcement")).toBeTruthy();
  });

  it("renders a labelled bar row per event type with its count", () => {
    render(
      <BreakdownBars title="Monitoring" data={data} variant="monitoring" />,
    );
    // Each event-type name is rendered inside its bar...
    expect(screen.getByText("Blast Fishing")).toBeTruthy();
    expect(screen.getByText("Illegal Nets")).toBeTruthy();
    expect(screen.getByText("Poaching")).toBeTruthy();
    // ...and its count is shown in the right-hand column.
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders empty state when no data", () => {
    render(
      <BreakdownBars title="Law Enforcement" data={[]} variant="law_enforcement" />,
    );
    expect(screen.getByText(/no events/i)).toBeTruthy();
  });

  it("accepts deprecated barClass prop without crashing (backward compat)", () => {
    // Callers that haven't migrated yet should not throw.
    expect(() =>
      render(
        <BreakdownBars
          title="Legacy"
          data={data}
          barClass="bg-destructive"
        />,
      ),
    ).not.toThrow();
  });
});
