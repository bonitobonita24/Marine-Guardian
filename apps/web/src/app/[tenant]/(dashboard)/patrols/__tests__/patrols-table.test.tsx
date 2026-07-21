// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const useQueryMock = vi.fn();
const softDeleteMutate = vi.fn();
const restoreMutate = vi.fn();

// Mutable session roles — tests set this before render.
let sessionRoles: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: (): unknown => ({ push: vi.fn() }),
  useParams: () => ({ tenant: "demo-site" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: (): unknown => ({
    data: { user: { roles: sessionRoles } },
  }),
}));

const setOverrideMutate = vi.fn();
const setTimeOverrideMutate = vi.fn();
const setZoneOverrideMutate = vi.fn();

// Mutable protected-zones list — tests set this before render to control the
// "Add a missed zone" picker's options.
let protectedZonesData: { id: string; name: string }[] = [];

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
      setMunicipalityOverride: {
        useMutation: (): unknown => ({
          mutate: setOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
      setTimeOverride: {
        useMutation: (): unknown => ({
          mutate: setTimeOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
      setZoneCoverageOverride: {
        useMutation: (): unknown => ({
          mutate: setZoneOverrideMutate,
          isPending: false,
          error: null,
        }),
      },
    },
    municipality: {
      list: {
        useQuery: (): unknown => ({ data: [] }),
      },
      protectedZones: {
        useQuery: (): unknown => ({ data: protectedZonesData }),
      },
    },
  },
}));

import { PatrolsTable } from "../patrols-table";

beforeEach(() => {
  useQueryMock.mockReset();
  softDeleteMutate.mockReset();
  restoreMutate.mockReset();
  setOverrideMutate.mockReset();
  setTimeOverrideMutate.mockReset();
  setZoneOverrideMutate.mockReset();
  protectedZonesData = [];
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
  startTimeManual: false,
  endTimeManual: false,
  startTimeDerivedAt: null,
  firstSeenAt: null,
  isDeleted: false,
  segments: [],
  coveredZones: [],
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
    sessionRoles = ["tenant_superadmin"];
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
    sessionRoles = ["tenant_manager"];
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
    sessionRoles = ["tenant_superadmin"];
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
    sessionRoles = ["tenant_superadmin"];
    mockListResult([
      { ...basePatrol, id: "p1", title: "Morning Sweep", isTestPatrol: false },
    ]);

    render(<PatrolsTable />);

    fireEvent.click(screen.getByTestId("delete-button-p1"));
    fireEvent.click(screen.getByTestId("confirm-delete-button"));

    expect(softDeleteMutate).toHaveBeenCalledWith({ id: "p1" });
  });

  it("clicking Restore calls patrol.restore with the row id", () => {
    sessionRoles = ["tenant_superadmin"];
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

// ── Manual start/end time override (officer correction for missing ER clock) ──

describe("PatrolsTable — time override", () => {
  const MANAGER_ROLES = ["tenant_admin"];

  it("renders an em-dash for a patrol with no start or end time", () => {
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);

    expect(screen.getByTestId("start-cell-p1").textContent).toContain("—");
    expect(screen.getByTestId("end-cell-p1").textContent).toContain("—");
  });

  it("marks an officer-supplied start time with a Manual badge", () => {
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        startTime: new Date("2026-07-01T08:00:00Z"),
        startTimeManual: true,
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("start-manual-badge-p1")).not.toBeNull();
    expect(screen.queryByTestId("start-derived-badge-p1")).toBeNull();
  });

  it("marks a script-derived start time with a Derived badge, not Manual", () => {
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        startTime: new Date("2026-07-01T08:00:00Z"),
        startTimeManual: false,
        startTimeDerivedAt: new Date("2026-07-02T00:00:00Z"),
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("start-derived-badge-p1")).not.toBeNull();
    expect(screen.queryByTestId("start-manual-badge-p1")).toBeNull();
  });

  it("shows no provenance badge for an ER-supplied start time", () => {
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        startTime: new Date("2026-07-01T08:00:00Z"),
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("start-manual-badge-p1")).toBeNull();
    expect(screen.queryByTestId("start-derived-badge-p1")).toBeNull();
  });

  it("marks an officer-supplied end time with a Manual badge", () => {
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        endTime: new Date("2026-07-01T12:00:00Z"),
        endTimeManual: true,
      },
    ]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("end-manual-badge-p1")).not.toBeNull();
  });

  it("hides the 'Set times' action from users who cannot manage patrols", () => {
    sessionRoles = ["ranger"];
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("time-override-button-p1")).toBeNull();
  });

  it("shows the 'Set times' action to a manager", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("time-override-button-p1")).not.toBeNull();
  });

  it("submits both entered times through setTimeOverride", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("time-override-button-p1"));

    fireEvent.change(screen.getByTestId("override-start-time-input"), {
      target: { value: "2026-07-01T08:00" },
    });
    fireEvent.change(screen.getByTestId("override-end-time-input"), {
      target: { value: "2026-07-01T12:00" },
    });
    fireEvent.click(screen.getByTestId("save-time-override-button"));

    expect(setTimeOverrideMutate).toHaveBeenCalledTimes(1);
    const arg = setTimeOverrideMutate.mock.calls[0]?.[0] as {
      id: string;
      startTime: Date | null;
      endTime: Date | null;
    };
    expect(arg.id).toBe("p1");
    expect(arg.startTime).toEqual(new Date("2026-07-01T08:00"));
    expect(arg.endTime).toEqual(new Date("2026-07-01T12:00"));
  });

  it("submits null for a field left blank", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("time-override-button-p1"));

    fireEvent.change(screen.getByTestId("override-start-time-input"), {
      target: { value: "2026-07-01T08:00" },
    });
    fireEvent.click(screen.getByTestId("save-time-override-button"));

    const arg = setTimeOverrideMutate.mock.calls[0]?.[0] as {
      startTime: Date | null;
      endTime: Date | null;
    };
    expect(arg.startTime).toEqual(new Date("2026-07-01T08:00"));
    expect(arg.endTime).toBeNull();
  });

  it("prefills the dialog inputs from the patrol's existing times", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        startTime: new Date(2026, 6, 1, 8, 30),
        startTimeManual: true,
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("time-override-button-p1"));

    const startInput: HTMLInputElement = screen.getByTestId(
      "override-start-time-input",
    );
    expect(startInput.value).toBe("2026-07-01T08:30");
  });

  it("offers 'Clear override' only when a time is already manual, and sends nulls", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        startTime: new Date("2026-07-01T08:00:00Z"),
        startTimeManual: true,
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("time-override-button-p1"));
    fireEvent.click(screen.getByTestId("clear-time-override-button"));

    expect(setTimeOverrideMutate).toHaveBeenCalledWith({
      id: "p1",
      startTime: null,
      endTime: null,
    });
  });

  it("does not offer 'Clear override' for a patrol with no manual time", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("time-override-button-p1"));

    expect(screen.queryByTestId("clear-time-override-button")).toBeNull();
  });
});

