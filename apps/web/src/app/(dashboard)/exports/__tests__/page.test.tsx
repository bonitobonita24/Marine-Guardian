// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { ExportRowItem } from "../export-row";

type Role = "super_admin" | "site_admin" | "field_coordinator" | "operator";

const { stubs } = vi.hoisted(() => {
  const s: {
    roles: Role[];
    listData:
      | { items: ExportRowItem[]; nextCursor: string | undefined }
      | undefined;
    listIsLoading: boolean;
    lastListInput: Record<string, unknown> | undefined;
  } = {
    roles: ["site_admin"],
    listData: undefined,
    listIsLoading: false,
    lastListInput: undefined,
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
      list: {
        useQuery: (input: Record<string, unknown>) => {
          stubs.lastListInput = input;
          return {
            data: stubs.listData,
            isLoading: stubs.listIsLoading,
            isFetching: false,
          };
        },
      },
      // Stub these so the ExportRow children don't blow up during page render.
      pollStatus: {
        useQuery: (
          _input: { id: string },
          opts?: { initialData?: unknown },
        ) => ({
          data: opts?.initialData,
        }),
      },
      getDownloadUrl: {
        useQuery: () => ({ data: undefined }),
      },
      retry: {
        useMutation: () => ({
          mutate: vi.fn(),
          reset: vi.fn(),
          isPending: false,
        }),
      },
      cancel: {
        useMutation: () => ({
          mutate: vi.fn(),
          reset: vi.fn(),
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: vi.fn(),
          reset: vi.fn(),
          isPending: false,
        }),
      },
      // Stub the on-demand PowerPoint export procedures so ExportRow
      // children don't blow up during page render (same rationale as
      // pollStatus/getDownloadUrl above).
      pollPptxStatus: {
        useQuery: (
          _input: { id: string },
          opts?: { initialData?: unknown },
        ) => ({
          data: opts?.initialData,
          refetch: vi.fn(),
        }),
      },
      renderPptx: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      getPptxDownloadUrl: {
        useQuery: () => ({ data: undefined }),
      },
    },
    useUtils: () => ({
      reportExport: { list: { invalidate: vi.fn() } },
    }),
  },
}));

import ExportsPage from "../page";

function makeRow(overrides: Partial<ExportRowItem> = {}): ExportRowItem {
  return {
    id: "re-1",
    reportType: "coverage",
    paperSize: "A4",
    status: "ready",
    errorMessage: null,
    createdAt: new Date("2026-05-21T10:00:00Z"),
    completedAt: new Date("2026-05-21T10:05:00Z"),
    requestedBy: { id: "u1", fullName: "Bonito" },
    ...overrides,
  };
}

describe("ExportsPage (5.3d)", () => {
  beforeEach(() => {
    stubs.roles = ["site_admin"];
    stubs.listData = undefined;
    stubs.listIsLoading = false;
    stubs.lastListInput = undefined;
  });
  afterEach(() => {
    cleanup();
  });

  it("renders access-denied content for operator sessions (coordinator+ client gate)", () => {
    stubs.roles = ["operator"];
    const { queryByTestId, queryByText } = render(<ExportsPage />);
    expect(queryByTestId("exports-access-denied")).toBeTruthy();
    expect(queryByText("Exports")).toBeNull();
  });

  it("renders the rows returned by trpc.reportExport.list for field_coordinator", () => {
    stubs.roles = ["field_coordinator"];
    stubs.listData = {
      items: [
        makeRow({ id: "re-a", status: "ready" }),
        makeRow({ id: "re-b", status: "queued" }),
      ],
      nextCursor: undefined,
    };
    const { queryByTestId } = render(<ExportsPage />);
    expect(queryByTestId("export-row-re-a")).toBeTruthy();
    expect(queryByTestId("export-row-re-b")).toBeTruthy();
  });

  it("renders the empty state when listQuery returns no items", () => {
    stubs.listData = { items: [], nextCursor: undefined };
    const { queryByTestId } = render(<ExportsPage />);
    expect(queryByTestId("exports-empty-state")).toBeTruthy();
  });

  it("forwards the status filter selection to the listQuery input on the next render", () => {
    stubs.listData = { items: [], nextCursor: undefined };
    const { getByTestId, rerender } = render(<ExportsPage />);

    const select = getByTestId("status-filter") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "failed" } });
    rerender(<ExportsPage />);

    expect(stubs.lastListInput?.status).toBe("failed");
  });

  it("renders the Load more button when listQuery returns nextCursor", () => {
    stubs.listData = {
      items: [makeRow({ id: "re-page-1" })],
      nextCursor: "cursor-2",
    };
    const { queryByTestId } = render(<ExportsPage />);
    expect(queryByTestId("exports-load-more")).toBeTruthy();
  });
});
