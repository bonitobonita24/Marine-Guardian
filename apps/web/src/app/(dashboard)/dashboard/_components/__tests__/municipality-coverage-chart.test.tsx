// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  MunicipalityCoverageChart,
  groupCoverageByProvince,
  type MunicipalityCoverageDatum,
} from "../municipality-coverage-chart";

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

const data: MunicipalityCoverageDatum[] = [
  {
    municipality: "Calapan City",
    province: "Oriental Mindoro",
    patrolCount: 5,
    eventCount: 2,
  },
  {
    municipality: "Naujan",
    province: "Oriental Mindoro",
    patrolCount: 3,
    eventCount: 1,
  },
  {
    municipality: "Mamburao",
    province: "Occidental Mindoro",
    patrolCount: 4,
    eventCount: 6,
  },
  {
    municipality: "Coron",
    province: "Palawan",
    patrolCount: 0,
    eventCount: 0,
  },
];

describe("groupCoverageByProvince (pure grouping logic)", () => {
  it("sums municipalities into exactly the provinces present in the data", () => {
    const result = groupCoverageByProvince(data);
    expect(result).toHaveLength(3);

    const oriental = result.find((r) => r.municipality === "Oriental Mindoro");
    expect(oriental).toEqual({
      municipality: "Oriental Mindoro",
      patrolCount: 8, // 5 + 3
      eventCount: 3, // 2 + 1
    });

    const occidental = result.find((r) => r.municipality === "Occidental Mindoro");
    expect(occidental).toEqual({
      municipality: "Occidental Mindoro",
      patrolCount: 4,
      eventCount: 6,
    });

    const palawan = result.find((r) => r.municipality === "Palawan");
    expect(palawan).toEqual({
      municipality: "Palawan",
      patrolCount: 0,
      eventCount: 0,
    });
  });

  it("does not invent a region that has zero municipalities in the data", () => {
    const onlyOriental = data.filter((d) => d.province === "Oriental Mindoro");
    const result = groupCoverageByProvince(onlyOriental);
    expect(result).toHaveLength(1);
    expect(result[0]?.municipality).toBe("Oriental Mindoro");
  });

  it("returns an empty array for empty input", () => {
    expect(groupCoverageByProvince([])).toEqual([]);
  });
});

describe("MunicipalityCoverageChart", () => {
  it("defaults to Municipality Coverage title when groupByProvince is omitted", () => {
    render(
      <MunicipalityCoverageChart data={data} isLoading={false} rangeLabel="Jun 19 – Jun 26" />,
    );
    expect(screen.getByText(/^municipality coverage$/i)).toBeTruthy();
  });

  it("shows Region Coverage title when groupByProvince is true", () => {
    render(
      <MunicipalityCoverageChart
        data={data}
        isLoading={false}
        rangeLabel="Jun 19 – Jun 26"
        groupByProvince
      />,
    );
    expect(screen.getByText(/^region coverage$/i)).toBeTruthy();
    expect(screen.queryByText(/^municipality coverage$/i)).toBeNull();
  });

  it("Patrols/Events legend totals are unaffected by grouping (same underlying data)", () => {
    render(
      <MunicipalityCoverageChart
        data={data}
        isLoading={false}
        rangeLabel="Jun 19 – Jun 26"
        groupByProvince
      />,
    );
    // total patrols = 5+3+4+0 = 12, total events = 2+1+6+0 = 9
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("shows the empty state and does not crash when data is empty", () => {
    render(
      <MunicipalityCoverageChart
        data={[]}
        isLoading={false}
        rangeLabel="Jun 19 – Jun 26"
        groupByProvince
      />,
    );
    expect(screen.getByText(/no coverage data/i)).toBeTruthy();
  });
});
