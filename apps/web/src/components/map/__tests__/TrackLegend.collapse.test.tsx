// @vitest-environment jsdom

// Guards the "MAP CONTROLS" contract the Report Map's floating chart overlay
// depends on (owner request 2026-07-20): unlike the two chart panels — which
// are hidden by default — the map controls card stays VISIBLE by default, and
// still owns its own hide/show button.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TrackLegend } from "../TrackLegend";
import { DEFAULT_TRACK_VISIBILITY } from "../patrolTrackStyle";

function renderControls() {
  return render(
    <TrackLegend
      orientation="vertical"
      collapsible
      title="Map controls"
      showTracks
      onShowTracksChange={vi.fn()}
      visibility={DEFAULT_TRACK_VISIBILITY}
      onTypeVisibilityChange={vi.fn()}
      eventLayers={{ lawEnforcement: true, monitoring: true }}
      onEventLayerChange={vi.fn()}
      showBoundaries={false}
      onShowBoundariesChange={vi.fn()}
      showSkylight={false}
      onShowSkylightChange={vi.fn()}
      showThumbnails={false}
      onShowThumbnailsChange={vi.fn()}
    />,
  );
}

describe("TrackLegend — floating map controls", () => {
  afterEach(() => {
    cleanup();
  });

  it("is EXPANDED by default (controls visible on load)", () => {
    renderControls();

    // The body is rendered, so a control inside it is reachable.
    expect(screen.getByLabelText("Show all patrol tracks")).toBeTruthy();
    expect(
      screen.getByLabelText("Collapse map controls").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("hides its body when its own collapse button is clicked", () => {
    renderControls();

    fireEvent.click(screen.getByLabelText("Collapse map controls"));

    expect(screen.queryByLabelText("Show all patrol tracks")).toBeNull();
    // The card + its toggle remain — only the body collapsed.
    const expand = screen.getByLabelText("Expand map controls");
    expect(expand.getAttribute("aria-expanded")).toBe("false");

    // ...and it re-opens.
    fireEvent.click(expand);
    expect(screen.getByLabelText("Show all patrol tracks")).toBeTruthy();
  });
});
