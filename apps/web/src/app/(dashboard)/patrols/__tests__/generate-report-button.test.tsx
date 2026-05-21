// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    createMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    createReset: ReturnType<typeof vi.fn<() => void>>;
    createIsPending: boolean;
  } = {
    roles: ["field_coordinator"],
    createMutate: vi.fn<(input: unknown) => void>(),
    createReset: vi.fn<() => void>(),
    createIsPending: false,
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
  },
}));

import { GenerateReportButton } from "../generate-report-button";

describe("GenerateReportButton (5.3d)", () => {
  beforeEach(() => {
    stubs.roles = ["field_coordinator"];
    stubs.createMutate.mockClear();
    stubs.createReset.mockClear();
    stubs.createIsPending = false;
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

  it("on confirm: calls reportExport.create with the chosen reportType + paperSize", () => {
    stubs.roles = ["site_admin"];
    const { getByTestId } = render(<GenerateReportButton />);

    fireEvent.click(getByTestId("generate-report-button"));

    const typeSelect = getByTestId("report-type-select") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "area" } });

    const paperSelect = getByTestId("paper-size-select") as HTMLSelectElement;
    fireEvent.change(paperSelect, { target: { value: "Letter" } });

    fireEvent.click(getByTestId("generate-report-confirm"));

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createMutate).toHaveBeenCalledWith({
      reportType: "area",
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
});
