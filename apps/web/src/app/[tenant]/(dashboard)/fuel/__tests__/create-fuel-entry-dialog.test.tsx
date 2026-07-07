// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Shared mutable stubs — hoisted so vi.mock factories can close over them.
// ---------------------------------------------------------------------------
const { stubs } = vi.hoisted(() => {
  const s: {
    createMutate: ReturnType<typeof vi.fn<(input: unknown) => void>>;
    createReset: ReturnType<typeof vi.fn<() => void>>;
    createIsPending: boolean;
    listInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    analyticsInvalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
    nextOutcome:
      | { kind: "success" }
      | { kind: "error"; message: string }
      | null;
  } = {
    createMutate: vi.fn<(input: unknown) => void>(),
    createReset: vi.fn<() => void>(),
    createIsPending: false,
    listInvalidate: vi.fn<() => Promise<void>>(),
    analyticsInvalidate: vi.fn<() => Promise<void>>(),
    nextOutcome: null,
  };
  return { stubs: s };
});

const MUNICIPALITIES = [
  { id: "muni-1", name: "Calapan City", province: "Oriental Mindoro", slug: "calapan-city" },
  { id: "muni-2", name: "Puerto Galera", province: "Oriental Mindoro", slug: "puerto-galera" },
  { id: "muni-3", name: "Sablayan", province: "Occidental Mindoro", slug: "sablayan" },
];

