// @vitest-environment jsdom

/**
 * Short-viewport density guard for the COMPACT reporting charts used as
 * Interactive Report Map overlays (2026-07-20).
 *
 * Why this exists: at 1280x600 the map pane is 286px tall, so the overlay
 * column is 262px while the two chart panels were 201px + 185px — one chart at
 * a time, legend clipped. The fix shrinks the compact variant below an
 * 800px-tall viewport. These tests pin BOTH halves of that contract:
 *   1. the compact variant carries the short-viewport classes, and
 *   2. the NON-compact (dashboard) variant carries none of them, i.e. tall /
 *      dashboard rendering stays byte-identical.
 *
 * jsdom cannot evaluate a `@media (max-height: …)` query, so these assert the
 * classes are present on the right elements rather than the computed pixels;
 * the arithmetic they encode is asserted separately below.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EventsOverTimeChart } from "../events-over-time-chart";
import { MunicipalityCoverageChart } from "@/app/[tenant]/(dashboard)/dashboard/_components/municipality-coverage-chart";
import {
  COMPACT_CARD_SHORT_CLASS,
  COMPACT_CHART_BODY_CLASS,
  COMPACT_HIDE_WHEN_SHORT_CLASS,
  COMPACT_LEGEND_SHORT_CLASS,
  SHORT_VIEWPORT_MEDIA_QUERY,
} from "../compact-chart-density";

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

const SHORT_VARIANT = "[@media(max-height:799px)]";

const timeSeries = [
  { date: "2026-06-01", label: "Jun 1", count: 2, patrolCount: 1 },
  { date: "2026-06-02", label: "Jun 2", count: 4, patrolCount: 3 },
];

const coverage = [
  {
    municipality: "Baco",
    province: "Oriental Mindoro",
    patrolCount: 3,
    eventCount: 5,
  },
];

/** Every class token in the container's markup that is a short-viewport rule. */
function shortViewportTokens(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("*"))
    .flatMap((el) => Array.from(el.classList))
    .filter((token) => token.startsWith(SHORT_VARIANT));
}

describe("compact chart density — short viewports", () => {
  it("keeps the threshold at 800px so tall viewports are untouched", () => {
    // The threshold is derived from the measured geometry: at a 600px-tall
    // viewport the overlay column is 262px; the map pane grows ~1:1 with the
    // window, so 800px is where the untrimmed stack stops being wildly over.
    // Anything >= 800px must render exactly as before, hence max-height:799px.
    for (const cls of [
      COMPACT_CHART_BODY_CLASS,
      COMPACT_CARD_SHORT_CLASS,
      COMPACT_HIDE_WHEN_SHORT_CLASS,
      COMPACT_LEGEND_SHORT_CLASS,
    ]) {
      expect(cls).toContain("max-height:799px");
      expect(cls).not.toContain("max-height:800px");
    }
  });

  it("shrinks the compact chart body but never below 4.5rem", () => {
    // 4.5rem = 72px of plot area. Below this the bar chart's 11px bar pairs
    // stop fitting, so the floor is deliberate — see compact-chart-density.ts.
    expect(COMPACT_CHART_BODY_CLASS).toContain("h-[7.5rem]");
    expect(COMPACT_CHART_BODY_CLASS).toContain(`${SHORT_VARIANT}:h-[4.5rem]`);
  });

  it("applies the short-viewport classes to the compact EventsOverTimeChart", () => {
    const { container } = render(
      <EventsOverTimeChart
        data={timeSeries}
        isLoading={false}
        rangeLabel="Jun 1 – Jun 2"
        compact
      />,
    );
    const tokens = shortViewportTokens(container);
    expect(tokens).toContain(`${SHORT_VARIANT}:h-[4.5rem]`);
    expect(tokens).toContain(`${SHORT_VARIANT}:py-1.5`);
    // The redundant range label is the hidden chrome — the legend totals are not.
    expect(tokens).toContain(`${SHORT_VARIANT}:hidden`);
    expect(container.textContent).toContain("Events");
    expect(container.textContent).toContain("Patrols");
  });

  it("applies the short-viewport classes to the compact MunicipalityCoverageChart", () => {
    const { container } = render(
      <MunicipalityCoverageChart
        data={coverage}
        isLoading={false}
        rangeLabel="Jun 1 – Jun 2"
        compact
      />,
    );
    const tokens = shortViewportTokens(container);
    expect(tokens).toContain(`${SHORT_VARIANT}:h-[4.5rem]`);
    expect(tokens).toContain(`${SHORT_VARIANT}:py-1.5`);
    expect(tokens).toContain(`${SHORT_VARIANT}:hidden`);
  });

  it("leaves the NON-compact dashboard rendering completely unchanged", () => {
    const { container: timeContainer } = render(
      <EventsOverTimeChart
        data={timeSeries}
        isLoading={false}
        rangeLabel="Jun 1 – Jun 2"
      />,
    );
    expect(shortViewportTokens(timeContainer)).toHaveLength(0);

    const { container: coverageContainer } = render(
      <MunicipalityCoverageChart
        data={coverage}
        isLoading={false}
        rangeLabel="Jun 1 – Jun 2"
      />,
    );
    expect(shortViewportTokens(coverageContainer)).toHaveLength(0);
  });

  it("hides the range label ONLY in compact mode (it stays on the dashboard)", () => {
    const { container } = render(
      <MunicipalityCoverageChart
        data={coverage}
        isLoading={false}
        rangeLabel="Jun 1 – Jun 2"
      />,
    );
    const label = Array.from(container.querySelectorAll("span")).find((el) =>
      el.textContent === "Jun 1 – Jun 2",
    );
    expect(label).toBeTruthy();
    expect(label?.className.includes(SHORT_VARIANT)).toBe(false);
  });
});

