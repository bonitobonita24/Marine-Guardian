// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const { exitStubs } = vi.hoisted(() => {
  const s: {
    exitMutate: ReturnType<typeof vi.fn>;
    exitOnSuccess: (() => void) | undefined;
    exitIsPending: boolean;
  } = {
    exitMutate: vi.fn(),
    exitOnSuccess: undefined,
    exitIsPending: false,
  };
  return { exitStubs: s };
});

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    platformImpersonation: {
      exit: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          exitStubs.exitOnSuccess = opts?.onSuccess;
          return {
            mutate: exitStubs.exitMutate,
            isPending: exitStubs.exitIsPending,
          };
        },
      },
    },
  },
}));

import { ImpersonationBannerExitButton } from "../impersonation-banner-exit-button";
import { useRouter } from "next/navigation";

beforeEach(() => {
  exitStubs.exitMutate = vi.fn();
  exitStubs.exitOnSuccess = undefined;
  exitStubs.exitIsPending = false;
  cleanup();
});

describe("ImpersonationBannerExitButton", () => {
  it("renders Exit tenant view button enabled by default", () => {
    render(<ImpersonationBannerExitButton />);
    const btn = screen.getByTestId("impersonation-banner-exit");
    expect(btn).toBeTruthy();
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.textContent).toContain("Exit tenant view");
  });

  it("click triggers exit mutation with no args", () => {
    render(<ImpersonationBannerExitButton />);
    const btn = screen.getByTestId("impersonation-banner-exit");
    fireEvent.click(btn);
    expect(exitStubs.exitMutate).toHaveBeenCalledWith();
  });

  it("on success calls router.push and router.refresh", () => {
    const pushMock = vi.fn();
    const refreshMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: pushMock,
      refresh: refreshMock,
    } as unknown as ReturnType<typeof useRouter>);

    render(<ImpersonationBannerExitButton />);

    // Simulate onSuccess
    exitStubs.exitOnSuccess?.();

    expect(pushMock).toHaveBeenCalledWith("/admin/tenants");
    expect(refreshMock).toHaveBeenCalled();
  });
});
