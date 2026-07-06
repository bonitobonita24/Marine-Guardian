// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

const { stubs } = vi.hoisted(() => {
  const s: {
    listQueryInput: unknown;
    listData: { items: unknown[]; nextCursor: string | undefined };
    listUseQuery: ReturnType<typeof vi.fn<(input: unknown) => void>>;
  } = {
    listQueryInput: undefined,
    listData: { items: [], nextCursor: undefined },
    listUseQuery: vi.fn<(input: unknown) => void>(),
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    event: {
      list: {
        useQuery: (input: unknown) => {
          stubs.listQueryInput = input;
          stubs.listUseQuery(input);
          return {
            data: stubs.listData,
            isLoading: false,
            isFetching: false,
          };
        },
      },
      updateState: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      bulkUpdateState: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      resolveAllEvents: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({
      event: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
  },
}));

// EventDetailModal pulls in a lot of transitive deps (maps, revisions, etc.)
// that are irrelevant to filter-bar wiring — stub it out.
vi.mock("../event-detail-modal", () => ({
  EventDetailModal: () => null,
}));

import { EventsList } from "../events-list";

beforeEach(() => {
  stubs.listQueryInput = undefined;
  stubs.listData = { items: [], nextCursor: undefined };
  stubs.listUseQuery.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("EventsList — From/To date-range filter (Feature A)", () => {
  it("renders From and To date inputs instead of the old month picker", () => {
    render(<EventsList />);
    expect(screen.getByTestId("date-from-filter")).toBeTruthy();
    expect(screen.getByTestId("date-to-filter")).toBeTruthy();
    expect(screen.queryByTestId("month-filter")).toBeNull();
  });

  it("threads dateFrom as-is (midnight inclusive lower bound) into the list query", () => {
    render(<EventsList />);
    fireEvent.change(screen.getByTestId("date-from-filter"), {
      target: { value: "2026-06-01" },
    });
    const input = stubs.listQueryInput as { dateFrom?: string; dateTo?: string };
    expect(input.dateFrom).toBe("2026-06-01");
    expect(input.dateTo).toBeUndefined();
  });

  it("expands dateTo to the END of that day (23:59:59.999) so the whole day is included", () => {
    render(<EventsList />);
    fireEvent.change(screen.getByTestId("date-to-filter"), {
      target: { value: "2026-06-30" },
    });
    const input = stubs.listQueryInput as { dateFrom?: string; dateTo?: string };
    expect(input.dateTo).toBe("2026-06-30T23:59:59.999");
  });

  it("supports from-only, to-only, and both-set independently", () => {
    render(<EventsList />);

    // from-only
    fireEvent.change(screen.getByTestId("date-from-filter"), {
      target: { value: "2026-01-01" },
    });
    let input = stubs.listQueryInput as { dateFrom?: string; dateTo?: string };
    expect(input.dateFrom).toBe("2026-01-01");
    expect(input.dateTo).toBeUndefined();

    // both
    fireEvent.change(screen.getByTestId("date-to-filter"), {
      target: { value: "2026-01-31" },
    });
    input = stubs.listQueryInput as { dateFrom?: string; dateTo?: string };
    expect(input.dateFrom).toBe("2026-01-01");
    expect(input.dateTo).toBe("2026-01-31T23:59:59.999");
  });

  it("clear filters resets both date bounds", () => {
    render(<EventsList />);
    fireEvent.change(screen.getByTestId("date-from-filter"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("date-to-filter"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByText("Clear filters"));

    expect(screen.getByTestId("date-from-filter")).toHaveProperty("value", "");
    expect(screen.getByTestId("date-to-filter")).toHaveProperty("value", "");
    const input = stubs.listQueryInput as { dateFrom?: string; dateTo?: string };
    expect(input.dateFrom).toBeUndefined();
    expect(input.dateTo).toBeUndefined();
  });

  it("mirrors the end-of-day dateTo expansion into onFiltersChange (export URLs)", () => {
    const onFiltersChange = vi.fn();
    render(<EventsList onFiltersChange={onFiltersChange} />);

    fireEvent.change(screen.getByTestId("date-from-filter"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByTestId("date-to-filter"), {
      target: { value: "2026-06-30" },
    });

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0] as {
      dateFrom?: string;
      dateTo?: string;
    };
    expect(lastCall.dateFrom).toBe("2026-06-01");
    expect(lastCall.dateTo).toBe("2026-06-30T23:59:59.999");
  });
});
