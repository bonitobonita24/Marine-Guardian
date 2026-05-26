// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

// Stub out the editor island so vitest jsdom doesn't try to render Leaflet.
// The shared stub (see __tests__/_helpers/area-boundary-editor-stub.tsx)
// exposes 5 buttons that simulate the onGeometryChange callbacks the real
// editor would emit. `vi.mock` is hoisted above imports, so the factory
// loads the stub module via `await import(...)` inside the factory.
vi.mock("../area-boundary-editor", async () => {
  const mod = await import("./_helpers/area-boundary-editor-stub");
  return { AreaBoundaryEditor: mod.AreaBoundaryEditorStub };
});

interface CreateInput {
  name: string;
  region: string;
  aliases: string[];
  source: "official" | "custom";
  geometryType: "Polygon" | "LineString";
  geometryGeojson: Record<string, unknown>;
  isEnabled: boolean;
  overrideOfficial: boolean;
  arcgisReferenceId: string | null;
}

interface MutationOpts {
  onSuccess?: (data: {
    boundary: { id: string };
    fanOut: { enqueued: number };
  }) => void;
  onError?: (err: { message: string }) => void;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    createMutate: ReturnType<typeof vi.fn<(input: CreateInput) => void>>;
    createReset: ReturnType<typeof vi.fn<() => void>>;
    createIsPending: boolean;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    nextOutcome:
      | { kind: "success"; enqueued: number }
      | { kind: "error"; message: string }
      | null;
  } = {
    createMutate: vi.fn<(input: CreateInput) => void>(),
    createReset: vi.fn<() => void>(),
    createIsPending: false,
    listInvalidate: vi.fn<() => Promise<void>>(),
    nextOutcome: null,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    areaBoundary: {
      create: {
        useMutation: (opts?: MutationOpts) => ({
          mutate: (input: CreateInput) => {
            stubs.createMutate(input);
            const outcome = stubs.nextOutcome;
            if (outcome?.kind === "success") {
              opts?.onSuccess?.({
                boundary: { id: "new-b-id" },
                fanOut: { enqueued: outcome.enqueued },
              });
            } else if (outcome?.kind === "error") {
              opts?.onError?.({ message: outcome.message });
            }
          },
          isPending: stubs.createIsPending,
          reset: stubs.createReset,
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

import { CreateAreaBoundaryDialog } from "../create-area-boundary-dialog";

describe("CreateAreaBoundaryDialog", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    stubs.createMutate.mockReset();
    stubs.createReset.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.createIsPending = false;
    stubs.nextOutcome = null;
    onOpenChange.mockReset();
    onSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function renderOpen() {
    return render(
      <CreateAreaBoundaryDialog
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );
  }

  function fillRequired(
    container: ReturnType<typeof renderOpen>,
    overrides?: {
      name?: string;
      region?: string;
      emit?: "polygon" | "linestring" | "none";
    },
  ) {
    const name = container.getByLabelText("Name") as HTMLInputElement;
    const region = container.getByLabelText("Region") as HTMLInputElement;
    fireEvent.change(name, { target: { value: overrides?.name ?? "MPA East" } });
    fireEvent.change(region, {
      target: { value: overrides?.region ?? "Region IV-A" },
    });
    const emit = overrides?.emit ?? "polygon";
    if (emit === "polygon") {
      fireEvent.click(container.getByTestId("editor-stub-emit-polygon"));
    } else if (emit === "linestring") {
      fireEvent.click(container.getByTestId("editor-stub-emit-linestring"));
    }
    // emit === "none" → leave geometry empty for negative-path tests
  }

  it("renders all form fields", async () => {
    const c = renderOpen();
    expect(c.getByLabelText("Name")).toBeTruthy();
    expect(c.getByLabelText("Region")).toBeTruthy();
    expect(c.getByLabelText(/Aliases/i)).toBeTruthy();
    expect(c.getByTestId("create-source-select")).toBeTruthy();
    // editor-stub mounts via next/dynamic — first paint is the loading
    // skeleton, so resolve the dynamic import before asserting.
    expect(await c.findByTestId("editor-stub")).toBeTruthy();
    expect(c.getByLabelText(/ArcGIS reference ID/i)).toBeTruthy();
    expect(c.getByTestId("create-enabled-switch")).toBeTruthy();
    expect(c.getByTestId("create-override-switch")).toBeTruthy();
  });

  it("source defaults to 'custom' and isEnabled defaults true, overrideOfficial defaults false", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 5 };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    const payload = stubs.createMutate.mock.calls[0]?.[0];
    expect(payload?.source).toBe("custom");
    expect(payload?.isEnabled).toBe(true);
    expect(payload?.overrideOfficial).toBe(false);
  });

  it("submits with geometry from editor stub, trimmed name + region, and null ArcGIS when empty", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 3 };
    const c = renderOpen();
    fillRequired(c, { name: "  MPA East  ", region: "  Region IV-A  " });
    fireEvent.click(c.getByText("Create"));
    const payload = stubs.createMutate.mock.calls[0]?.[0];
    expect(payload?.name).toBe("MPA East");
    expect(payload?.region).toBe("Region IV-A");
    expect(payload?.arcgisReferenceId).toBeNull();
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
    expect(payload?.geometryType).toBe("Polygon");
  });

  it("parses comma-separated aliases into array", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 0 };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.change(c.getByLabelText(/Aliases/i), {
      target: { value: "MPA-North, Northern MPA ,  " },
    });
    fireEvent.click(c.getByText("Create"));
    const payload = stubs.createMutate.mock.calls[0]?.[0];
    expect(payload?.aliases).toEqual(["MPA-North", "Northern MPA"]);
  });

  it("Save is disabled until editor emits a non-null geometry", () => {
    const c = renderOpen();
    // Name + Region filled, but no emit yet.
    const name = c.getByLabelText("Name") as HTMLInputElement;
    const region = c.getByLabelText("Region") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "MPA East" } });
    fireEvent.change(region, { target: { value: "Region IV-A" } });
    const create = c.getByText("Create") as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    // Emit a polygon → Save enables.
    fireEvent.click(c.getByTestId("editor-stub-emit-polygon"));
    expect(create.disabled).toBe(false);
    // Clear geometry → Save disables again.
    fireEvent.click(c.getByTestId("editor-stub-clear"));
    expect(create.disabled).toBe(true);
  });

  it("submits a LineString geometry when editor emits LineString", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 1 };
    const c = renderOpen();
    fillRequired(c, { emit: "linestring" });
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    const payload = stubs.createMutate.mock.calls[0]?.[0];
    expect(payload?.geometryType).toBe("LineString");
    expect(payload?.geometryGeojson).toEqual({
      type: "LineString",
      coordinates: [
        [121.0, 13.0],
        [121.5, 13.5],
      ],
    });
  });

  it("rejects when name is blank", () => {
    const c = renderOpen();
    fillRequired(c, { name: "   " });
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("create-validation-error").textContent,
    ).toMatch(/Name is required/i);
  });

  it("rejects when region is blank", () => {
    const c = renderOpen();
    fillRequired(c, { region: "   " });
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).not.toHaveBeenCalled();
    expect(
      c.getByTestId("create-validation-error").textContent,
    ).toMatch(/Region is required/i);
  });

  it("rejects Polygon geometry whose coordinates is flat (LineString shape)", () => {
    const c = renderOpen();
    // Fill required fields so the validation reaches the shape check.
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "Test Area" },
    });
    fireEvent.change(c.getByLabelText("Region"), {
      target: { value: "Test Region" },
    });
    // Emit a Polygon with flat (LineString-shaped) coordinates via the stub.
    fireEvent.click(c.getByTestId("editor-stub-emit-mismatched-polygon"));
    // Submit — the disabled gate is now lifted because geometry is non-null;
    // the validateGeoJsonShape defense catches it.
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).not.toHaveBeenCalled();
    const err = c.getByTestId("create-validation-error");
    expect(err.textContent).toMatch(/Polygon/i);
  });

  it("rejects LineString geometry whose coordinates is nested (Polygon shape)", () => {
    const c = renderOpen();
    fireEvent.change(c.getByLabelText("Name"), {
      target: { value: "Test Area" },
    });
    fireEvent.change(c.getByLabelText("Region"), {
      target: { value: "Test Region" },
    });
    fireEvent.click(c.getByTestId("editor-stub-emit-mismatched-linestring"));
    fireEvent.click(c.getByText("Create"));
    expect(stubs.createMutate).not.toHaveBeenCalled();
    const err = c.getByTestId("create-validation-error");
    expect(err.textContent).toMatch(/LineString/i);
  });

  it("shows success feedback + invalidates list + calls onSuccess on Close", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 8 };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.click(c.getByText("Create"));
    expect(stubs.listInvalidate).toHaveBeenCalled();
    const msg = c.getByTestId("create-success");
    expect(msg.textContent).toContain("8");
    expect(msg.textContent).toContain("rederive jobs enqueued");
    fireEvent.click(c.getByTestId("create-success-close"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows singular form when enqueued count is 1", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 1 };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.click(c.getByText("Create"));
    expect(c.getByTestId("create-success").textContent).toContain(
      "rederive job enqueued",
    );
  });

  it("shows the server error message on mutation failure", () => {
    stubs.nextOutcome = { kind: "error", message: "Access denied." };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.click(c.getByText("Create"));
    expect(c.getByTestId("create-error").textContent).toContain(
      "Access denied.",
    );
    // Form fields should still be visible (no success-state takeover on error).
    expect(c.getByLabelText("Name")).toBeTruthy();
  });

  it("Cancel calls onOpenChange(false)", () => {
    const c = renderOpen();
    fireEvent.click(c.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Cancel and Create while mutation is pending", () => {
    stubs.createIsPending = true;
    const c = renderOpen();
    const cancel = c.getByText("Cancel") as HTMLButtonElement;
    const create = c.getByText("Creating…") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(create.disabled).toBe(true);
  });

  it("preserves the user-entered ArcGIS reference ID and trims it", () => {
    stubs.nextOutcome = { kind: "success", enqueued: 0 };
    const c = renderOpen();
    fillRequired(c);
    fireEvent.change(c.getByLabelText(/ArcGIS reference ID/i), {
      target: { value: "  arc-9999  " },
    });
    fireEvent.click(c.getByText("Create"));
    const payload = stubs.createMutate.mock.calls[0]?.[0];
    expect(payload?.arcgisReferenceId).toBe("arc-9999");
  });
});
