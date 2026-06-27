// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EventsOverTimeChart } from "../events-over-time-chart";

// Recharts ResponsiveContainer needs a measured DOM container; jsdom is 0×0,
// so stub it to render children directly (same pattern as the dashboard chart tests).
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-responsive-container">{children}</div>
    ),
  };
});

afterEach(() => {
  cleanup();
});

describe("EventsOverTimeChart", () => {
  const data = [
    { date: "2026-06-01", count: 2 },
    { date: "2026-06-02", count: 0 },
    { date: "2026-06-03", count: 5 },
  ];

  it("renders the Recharts container when data is present", () => {
    render(
      <EventsOverTimeChart data={data} isLoading={false} rangeLabel="Jun 1 – Jun 3" />,
    );
    expect(
      document.querySelector("[data-testid='recharts-responsive-container']"),
    ).toBeTruthy();
  });

  it("shows a loading message while loading", () => {
    render(
      <EventsOverTimeChart data={[]} isLoading={true} rangeLabel="Jun 1 – Jun 3" />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("shows empty state when not loading and no data", () => {
    render(
      <EventsOverTimeChart data={[]} isLoading={false} rangeLabel="Jun 1 – Jun 3" />,
    );
    expect(screen.getByText(/no events in range/i)).toBeTruthy();
  });

  it("renders the heading and total event count", () => {
    render(
      <EventsOverTimeChart data={data} isLoading={false} rangeLabel="Jun 1 – Jun 3" />,
    );
    expect(screen.getByText(/events over time/i)).toBeTruthy();
    // total = 7
    expect(screen.getByText("7")).toBeTruthy();
  });
});
