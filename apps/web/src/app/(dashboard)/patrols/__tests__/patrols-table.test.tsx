// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const useQueryMock = vi.fn();
const softDeleteMutate = vi.fn();
const restoreMutate = vi.fn();

// Mutable session roles — tests set this before render.
let sessionRoles: string[] = [];

vi.mock("next-auth/react", () => ({
  useSession: (): unknown => ({
    data: { user: { roles: sessionRoles } },
  }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    patrol: {
      list: {
        useQuery: (...args: unknown[]): unknown => useQueryMock(...args),
      },
      softDelete: {
        useMutation: (): unknown => ({
          mutate: softDeleteMutate,
          isPending: false,
          error: null,
        }),
      },
      restore: {
        useMutation: (): unknown => ({
          mutate: restoreMutate,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { PatrolsTable } from "../patrols-table";

beforeEach(() => {
  useQueryMock.mockReset();
  softDeleteMutate.mockReset();
  restoreMutate.mockReset();
  sessionRoles = [];
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
    refetch: vi.fn(),
  });
}

const basePatrol = {
  tenantId: "t1",
  erPatrolId: "er-1",
  patrolType: "foot",
  state: "open",
  startTime: null,
  endTime: null,
  isDeleted: false,
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

  it("admin sees Delete button on a non-deleted patrol", () => {
    sessionRoles = ["site_admin"];
    mockListResult([
      { ...basePatrol, id: "p1", title: "Morning Sweep", isTestPatrol: false },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("delete-button-p1")).not.toBeNull();
  });

  it("operator does not see Delete button", () => {
    sessionRoles = ["operator"];
    mockListResult([
      { ...basePatrol, id: "p1", title: "Morning Sweep", isTestPatrol: false },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("delete-button-p1")).toBeNull();
  });

  it("admin sees the 'Show deleted' toggle; operator does not", () => {
    sessionRoles = ["super_admin"];
    mockListResult([]);
    render(<PatrolsTable />);
    expect(screen.queryByTestId("include-deleted-toggle")).not.toBeNull();

    cleanup();

    sessionRoles = ["operator"];
    mockListResult([]);
    render(<PatrolsTable />);
    expect(screen.queryByTestId("include-deleted-toggle")).toBeNull();
  });

  it("deleted row shows Restore button and a Deleted badge (admin)", () => {
    sessionRoles = ["site_admin"];
    mockListResult([
      {
        ...basePatrol,
        id: "p9",
        title: "Old Patrol",
        isTestPatrol: false,
        isDeleted: true,
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("restore-button-p9")).not.toBeNull();
    expect(screen.queryByTestId("deleted-badge-p9")).not.toBeNull();
    expect(screen.queryByTestId("delete-button-p9")).toBeNull();
  });

  it("confirming delete calls patrol.softDelete with the row id", () => {
    sessionRoles = ["site_admin"];
    mockListResult([
      { ...basePatrol, id: "p1", title: "Morning Sweep", isTestPatrol: false },
    ]);

    render(<PatrolsTable />);

    fireEvent.click(screen.getByTestId("delete-button-p1"));
    fireEvent.click(screen.getByTestId("confirm-delete-button"));

    expect(softDeleteMutate).toHaveBeenCalledWith({ id: "p1" });
  });

  it("clicking Restore calls patrol.restore with the row id", () => {
    sessionRoles = ["site_admin"];
    mockListResult([
      {
        ...basePatrol,
        id: "p9",
        title: "Old Patrol",
        isTestPatrol: false,
        isDeleted: true,
      },
    ]);

    render(<PatrolsTable />);

    fireEvent.click(screen.getByTestId("restore-button-p9"));

    expect(restoreMutate).toHaveBeenCalledWith({ id: "p9" });
  });
});
