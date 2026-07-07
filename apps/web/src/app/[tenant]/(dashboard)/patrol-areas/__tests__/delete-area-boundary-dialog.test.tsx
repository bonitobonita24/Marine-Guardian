// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { AreaBoundaryRow } from "../area-boundary-table";

interface MutationOpts {
  onSuccess?: (data: {
    result: { count: number };
    fanOut: { enqueued: number };
  }) => void;
  onError?: (err: { message: string }) => void;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    deleteMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    deleteReset: ReturnType<typeof vi.fn<() => void>>;
    deleteIsPending: boolean;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    nextOutcome:
      | { kind: "success"; enqueued: number; count: number }
      | { kind: "error"; message: string }
      | null;
    capturedOpts: MutationOpts | undefined;
  } = {
    deleteMutate: vi.fn<(input: unknown) => void>(),
    deleteReset: vi.fn<() => void>(),
    deleteIsPending: false,
    listInvalidate: vi.fn<() => Promise<void>>(),
    nextOutcome: null,
    capturedOpts: undefined,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    areaBoundary: {
      delete: {
        useMutation: (opts?: MutationOpts) => {
          stubs.capturedOpts = opts;
          return {
            mutate: (input: unknown) => {
              stubs.deleteMutate(input);
              const outcome = stubs.nextOutcome;
              if (outcome?.kind === "success") {
                opts?.onSuccess?.({
                  result: { count: outcome.count },
                  fanOut: { enqueued: outcome.enqueued },
                });
              } else if (outcome?.kind === "error") {
                opts?.onError?.({ message: outcome.message });
              }
            },
            isPending: stubs.deleteIsPending,
            reset: stubs.deleteReset,
          };
        },
      },
      list: { invalidate: stubs.listInvalidate },
    },
    useUtils: () => ({
      areaBoundary: {
        list: { invalidate: stubs.listInvalidate },
      },
    }),
  },
}));

import { DeleteAreaBoundaryDialog } from "../delete-area-boundary-dialog";

const baseBoundary: AreaBoundaryRow = {
  id: "b-1",
  name: "MPA North",
  aliases: [],
  region: "Region IV-A",
  source: "official",
  geometryType: "Polygon",
  isEnabled: true,
  overrideOfficial: false,
  arcgisReferenceId: null,
  geometryGeojson: { type: "Polygon", coordinates: [[[0, 0]]] },
  createdByUserId: "u-1",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
  creator: { id: "u-1", fullName: "Alice Anderson" },
};

describe("DeleteAreaBoundaryDialog", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    stubs.deleteMutate.mockReset();
    stubs.deleteReset.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.deleteIsPending = false;
    stubs.nextOutcome = null;
    stubs.capturedOpts = undefined;
    onOpenChange.mockReset();
    onSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the boundary name in the description", () => {
    const { getByText } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    expect(getByText("MPA North")).toBeTruthy();
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const { getByText } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls delete mutation with id when Confirm is clicked", () => {
    const { getByText } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    expect(stubs.deleteMutate).toHaveBeenCalledWith({ id: "b-1" });
  });

  it("shows success feedback with enqueued count (plural form)", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 42, count: 1 };
    const { getByText, getByTestId } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    const msg = getByTestId("delete-success");
    expect(msg.textContent).toContain("42");
    expect(msg.textContent).toContain("rederive jobs enqueued");
  });

  it("shows singular form when enqueued count is 1", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 1, count: 1 };
    const { getByText, getByTestId } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    const msg = getByTestId("delete-success");
    expect(msg.textContent).toContain("rederive job enqueued");
  });

  it("invalidates the list query on success", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 7, count: 1 };
    const { getByText } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    expect(stubs.listInvalidate).toHaveBeenCalled();
  });

  it("calls onSuccess when Close is clicked after a successful delete", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 3, count: 1 };
    const { getByText, getByTestId } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    // Use testid — shadcn Dialog renders its own sr-only "Close" button.
    fireEvent.click(getByTestId("delete-success-close"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows the server error message when delete fails", () => {
    stubs.nextOutcome = { kind: "error", message: "Access denied." };
    const { getByText, getByTestId } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(getByText("Confirm Delete"));
    expect(getByTestId("delete-error").textContent).toContain(
      "Access denied.",
    );
  });

  it("disables Confirm and Cancel while the mutation is pending", () => {
    stubs.deleteIsPending = true;
    const { getByText } = render(
      <DeleteAreaBoundaryDialog
        boundary={baseBoundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
    const confirm = getByText("Deleting…") as HTMLButtonElement;
    const cancel = getByText("Cancel") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });
});
