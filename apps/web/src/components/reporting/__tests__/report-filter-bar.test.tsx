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

  it("stacked layout keeps all controls but drops the bar chrome (for the floating card)", () => {
    render(
      <ReportFilterProvider>
        <ReportFilterBar layout="stacked" />
      </ReportFilterProvider>,
    );
    expect(screen.getByTestId("report-range-from")).toBeTruthy();
    expect(screen.getByTestId("report-range-to")).toBeTruthy();
    expect(screen.getByTestId("report-municipality")).toBeTruthy();
    // Stacked = borderless vertical column; the preset buttons span full width.
    const region = screen.getByRole("region", { name: "Report map filters" });
    expect(region.className).toContain("flex-col");
    expect(region.className).not.toContain("border");
    expect(
      screen.getByTestId("report-range-preset-30").className,
    ).toContain("w-full");
  });

  it("renders 30D/15D/7D quick-range presets above From/To", () => {
    renderBar();
    const region = screen.getByRole("region", { name: "Report map filters" });
    const preset30 = screen.getByTestId("report-range-preset-30");
    const fromInput = screen.getByTestId("report-range-from");
    expect(screen.getByTestId("report-range-preset-15")).toBeTruthy();
    expect(screen.getByTestId("report-range-preset-7")).toBeTruthy();
    // Preset group precedes the From input in document order.
    expect(
      preset30.compareDocumentPosition(fromInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The default window is 30 days → the 30D preset is highlighted/pressed.
    expect(preset30.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByTestId("report-range-preset-7").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(region).toBeTruthy();
  });

  it("each quick-range preset sets the last-N-day window", () => {
    renderBar();
    const from = screen.getByTestId("report-range-from");
    fireEvent.change(from, { target: { value: "2020-01-01" } });

    for (const days of [30, 15, 7]) {
      fireEvent.click(screen.getByTestId(`report-range-preset-${String(days)}`));
      const probe = screen.getByTestId("probe");
      const span =
        new Date(probe.getAttribute("data-to") as string).getTime() -
        new Date(probe.getAttribute("data-from") as string).getTime();
      expect(Math.abs(span - days * 24 * 60 * 60 * 1000)).toBeLessThan(2000);
    }
  });
});
