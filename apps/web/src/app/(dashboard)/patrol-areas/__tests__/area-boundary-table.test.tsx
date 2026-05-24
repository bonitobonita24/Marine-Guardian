// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

interface BoundaryItem {
  id: string;
  name: string;
  aliases: string[];
  region: string;
  source: "official" | "custom";
  geometryType: "Polygon" | "LineString";
  isEnabled: boolean;
  overrideOfficial: boolean;
  arcgisReferenceId: string | null;
  geometryGeojson: unknown;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  creator: { id: string; fullName: string } | null;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    listData:
      | { items: BoundaryItem[]; nextCursor: string | undefined }
      | undefined;
    listIsLoading: boolean;
    listIsFetching: boolean;
    lastListInput: Record<string, unknown> | undefined;
  } = {
    listData: undefined,
    listIsLoading: false,
    listIsFetching: false,
    lastListInput: undefined,
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    areaBoundary: {
      list: {
        useQuery: (input: Record<string, unknown>) => {
          stubs.lastListInput = input;
          return {
            data: stubs.listData,
            isLoading: stubs.listIsLoading,
            isFetching: stubs.listIsFetching,
          };
        },
      },
    },
  },
}));

import {
  AreaBoundaryTable,
  type AreaBoundaryRow,
} from "../area-boundary-table";

const baseBoundaries: BoundaryItem[] = [
  {
    id: "b-1",
    name: "MPA North",
    aliases: ["North Reserve"],
    region: "Region IV-A",
    source: "official",
    geometryType: "Polygon",
    isEnabled: true,
    overrideOfficial: false,
    arcgisReferenceId: "arc-123",
    geometryGeojson: { type: "Polygon", coordinates: [[[0, 0]]] },
    createdByUserId: "u-1",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    creator: { id: "u-1", fullName: "Alice Anderson" },
  },
  {
    id: "b-2",
    name: "Coastal Patrol Zone",
    aliases: [],
    region: "Region V",
    source: "custom",
    geometryType: "LineString",
    isEnabled: false,
    overrideOfficial: true,
    arcgisReferenceId: null,
    geometryGeojson: { type: "LineString", coordinates: [[0, 0]] },
    createdByUserId: "u-2",
    createdAt: new Date("2026-04-02T00:00:00Z"),
    updatedAt: new Date("2026-04-02T00:00:00Z"),
    creator: { id: "u-2", fullName: "Bob Brown" },
  },
];

describe("AreaBoundaryTable", () => {
  const onDelete = vi.fn<(b: AreaBoundaryRow) => void>();

  beforeEach(() => {
    stubs.listData = { items: baseBoundaries, nextCursor: undefined };
    stubs.listIsLoading = false;
    stubs.listIsFetching = false;
    stubs.lastListInput = undefined;
    onDelete.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a row for each boundary with name and region", () => {
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText("MPA North")).toBeTruthy();
    expect(getByText("Region IV-A")).toBeTruthy();
    expect(getByText("Coastal Patrol Zone")).toBeTruthy();
    expect(getByText("Region V")).toBeTruthy();
  });

  it("renders source badges (official + custom)", () => {
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText("official")).toBeTruthy();
    expect(getByText("custom")).toBeTruthy();
  });

  it("renders geometry type per row", () => {
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText("Polygon")).toBeTruthy();
    expect(getByText("LineString")).toBeTruthy();
  });

  it("renders enabled badges (Enabled + Disabled)", () => {
    const { getAllByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    // "Enabled" and "Disabled" also appear as <option>s in the enabled filter,
    // so multiple matches are expected — assert at least one badge exists.
    expect(getAllByText("Enabled").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Disabled").length).toBeGreaterThanOrEqual(1);
  });

  it("renders override-official badges (Yes + No)", () => {
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText("Yes")).toBeTruthy();
    expect(getByText("No")).toBeTruthy();
  });

  it("renders creator full name", () => {
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText("Alice Anderson")).toBeTruthy();
    expect(getByText("Bob Brown")).toBeTruthy();
  });

  it("does NOT render Actions column or row actions when isAdmin=false", () => {
    const { queryByText, queryAllByTestId } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(queryByText("Actions")).toBeNull();
    expect(queryAllByTestId("row-action-edit").length).toBe(0);
    expect(queryAllByTestId("row-action-delete").length).toBe(0);
  });

  it("renders Actions column with Edit (disabled) + Delete buttons when isAdmin=true", () => {
    const { getByText, getAllByTestId } = render(
      <AreaBoundaryTable isAdmin={true} onDelete={onDelete} />,
    );
    expect(getByText("Actions")).toBeTruthy();
    const edits = getAllByTestId("row-action-edit");
    const deletes = getAllByTestId("row-action-delete");
    expect(edits.length).toBe(2);
    expect(deletes.length).toBe(2);
    // Edit is the A.1 stub — must be disabled with A.2 tooltip
    expect((edits[0] as HTMLButtonElement).disabled).toBe(true);
    expect(edits[0]?.getAttribute("title")).toBe("Available in A.2");
  });

  it("calls onDelete with the row's boundary when Delete is clicked", () => {
    const { getAllByTestId } = render(
      <AreaBoundaryTable isAdmin={true} onDelete={onDelete} />,
    );
    const deletes = getAllByTestId("row-action-delete");
    const first = deletes[0];
    if (first === undefined) throw new Error("No delete button rendered");
    fireEvent.click(first);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0]?.[0]?.id).toBe("b-1");
  });

  it("debounces region input into trpc.areaBoundary.list query", async () => {
    const { getByPlaceholderText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    const input = getByPlaceholderText(
      /Filter by region/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Region IV-A" } });
    await new Promise((r) => setTimeout(r, 350));
    expect(stubs.lastListInput?.region).toBe("Region IV-A");
  });

  it("passes isEnabled filter to query when selected", () => {
    const { getByTestId } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    fireEvent.change(getByTestId("enabled-filter"), {
      target: { value: "enabled" },
    });
    expect(stubs.lastListInput?.isEnabled).toBe(true);
  });

  it("passes isEnabled=false when 'disabled' is selected", () => {
    const { getByTestId } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    fireEvent.change(getByTestId("enabled-filter"), {
      target: { value: "disabled" },
    });
    expect(stubs.lastListInput?.isEnabled).toBe(false);
  });

  it("passes source filter to query when selected", () => {
    const { getByTestId } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    fireEvent.change(getByTestId("source-filter"), {
      target: { value: "custom" },
    });
    expect(stubs.lastListInput?.source).toBe("custom");
  });

  it("renders the empty state when no items are returned", () => {
    stubs.listData = { items: [], nextCursor: undefined };
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText(/No area boundaries/i)).toBeTruthy();
  });

  it("renders the loading skeleton when query is loading with no rows", () => {
    stubs.listData = undefined;
    stubs.listIsLoading = true;
    const { getByTestId } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByTestId("area-boundary-table-loading")).toBeTruthy();
  });

  it("shows the Load more button when nextCursor is present", () => {
    stubs.listData = { items: baseBoundaries, nextCursor: "b-2" };
    const { getByText } = render(
      <AreaBoundaryTable isAdmin={false} onDelete={onDelete} />,
    );
    expect(getByText(/Load more/i)).toBeTruthy();
  });
});
