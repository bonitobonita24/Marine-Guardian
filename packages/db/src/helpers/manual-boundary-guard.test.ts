import { describe, expect, it } from "vitest";
import { shouldSkipManualBoundary } from "./manual-boundary-guard";

describe("shouldSkipManualBoundary", () => {
  it("skips water when waterBoundaryManual is true", () => {
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: false, waterBoundaryManual: true },
        "water",
      ),
    ).toBe(true);
  });

  it("skips land when landBoundaryManual is true", () => {
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: true, waterBoundaryManual: false },
        "land",
      ),
    ).toBe(true);
  });

  it("applies (does not skip) when the relevant manual flag is false", () => {
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: false, waterBoundaryManual: false },
        "water",
      ),
    ).toBe(false);
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: false, waterBoundaryManual: false },
        "land",
      ),
    ).toBe(false);
  });

  it("force=true always applies, even if the manual flag is true", () => {
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: true, waterBoundaryManual: true },
        "water",
        true,
      ),
    ).toBe(false);
    expect(
      shouldSkipManualBoundary(
        { landBoundaryManual: true, waterBoundaryManual: true },
        "land",
        true,
      ),
    ).toBe(false);
  });
});
