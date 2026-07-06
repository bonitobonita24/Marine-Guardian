import { describe, it, expect } from "vitest";
import { rangeLabel } from "../report-map-view";

describe("rangeLabel", () => {
  it("omits the year when both dates fall in the same calendar year", () => {
    const from = new Date(2026, 0, 1); // Jan 1, 2026
    const to = new Date(2026, 6, 6); // Jul 6, 2026
    expect(rangeLabel(from, to)).toBe("Jan 1 – Jul 6");
  });

  it("includes the year on BOTH ends when the range crosses a year boundary", () => {
    const from = new Date(2025, 0, 1); // Jan 1, 2025
    const to = new Date(2026, 6, 6); // Jul 6, 2026
    expect(rangeLabel(from, to)).toBe("Jan 1, 2025 – Jul 6, 2026");
  });
});
