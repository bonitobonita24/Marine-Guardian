// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MunicipalityCoverageChart } from "../_components/municipality-coverage-chart";
import { ProtectedZoneCard } from "../_components/protected-zone-card";

// Recharts ResponsiveContainer requires a measured DOM container.
// In jsdom that is always 0×0 so we stub it to render children directly.
// Same pattern as warroom-panels.test.tsx.
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

// ── MunicipalityCoverageChart ─────────────────────────────────────────────────

describe("MunicipalityCoverageChart", () => {
  const data = [
    { municipality: "Calapan City",  province: "Oriental Mindoro",  patrolCount: 5, eventCount: 3 },
    { municipality: "Baco",          province: "Oriental Mindoro",  patrolCount: 2, eventCount: 1 },
    { municipality: "Puerto Galera", province: "Oriental Mindoro",  patrolCount: 0, eventCount: 0 },
  ];

  it("renders the Recharts container when data is present", () => {
    render(<MunicipalityCoverageChart data={data} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(
      document.querySelector("[data-testid='recharts-responsive-container']"),
    ).toBeTruthy();
  });

  it("shows a loading message while loading", () => {
    render(<MunicipalityCoverageChart data={[]} isLoading={true} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("shows empty state when data is empty and not loading", () => {
    render(<MunicipalityCoverageChart data={[]} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText(/no coverage data/i)).toBeTruthy();
  });

  it("renders heading with aria-labelledby", () => {
    render(<MunicipalityCoverageChart data={data} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText(/municipality coverage/i)).toBeTruthy();
  });

  it("renders total patrol and event counts in the legend", () => {
    render(<MunicipalityCoverageChart data={data} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    // totalPatrols = 7, totalEvents = 4
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });
});

// ── ProtectedZoneCard ─────────────────────────────────────────────────────────

describe("ProtectedZoneCard", () => {
  const zones = [
    { zone: "Apo Reef Natural Park", parentMunicipality: "Sablayan", patrolCount: 3, eventCount: 1 },
    { zone: "Another Zone",          parentMunicipality: null,       patrolCount: 0, eventCount: 0 },
  ];

  it("renders zone names", () => {
    render(<ProtectedZoneCard zones={zones} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText("Apo Reef Natural Park")).toBeTruthy();
    expect(screen.getByText("Another Zone")).toBeTruthy();
  });

  it("shows loading state", () => {
    render(<ProtectedZoneCard zones={[]} isLoading={true} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("shows empty state when no zones", () => {
    render(<ProtectedZoneCard zones={[]} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText(/no protected zones/i)).toBeTruthy();
  });

  it("shows Apo Reef first in the list", () => {
    const { container } = render(<ProtectedZoneCard zones={zones} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    const listItems = container.querySelectorAll("li");
    expect(listItems[0]?.textContent).toContain("Apo Reef");
  });

  it("shows parent municipality when present", () => {
    render(<ProtectedZoneCard zones={zones} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText("Sablayan")).toBeTruthy();
  });

  it("renders patrol (P) and event (E) badges", () => {
    render(<ProtectedZoneCard zones={zones} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    // Apo Reef has 3P 1E
    expect(screen.getAllByText(/P$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/E$/).length).toBeGreaterThan(0);
  });

  it("shows the client-derived coverage % headline (1 of 2 zones patrolled = 50%)", () => {
    render(<ProtectedZoneCard zones={zones} isLoading={false} rangeLabel="Jun 19 – Jun 26" />);
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/patrolled \(1\/2 zones\)/)).toBeTruthy();
  });
});
