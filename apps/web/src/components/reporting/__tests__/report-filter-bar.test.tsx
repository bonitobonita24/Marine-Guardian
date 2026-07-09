// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const { stubs } = vi.hoisted(() => ({
  stubs: {
    municipalities: [
      { id: "m-1", name: "Calapan City", province: "Oriental Mindoro", slug: "calapan-city" },
      { id: "m-2", name: "Naujan", province: "Oriental Mindoro", slug: "naujan" },
      { id: "m-3", name: "Mamburao", province: "Occidental Mindoro", slug: "mamburao" },
      { id: "m-4", name: "Puerto Princesa", province: "Palawan", slug: "puerto-princesa" },
    ] as { id: string; name: string; province: string; slug: string }[],
    protectedZones: [] as {
      id: string;
      name: string;
      slug: string;
      category: string;
      parentMunicipalityId: string | null;
    }[],
    protectedZonesLoading: false,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    municipality: {
      list: {
        useQuery: () => ({ data: stubs.municipalities, isLoading: false }),
      },
      protectedZones: {
        useQuery: () => ({
          data: stubs.protectedZones,
          isLoading: stubs.protectedZonesLoading,
        }),
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
  stubs.protectedZones = [];
  stubs.protectedZonesLoading = false;
});

// Read-out probe so we can assert the bar drives the shared context.
function Probe() {
  const { from, to, municipalityId, province, protectedZoneId } = useReportFilter();
  return (
    <div
      data-testid="probe"
      data-from={from.toISOString()}
      data-to={to.toISOString()}
      data-municipality={municipalityId ?? "null"}
      data-province={province ?? "null"}
      data-zone={protectedZoneId ?? "null"}
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

// jsdom doesn't implement scrollIntoView / pointer-capture, both of which
// Radix Select's open/scroll-into-view-on-open logic touches — stub them so
// the real Select popup can actually open under jsdom.
beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

/** Open a shadcn/Radix Select by its trigger testid, then click the option
 *  matching `optionText`. */
async function openAndPick(triggerTestId: string, optionText: string) {
  fireEvent.pointerDown(screen.getByTestId(triggerTestId));
  fireEvent.click(screen.getByTestId(triggerTestId));
  const option = await screen.findByText(optionText);
  fireEvent.click(option);
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
    // The default window is 7 days (owner request 2026-06-28) → the 7D preset
    // is highlighted/pressed and 30D is not.
    expect(
      screen.getByTestId("report-range-preset-7").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(preset30.getAttribute("aria-pressed")).toBe("false");
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

  it("shows the MPA Zone select when 'All municipalities' is active, even with zero zones total", () => {
    stubs.protectedZones = [];
    renderBar();
    expect(screen.getByTestId("report-protected-zone")).toBeTruthy();
  });

  it("hides the MPA Zone select when the selected municipality has zero protected zones", async () => {
    stubs.protectedZones = [
      {
        id: "z-1",
        name: "Zone One",
        slug: "zone-one",
        category: "mpa",
        parentMunicipalityId: "m-1",
      },
    ];
    renderBar();
    expect(screen.getByTestId("report-protected-zone")).toBeTruthy();

    // Naujan (m-2) has no zones in the stub → the control should disappear.
    await openAndPick("report-municipality", "Naujan");
    await waitFor(() => {
      expect(screen.queryByTestId("report-protected-zone")).toBeNull();
    });
  });

  it("filters the MPA Zone options to only the selected municipality's zones", async () => {
    stubs.protectedZones = [
      {
        id: "z-1",
        name: "Zone One",
        slug: "zone-one",
        category: "mpa",
        parentMunicipalityId: "m-1",
      },
      {
        id: "z-2",
        name: "Zone Two",
        slug: "zone-two",
        category: "mpa",
        parentMunicipalityId: "m-2",
      },
    ];
    renderBar();

    await openAndPick("report-municipality", "Calapan City"); // m-1
    await waitFor(() => {
      expect(screen.getByTestId("report-protected-zone")).toBeTruthy();
    });

    fireEvent.pointerDown(screen.getByTestId("report-protected-zone"));
    fireEvent.click(screen.getByTestId("report-protected-zone"));
    expect(await screen.findByText("Zone One")).toBeTruthy();
    expect(screen.queryByText("Zone Two")).toBeNull();
  });

  it("resets protectedZoneId to 'all zones' when the municipality changes out from under the current selection", async () => {
    stubs.protectedZones = [
      {
        id: "z-1",
        name: "Zone One",
        slug: "zone-one",
        category: "mpa",
        parentMunicipalityId: "m-1",
      },
      {
        id: "z-2",
        name: "Zone Two",
        slug: "zone-two",
        category: "mpa",
        parentMunicipalityId: "m-2",
      },
    ];
    renderBar();

    await openAndPick("report-municipality", "Calapan City"); // m-1
    await waitFor(() => {
      expect(screen.getByTestId("report-protected-zone")).toBeTruthy();
    });
    await openAndPick("report-protected-zone", "Zone One"); // z-1

    expect(screen.getByTestId("probe").getAttribute("data-zone")).toBe("z-1");

    // Switching to Naujan (m-2) invalidates z-1 (it belongs to m-1) — the
    // selection must reset back to the "all zones" sentinel (null), not
    // silently keep filtering by a zone that's no longer in scope.
    await openAndPick("report-municipality", "Naujan");
    await waitFor(() => {
      expect(screen.getByTestId("probe").getAttribute("data-zone")).toBe(
        "null",
      );
    });
  });

  it("renders a Province select with 'All provinces' plus the 3 distinct provinces", async () => {
    renderBar();
    expect(screen.getByTestId("report-province")).toBeTruthy();
    expect(screen.getByTestId("probe").getAttribute("data-province")).toBe(
      "null",
    );

    fireEvent.pointerDown(screen.getByTestId("report-province"));
    fireEvent.click(screen.getByTestId("report-province"));
    // The trigger's own selected-value span already renders "All provinces",
    // so the open listbox contributes a SECOND match — assert on the count.
    expect((await screen.findAllByText("All provinces")).length).toBe(2);
    expect(screen.getByText("Oriental Mindoro")).toBeTruthy();
    expect(screen.getByText("Occidental Mindoro")).toBeTruthy();
    expect(screen.getByText("Palawan")).toBeTruthy();
  });

  it("selecting a province sets the province filter and clears any selected municipality", async () => {
    renderBar();

    await openAndPick("report-municipality", "Calapan City"); // m-1
    expect(screen.getByTestId("probe").getAttribute("data-municipality")).toBe(
      "m-1",
    );

    await openAndPick("report-province", "Palawan");

    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-province")).toBe("Palawan");
    expect(probe.getAttribute("data-municipality")).toBe("null");
  });

  it("narrows the Municipality select to only the selected province's municipalities", async () => {
    renderBar();

    await openAndPick("report-province", "Oriental Mindoro");

    fireEvent.pointerDown(screen.getByTestId("report-municipality"));
    fireEvent.click(screen.getByTestId("report-municipality"));
    expect(await screen.findByText("Calapan City")).toBeTruthy();
    expect(screen.getByText("Naujan")).toBeTruthy();
    expect(screen.queryByText("Mamburao")).toBeNull();
    expect(screen.queryByText("Puerto Princesa")).toBeNull();
  });

  it("selecting 'All provinces' restores every province group in the Municipality select", async () => {
    renderBar();

    await openAndPick("report-province", "Palawan");
    expect(screen.getByTestId("probe").getAttribute("data-province")).toBe(
      "Palawan",
    );

    await openAndPick("report-province", "All provinces");
    expect(screen.getByTestId("probe").getAttribute("data-province")).toBe(
      "null",
    );

    fireEvent.pointerDown(screen.getByTestId("report-municipality"));
    fireEvent.click(screen.getByTestId("report-municipality"));
    expect(await screen.findByText("Calapan City")).toBeTruthy();
    expect(screen.getByText("Mamburao")).toBeTruthy();
    expect(screen.getByText("Puerto Princesa")).toBeTruthy();
  });
});
