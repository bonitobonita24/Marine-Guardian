// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

type StreamResult = { status: string; reconnectAttempts: number };

const useNotificationStreamMock = vi.fn<(...args: unknown[]) => StreamResult>();

vi.mock("@/hooks/useNotificationStream", () => ({
  useNotificationStream: (...args: unknown[]): StreamResult =>
    useNotificationStreamMock(...args),
}));

// Import AFTER the mock is registered.
import { RealtimeProvider } from "../realtime-provider";

describe("RealtimeProvider", () => {
  beforeEach(() => {
    useNotificationStreamMock.mockReset();
    useNotificationStreamMock.mockReturnValue({
      status: "connecting",
      reconnectAttempts: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children", () => {
    const { getByText } = render(
      <RealtimeProvider>
        <span>child-marker</span>
      </RealtimeProvider>,
    );
    expect(getByText("child-marker")).not.toBeNull();
  });

  it("invokes useNotificationStream exactly once on mount", () => {
    render(
      <RealtimeProvider>
        <span />
      </RealtimeProvider>,
    );
    expect(useNotificationStreamMock).toHaveBeenCalledTimes(1);
  });
});
