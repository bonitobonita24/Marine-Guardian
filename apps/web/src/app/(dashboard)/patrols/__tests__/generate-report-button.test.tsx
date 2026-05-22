// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

type AreaListItem = { id: string; name: string };

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    createMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    createReset: ReturnType<typeof vi.fn<() => void>>;
    createIsPending: boolean;
    // 6.2d — area-list mock state. Default: 2 enabled areas. Tests may
    // override before render to assert the empty / loading branches.
    areaListItems: AreaListItem[];
    areaListIsLoading: boolean;
  } = {
    roles: ["field_coordinator"],
    createMutate: vi.fn<(input: unknown) => void>(),
    createReset: vi.fn<() => void>(),
    createIsPending: false,
    areaListItems: [
      { id: "ab-coral-sanctuary", name: "Coral Sanctuary" },
      { id: "ab-mangrove-bay", name: "Mangrove Bay" },
    ],
    areaListIsLoading: false,
  };
  return { stubs: s };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "Test",
        tenantId: "t1",
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
    stubs.createMutate.mockClear();
    stubs.createReset.mockClear();
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

  it("on confirm (coverage): calls reportExport.create with empty paramsJson + chosen paperSize", () => {
    stubs.roles = ["site_admin"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));

    const paperSelect = getByTestId("paper-size-select") as HTMLSelectElement;
    fireEvent.change(paperSelect, { target: { value: "Letter" } });

    fireEvent.click(getByTestId("generate-report-confirm"));

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createMutate).toHaveBeenCalledWith({
      reportType: "coverage",
      paramsJson: {},
      paperSize: "Letter",
    });
  });

  it("after success: surfaces a link to /exports for the user to track the export", () => {
    stubs.roles = ["field_coordinator"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.click(getByTestId("generate-report-confirm"));

    const link = getByTestId("generate-report-go-to-exports");
    expect(link.getAttribute("href")).toBe("/exports");
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
    stubs.roles = ["site_admin"];
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
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));
    fireEvent.change(getByTestId("report-type-select"), {
      target: { value: "area" },
    });

    const select = getByTestId("area-boundary-select") as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.options[0]?.textContent).toContain("No areas available");
  });
});
