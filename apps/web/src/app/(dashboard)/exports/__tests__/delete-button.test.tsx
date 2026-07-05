// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    deleteMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    deleteReset: ReturnType<typeof vi.fn<() => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    deleteIsPending: boolean;
  } = {
    roles: ["site_admin"],
    deleteMutate: vi.fn<(input: unknown) => void>(),
    deleteReset: vi.fn<() => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
    deleteIsPending: false,
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

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportExport: {
      delete: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            stubs.deleteMutate(input);
            opts?.onSuccess?.();
          },
          reset: stubs.deleteReset,
          isPending: stubs.deleteIsPending,
        }),
      },
    },
    useUtils: () => ({
      reportExport: {
        list: { invalidate: stubs.listInvalidate },
      },
    }),
  },
}));

import { DeleteButton } from "../delete-button";

describe("DeleteButton", () => {
  beforeEach(() => {
    stubs.roles = ["site_admin"];
    stubs.deleteMutate.mockClear();
    stubs.deleteReset.mockClear();
    stubs.listInvalidate.mockClear();
    stubs.deleteIsPending = false;
  });
  afterEach(() => {
    cleanup();
  });

  it("returns null for operator sessions (admin-only client gate)", () => {
    stubs.roles = ["operator"];
    const { container } = render(<DeleteButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for field_coordinator sessions (admin-only client gate)", () => {
    stubs.roles = ["field_coordinator"];
    const { container } = render(<DeleteButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Delete trigger for site_admin and invokes delete.mutate with the exportId on confirm", () => {
    stubs.roles = ["site_admin"];
    const { getByTestId } = render(<DeleteButton exportId="re-failed-1" />);

    const trigger = getByTestId("delete-export-button");
    fireEvent.click(trigger);

    const confirm = getByTestId("delete-export-confirm");
    fireEvent.click(confirm);

    expect(stubs.deleteMutate).toHaveBeenCalledTimes(1);
    expect(stubs.deleteMutate).toHaveBeenCalledWith({ id: "re-failed-1" });
    expect(stubs.listInvalidate).toHaveBeenCalledTimes(1);
  });

  it("renders for super_admin as well", () => {
    stubs.roles = ["super_admin"];
    const { getByTestId } = render(<DeleteButton exportId="re-2" />);
    expect(getByTestId("delete-export-button")).toBeTruthy();
  });
});
