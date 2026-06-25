// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup, fireEvent } from "@testing-library/react";
import {
  FullscreenProvider,
  useFullscreen,
} from "../fullscreen-context";

/**
 * Focused tests for the fullscreen "command center" toggle (Item 6).
 *
 * jsdom does not implement the Fullscreen API, so we stub the minimal surface
 * the context relies on: document.fullscreenEnabled, document.fullscreenElement,
 * Element.requestFullscreen, document.exitFullscreen, and the fullscreenchange
 * event. A tiny in-test harness exercises registerRoot + toggle + exit and
 * mirrors the native fullscreenchange transitions back into React state.
 */

// Mutable native-fullscreen stub.
const fs = {
  enabled: true,
  element: null as Element | null,
};

// Mock references held in variables so assertions never reference the unbound
// document/Element methods directly (@typescript-eslint/unbound-method).
let requestFullscreenMock: ReturnType<typeof vi.fn>;
let exitFullscreenMock: ReturnType<typeof vi.fn>;

function fireFullscreenChange() {
  document.dispatchEvent(new Event("fullscreenchange"));
}

beforeEach(() => {
  fs.enabled = true;
  fs.element = null;

  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    get: () => fs.enabled,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fs.element,
  });

  exitFullscreenMock = vi.fn(() => {
    fs.element = null;
    fireFullscreenChange();
    return Promise.resolve();
  });
  document.exitFullscreen = exitFullscreenMock;

  // requestFullscreen lives on Element.prototype in real browsers.
  requestFullscreenMock = vi.fn(function (this: Element) {
    fs.element = this;
    fireFullscreenChange();
    return Promise.resolve();
  });
  Object.defineProperty(Element.prototype, "requestFullscreen", {
    configurable: true,
    writable: true,
    value: requestFullscreenMock,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Harness: registers a root element, exposes toggle/exit/state as data attrs.
function Harness() {
  const { isFullscreen, isSupported, toggle, exit, registerRoot } =
    useFullscreen();
  return (
    <div ref={registerRoot} data-testid="root">
      <span data-testid="state">{isFullscreen ? "on" : "off"}</span>
      <span data-testid="supported">{isSupported ? "yes" : "no"}</span>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <button type="button" onClick={exit}>
        exit
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <FullscreenProvider>
      <Harness />
    </FullscreenProvider>,
  );
}

describe("FullscreenProvider / useFullscreen", () => {
  it("reports support from document.fullscreenEnabled", () => {
    const { getByTestId } = renderHarness();
    expect(getByTestId("supported").textContent).toBe("yes");
  });

  it("reports unsupported when the Fullscreen API is disabled", () => {
    fs.enabled = false;
    const { getByTestId } = renderHarness();
    expect(getByTestId("supported").textContent).toBe("no");
  });

  it("toggle enters fullscreen on the registered root and flips state", () => {
    const { getByText, getByTestId } = renderHarness();
    expect(getByTestId("state").textContent).toBe("off");

    act(() => {
      fireEvent.click(getByText("toggle"));
    });

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(fs.element).toBe(getByTestId("root"));
    expect(getByTestId("state").textContent).toBe("on");
  });

  it("toggle exits when already fullscreen", () => {
    const { getByText, getByTestId } = renderHarness();

    act(() => {
      fireEvent.click(getByText("toggle"));
    });
    expect(getByTestId("state").textContent).toBe("on");

    act(() => {
      fireEvent.click(getByText("toggle"));
    });
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
    expect(getByTestId("state").textContent).toBe("off");
  });

  it("syncs state when fullscreen is exited natively (e.g. ESC)", () => {
    const { getByText, getByTestId } = renderHarness();

    act(() => {
      fireEvent.click(getByText("toggle"));
    });
    expect(getByTestId("state").textContent).toBe("on");

    // Simulate the browser/ESC exiting fullscreen out from under React.
    act(() => {
      fs.element = null;
      fireFullscreenChange();
    });
    expect(getByTestId("state").textContent).toBe("off");
  });

  it("exit is a no-op when not fullscreen", () => {
    const { getByText } = renderHarness();
    act(() => {
      fireEvent.click(getByText("exit"));
    });
    expect(exitFullscreenMock).not.toHaveBeenCalled();
  });
});
