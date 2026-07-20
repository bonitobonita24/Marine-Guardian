// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "tenant_manager" | "tenant_superadmin" | "field_coordinator" | "operator";

type AreaListItem = { id: string; name: string };

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    // Task 4 — tenantId is now mockable per-test. "" simulates a platform-level
    // super_admin (tenant_id NULL in DB, marshalled as empty string by the
    // Auth.js session callback). Default "t1" preserves prior test semantics.
    tenantId: string;
    createMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    createReset: ReturnType<typeof vi.fn<() => void>>;
    createIsPending: boolean;
    // Phase 4 S8 — best-effort purge fired on dialog close.
    purgeMutate: ReturnType<typeof vi.fn<(input: { ids: string[] }) => void>>;
    // 6.2d — area-list mock state. Default: 2 enabled areas. Tests may
    // override before render to assert the empty / loading branches.
    areaListItems: AreaListItem[];
    areaListIsLoading: boolean;
  } = {
    roles: ["field_coordinator"],
    tenantId: "t1",
    createMutate: vi.fn<(input: unknown) => void>(),
    createReset: vi.fn<() => void>(),
    createIsPending: false,
    purgeMutate: vi.fn<(input: { ids: string[] }) => void>(),
    areaListItems: [
      { id: "ab-coral-sanctuary", name: "Coral Sanctuary" },
      { id: "ab-mangrove-bay", name: "Mangrove Bay" },
    ],
    areaListIsLoading: false,
  };
  return { stubs: s };
});

// Path-based tenancy: components under this tree read the tenant slug via
// useParams. (The dialog itself no longer builds a tenant link — the /exports
// hand-off was removed in Phase 4 S8 — but the mock keeps the tree renderable.)
vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "demo-site" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "Test",
        tenantId: stubs.tenantId,
        roles: stubs.roles,
      },
      expires: "9999-01-01",
    },
    status: "authenticated" as const,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.HTMLProps<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Phase 4 S8 — the dialog now renders the shared ExportProgressRow instead of
// linking to the deleted /exports page. Stubbed here so these tests pin THIS
// dialog's contract (a row is rendered for the created id); the row's own
// lifecycle is covered by its dedicated test file under map/_components.
vi.mock(
  "@/app/[tenant]/(dashboard)/map/_components/export-progress-row",
  () => ({
    ExportProgressRow: ({
      exportId,
      label,
    }: {
      exportId: string;
      label: string;
    }) => (
      <div data-testid={`export-progress-row-${exportId}`}>{label}</div>
    ),
  }),
);

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportExport: {
      create: {
        useMutation: (opts?: {
          onSuccess?: (data: { id: string }) => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            stubs.createMutate(input);
            opts?.onSuccess?.({ id: "re-new-1" });
          },
          reset: stubs.createReset,
          isPending: stubs.createIsPending,
        }),
      },
      // Phase 4 S8 — fired fire-and-forget on dialog close.
      purge: {
        useMutation: () => ({
          mutate: stubs.purgeMutate,
          isPending: false,
        }),
      },
    },
    // 6.2d — areaBoundary.list mock matches the real { items, nextCursor }
    // shape. The button only reads `data?.items` + `isLoading`, so other
    // useQuery fields are omitted.
    areaBoundary: {
      list: {
        useQuery: (
          _input: { isEnabled?: boolean; limit?: number },
          opts?: { enabled?: boolean },
        ) => {
          const enabled = opts?.enabled ?? true;
          if (!enabled) {
            return { data: undefined, isLoading: false };
          }
          return {
            data: { items: stubs.areaListItems, nextCursor: undefined },
            isLoading: stubs.areaListIsLoading,
          };
        },
      },
    },
  },
}));

import { GenerateReportButton } from "../generate-report-button";

