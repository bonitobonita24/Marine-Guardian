// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RangerKpiCards } from "../ranger-kpi-cards";

afterEach(() => {
  cleanup();
});

describe("RangerKpiCards", () => {
  it("renders both Foot patrol and Seaborne patrol cards", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 0, km: 0, hours: 0 },
          sea: { count: 0, km: 0, hours: 0 },
        }}
      />,
    );
    expect(container.textContent).toContain("Foot patrol");
    expect(container.textContent).toContain("Seaborne patrol");
  });

  it("renders foot patrol count, km, and hours from props", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 12, km: 47.3, hours: 22 },
          sea: { count: 0, km: 0, hours: 0 },
        }}
      />,
    );
    expect(container.textContent).toContain("12");
    // formatted as integer when >= 10
    expect(container.textContent).toMatch(/47/);
    expect(container.textContent).toContain("22");
  });

  it("renders seaborne patrol count, km, and hours from props", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 0, km: 0, hours: 0 },
          sea: { count: 5, km: 88.1, hours: 14 },
        }}
      />,
    );
    expect(container.textContent).toContain("5");
    expect(container.textContent).toMatch(/88/);
    expect(container.textContent).toContain("14");
  });

  it("renders 0 values without errors", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 0, km: 0, hours: 0 },
          sea: { count: 0, km: 0, hours: 0 },
        }}
      />,
    );
    // both Patrols rows show 0
    const zeros = container.textContent.match(/0/g) ?? [];
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("formats km < 10 with one decimal place", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 1, km: 4.5, hours: 1 },
          sea: { count: 0, km: 0, hours: 0 },
        }}
      />,
    );
    expect(container.textContent).toContain("4.5");
  });

  it("formats km >= 10 as rounded integer", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 1, km: 12.7, hours: 1 },
          sea: { count: 0, km: 0, hours: 0 },
        }}
      />,
    );
    // 12.7 rounds to 13
    expect(container.textContent).toContain("13");
    expect(container.textContent).not.toContain("12.7");
  });

  it("includes 'km' and 'hrs' unit labels", () => {
    const { container } = render(
      <RangerKpiCards
        patrolStats={{
          foot: { count: 1, km: 1, hours: 1 },
          sea: { count: 1, km: 1, hours: 1 },
        }}
      />,
    );
    expect(container.textContent).toContain("km");
    expect(container.textContent).toContain("hrs");
  });
});
