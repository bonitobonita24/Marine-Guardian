// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  PatrolListByRangeCard,
  type RangePatrol,
} from "../patrol-list-by-range-card";

function makePatrol(id: string): RangePatrol {
  return {
    id,
    title: null,
    serialNumber: null,
    patrolType: "sea",
    boatName: "MB Guardian",
    startTime: null,
    endTime: null,
    totalDistanceKm: null,
    computedDistanceKm: null,
    totalHours: null,
    computedDurationHours: null,
    startLocationLat: null,
    startLocationLon: null,
    endLocationLat: null,
    endLocationLon: null,
    leaderName: null,
    leaders: [],
  };
}

describe("PatrolListByRangeCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("falls back to patrols.length when totalCount is undefined (loading)", () => {
    const patrols = [makePatrol("1"), makePatrol("2")];
    render(
      <PatrolListByRangeCard
        patrols={patrols}
        isLoading={false}
        selectedPatrolId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("shows the uncapped totalCount in the badge and a truncation note when the list is capped", () => {
    const patrols = [makePatrol("1"), makePatrol("2"), makePatrol("3")];
    render(
      <PatrolListByRangeCard
        patrols={patrols}
        isLoading={false}
        selectedPatrolId={null}
        onSelect={vi.fn()}
        totalCount={454}
      />,
    );
    expect(screen.getByText("454")).toBeTruthy();
    expect(screen.getByText("Showing 3 of 454")).toBeTruthy();
  });

  it("does NOT render a truncation note when totalCount equals the row count", () => {
    const patrols = [makePatrol("1")];
    render(
      <PatrolListByRangeCard
        patrols={patrols}
        isLoading={false}
        selectedPatrolId={null}
        onSelect={vi.fn()}
        totalCount={1}
      />,
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});