// ── Manual per-patrol MPA-zone coverage override ──

describe("PatrolsTable — zone coverage override", () => {
  const MANAGER_ROLES = ["tenant_admin"];

  it("hides the 'Zones' action from users who cannot manage patrols", () => {
    sessionRoles = ["ranger"];
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("zone-override-button-p1")).toBeNull();
  });

  it("shows the 'Zones' action to a manager", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);

    expect(screen.queryByTestId("zone-override-button-p1")).not.toBeNull();
  });

  it("lists currently-covered zones with their provenance", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        coveredZones: [
          {
            protectedZoneId: "z1",
            source: "geometry",
            protectedZone: { id: "z1", name: "Apo Reef" },
          },
          {
            protectedZoneId: "z2",
            source: "manual_include",
            protectedZone: { id: "z2", name: "Wawa MPA" },
          },
        ],
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));

    expect(screen.getByTestId("covered-zone-row-z1").textContent).toContain(
      "Apo Reef",
    );
    expect(screen.getByTestId("covered-zone-row-z2").textContent).toContain(
      "Wawa MPA",
    );
    // Auto-derived coverage offers "Exclude"; manual coverage offers "Clear".
    expect(screen.getByTestId("exclude-zone-button-z1")).not.toBeNull();
    expect(screen.getByTestId("clear-zone-button-z2")).not.toBeNull();
  });

  it("clicking Exclude on an auto-covered zone calls setZoneCoverageOverride with action=exclude", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        coveredZones: [
          {
            protectedZoneId: "z1",
            source: "geometry",
            protectedZone: { id: "z1", name: "Apo Reef" },
          },
        ],
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));
    fireEvent.click(screen.getByTestId("exclude-zone-button-z1"));

    expect(setZoneOverrideMutate).toHaveBeenCalledWith({
      patrolId: "p1",
      protectedZoneId: "z1",
      action: "exclude",
    });
  });

  it("clicking Clear on a manually-included zone calls setZoneCoverageOverride with action=clear", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        coveredZones: [
          {
            protectedZoneId: "z2",
            source: "manual_include",
            protectedZone: { id: "z2", name: "Wawa MPA" },
          },
        ],
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));
    fireEvent.click(screen.getByTestId("clear-zone-button-z2"));

    expect(setZoneOverrideMutate).toHaveBeenCalledWith({
      patrolId: "p1",
      protectedZoneId: "z2",
      action: "clear",
    });
  });

  it("lists a manually-excluded zone under 'Manually excluded' with its own Clear button", () => {
    sessionRoles = MANAGER_ROLES;
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        coveredZones: [
          {
            protectedZoneId: "z3",
            source: "manual_exclude",
            protectedZone: { id: "z3", name: "Baco Bay" },
          },
        ],
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));

    // Not listed as covered — it's a tombstone, not real coverage.
    expect(screen.queryByTestId("covered-zone-row-z3")).toBeNull();
    expect(screen.getByTestId("excluded-zone-row-z3").textContent).toContain(
      "Baco Bay",
    );

    fireEvent.click(screen.getByTestId("clear-zone-button-z3"));
    expect(setZoneOverrideMutate).toHaveBeenCalledWith({
      patrolId: "p1",
      protectedZoneId: "z3",
      action: "clear",
    });
  });

  it("the 'Add a missed zone' picker excludes zones already covered and includes the selection", () => {
    sessionRoles = MANAGER_ROLES;
    protectedZonesData = [
      { id: "z1", name: "Apo Reef" },
      { id: "z4", name: "Puerto Galera MPA" },
    ];
    mockListResult([
      {
        ...basePatrol,
        id: "p1",
        title: "Foot patrol",
        coveredZones: [
          {
            protectedZoneId: "z1",
            source: "geometry",
            protectedZone: { id: "z1", name: "Apo Reef" },
          },
        ],
      },
    ]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));

    const select: HTMLSelectElement = screen.getByTestId("zone-picker-select");
    const optionValues = Array.from(select.options).map((o) => o.value);
    // Already-covered z1 is excluded from the "missed zone" picker.
    expect(optionValues).not.toContain("z1");
    expect(optionValues).toContain("z4");

    fireEvent.change(select, { target: { value: "z4" } });
    fireEvent.click(screen.getByTestId("include-zone-button"));

    expect(setZoneOverrideMutate).toHaveBeenCalledWith({
      patrolId: "p1",
      protectedZoneId: "z4",
      action: "include",
    });
  });

  it("disables 'Include zone' until a zone is selected", () => {
    sessionRoles = MANAGER_ROLES;
    protectedZonesData = [{ id: "z4", name: "Puerto Galera MPA" }];
    mockListResult([{ ...basePatrol, id: "p1", title: "Foot patrol" }]);

    render(<PatrolsTable />);
    fireEvent.click(screen.getByTestId("zone-override-button-p1"));

    const button: HTMLButtonElement = screen.getByTestId(
      "include-zone-button",
    );
    expect(button.disabled).toBe(true);
  });
});
