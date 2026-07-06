// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Shared mutable stubs — hoisted so vi.mock factories can close over them.
// Plain objects (not vi.fn()) avoids TS "Mock<Procedure|Constructable>" errors.
// ---------------------------------------------------------------------------
const { stubs } = vi.hoisted(() => {
  const s = {
    createCalls: [] as unknown[],
    updateCalls: [] as unknown[],
    checkConflictsArg: undefined as unknown,
    checkConflictsResult: { conflicts: [] as unknown[] },
    listInvalidateCalled: false,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      patrolSchedule: {
        checkConflicts: {
          fetch: (arg: unknown) => {
            stubs.checkConflictsArg = arg;
            return Promise.resolve(stubs.checkConflictsResult);
          },
        },
        list: {
          invalidate: () => {
            stubs.listInvalidateCalled = true;
            return Promise.resolve();
          },
        },
      },
    }),
    patrolSchedule: {
      create: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (payload: unknown) => {
            stubs.createCalls.push(payload);
            opts.onSuccess?.();
          },
          isPending: false,
          reset: () => undefined,
        }),
      },
      update: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => ({
          mutate: (payload: unknown) => {
            stubs.updateCalls.push(payload);
            opts.onSuccess?.();
          },
          isPending: false,
          reset: () => undefined,
        }),
      },
    },
    patrolArea: {
      list: {
        useQuery: () => ({
          data: {
            items: [{ id: "area-1", name: "Area Alpha", isActive: true }],
          },
        }),
      },
    },
    // user.listActiveNames (2026-07-06) — minimal id+fullName picker source;
    // the dialog switched off user.list (now super_admin/site_admin only).
    user: {
      listActiveNames: {
        useQuery: () => ({
          data: {
            items: [{ id: "user-1", fullName: "Ranger Rico" }],
          },
        }),
      },
    },
    event: {
      suggestAccompanyingRangers: {
        useQuery: () => ({
          data: { suggestions: [] },
          isLoading: false,
        }),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock shadcn Select as a native <select> so fireEvent.change works.
// SelectTrigger propagates its data-testid to the parent Select via context.
// Must use vi.hoisted + import React separately since vi.mock factory runs
// before module scope — we import React at top and reference it via closure.
// ---------------------------------------------------------------------------
import * as React from "react";

type SelectMeta = { testId?: string | undefined; id?: string | undefined };
type SelectCtxType = SelectMeta & { setMeta: (v: SelectMeta) => void };

// Build the context and components OUTSIDE the vi.mock factory so they can
// use the top-level React import instead of require().
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
    // ctx omitted from deps: ctxVal recomputes on every meta change,
    // so including it here causes an infinite re-render loop.
    // setMeta itself is a stable useState dispatcher.
  }, [testId, id]);
  return null;
}

