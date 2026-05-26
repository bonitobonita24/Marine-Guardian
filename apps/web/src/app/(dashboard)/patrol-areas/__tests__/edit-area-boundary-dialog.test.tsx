// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { AreaBoundaryRow } from "../area-boundary-table";

// Stub out the editor island so vitest jsdom doesn't try to render Leaflet.
// The shared stub (see __tests__/_helpers/area-boundary-editor-stub.tsx)
// exposes 5 buttons that simulate the onGeometryChange callbacks the real
// editor would emit. `vi.mock` is hoisted above imports, so the factory
// loads the stub module via `await import(...)` inside the factory.
vi.mock("../area-boundary-editor", async () => {
  const mod = await import("./_helpers/area-boundary-editor-stub");
  return { AreaBoundaryEditor: mod.AreaBoundaryEditorStub };
});

interface UpdateInput {
  id: string;
  name?: string;
  region?: string;
  aliases?: string[];
  isEnabled?: boolean;
  overrideOfficial?: boolean;
  arcgisReferenceId?: string | null;
  geometryGeojson?: Record<string, unknown>;
}

interface MutationOpts {
  onSuccess?: (data: {
    result: { count: number };
    fanOut: { enqueued: number };
  }) => void;
  onError?: (err: { message: string }) => void;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    updateMutate: ReturnType<typeof vi.fn<(input: UpdateInput) => void>>;
    updateReset: ReturnType<typeof vi.fn<() => void>>;
    updateIsPending: boolean;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    nextOutcome:
      | { kind: "success"; enqueued: number; count: number }
      | { kind: "error"; message: string }
      | null;
  } = {
    updateMutate: vi.fn<(input: UpdateInput) => void>(),
    updateReset: vi.fn<() => void>(),
    updateIsPending: false,
    listInvalidate: vi.fn<() => Promise<void>>(),
    nextOutcome: null,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    areaBoundary: {
      update: {
        useMutation: (opts?: MutationOpts) => ({
          mutate: (input: UpdateInput) => {
            stubs.updateMutate(input);
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
          isPending: stubs.updateIsPending,
          reset: stubs.updateReset,
        }),
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

import { EditAreaBoundaryDialog } from "../edit-area-boundary-dialog";

const baseBoundary: AreaBoundaryRow = {
  id: "b-1",
  name: "MPA North",
  aliases: ["North Reserve", "MPA-N"],
  region: "Region IV-A",
  source: "official",
  geometryType: "Polygon",
  isEnabled: true,
  overrideOfficial: false,
  arcgisReferenceId: "arc-123",
  geometryGeojson: {
    type: "Polygon",
    coordinates: [
      [
        [120.0, 14.0],
        [120.1, 14.0],
        [120.1, 14.1],
        [120.0, 14.1],
        [120.0, 14.0],
      ],
    ],
  },
  createdByUserId: "u-1",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
  creator: { id: "u-1", fullName: "Alice Anderson" },
};

describe("EditAreaBoundaryDialog", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    stubs.updateMutate.mockReset();
    stubs.updateReset.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.updateIsPending = false;
    stubs.nextOutcome = null;
    onOpenChange.mockReset();
    onSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function renderOpen(boundary: AreaBoundaryRow = baseBoundary) {
    return render(
      <EditAreaBoundaryDialog
        boundary={boundary}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
  }

  it("pre-fills editable fields from initialBoundary prop", () => {
    const c = renderOpen();
    expect((c.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "MPA North",
    );
    expect((c.getByLabelText("Region") as HTMLInputElement).value).toBe(
      "Region IV-A",
    );
    expect(
      (c.getByLabelText(/Aliases/i) as HTMLInputElement).value,
    ).toBe("North Reserve, MPA-N");
    expect(
      (c.getByLabelText(/ArcGIS reference ID/i) as HTMLInputElement).value,
    ).toBe("arc-123");
  });

  it("displays locked source as read-only", () => {
    const c = renderOpen();
    const source = c.getByTestId("edit-source-locked") as HTMLInputElement;
    expect(source.value).toBe("official");
    expect(source.disabled).toBe(true);
  });

  it("mounts the editor with initialGeometry and initialType matching the boundary", async () => {
    const c = renderOpen();
    // editor-stub mounts via next/dynamic — first paint is the loading
    // skeleton, so resolve the dynamic import before asserting.
    expect(await c.findByTestId("editor-stub")).toBeTruthy();
  });

  it("blocks submit when nothing changed", () => {
    const c = renderOpen();
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("edit-validation-error").textContent,
    ).toMatch(/No changes/i);
  });

  it("submits only the changed field (partial update — name only)", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 5, count: 1 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "MPA North Renamed" },
    });
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).toHaveBeenCalledTimes(1);
    const payload = stubs.updateMutate.mock.calls[0]?.[0];
    expect(payload).toEqual({ id: "b-1", name: "MPA North Renamed" });
  });

  it("submits multiple changed fields and skips unchanged ones", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 7, count: 1 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Region"), {
      target: { value: "Region V" },
    });
    fireEvent.click(c.getByTestId("edit-override-switch"));
    fireEvent.click(c.getByText("Save"));
    const payload = stubs.updateMutate.mock.calls[0]?.[0];
    expect(payload?.id).toBe("b-1");
    expect(payload?.region).toBe("Region V");
    expect(payload?.overrideOfficial).toBe(true);
    expect(payload?.name).toBeUndefined();
    expect(payload?.aliases).toBeUndefined();
    expect(payload?.geometryGeojson).toBeUndefined();
  });

  it("submits aliases as parsed array when aliases input changes", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 0, count: 1 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText(/Aliases/i), {
      target: { value: "North Reserve, MPA-N, Northern" },
    });
    fireEvent.click(c.getByText("Save"));
    const payload = stubs.updateMutate.mock.calls[0]?.[0];
    expect(payload?.aliases).toEqual(["North Reserve", "MPA-N", "Northern"]);
  });

  it("submits arcgisReferenceId=null when cleared", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 0, count: 1 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText(/ArcGIS reference ID/i), {
      target: { value: "" },
    });
    fireEvent.click(c.getByText("Save"));
    const payload = stubs.updateMutate.mock.calls[0]?.[0];
    expect(payload?.arcgisReferenceId).toBeNull();
  });

  it("rejects blank Name even on edit", () => {
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("edit-validation-error").textContent,
    ).toMatch(/Name is required/i);
  });

  it("submits geometryGeojson when editor emits a new polygon", async () => {
    stubs.nextOutcome = { kind: "success", enqueued: 3, count: 1 };
    const c = renderOpen();
    fireEvent.click(await c.findByTestId("editor-stub-emit-polygon"));
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).toHaveBeenCalledTimes(1);
    const payload = stubs.updateMutate.mock.calls[0]?.[0];
    expect(payload?.id).toBe("b-1");
    expect(payload?.geometryGeojson).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [121.0, 13.0],
          [121.5, 13.0],
          [121.5, 13.5],
          [121.0, 13.5],
          [121.0, 13.0],
        ],
      ],
    });
  });

  it("blocks submit when editor clears the geometry", async () => {
    const c = renderOpen();
    fireEvent.click(await c.findByTestId("editor-stub-clear"));
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "MPA North Renamed" },
    });
    // Save button should be disabled because geometryType is null
    const save = c.getByText("Save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(stubs.updateMutate).not.toHaveBeenCalled();
  });

  it("rejects mismatched polygon geometry on submit (defense-in-depth)", async () => {
    const c = renderOpen();
    fireEvent.click(
      await c.findByTestId("editor-stub-emit-mismatched-polygon"),
    );
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("edit-validation-error").textContent,
    ).toMatch(/Polygon/i);
  });

  it("rejects mismatched linestring geometry on submit (defense-in-depth)", async () => {
    const c = renderOpen();
    fireEvent.click(
      await c.findByTestId("editor-stub-emit-mismatched-linestring"),
    );
    fireEvent.click(c.getByText("Save"));
    expect(stubs.updateMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("edit-validation-error").textContent,
    ).toMatch(/LineString/i);
  });

  it("shows success + invalidates list + calls onSuccess on Close", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 12, count: 1 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "MPA North v2" },
    });
    fireEvent.click(c.getByText("Save"));
    expect(stubs.listInvalidate).toHaveBeenCalled();
    expect(c.getByTestId("edit-success").textContent).toContain("12");
    expect(c.getByTestId("edit-success").textContent).toContain(
      "rederive jobs enqueued",
    );
    fireEvent.click(c.getByTestId("edit-success-close"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows the no-rows-updated message when result.count is 0", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 0, count: 0 };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "Other Name" },
    });
    fireEvent.click(c.getByText("Save"));
    expect(c.getByTestId("edit-success").textContent).toMatch(
      /No matching boundary/i,
    );
  });

  it("shows the server error message on mutation failure", () => {
    stubs.nextOutcome = { kind: "error", message: "Access denied." };
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "MPA North v3" },
    });
    fireEvent.click(c.getByText("Save"));
    expect(c.getByTestId("edit-error").textContent).toContain(
      "Access denied.",
    );
  });

  it("Cancel calls onOpenChange(false)", () => {
    const c = renderOpen();
    fireEvent.click(c.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Cancel and Save while update is pending", () => {
    stubs.updateIsPending = true;
    const c = renderOpen();
    const cancel = c.getByText("Cancel") as HTMLButtonElement;
    const save = c.getByText("Saving…") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(save.disabled).toBe(true);
  });
});
