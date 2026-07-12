// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

  it("does not render the hide-idle toggle when no handler is supplied", () => {
    render(
      <RangerRoster rangers={rangers} summary={summary} isLoading={false} />,
    );
    expect(screen.queryByText(/hide inactive rangers on map/i)).toBeNull();
  });

  it("renders the hide-idle-on-map toggle (CC-1) and reports changes", () => {
    const onHideIdleRangersChange = vi.fn();
    render(
      <RangerRoster
        rangers={rangers}
        summary={summary}
        isLoading={false}
        hideIdleRangers={false}
        onHideIdleRangersChange={onHideIdleRangersChange}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /hide inactive rangers on map/i });
    expect((toggle as HTMLInputElement).getAttribute("aria-checked")).toBe(
      "false",
    );
    fireEvent.click(toggle);
    expect(onHideIdleRangersChange).toHaveBeenCalledWith(true);
  });

  // ── Q2 (2026-07-07) click-to-locate ──────────────────────────────────────

  it("makes ONLY locatable rangers clickable buttons and fires onSelectRanger with the ranger", () => {
    const onSelectRanger = vi.fn();
    render(
      <RangerRoster
        rangers={rangers}
        summary={summary}
        isLoading={false}
        onSelectRanger={onSelectRanger}
        // Alpha + Bravo have a map position; Charlie does not.
        locatableRangerNames={new Set(["alpha ranger", "bravo ranger"])}
      />,
    );
    // Two locatable rangers → two accessible "Show … on the map" buttons.
    const alphaBtn = screen.getByRole("button", {
      name: /show alpha ranger on the map/i,
    });
    expect(alphaBtn).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /show bravo ranger on the map/i }),
    ).toBeTruthy();
    // Charlie is NOT locatable → no button for it.
    expect(
      screen.queryByRole("button", { name: /show charlie ranger on the map/i }),
    ).toBeNull();

    fireEvent.click(alphaBtn);
    expect(onSelectRanger).toHaveBeenCalledTimes(1);
    const clicked = onSelectRanger.mock.calls[0]?.[0] as
      | RosterRanger
      | undefined;
    expect(clicked?.name).toBe("Alpha Ranger");
  });

  it("renders no locate buttons when onSelectRanger is omitted (read-only list)", () => {
    render(
      <RangerRoster
        rangers={rangers}
        summary={summary}
        isLoading={false}
        locatableRangerNames={new Set(["alpha ranger"])}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /on the map/i }),
    ).toBeNull();
  });

  it("matches ranger→position names case/whitespace-insensitively", () => {
    const onSelectRanger = vi.fn();
    render(
      <RangerRoster
        rangers={[
          {
            id: "r1",
            name: "  Alpha Ranger  ",
            status: "on_patrol",
            lastSeenAt: new Date(),
            patrolsInRange: 1,
            patrolHoursInRange: 2,
          },
        ]}
        summary={{ total: 1, onPatrol: 1, active: 0, idle: 0 }}
        isLoading={false}
        onSelectRanger={onSelectRanger}
        locatableRangerNames={new Set(["alpha ranger"])}
      />,
    );
    // Padded/mixed-case display name still resolves to the normalized key.
    expect(
      screen.getByRole("button", { name: /show .*alpha ranger.* on the map/i }),
    ).toBeTruthy();
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
