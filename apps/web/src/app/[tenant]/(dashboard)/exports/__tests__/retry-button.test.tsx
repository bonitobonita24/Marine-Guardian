// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    retryMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    retryReset: ReturnType<typeof vi.fn<() => void>>;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    retryIsPending: boolean;
  } = {
    roles: ["site_admin"],
    retryMutate: vi.fn<(input: unknown) => void>(),
    retryReset: vi.fn<() => void>(),
    listInvalidate: vi.fn<() => Promise<void>>(),
    retryIsPending: false,
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
      retry: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            stubs.retryMutate(input);
            opts?.onSuccess?.();
          },
          reset: stubs.retryReset,
          isPending: stubs.retryIsPending,
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

import { RetryButton } from "../retry-button";

describe("RetryButton (5.3d)", () => {
  beforeEach(() => {
    stubs.roles = ["site_admin"];
    stubs.retryMutate.mockClear();
    stubs.retryReset.mockClear();
    stubs.listInvalidate.mockClear();
    stubs.retryIsPending = false;
  });
  afterEach(() => {
    cleanup();
  });

  it("returns null for operator sessions (admin-only client gate)", () => {
    stubs.roles = ["operator"];
    const { container } = render(<RetryButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for field_coordinator sessions (admin-only client gate)", () => {
    stubs.roles = ["field_coordinator"];
    const { container } = render(<RetryButton exportId="re-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Retry trigger for site_admin and invokes retry.mutate with the exportId on confirm", () => {
    stubs.roles = ["site_admin"];
    const { getByTestId } = render(<RetryButton exportId="re-failed-1" />);

    const trigger = getByTestId("retry-export-button");
    fireEvent.click(trigger);

    const confirm = getByTestId("retry-export-confirm");
    fireEvent.click(confirm);

    expect(stubs.retryMutate).toHaveBeenCalledTimes(1);
    expect(stubs.retryMutate).toHaveBeenCalledWith({ id: "re-failed-1" });
    expect(stubs.listInvalidate).toHaveBeenCalledTimes(1);
  });

  it("renders for super_admin as well", () => {
    stubs.roles = ["super_admin"];
    const { getByTestId } = render(<RetryButton exportId="re-2" />);
    expect(getByTestId("retry-export-button")).toBeTruthy();
  });
});
