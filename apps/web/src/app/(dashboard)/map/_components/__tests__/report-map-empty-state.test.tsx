// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  ReportMapEmptyState,
  shouldShowReportMapEmptyState,
} from "../report-map-empty-state";

describe("shouldShowReportMapEmptyState", () => {
  const base = {
    municipalityId: "muni-1",
    totalEvents: 0,
    isLoading: false,
    municipalityName: "Calapan City",
  };

  it("shows when a specific municipality is selected and the count is zero", () => {
    expect(shouldShowReportMapEmptyState(base)).toBe(true);
  });

  it("does NOT show for all-municipalities (municipalityId null), even at zero", () => {
    expect(
      shouldShowReportMapEmptyState({
        ...base,
        municipalityId: null,
        municipalityName: null,
      }),
    ).toBe(false);
  });

  it("does NOT show when there are events in range", () => {
    expect(
      shouldShowReportMapEmptyState({ ...base, totalEvents: 12 }),
    ).toBe(false);
  });

  it("does NOT show while still loading (avoids flashing mid-fetch)", () => {
    expect(
      shouldShowReportMapEmptyState({ ...base, isLoading: true }),
    ).toBe(false);
  });

  it("does NOT show until the municipality name is known", () => {
    expect(
      shouldShowReportMapEmptyState({ ...base, municipalityName: null }),
    ).toBe(false);
  });
});

describe("ReportMapEmptyState", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the municipality name and date range in the message", () => {
    render(
      <ReportMapEmptyState
        municipalityName="Calapan City"
        rangeLabel="Jun 22 – Jun 29, 2026"
      />,
    );

    expect(
      screen.getByText(
        "No events recorded for Calapan City between Jun 22 – Jun 29, 2026.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Try a wider date range or a different municipality."),
    ).toBeTruthy();
    // Accessible live region so screen readers announce the change.
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