describe("GenerateReportButton (5.3d + 6.2d)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    stubs.tenantId = "t1";
    stubs.createMutate.mockClear();
    stubs.createReset.mockClear();
    stubs.purgeMutate.mockReset();
    stubs.createIsPending = false;
    stubs.areaListItems = [
      { id: "ab-coral-sanctuary", name: "Coral Sanctuary" },
      { id: "ab-mangrove-bay", name: "Mangrove Bay" },
    ];
    stubs.areaListIsLoading = false;
  });
  afterEach(() => {
    cleanup();
  });

  it("returns null for operator sessions (coordinator+ client gate)", () => {
    stubs.roles = ["operator"];
    const { container } = render(<GenerateReportButton />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Generate Report trigger for field_coordinator", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId } = render(<GenerateReportButton />);
    expect(getByTestId("generate-report-button")).toBeTruthy();
  });

  // P1-D: coverage report now emits { category, year, month } so the server
  // renders the correct monthly window instead of defaulting to "last 30 days".
  it("P1-D: on confirm (coverage): paramsJson carries {category, year, month} + chosen paperSize", () => {
    stubs.roles = ["tenant_superadmin"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));

    // Coverage period picker should be visible
    expect(getByTestId("coverage-report-fields")).toBeTruthy();
    expect(getByTestId("coverage-year-input")).toBeTruthy();
    expect(getByTestId("coverage-month-select")).toBeTruthy();

    // Change year to 2026 and month to April (4)
    fireEvent.change(getByTestId("coverage-year-input"), {
      target: { value: "2026" },
    });
    fireEvent.change(getByTestId("coverage-month-select"), {
      target: { value: "4" },
    });

    const paperSelect = getByTestId("paper-size-select") as HTMLSelectElement;
    fireEvent.change(paperSelect, { target: { value: "Letter" } });

    fireEvent.click(getByTestId("generate-report-confirm"));

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createMutate).toHaveBeenCalledWith({
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 4 },
      paperSize: "Letter",
    });
  });

  it("P1-D: coverage report period picker hidden when switching to area report", () => {
    stubs.roles = ["tenant_superadmin"];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    // Coverage fields visible by default
    expect(queryByTestId("coverage-report-fields")).toBeTruthy();

    // Switch to area → coverage fields hidden, area fields visible
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });
    expect(queryByTestId("coverage-report-fields")).toBeNull();
    expect(queryByTestId("area-report-fields")).toBeTruthy();
  });

  // Phase 4 S8 — the /exports page is deleted; the dialog stays open and
  // renders the progress row in place.
  it("after success: stays open and renders an in-dialog progress row (no /exports link)", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-confirm"));

    expect(getByTestId("export-progress-row-re-new-1")).toBeTruthy();
    expect(queryByTestId("generate-report-go-to-exports")).toBeNull();
  });

  it("after success: renders no anchor pointing at the deleted /exports route", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId, baseElement } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-confirm"));

    const hrefs = Array.from(baseElement.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.filter((h) => h !== null && h.includes("/exports"))).toEqual(
      [],
    );
  });

  it("closing after a successful create purges the generated export", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-confirm"));
    fireEvent.click(getByTestId("generate-report-dismiss"));

    expect(stubs.purgeMutate).toHaveBeenCalledTimes(1);
    expect(stubs.purgeMutate).toHaveBeenCalledWith({ ids: ["re-new-1"] });
  });

  it("closing WITHOUT a successful create does not purge", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-dismiss"));

    expect(stubs.purgeMutate).not.toHaveBeenCalled();
  });

  it("closing still works when purge throws synchronously", () => {
    stubs.roles = ["field_coordinator"];
    stubs.purgeMutate.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-confirm"));
    expect(() => {
      fireEvent.click(getByTestId("generate-report-dismiss"));
    }).not.toThrow();

    expect(queryByTestId("export-progress-row-re-new-1")).toBeNull();
  });

  // 6.2d — Per Area Report paramsJson wiring.

  it("6.2d: switching to reportType=area reveals area + date inputs (hidden for coverage)", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    // Coverage (default) — area fields hidden
    expect(queryByTestId("area-report-fields")).toBeNull();
    expect(queryByTestId("area-boundary-select")).toBeNull();
    expect(queryByTestId("area-start-date-input")).toBeNull();
    expect(queryByTestId("area-end-date-input")).toBeNull();

    const typeSelect = getByTestId("report-type-select") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "area" } });

    // Area fields now visible
    expect(getByTestId("area-report-fields")).toBeTruthy();
    expect(getByTestId("area-boundary-select")).toBeTruthy();
    expect(getByTestId("area-start-date-input")).toBeTruthy();
    expect(getByTestId("area-end-date-input")).toBeTruthy();
  });

  it("6.2d: Generate is disabled until area + both dates are filled", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    const typeSelect = getByTestId("report-type-select") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "area" } });

    const confirm = getByTestId("generate-report-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Pick area only → still disabled
    fireEvent.change(getByTestId("area-boundary-select"), {
      target: { value: "ab-coral-sanctuary" },
    });
    expect(confirm.disabled).toBe(true);

    // Add startDate only → still disabled
    fireEvent.change(getByTestId("area-start-date-input"), {
      target: { value: "2026-04-01" },
    });
    expect(confirm.disabled).toBe(true);

    // Add endDate → now enabled
    fireEvent.change(getByTestId("area-end-date-input"), {
      target: { value: "2026-05-01" },
    });
    expect(confirm.disabled).toBe(false);
  });

  it("6.2d: on confirm (area): paramsJson carries {areaBoundaryId, startDate, endDate}", () => {
    stubs.roles = ["tenant_superadmin"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });
    fireEvent.change(getByTestId("area-boundary-select"), {
      target: { value: "ab-mangrove-bay" },
    });
    fireEvent.change(getByTestId("area-start-date-input"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.change(getByTestId("area-end-date-input"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(getByTestId("paper-size-select"), {
      target: { value: "A4" },
    });

    fireEvent.click(getByTestId("generate-report-confirm"));

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createMutate).toHaveBeenCalledWith({
      reportType: "area",
      paramsJson: {
        areaBoundaryId: "ab-mangrove-bay",
        startDate: "2026-03-01",
        endDate: "2026-06-01",
      },
      paperSize: "A4",
    });
  });

  it("6.2d: switching reportType off 'area' resets area + date state (no stale leak)", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    const typeSelect = getByTestId("report-type-select") as HTMLSelectElement;

    // Fill the area branch fully
    fireEvent.change(typeSelect, { target: { value: "area" } });
    fireEvent.change(getByTestId("area-boundary-select"), {
      target: { value: "ab-coral-sanctuary" },
    });
    fireEvent.change(getByTestId("area-start-date-input"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(getByTestId("area-end-date-input"), {
      target: { value: "2026-05-01" },
    });

    // Switch off "area" → fields hidden
    fireEvent.change(typeSelect, { target: { value: "coverage" } });
    expect(queryByTestId("area-report-fields")).toBeNull();

    // Switch back to "area" — fields re-render BLANK (state was reset on
    // the off-ramp, not on the return trip). Prevents a stale areaBoundaryId
    // from a previous selection leaking into a fresh paramsJson payload.
    fireEvent.change(typeSelect, { target: { value: "area" } });
    expect(
      (getByTestId("area-boundary-select") as HTMLSelectElement).value,
    ).toBe("");
    expect(
      (getByTestId("area-start-date-input") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (getByTestId("area-end-date-input") as HTMLInputElement).value,
    ).toBe("");

    // Confirm is once again disabled because the area fields are blank.
    expect(
      (getByTestId("generate-report-confirm") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("6.2d: empty area list renders 'No areas available' placeholder", () => {
    stubs.roles = ["field_coordinator"];
    stubs.areaListItems = [];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.options[0]?.textContent).toContain("No areas available");
    // Task 4 — tenant-scoped user (tenantId="t1") must NOT see the platform
    // admin hint; "No areas available" is the correct empty-state for them.
    expect(queryByTestId("area-boundary-platform-admin-hint")).toBeNull();
  });

  it("Task 4: platform-level super_admin (tenantId='') sees empty-tenant guidance", () => {
    stubs.roles = ["tenant_manager"];
    stubs.tenantId = "";
    stubs.areaListItems = [];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    // Inline placeholder swaps to a tenancy-aware label.
    expect(select.options[0]?.textContent).toContain("No tenant context");
    // Full guidance copy renders beneath the select so the platform admin
    // understands why the list is empty.
    const hint = getByTestId("area-boundary-platform-admin-hint");
    expect(hint.textContent).toContain("platform admin");
    expect(hint.textContent).toContain("tenant context");
  });

  it("Task 4: tenant-scoped super_admin (tenantId set) sees the standard empty placeholder, not the platform hint", () => {
    stubs.roles = ["tenant_manager"];
    stubs.tenantId = "t1";
    stubs.areaListItems = [];
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toContain("No areas available");
    expect(queryByTestId("area-boundary-platform-admin-hint")).toBeNull();
  });

  it("Task 4: hint does not render while the area list is loading", () => {
    stubs.roles = ["tenant_manager"];
    stubs.tenantId = "";
    stubs.areaListItems = [];
    stubs.areaListIsLoading = true;
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toContain("Loading areas…");
    expect(queryByTestId("area-boundary-platform-admin-hint")).toBeNull();
  });

  it("Task 4: hint does not render when the area list has items, even for platform admins", () => {
    stubs.roles = ["tenant_manager"];
    stubs.tenantId = "";
    // Items present (e.g. global areas surfaced via overrideOfficial) — hint
    // should stay hidden because the dropdown is usable.
    const { getByTestId, queryByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(1);
    expect(queryByTestId("area-boundary-platform-admin-hint")).toBeNull();
  });
});
