// page-3-fuel-consumption.test.tsx

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Page3FuelConsumption } from "../page-3-fuel-consumption";
import type {
  PerAreaReportArea,
  PerAreaReportDateRange,
  PerAreaReportFuelConsumption,
} from "@/server/per-area-report/get-per-area-report-data";

const AREA: PerAreaReportArea = {
  id: "area_a5",
  name: "Area A5",
  region: "Mindoro Strait",
  source: "ARCGIS",
};

const SINGLE_MONTH_RANGE: PerAreaReportDateRange = {
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
  label: "May 2026",
  isDefault: true,
};

const MULTI_MONTH_RANGE: PerAreaReportDateRange = {
  start: new Date("2026-03-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
  label: "2026-03-01 — 2026-05-31",
  isDefault: false,
};

const SINGLE_MONTH_FUEL: PerAreaReportFuelConsumption = {
  totalLiters: 40.5,
  totalCost: 2430,
  currency: "PHP",
  totalSeabornePatrolKm: 50,
  averageLitersPerKm: 0.81,
  entryCount: 2,
  perMonthBreakdown: [
    {
      month: "2026-05",
      liters: 40.5,
      cost: 2430,
      seabornePatrolKm: 50,
      litersPerKm: 0.81,
    },
  ],
};

const MULTI_MONTH_FUEL: PerAreaReportFuelConsumption = {
  totalLiters: 33,
  totalCost: 1980,
  currency: "PHP",
  totalSeabornePatrolKm: 35,
  averageLitersPerKm: 33 / 35,
  entryCount: 3,
  perMonthBreakdown: [
    {
      month: "2026-03",
      liters: 8,
      cost: 480,
      seabornePatrolKm: 10,
      litersPerKm: 0.8,
    },
    {
      month: "2026-04",
      liters: 5,
      cost: 300,
      seabornePatrolKm: 0,
      litersPerKm: null,
    },
    {
      month: "2026-05",
      liters: 20,
      cost: 1200,
      seabornePatrolKm: 25,
      litersPerKm: 0.8,
    },
  ],
};

describe("Page3FuelConsumption", () => {
  it("renders the empty state when fuelConsumption is null", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={null}
      />,
    );
    expect(html).toContain(`data-testid="fuel-empty-state"`);
    expect(html).toContain("No fuel entries recorded for Area A5");
    expect(html).toContain("May 2026");
    // No KPI cards rendered in empty state
    expect(html).not.toContain(`data-testid="fuel-kpi-row"`);
  });

  it("renders all 3 KPI cards when fuel data is present", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={SINGLE_MONTH_FUEL}
      />,
    );
    expect(html).toContain(`data-testid="fuel-kpi-row"`);
    expect(html).toContain(`data-testid="fuel-kpi-total-liters"`);
    expect(html).toContain(`data-testid="fuel-kpi-total-cost"`);
    expect(html).toContain(`data-testid="fuel-kpi-avg-l-per-km"`);
    // Liters value with 1 fractional digit
    expect(html).toContain("40.5");
    // Entry count caption pluralised correctly
    expect(html).toContain("2 fuel entries");
  });

  it("displays N/A when averageLitersPerKm is null (zero seaborne km)", () => {
    const fuel: PerAreaReportFuelConsumption = {
      ...SINGLE_MONTH_FUEL,
      totalSeabornePatrolKm: 0,
      averageLitersPerKm: null,
    };
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={fuel}
      />,
    );
    expect(html).toContain(`data-testid="fuel-kpi-avg-l-per-km"`);
    // The N/A token must appear inside the avg-l-per-km card. Strip
    // surrounding markup to a single-line search to keep the assertion robust.
    expect(html).toMatch(/fuel-kpi-avg-l-per-km[^>]*>[\s\S]*?N\/A/);
  });

  it("formats totalCost as currency using the supplied currency code", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={SINGLE_MONTH_FUEL}
      />,
    );
    // Intl.NumberFormat("en-US", { currency: "PHP" }) → "₱2,430.00"
    // (Node's ICU emits the peso glyph for the en-US + PHP combo. The bare
    // "PHP" code only appears on locales without a known currency symbol.)
    expect(html).toMatch(/[₱P]/);
    expect(html).toMatch(/2,430\.00/);
  });

  it("renders the per-month breakdown table when dateRange spans 2 or more months", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={MULTI_MONTH_RANGE}
        fuelConsumption={MULTI_MONTH_FUEL}
      />,
    );
    expect(html).toContain(`data-testid="fuel-per-month-table-wrapper"`);
    expect(html).toContain(`data-testid="fuel-per-month-table"`);
    // All 3 months appear with display labels
    expect(html).toContain("March 2026");
    expect(html).toContain("April 2026");
    expect(html).toContain("May 2026");
    // April row shows N/A for litersPerKm (no seaborne km in April)
    expect(html).toMatch(/April 2026[\s\S]*?N\/A/);
  });

  it("hides the per-month breakdown table for single-month ranges", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={SINGLE_MONTH_FUEL}
      />,
    );
    expect(html).not.toContain(`data-testid="fuel-per-month-table-wrapper"`);
    expect(html).not.toContain(`data-testid="fuel-per-month-table"`);
  });

  it("methodology footer mentions the per-area fuel allocation caveat", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={SINGLE_MONTH_FUEL}
      />,
    );
    expect(html).toContain(`data-testid="fuel-methodology"`);
    expect(html).toContain("per-area level");
    expect(html).toContain("not tracked per individual boat");
  });

  it("applies pageBreakBefore so Page 3 starts on a fresh sheet in print", () => {
    const html = renderToStaticMarkup(
      <Page3FuelConsumption
        area={AREA}
        dateRange={SINGLE_MONTH_RANGE}
        fuelConsumption={SINGLE_MONTH_FUEL}
      />,
    );
    expect(html).toContain(`data-testid="page-3-fuel-consumption"`);
    expect(html).toMatch(/page-?break-?before\s*:\s*always/i);
  });
});
