// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  RangerRoster,
  type RosterRanger,
} from "../_components/ranger-roster";
import { Sparkline } from "../_components/sparkline";

afterEach(() => {
  cleanup();
});

// ── RangerRoster ──────────────────────────────────────────────────────────────

describe("RangerRoster", () => {
  const rangers: RosterRanger[] = [
    {
      id: "r1",
      name: "Alpha Ranger",
      status: "on_patrol",
      lastSeenAt: new Date(),
      patrolsInRange: 2,
      patrolHoursInRange: 5.5,
    },
    {
      id: "r2",
      name: "Bravo Ranger",
      status: "active",
      lastSeenAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      patrolsInRange: 1,
      patrolHoursInRange: 3,
    },
    {
      id: "r3",
      name: "Charlie Ranger",
      status: "idle",
      lastSeenAt: null,
      patrolsInRange: 0,
      patrolHoursInRange: 0,
    },
  ];
  const summary = { total: 3, onPatrol: 1, active: 1, idle: 1 };

  it("renders ranger names and their status labels", () => {
    render(
      <RangerRoster rangers={rangers} summary={summary} isLoading={false} />,
    );
    expect(screen.getByText("Alpha Ranger")).toBeTruthy();
    expect(screen.getByText("Bravo Ranger")).toBeTruthy();
    expect(screen.getByText("Charlie Ranger")).toBeTruthy();
    // Status is conveyed as TEXT (never color-alone) for WCAG 2.2 AA.
    expect(screen.getByText("On patrol")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("shows the status summary line in the header", () => {
    render(
      <RangerRoster rangers={rangers} summary={summary} isLoading={false} />,
    );
    expect(
      screen.getByText(/1 on patrol · 1 active · 1 idle/),
    ).toBeTruthy();
  });

  it("shows a loading state", () => {
    render(
      <RangerRoster
        rangers={[]}
        summary={{ total: 0, onPatrol: 0, active: 0, idle: 0 }}
        isLoading={true}
      />,
    );
    expect(screen.getByText(/loading roster/i)).toBeTruthy();
  });

  it("shows an empty state when there are no rangers", () => {
    render(
      <RangerRoster
        rangers={[]}
        summary={{ total: 0, onPatrol: 0, active: 0, idle: 0 }}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/no rangers on record/i)).toBeTruthy();
  });
});

// ── Sparkline ─────────────────────────────────────────────────────────────────

describe("Sparkline", () => {
  it("renders a polyline with one point per data value", () => {
    const { container } = render(<Sparkline data={[1, 4, 2, 8, 3]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeTruthy();
    const points = polyline?.getAttribute("points")?.trim().split(" ") ?? [];
    expect(points).toHaveLength(5);
  });

  it("renders nothing for fewer than two points", () => {
    const { container } = render(<Sparkline data={[7]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("applies the requested CSS-variable stroke color", () => {
    const { container } = render(
      <Sparkline data={[1, 2, 3]} colorVar="--success" />,
    );
    const polyline = container.querySelector("polyline");
    expect(polyline?.getAttribute("stroke")).toBe("hsl(var(--success))");
  });
});
