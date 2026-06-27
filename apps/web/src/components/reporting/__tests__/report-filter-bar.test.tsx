// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

const { stubs } = vi.hoisted(() => ({
  stubs: {
    municipalities: [
      { id: "m-1", name: "Calapan City", province: "Oriental Mindoro", slug: "calapan-city" },
      { id: "m-2", name: "Naujan", province: "Oriental Mindoro", slug: "naujan" },
    ] as { id: string; name: string; province: string; slug: string }[],
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    municipality: {
      list: {
        useQuery: () => ({ data: stubs.municipalities, isLoading: false }),
      },
    },
  },
}));

import {
  ReportFilterProvider,
  useReportFilter,
} from "../report-filter-context";
import { ReportFilterBar } from "../report-filter-bar";

afterEach(() => {
  cleanup();
});

// Read-out probe so we can assert the bar drives the shared context.
function Probe() {
  const { from, to, municipalityId } = useReportFilter();
  return (
    <div
      data-testid="probe"
      data-from={from.toISOString()}
      data-to={to.toISOString()}
      data-municipality={municipalityId ?? "null"}
    />
  );
}

function renderBar() {
  return render(
    <ReportFilterProvider>
      <ReportFilterBar />
      <Probe />
    </ReportFilterProvider>,
  );
}

describe("ReportFilterBar", () => {
  it("renders From/To date inputs and a municipality select", () => {
    renderBar();
    expect(screen.getByTestId("report-range-from")).toBeTruthy();
    expect(screen.getByTestId("report-range-to")).toBeTruthy();
    expect(screen.getByTestId("report-municipality")).toBeTruthy();
    // Default municipality = all (null).
    expect(screen.getByTestId("probe").getAttribute("data-municipality")).toBe(
      "null",
    );
  });

  it("updating the From input drives the shared range", () => {
    renderBar();
    const from = screen.getByTestId("report-range-from");
    fireEvent.change(from, { target: { value: "2026-03-15" } });

    const probeFrom = screen.getByTestId("probe").getAttribute("data-from");
    expect(probeFrom).not.toBeNull();
    // The provider parsed local midnight 2026-03-15.
    expect(new Date(probeFrom as string).getFullYear()).toBe(2026);
    expect(new Date(probeFrom as string).getMonth()).toBe(2); // March (0-based)
  });

  it("reset button restores the 30-day default window", () => {
    renderBar();
    const from = screen.getByTestId("report-range-from");
    fireEvent.change(from, { target: { value: "2020-01-01" } });

    fireEvent.click(screen.getByTestId("report-filter-reset"));

    const probe = screen.getByTestId("probe");
    const span =
      new Date(probe.getAttribute("data-to") as string).getTime() -
      new Date(probe.getAttribute("data-from") as string).getTime();
    expect(Math.abs(span - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(2000);
  });
});
