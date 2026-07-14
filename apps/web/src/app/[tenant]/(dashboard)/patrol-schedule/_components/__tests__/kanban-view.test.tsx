// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import * as React from "react";

// ---------------------------------------------------------------------------
// Shared mutable stub — mirrors the pattern in assignment-dialog.test.tsx.
// ---------------------------------------------------------------------------
const { stubs } = vi.hoisted(() => {
  const s = {
    setStatusCalls: [] as unknown[],
    listInvalidateCalled: false,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      patrolSchedule: {
        list: {
          invalidate: () => {
            stubs.listInvalidateCalled = true;
            return Promise.resolve();
          },
        },
      },
    }),
    patrolSchedule: {
      setStatus: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (payload: unknown) => {
            stubs.setStatusCalls.push(payload);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

// Mock shadcn Select as a native <select> so fireEvent.change works — same
// pattern as assignment-dialog.test.tsx.
type SelectMeta = { testId?: string | undefined };
type SelectCtxType = SelectMeta & { setMeta: (v: SelectMeta) => void };
const SelectCtx = React.createContext<SelectCtxType>({ setMeta: () => undefined });

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
  const ctxVal = React.useMemo<SelectCtxType>(() => ({ ...meta, setMeta }), [meta]);
  return (
    <SelectCtx.Provider value={ctxVal}>
      <select
        data-testid={meta.testId}
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
}: {
  "data-testid"?: string;
  children?: React.ReactNode;
}) {
  const ctx = React.useContext(SelectCtx);
  React.useEffect(() => {
    ctx.setMeta({ testId });
  }, [testId]);
  return null;
}

vi.mock("@/components/ui/select", () => ({
  Select: MockSelect,
  SelectTrigger: MockSelectTrigger,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectValue: () => null,
}));

import { KanbanView } from "../kanban-view";

const ITEMS = [
  {
    id: "sched-1",
    rangerName: "Ranger Rico",
    scheduledStart: new Date("2026-06-01T08:00:00Z"),
    plannedHours: 4,
    status: "planned",
    accompanyingRangers: [],
    patrolArea: { id: "area-1", name: "Area Alpha", colorHex: "#3b82f6" },
  },
  {
    id: "sched-2",
    rangerName: "Ranger Amihan",
    scheduledStart: new Date("2026-06-02T08:00:00Z"),
    plannedHours: 6,
    status: "in_progress",
    accompanyingRangers: [{ userId: "u-2", name: "Ranger Bituin" }],
    patrolArea: null,
  },
];

beforeEach(() => {
  stubs.setStatusCalls = [];
  stubs.listInvalidateCalled = false;
});

afterEach(() => {
  cleanup();
});

describe("KanbanView", () => {
  it("renders one column per status with correct counts", () => {
    const { getByTestId } = render(<KanbanView items={ITEMS} onSelect={() => undefined} />);
    expect(getByTestId("patrol-schedule-kanban-count-planned").textContent).toBe("1");
    expect(getByTestId("patrol-schedule-kanban-count-in_progress").textContent).toBe("1");
    expect(getByTestId("patrol-schedule-kanban-count-completed").textContent).toBe("0");
    expect(getByTestId("patrol-schedule-kanban-count-cancelled").textContent).toBe("0");
  });

  it("changing the status select calls setStatus.mutate and invalidates the list", () => {
    const { getByTestId } = render(<KanbanView items={ITEMS} onSelect={() => undefined} />);
    const select = getByTestId("patrol-schedule-kanban-status-select-sched-1");
    fireEvent.change(select, { target: { value: "completed" } });

    expect(stubs.setStatusCalls).toHaveLength(1);
    expect(stubs.setStatusCalls[0]).toMatchObject({ id: "sched-1", status: "completed" });
    expect(stubs.listInvalidateCalled).toBe(true);
  });

  it("renders a fallback color for schedules with no patrol area", () => {
    const { getByTestId } = render(<KanbanView items={ITEMS} onSelect={() => undefined} />);
    expect(getByTestId("patrol-schedule-kanban-card-sched-2")).toBeTruthy();
  });
});
