// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RangerActivityTimeline } from "../ranger-activity-timeline";

afterEach(() => {
  cleanup();
});

describe("RangerActivityTimeline", () => {
  it("shows empty-state message when recentActivity is empty", () => {
    const { container } = render(
      <RangerActivityTimeline recentActivity={[]} />,
    );
    expect(container.textContent).toContain("No recent activity");
  });

  it("renders an item per activity entry", () => {
    const { getAllByRole } = render(
      <RangerActivityTimeline
        recentActivity={[
          {
            type: "event-reported",
            entityId: "ev-1",
            title: "Blast fishing report",
            timestamp: new Date("2024-04-01T10:00:00Z"),
          },
          {
            type: "patrol-led",
            entityId: "p-1",
            title: "Morning patrol",
            timestamp: new Date("2024-04-02T07:00:00Z"),
          },
        ]}
      />,
    );
    expect(getAllByRole("listitem")).toHaveLength(2);
  });

  it("labels all 4 activity types correctly", () => {
    const { container } = render(
      <RangerActivityTimeline
        recentActivity={[
          { type: "event-reported", entityId: "a", title: "A", timestamp: new Date() },
          { type: "event-accompanied", entityId: "b", title: "B", timestamp: new Date() },
          { type: "patrol-led", entityId: "c", title: "C", timestamp: new Date() },
          { type: "patrol-accompanied", entityId: "d", title: "D", timestamp: new Date() },
        ]}
      />,
    );
    expect(container.textContent).toContain("Reported event");
    expect(container.textContent).toContain("Accompanied event");
    expect(container.textContent).toContain("Led patrol");
    expect(container.textContent).toContain("Accompanied patrol");
  });

  it("renders 'Untitled' when title is null", () => {
    const { container } = render(
      <RangerActivityTimeline
        recentActivity={[
          {
            type: "event-reported",
            entityId: "ev-untitled",
            title: null,
            timestamp: new Date("2024-04-01T10:00:00Z"),
          },
        ]}
      />,
    );
    expect(container.textContent).toContain("Untitled");
  });

  it("renders the entity title when provided", () => {
    const { container } = render(
      <RangerActivityTimeline
        recentActivity={[
          {
            type: "patrol-accompanied",
            entityId: "p-x",
            title: "Reef survey",
            timestamp: new Date("2024-04-01T10:00:00Z"),
          },
        ]}
      />,
    );
    expect(container.textContent).toContain("Reef survey");
  });

  it("renders activity items in the order received (page is responsible for DESC sort)", () => {
    const { container } = render(
      <RangerActivityTimeline
        recentActivity={[
          { type: "patrol-led", entityId: "newer", title: "Newer", timestamp: new Date("2024-04-02T00:00:00Z") },
          { type: "event-reported", entityId: "older", title: "Older", timestamp: new Date("2024-04-01T00:00:00Z") },
        ]}
      />,
    );
    const text = container.textContent;
    const newerIdx = text.indexOf("Newer");
    const olderIdx = text.indexOf("Older");
    expect(newerIdx).toBeLessThan(olderIdx);
  });
});
