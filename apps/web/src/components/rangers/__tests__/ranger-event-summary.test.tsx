// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RangerEventSummary } from "../ranger-event-summary";

afterEach(() => {
  cleanup();
});

describe("RangerEventSummary", () => {
  it("renders the Reported / Accompanied / Total credit headline", () => {
    const { container } = render(
      <RangerEventSummary
        eventStats={{
          reportedCount: 7,
          accompaniedCount: 3,
          totalCredit: 10,
          categoryBreakdown: [],
        }}
      />,
    );
    expect(container.textContent).toContain("Reported:");
    expect(container.textContent).toContain("7");
    expect(container.textContent).toContain("Accompanied:");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("Total credit:");
    expect(container.textContent).toContain("10");
  });

  it("shows empty-state message when categoryBreakdown is empty", () => {
    const { container } = render(
      <RangerEventSummary
        eventStats={{
          reportedCount: 0,
          accompaniedCount: 0,
          totalCredit: 0,
          categoryBreakdown: [],
        }}
      />,
    );
    expect(container.textContent).toContain("No events credited");
  });

  it("renders a row per category with reported/accompanied/total counts", () => {
    const { container, getAllByRole } = render(
      <RangerEventSummary
        eventStats={{
          reportedCount: 5,
          accompaniedCount: 2,
          totalCredit: 7,
          categoryBreakdown: [
            { category: "Wildlife", reported: 3, accompanied: 1, total: 4 },
            { category: "Fishing Violation", reported: 2, accompanied: 1, total: 3 },
          ],
        }}
      />,
    );
    expect(container.textContent).toContain("Wildlife");
    expect(container.textContent).toContain("Fishing Violation");
    // header row + 2 data rows = 3 rows
    expect(getAllByRole("row")).toHaveLength(3);
  });

  it("sorts categoryBreakdown by total DESC", () => {
    const { container } = render(
      <RangerEventSummary
        eventStats={{
          reportedCount: 6,
          accompaniedCount: 4,
          totalCredit: 10,
          categoryBreakdown: [
            { category: "Small", reported: 1, accompanied: 0, total: 1 },
            { category: "Largest", reported: 5, accompanied: 2, total: 7 },
            { category: "Medium", reported: 0, accompanied: 2, total: 2 },
          ],
        }}
      />,
    );
    const text = container.textContent;
    const largestIdx = text.indexOf("Largest");
    const mediumIdx = text.indexOf("Medium");
    const smallIdx = text.indexOf("Small");
    expect(largestIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(smallIdx);
  });

  it("renders 'Uncategorized' as a category name when present", () => {
    const { container } = render(
      <RangerEventSummary
        eventStats={{
          reportedCount: 1,
          accompaniedCount: 0,
          totalCredit: 1,
          categoryBreakdown: [
            { category: "Uncategorized", reported: 1, accompanied: 0, total: 1 },
          ],
        }}
      />,
    );
    expect(container.textContent).toContain("Uncategorized");
  });
});