vi.mock("@/components/ui/select", () => ({
  Select: MockSelect,
  SelectTrigger: MockSelectTrigger,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
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
import { AssignmentDialog } from "../assignment-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AREA_ID = "area-1";
const RANGER_ID = "user-1";
const START = "2026-06-01";
const END = "2026-06-05";

const CONFLICT_ITEMS = [
  {
    id: "sched-x",
    scheduledStart: new Date("2026-06-02T00:00:00Z"),
    scheduledEnd: new Date("2026-06-04T00:00:00Z"),
    rangerName: "Ranger Rico",
    patrolArea: { id: "area-2", name: "Area Beta" },
  },
  {
    id: "sched-y",
    scheduledStart: new Date("2026-06-03T00:00:00Z"),
    scheduledEnd: new Date("2026-06-06T00:00:00Z"),
    rangerName: "Ranger Rico",
    patrolArea: { id: "area-3", name: "Area Gamma" },
  },
];

// ---------------------------------------------------------------------------
// Helpers — query document.body (Dialog renders via Radix portal)
// ---------------------------------------------------------------------------
function qs(testId: string) {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof AssignmentDialog>> = {},
) {
  const defaults: React.ComponentProps<typeof AssignmentDialog> = {
    open: true,
    onOpenChange: () => undefined,
    mode: "create",
    onSuccess: () => undefined,
  };
  return render(<AssignmentDialog {...defaults} {...props} />);
}

// Fill all form fields needed for a valid submission.
// prefix matches testPrefix = `patrol-schedule-assignment-${mode}`
async function fillForm(
  prefix = "patrol-schedule-assignment-create",
  opts: { skipRanger?: boolean; rangerName?: string } = {},
) {
  // Wait for selects to get their testids via the SelectTrigger useEffect
  await act(async () => {});

  const areaEl = document.body.querySelector(`[data-testid="${prefix}-area"]`);
  if (areaEl) fireEvent.change(areaEl, { target: { value: AREA_ID } });

  if (opts.skipRanger !== true) {
    const rangerEl = document.body.querySelector(`[data-testid="${prefix}-ranger"]`);
    if (rangerEl) fireEvent.change(rangerEl, { target: { value: RANGER_ID } });
  }

  const nameEl = document.body.querySelector<HTMLInputElement>(
    `[data-testid="${prefix}-name"]`,
  );
  if (nameEl)
    fireEvent.change(nameEl, {
      target: { value: opts.rangerName ?? "Ranger Rico" },
    });

  const startEl = document.body.querySelector<HTMLInputElement>(
    `[data-testid="${prefix}-start"]`,
  );
  if (startEl) fireEvent.change(startEl, { target: { value: START } });

  const endEl = document.body.querySelector<HTMLInputElement>(
    `[data-testid="${prefix}-end"]`,
  );
  if (endEl) fireEvent.change(endEl, { target: { value: END } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  stubs.createCalls = [];
  stubs.updateCalls = [];
  stubs.checkConflictsArg = undefined;
  stubs.checkConflictsResult = { conflicts: [] };
  stubs.listInvalidateCalled = false;
});

afterEach(() => {
  cleanup();
});

describe("AssignmentDialog — conflict confirm UI", () => {
  it("1. create mode, no conflicts → checkConflicts called, create.mutate called with overrideConflicts: false", async () => {
    renderDialog({ mode: "create" });
    await fillForm();

    act(() => {
      const submitBtn = qs("patrol-schedule-assignment-create-submit");
      expect(submitBtn).not.toBeNull();
      if (submitBtn !== null) fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(stubs.checkConflictsArg).toBeTruthy();
    });
    expect(stubs.createCalls).toHaveLength(1);
    expect(stubs.createCalls[0]).toMatchObject({ overrideConflicts: false });
    expect(qs("conflict-confirm-view")).toBeNull();
  });

  it("2. create mode, 2 conflicts → confirm view shown with 2 items, create.mutate NOT called", async () => {
    stubs.checkConflictsResult = { conflicts: CONFLICT_ITEMS };
    renderDialog({ mode: "create" });
    await fillForm();

    act(() => {
      const btn = qs("patrol-schedule-assignment-create-submit");
      if (btn !== null) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(qs("conflict-confirm-view")).not.toBeNull();
    });
    const confirmView = qs("conflict-confirm-view");
    expect(confirmView).not.toBeNull();
    expect(confirmView?.querySelectorAll("li")).toHaveLength(2);
    expect(qs("patrol-schedule-assignment-create-confirm-override")).not.toBeNull();
    expect(stubs.createCalls).toHaveLength(0);
  });

  it("3. click 'Save anyway' → create.mutate called with overrideConflicts: true", async () => {
    stubs.checkConflictsResult = { conflicts: CONFLICT_ITEMS };
    renderDialog({ mode: "create" });
    await fillForm();

    act(() => {
      const btn = qs("patrol-schedule-assignment-create-submit");
      if (btn !== null) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(qs("conflict-confirm-view")).not.toBeNull();
    });

    act(() => {
      const btn = qs("patrol-schedule-assignment-create-confirm-override");
      if (btn !== null) fireEvent.click(btn);
    });

    expect(stubs.createCalls).toHaveLength(1);
    expect(stubs.createCalls[0]).toMatchObject({ overrideConflicts: true });
    await waitFor(() => {
      expect(qs("conflict-confirm-view")).toBeNull();
    });
  });

  it("4. click 'Back' → confirm view cleared, create.mutate not called", async () => {
    stubs.checkConflictsResult = { conflicts: CONFLICT_ITEMS };
    renderDialog({ mode: "create" });
    await fillForm();

    act(() => {
      const btn = qs("patrol-schedule-assignment-create-submit");
      if (btn !== null) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(qs("conflict-confirm-view")).not.toBeNull();
    });

    const backBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Back",
    );
    expect(backBtn).not.toBeUndefined();

    act(() => {
      if (backBtn !== undefined) fireEvent.click(backBtn);
    });

    expect(qs("conflict-confirm-view")).toBeNull();
    expect(stubs.createCalls).toHaveLength(0);
  });

  it("5. edit mode with conflicts → checkConflicts called with excludeId, confirm view appears", async () => {
    stubs.checkConflictsResult = { conflicts: [CONFLICT_ITEMS[0]] };

    const initial = {
      id: "sched-existing",
      patrolAreaId: AREA_ID,
      rangerUserId: RANGER_ID,
      rangerName: "Ranger Rico",
      scheduledStart: new Date(`${START}T00:00:00Z`),
      scheduledEnd: new Date(`${END}T00:00:00Z`),
      notes: null as string | null,
    };

    renderDialog({ mode: "edit", initial });
    await fillForm("patrol-schedule-assignment-edit");

    act(() => {
      const btn = qs("patrol-schedule-assignment-edit-submit");
      if (btn !== null) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(stubs.checkConflictsArg).toMatchObject({ excludeId: "sched-existing" });
    });
    await waitFor(() => {
      expect(qs("conflict-confirm-view")).not.toBeNull();
    });
    expect(stubs.updateCalls).toHaveLength(0);
  });

  it("6. create mode with no rangerUserId → checkConflicts NOT called, create.mutate called directly", async () => {
    renderDialog({ mode: "create" });
    await fillForm("patrol-schedule-assignment-create", {
      skipRanger: true,
      rangerName: "Unassigned Ranger",
    });

    act(() => {
      const btn = qs("patrol-schedule-assignment-create-submit");
      if (btn !== null) fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(stubs.createCalls).toHaveLength(1);
    });
    expect(stubs.checkConflictsArg).toBeUndefined();
    expect(stubs.createCalls[0]).toMatchObject({ overrideConflicts: false });
  });
});
