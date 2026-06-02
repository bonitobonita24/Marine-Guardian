// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const useQueryMock = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    patrol: {
      list: {
        useQuery: (...args: unknown[]): unknown => useQueryMock(...args),
      },
    },
  },
}));

import { PatrolsTable } from "../patrols-table";

beforeEach(() => {
  useQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function mockListResult(
  items: unknown[],
  nextCursor?: string,
  isLoading = false,
) {
  useQueryMock.mockReturnValue({
    data: { items, nextCursor },
    isLoading,
    isFetching: false,
  });
}

const basePatrol = {
  tenantId: "t1",
  erPatrolId: "er-1",
  patrolType: "foot",
  state: "open",
  startTime: null,
  endTime: null,
  segments: [],
};

describe("PatrolsTable", () => {
  it("renders Test badge on patrols where isTestPatrol=true", () => {
    mockListResult([
      { ...basePatrol, id: "p1", title: "QA Test Patrol", isTestPatrol: true },
      {
        ...basePatrol,
        id: "p2",
        title: "Morning Sweep",
        isTestPatrol: false,
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("test-badge-p1")).not.toBeNull();
    expect(screen.queryByTestId("test-badge-p2")).toBeNull();
  });

  it("toggling 'Show test patrols' calls list with includeTest=true", () => {
    mockListResult([]);

    render(<PatrolsTable />);

    const checkbox = screen.getByTestId("include-test-toggle");
    fireEvent.click(checkbox);

    const calls = useQueryMock.mock.calls as Array<[Record<string, unknown>]>;
    const calledWithIncludeTest = calls.some(
      ([arg]) => arg.includeTest === true,
    );
    expect(calledWithIncludeTest).toBe(true);
  });

  it("changing state filter calls list with state filter", () => {
    mockListResult([]);

    render(<PatrolsTable />);

    const select = screen.getByTestId("state-filter");
    fireEvent.change(select, { target: { value: "open" } });

    const calls = useQueryMock.mock.calls as Array<[Record<string, unknown>]>;
    const calledWithState = calls.some(
      ([arg]) => arg.state === "open",
    );
    expect(calledWithState).toBe(true);
  });
});