interface MutationOpts {
  onSuccess?: () => void;
  onError?: (err: { message: string }) => void;
}

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    municipality: {
      list: {
        useQuery: () => ({ data: MUNICIPALITIES }),
      },
    },
    fuelEntry: {
      create: {
        useMutation: (opts?: MutationOpts) => ({
          mutate: (input: unknown) => {
            stubs.createMutate(input);
            const outcome = stubs.nextOutcome;
            if (outcome?.kind === "success") {
              opts?.onSuccess?.();
            } else if (outcome?.kind === "error") {
              opts?.onError?.({ message: outcome.message });
            }
          },
          isPending: stubs.createIsPending,
          reset: stubs.createReset,
        }),
      },
    },
    useUtils: () => ({
      fuelEntry: {
        list: { invalidate: stubs.listInvalidate },
        consumptionAnalytics: { invalidate: stubs.analyticsInvalidate },
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock shadcn Select as a native <select> so fireEvent.change works — mirrors
// apps/web/src/app/(dashboard)/patrol-schedule/_components/__tests__/assignment-dialog.test.tsx.
// SelectGroup/SelectLabel are pass-through (province headings aren't asserted
// on directly; the flattened <option> list is enough for fireEvent.change).
// ---------------------------------------------------------------------------
import * as React from "react";

type SelectMeta = { testId?: string | undefined; id?: string | undefined };
type SelectCtxType = SelectMeta & { setMeta: (v: SelectMeta) => void };

const SelectCtx = React.createContext<SelectCtxType>({
  setMeta: () => undefined,
});

function MockSelect({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
}) {
  const [meta, setMeta] = React.useState<SelectMeta>({});
  const ctxVal = React.useMemo<SelectCtxType>(
    () => ({ ...meta, setMeta }),
    [meta],
  );
  return (
    <SelectCtx.Provider value={ctxVal}>
      <select
        data-testid={meta.testId}
        id={meta.id}
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {children}
      </select>
    </SelectCtx.Provider>
  );
}

function MockSelectTrigger({
  "data-testid": testId,
  id,
}: {
  "data-testid"?: string;
  id?: string;
  children?: React.ReactNode;
}) {
  const ctx = React.useContext(SelectCtx);
  React.useEffect(() => {
    ctx.setMeta({ testId, id });
  }, [testId, id]);
  return null;
}

vi.mock("@/components/ui/select", () => ({
  Select: MockSelect,
  SelectTrigger: MockSelectTrigger,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectLabel: () => null,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) => <option value={value}>{children}</option>,
  SelectValue: () => null,
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { CreateFuelEntryDialog } from "../create-fuel-entry-dialog";

function qs(testId: string) {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

function renderOpen() {
  return render(
    <CreateFuelEntryDialog
      open={true}
      onOpenChange={() => undefined}
      onSuccess={() => undefined}
    />,
  );
}

async function fillRequired(overrides?: {
  // undefined = select "muni-1" (default); null = skip selecting entirely
  // (leaves the underlying React state at its initial null — a native
  // <select> with no empty/placeholder option would otherwise default its
  // *displayed* value to the first option, which doesn't reflect the real
  // unselected state).
  municipalityId?: string | null;
  liters?: string;
  totalPrice?: string;
}) {
  // Wait for the Select's testid to propagate via the SelectTrigger useEffect.
  await act(async () => {});

  if (overrides?.municipalityId !== null) {
    const municipalityEl = qs("fuel-create-municipality");
    if (municipalityEl) {
      fireEvent.change(municipalityEl, {
        target: { value: overrides?.municipalityId ?? "muni-1" },
      });
    }
  }
  const liters = qs("fuel-create-liters") as HTMLInputElement;
  fireEvent.change(liters, { target: { value: overrides?.liters ?? "100.000" } });
  const totalPrice = qs("fuel-create-price") as HTMLInputElement;
  fireEvent.change(totalPrice, {
    target: { value: overrides?.totalPrice ?? "1500000.00" },
  });
}

describe("CreateFuelEntryDialog", () => {
  beforeEach(() => {
    stubs.createMutate.mockReset();
    stubs.createReset.mockReset();
    stubs.listInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.analyticsInvalidate.mockReset().mockResolvedValue(undefined);
    stubs.createIsPending = false;
    stubs.nextOutcome = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a Municipality label and select populated from municipality.list", async () => {
    const c = renderOpen();
    expect(c.getByText("Municipality")).toBeTruthy();
    await act(async () => {});
    const select = qs("fuel-create-municipality") as HTMLSelectElement;
    expect(select).toBeTruthy();
    const optionValues = Array.from(select.querySelectorAll("option")).map(
      (o) => o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["muni-1", "muni-2", "muni-3"]);
  });

  it("rejects submit when no municipality is selected", async () => {
    const c = renderOpen();
    await fillRequired({ municipalityId: null });
    fireEvent.click(c.getByTestId("fuel-create-submit"));
    expect(stubs.createMutate).not.toHaveBeenCalled();
    expect(c.getByTestId("fuel-create-validation-error").textContent).toBe(
      "Municipality is required.",
    );
  });

  it("submits municipalityId + the municipality's name as areaName", async () => {
    stubs.nextOutcome = { kind: "success" };
    const c = renderOpen();
    await fillRequired({ municipalityId: "muni-2" });
    fireEvent.click(c.getByTestId("fuel-create-submit"));

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    const payload = stubs.createMutate.mock.calls[0]?.[0] as {
      municipalityId: string;
      areaName: string;
    };
    expect(payload.municipalityId).toBe("muni-2");
    expect(payload.areaName).toBe("Puerto Galera");
  });

  it("shows success feedback and invalidates fuelEntry list + analytics", async () => {
    stubs.nextOutcome = { kind: "success" };
    const c = renderOpen();
    await fillRequired();
    fireEvent.click(c.getByTestId("fuel-create-submit"));

    expect(c.getByTestId("fuel-create-success")).toBeTruthy();
    expect(stubs.listInvalidate).toHaveBeenCalled();
    expect(stubs.analyticsInvalidate).toHaveBeenCalled();
  });

  it("shows the server error message on mutation failure", async () => {
    stubs.nextOutcome = {
      kind: "error",
      message: "The selected municipality was not found.",
    };
    const c = renderOpen();
    await fillRequired();
    fireEvent.click(c.getByTestId("fuel-create-submit"));

    expect(c.getByTestId("fuel-create-error").textContent).toBe(
      "The selected municipality was not found.",
    );
  });
});
