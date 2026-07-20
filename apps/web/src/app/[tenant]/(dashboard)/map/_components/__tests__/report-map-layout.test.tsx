// @vitest-environment jsdom

// Interactive Report Map layout restructure (owner request 2026-07-20):
//  1. "Generate Printable" moved into the page header row, opposite the <h1>.
//  2. The summary row is back to its original FOUR tiles — the 5th
//     stacked-charts tile added in b2cf14a is gone.
//  3. The two trend charts moved into floating map overlay panels, hidden by
//     default, behind always-visible toggles.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "demo-site" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "Test",
        tenantId: "t1",
        roles: ["field_coordinator"],
      },
      expires: "9999-01-01",
    },
    status: "authenticated" as const,
  }),
}));

// The filter provider is replaced wholesale so the view renders without the
// real date/municipality plumbing.
vi.mock("@/components/reporting/report-filter-context", () => ({
  ReportFilterProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useReportFilter: () => ({
    from: new Date("2026-05-01T00:00:00Z"),
    to: new Date("2026-05-31T00:00:00Z"),
    municipalityId: null,
    protectedZoneId: null,
    terrain: null,
    province: null,
    includeChildren: false,
    includeTraversing: false,
  }),
}));

vi.mock("@/components/reporting/report-filter-bar", () => ({
  ReportFilterBar: () => <div data-testid="filter-bar" />,
}));

// InteractiveMap is replaced by a stub that still renders the slots the view
// passes it — so the overlay wiring (controlsBelowSlot) is exercised for real
// without booting maplibre in jsdom.
vi.mock("@/components/map/InteractiveMap", () => ({
  InteractiveMap: ({
    filterSlot,
    controlsBelowSlot,
  }: {
    filterSlot?: ReactNode;
    controlsBelowSlot?: ReactNode;
  }) => (
    <div data-testid="interactive-map">
      {filterSlot}
      {controlsBelowSlot}
    </div>
  ),
}));

vi.mock("@/components/events/event-detail-modal", () => ({
  EventDetailModal: () => null,
}));

// Charts are stubbed: this test is about WHERE they render, not how they draw.
vi.mock("@/components/reporting/events-over-time-chart", () => ({
  EventsOverTimeChart: () => <div data-testid="chart-events" />,
}));
vi.mock(
  "@/app/[tenant]/(dashboard)/dashboard/_components/municipality-coverage-chart",
  () => ({
    MunicipalityCoverageChart: () => <div data-testid="chart-coverage" />,
  }),
);

// Every tRPC query used by the view resolves to an empty, non-loading result.
const emptyQuery = { data: undefined, isLoading: false };
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportMap: {
      eventBreakdownWithCoords: { useQuery: () => emptyQuery },
      eventsOverTime: { useQuery: () => ({ data: [], isLoading: false }) },
      highPriorityEvents: { useQuery: () => emptyQuery },
      patrolsInRange: { useQuery: () => ({ data: [], isLoading: false }) },
      summary: { useQuery: () => emptyQuery },
    },
    municipalityCoverage: {
      municipalityCoverage: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    municipality: { list: { useQuery: () => ({ data: [], isLoading: false }) } },
    reportTemplate: { list: { useQuery: () => emptyQuery } },
    reportExport: { create: { useMutation: () => ({ isPending: false, reset: vi.fn() }) } },
  },
}));

const { ReportMapView } = await import("../report-map-view");

describe("Interactive Report Map layout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders 'Generate Printable' in the same header row as the <h1>", () => {
    render(<ReportMapView />);

    const heading = screen.getByRole("heading", {
      name: "Interactive Report Map",
    });
    const button = screen.getByTestId("generate-printable-report-button");

    // Same flex row, title left / button right.
    const row = heading.parentElement;
    expect(row).not.toBeNull();
    expect(row?.contains(button)).toBe(true);
    expect(row?.className).toContain("justify-between");
  });

  it("mounts the chart overlay inside the map, not in the summary row", () => {
    render(<ReportMapView />);

    const map = screen.getByTestId("interactive-map");
    const overlay = screen.getByTestId("map-chart-overlay");
    expect(map.contains(overlay)).toBe(true);
  });

  it("keeps BOTH trend charts hidden on initial load", () => {
    render(<ReportMapView />);

    expect(screen.queryByTestId("chart-events")).toBeNull();
    expect(screen.queryByTestId("chart-coverage")).toBeNull();
    // ...but their toggles are present, so they stay discoverable.
    expect(screen.getByTestId("map-chart-toggle-events-over-time")).toBeTruthy();
    expect(screen.getByTestId("map-chart-toggle-region-coverage")).toBeTruthy();
  });

  it("restores the summary row to FOUR tiles at xl (no 5th chart tile)", () => {
    const { container } = render(<ReportMapView />);

    const grid = container.querySelector(".grid.shrink-0");
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("xl:grid-cols-4");
    expect(grid?.className).not.toContain("xl:grid-cols-5");
    expect(grid?.children.length).toBe(4);
  });
});