/**
 * HEIGHT BUDGET PIN — 1280x600 overlay column.
 *
 * These numbers are MEASURED in a real browser (2026-07-20), reconstructed from
 * the rendered panels' y-coordinates; the derived total reproduces the observed
 * 355px content height exactly. Their job is to fail loudly if someone grows the
 * compact chart body again, which is what silently re-clipped "Region Coverage"
 * down to a 7px title strip twice before.
 */
describe("short-viewport height budget (1280x600 overlay column)", () => {
  /** Measured: map pane 286px -> column max-h-[calc(100%-1.5rem)] = 262px. */
  const AVAILABLE_PX = 262;
  /** Measured: "Charts" toggle card, incl. border + both switch rows. */
  const TOGGLE_CARD_PX = 95;
  /** The column's `gap-2`. */
  const GAP_PX = 8;
  /** Measured per panel, excluding the chart body: 22px header + 28px legend. */
  const PANEL_CHROME_PX = 50;
  /** Measured cost of the single-panel hint line (text + its gap-1). */
  const HINT_PX = 16;

  /** Reads the short-viewport body height straight out of the shipped class. */
  function shortBodyPx(): number {
    const match = /max-height:799px\)\]:h-\[([\d.]+)rem\]/.exec(
      COMPACT_CHART_BODY_CLASS,
    );
    expect(match).not.toBeNull();
    return Number(match?.[1]) * 16;
  }

  const panelPx = (): number => PANEL_CHROME_PX + shortBodyPx();

  it("pins the compact body at 72px, the size the browser measured", () => {
    expect(shortBodyPx()).toBe(72);
    expect(panelPx()).toBe(122);
  });

  it("fits ONE panel (plus the hint) inside the 262px column", () => {
    const used = TOGGLE_CARD_PX + GAP_PX + panelPx() + HINT_PX;
    expect(used).toBe(241);
    expect(used).toBeLessThanOrEqual(AVAILABLE_PX);
  });

  it("proves TWO panels cannot fit — the reason for the one-at-a-time rule", () => {
    const used = TOGGLE_CARD_PX + GAP_PX + panelPx() + GAP_PX + panelPx();
    expect(used).toBe(355); // exactly the height measured in the browser
    expect(used).toBeGreaterThan(AVAILABLE_PX);

    // Any two-panel layout would need panels this small...
    const maxPanelForTwo = (AVAILABLE_PX - TOGGLE_CARD_PX - 2 * GAP_PX) / 2;
    expect(maxPanelForTwo).toBeLessThan(panelPx());
    // ...leaving a chart body smaller than the x-axis row alone (~20px).
    expect(maxPanelForTwo - PANEL_CHROME_PX).toBeLessThan(30);
  });

  it("shares one threshold between the CSS shrink and the runtime rule", () => {
    // useIsShortViewport() feeds this string to matchMedia; the CSS variants
    // encode the same 799px. Drift here would let the runtime think there is
    // room for two panels while the CSS still renders them at full height.
    expect(SHORT_VIEWPORT_MEDIA_QUERY).toBe("(max-height: 799px)");
    expect(COMPACT_CHART_BODY_CLASS).toContain("max-height:799px");
  });
});
