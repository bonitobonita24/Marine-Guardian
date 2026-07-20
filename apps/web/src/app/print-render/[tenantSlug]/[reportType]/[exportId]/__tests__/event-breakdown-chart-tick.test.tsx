// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

import { BreakdownYAxisTick } from "../components/event-breakdown-chart";

/**
 * The funder PDF breakdown chart must carry the same per-event-type icons as
 * the on-screen breakdown surfaces (owner directive 2026-06-28). The custom
 * YAxis tick renders the type label plus a lucide glyph inside a <foreignObject>
 * (so the icon SVG draws cleanly inside the recharts SVG). These guard that the
 * label still renders and an icon glyph is present beside it.
 */

afterEach(cleanup);

describe("BreakdownYAxisTick — event-type icon + label (PDF report)", () => {
  it("renders the type label and a lucide icon for a known law type", () => {
    const { container } = render(
      <svg>
        <BreakdownYAxisTick
          x={150}
          y={20}
          payload={{ value: "Compressor Fishing" }}
          variant="lawEnforcement"
        />
      </svg>,
    );
    expect(screen.getByText("Compressor Fishing")).toBeTruthy();
    // lucide renders its own <svg> glyph in addition to the outer <svg> wrapper.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(1);
  });

  it("renders a fallback icon (no crash) for an unmapped type", () => {
    const { container } = render(
      <svg>
        <BreakdownYAxisTick
          payload={{ value: "Some Unmapped Type" }}
          variant="monitoring"
        />
      </svg>,
    );
    expect(screen.getByText("Some Unmapped Type")).toBeTruthy();
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(1);
  });

  it("renders an empty label without throwing when payload is absent", () => {
    expect(() =>
      render(
        <svg>
          <BreakdownYAxisTick variant="lawEnforcement" />
        </svg>,
      ),
    ).not.toThrow();
  });

  it("never paints a blank label — falls back to 'Unknown' when handed an empty value", () => {
    render(
      <svg>
        <BreakdownYAxisTick payload={{ value: "   " }} variant="lawEnforcement" />
      </svg>,
    );
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("falls back to 'Unknown' when no payload is supplied at all", () => {
    render(
      <svg>
        <BreakdownYAxisTick variant="monitoring" />
      </svg>,
    );
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
