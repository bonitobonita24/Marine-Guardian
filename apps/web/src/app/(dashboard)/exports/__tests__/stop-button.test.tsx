// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    cancelMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    cancelReset: ReturnType<typeof vi.fn<() => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    cancelIsPending: boolean;
  } = {
    roles: ["site_admin"],
    cancelMutate: vi.fn<(input: unknown) => void>(),
    cancelReset: vi.fn<() => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
    cancelIsPending: false,
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
      cancel: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            stubs.cancelMutate(input);
            opts?.onSuccess?.();
          },
          reset: stubs.cancelReset,
          isPending: stubs.cancelIsPending,
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

import { StopButton } from "../stop-button";

describe("StopButton", () => {
  beforeEach(() => {
    stubs.roles = ["site_admin"];
    stubs.cancelMutate.mockClear();
    stubs.cancelReset.mockClear();
    stubs.listInvalidate.mockClear();
    stubs.cancelIsPending = false;
  });
  afterEach(() => {
    cleanup();
  });

  it("returns null for operator sessions (admin-only client gate)", () => {
    stubs.roles = ["operator"];
    const { container } = render(<StopButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for field_coordinator sessions (admin-only client gate)", () => {
    stubs.roles = ["field_coordinator"];
    const { container } = render(<StopButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Stop trigger for site_admin and invokes cancel.mutate with the exportId on confirm", () => {
    stubs.roles = ["site_admin"];
    const { getByTestId } = render(<StopButton exportId="re-queued-1" />);

    const trigger = getByTestId("stop-export-button");
    fireEvent.click(trigger);

    const confirm = getByTestId("stop-export-confirm");
    fireEvent.click(confirm);

    expect(stubs.cancelMutate).toHaveBeenCalledTimes(1);
    expect(stubs.cancelMutate).toHaveBeenCalledWith({ id: "re-queued-1" });
    expect(stubs.listInvalidate).toHaveBeenCalledTimes(1);
  });

  it("renders for super_admin as well", () => {
    stubs.roles = ["super_admin"];
    const { getByTestId } = render(<StopButton exportId="re-2" />);
    expect(getByTestId("stop-export-button")).toBeTruthy();
  });
});
