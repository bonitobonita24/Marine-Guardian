// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogTitle } from "../dialog";

/**
 * Regression guard (2026-06-28): a Dialog opened while a view is in fullscreen
 * must portal INTO the fullscreen element. Radix's default container is
 * document.body, which sits OUTSIDE the fullscreened subtree — so the dialog
 * mounts in the DOM but the browser never paints it. On the Interactive Report
 * Map (a fullscreen "presentation" surface) this made clicking an event marker
 * appear to do nothing. See DialogContent.useFullscreenPortalContainer.
 */

function setFullscreenElement(el: Element | null): void {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: el,
  });
}

afterEach(() => {
  cleanup();
  setFullscreenElement(null);
});

describe("DialogContent fullscreen-aware portal", () => {
  it("portals into the active fullscreen element so it paints in fullscreen", () => {
    const fsRoot = document.createElement("div");
    fsRoot.id = "fs-root";
    document.body.appendChild(fsRoot);
    setFullscreenElement(fsRoot);

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Fullscreen Dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const title = screen.getByText("Fullscreen Dialog");
    expect(fsRoot.contains(title)).toBe(true);

    document.body.removeChild(fsRoot);
  });

  it("portals to document.body when not in fullscreen (default behaviour)", () => {
    setFullscreenElement(null);

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Windowed Dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const title = screen.getByText("Windowed Dialog");
    expect(document.body.contains(title)).toBe(true);
    // Not nested under any leftover fullscreen root.
    expect(document.getElementById("fs-root")).toBeNull();
  });
});
