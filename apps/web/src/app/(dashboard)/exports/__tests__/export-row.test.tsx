// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ExportRowItem } from "../export-row";
import type { ExportStatus } from "../status-badge";

interface PollData {
  id: string;
  status: ExportStatus;
  completedAt: Date | null;
  errorMessage: string | null;
  fileSizeBytes: number | null;
}

const { stubs } = vi.hoisted(() => {
  const s: {
    pollData: PollData | undefined;
    pollEnabled: boolean | undefined;
    pollRefetchInterval: number | false | undefined;
    pollCallCount: number;
    downloadUrl: string | null;
    downloadEnabled: boolean | undefined;
  } = {
    pollData: undefined,
    pollEnabled: undefined,
    pollRefetchInterval: undefined,
    pollCallCount: 0,
    downloadUrl: null,
    downloadEnabled: undefined,
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
        roles: ["site_admin"],
      },
      expires: "9999-01-01",
    },
    status: "authenticated" as const,
  }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportExport: {
      pollStatus: {
        useQuery: (
          _input: { id: string },
          opts?: {
            enabled?: boolean;
            refetchInterval?: number | false;
            initialData?: PollData;
          },
        ) => {
          stubs.pollCallCount += 1;
          stubs.pollEnabled = opts?.enabled;
          stubs.pollRefetchInterval = opts?.refetchInterval;
          return {
            data: stubs.pollData ?? opts?.initialData,
          };
        },
      },
      getDownloadUrl: {
        useQuery: (
          _input: { id: string },
          opts?: { enabled?: boolean },
        ) => {
          stubs.downloadEnabled = opts?.enabled;
          return {
            data:
              stubs.downloadEnabled === true
                ? { downloadUrl: stubs.downloadUrl, status: "ready" as const }
                : undefined,
          };
        },
      },
      retry: {
        useMutation: () => ({
          mutate: vi.fn(),
          reset: vi.fn(),
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      reportExport: { list: { invalidate: vi.fn() } },
    }),
  },
}));

import { ExportRow } from "../export-row";

function makeRow(overrides: Partial<ExportRowItem> = {}): ExportRowItem {
  return {
    id: "re-1",
    reportType: "coverage",
    paperSize: "A4",
    status: "queued",
    errorMessage: null,
    createdAt: new Date("2026-05-21T10:00:00Z"),
    completedAt: null,
    requestedBy: { id: "u1", fullName: "Bonito" },
    ...overrides,
  };
}

function renderInTable(row: ExportRowItem) {
  return render(
    <table>
      <tbody>
        <ExportRow row={row} />
      </tbody>
    </table>,
  );
}

describe("ExportRow (5.3d)", () => {
  beforeEach(() => {
    stubs.pollData = undefined;
    stubs.pollEnabled = undefined;
    stubs.pollRefetchInterval = undefined;
    stubs.pollCallCount = 0;
    stubs.downloadUrl = null;
    stubs.downloadEnabled = undefined;
  });
  afterEach(() => {
    cleanup();
  });

  it("polls every 3 seconds while status is queued (in-flight)", () => {
    renderInTable(makeRow({ status: "queued" }));
    expect(stubs.pollEnabled).toBe(true);
    expect(stubs.pollRefetchInterval).toBe(3000);
  });

  it("polls every 3 seconds while status is rendering (in-flight)", () => {
    renderInTable(makeRow({ status: "rendering" }));
    expect(stubs.pollEnabled).toBe(true);
    expect(stubs.pollRefetchInterval).toBe(3000);
  });

  it("disables polling for terminal status=ready", () => {
    renderInTable(makeRow({ status: "ready" }));
    expect(stubs.pollEnabled).toBe(false);
    expect(stubs.pollRefetchInterval).toBe(false);
  });

  it("disables polling for terminal status=failed", () => {
    renderInTable(makeRow({ status: "failed" }));
    expect(stubs.pollEnabled).toBe(false);
    expect(stubs.pollRefetchInterval).toBe(false);
  });

  it("surfaces Download link only when status=ready and downloadUrl resolves", () => {
    stubs.downloadUrl = "/api/exports/reports/re-1/download";
    const { queryByTestId } = renderInTable(makeRow({ status: "ready" }));

    const dl = queryByTestId("export-download-link");
    expect(dl).toBeTruthy();
    expect((dl as HTMLAnchorElement).getAttribute("href")).toBe(
      "/api/exports/reports/re-1/download",
    );
    expect(stubs.downloadEnabled).toBe(true);
  });

  it("renders Retry button + error message when status=failed", () => {
    const { queryByTestId } = renderInTable(
      makeRow({ status: "failed", errorMessage: "Puppeteer timeout" }),
    );

    expect(queryByTestId("retry-export-button")).toBeTruthy();
    expect(queryByTestId("export-error-message")?.textContent).toContain(
      "Puppeteer timeout",
    );
  });

  it("renders the colored status badge corresponding to the current status", () => {
    const { queryByTestId, rerender } = renderInTable(
      makeRow({ status: "queued" }),
    );
    expect(queryByTestId("export-status-queued")).toBeTruthy();

    rerender(
      <table>
        <tbody>
          <ExportRow row={makeRow({ status: "rendering" })} />
        </tbody>
      </table>,
    );
    expect(queryByTestId("export-status-rendering")).toBeTruthy();
  });
});
