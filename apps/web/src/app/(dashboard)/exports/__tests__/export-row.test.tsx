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
    },
    useUtils: () => ({
      reportExport: { list: { invalidate: vi.fn() } },
    }),
  },
}));

import {
  ExportRow,
  buildReportSummaryLabel,
  buildReportSummaryParts,
} from "../export-row";

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

  // -------------------------------------------------------------------------
  // Delete / Stop actions.
  // -------------------------------------------------------------------------

  it("renders Stop button (not Delete) when status=queued", () => {
    const { queryByTestId } = renderInTable(makeRow({ status: "queued" }));
    expect(queryByTestId("stop-export-button")).toBeTruthy();
    expect(queryByTestId("delete-export-button")).toBeNull();
  });

  it("renders Stop button (not Delete) when status=rendering", () => {
    const { queryByTestId } = renderInTable(makeRow({ status: "rendering" }));
    expect(queryByTestId("stop-export-button")).toBeTruthy();
    expect(queryByTestId("delete-export-button")).toBeNull();
  });

  it("renders Delete button (not Stop) when status=ready", () => {
    const { queryByTestId } = renderInTable(makeRow({ status: "ready" }));
    expect(queryByTestId("delete-export-button")).toBeTruthy();
    expect(queryByTestId("stop-export-button")).toBeNull();
  });

  it("renders both Retry and Delete buttons when status=failed", () => {
    const { queryByTestId } = renderInTable(makeRow({ status: "failed" }));
    expect(queryByTestId("retry-export-button")).toBeTruthy();
    expect(queryByTestId("delete-export-button")).toBeTruthy();
    expect(queryByTestId("stop-export-button")).toBeNull();
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

  // -------------------------------------------------------------------------
  // 2c — honest in-progress affordance (spinner + elapsed time).
  // -------------------------------------------------------------------------

  it("shows an animated spinner + elapsed time while queued", () => {
    const createdAt = new Date(Date.now() - 65_000); // 1m 5s ago
    const { queryByTestId } = renderInTable(
      makeRow({ status: "queued", createdAt }),
    );
    const indicator = queryByTestId("export-in-flight-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator?.textContent).toContain("Queued");
    expect(indicator?.textContent).toMatch(/1m/);
  });

  it("shows an animated spinner + elapsed time while rendering", () => {
    const createdAt = new Date(Date.now() - 5_000);
    const { queryByTestId } = renderInTable(
      makeRow({ status: "rendering", createdAt }),
    );
    const indicator = queryByTestId("export-in-flight-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator?.textContent).toContain("Rendering");
  });

  it("does not show the in-flight indicator for terminal statuses", () => {
    const { queryByTestId, rerender } = renderInTable(
      makeRow({ status: "ready" }),
    );
    expect(queryByTestId("export-in-flight-indicator")).toBeNull();

    rerender(
      <table>
        <tbody>
          <ExportRow row={makeRow({ status: "failed" })} />
        </tbody>
      </table>,
    );
    expect(queryByTestId("export-in-flight-indicator")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Task 1 — Report Summary column.
  // -------------------------------------------------------------------------

  it("renders the resolved report summary in its own cell", () => {
    const { queryByTestId } = renderInTable(
      makeRow({
        reportType: "report_map",
        reportSummary: {
          municipalityName: "Calapan City",
          protectedZoneName: "Apo Reef",
          templateName: "Standard",
          areaName: null,
          from: "2024-12-31T00:00:00.000Z",
          to: "2026-07-05T00:00:00.000Z",
          period: null,
        },
      }),
    );
    const cell = queryByTestId("export-report-summary");
    expect(cell?.textContent).toContain("Calapan City");
    expect(cell?.textContent).toContain("Zone: Apo Reef");
  });

  it("renders just the humanized report type when reportSummary is absent", () => {
    const { queryByTestId } = renderInTable(
      makeRow({ reportType: "consolidated", reportSummary: undefined }),
    );
    expect(queryByTestId("export-report-summary")?.textContent).toBe(
      "Consolidated",
    );
  });
});

describe("buildReportSummaryLabel (Report Summary column formatting)", () => {
  function baseRow(overrides: Partial<ExportRowItem> = {}): ExportRowItem {
    return makeRow(overrides);
  }

  it("report_map: municipality + date range + zone, all present", () => {
    const label = buildReportSummaryLabel(
      baseRow({
        reportType: "report_map",
        reportSummary: {
          municipalityName: "Calapan City",
          protectedZoneName: "Apo Reef",
          templateName: "Standard",
          areaName: null,
          from: "2024-12-31T00:00:00.000Z",
          to: "2026-07-05T00:00:00.000Z",
          period: null,
        },
      }),
    );
    expect(label.startsWith("Report map · Calapan City · ")).toBe(true);
    expect(label).toContain("2024");
    expect(label).toContain("2026");
    expect(label).toContain(" – ");
    expect(label.endsWith("Zone: Apo Reef")).toBe(true);
  });

  it("report_map: no municipalityId → 'All municipalities'; no zone → 'Zone: —'", () => {
    const label = buildReportSummaryLabel(
      baseRow({
        reportType: "report_map",
        reportSummary: {
          municipalityName: null,
          protectedZoneName: null,
          templateName: null,
          areaName: null,
          from: null,
          to: null,
          period: null,
        },
      }),
    );
    expect(label).toBe("Report map · All municipalities · Zone: —");
  });

  it("area: shows area name + date range, no municipality/zone segment", () => {
    const label = buildReportSummaryLabel(
      baseRow({
        reportType: "area",
        reportSummary: {
          municipalityName: null,
          protectedZoneName: null,
          templateName: null,
          areaName: "Bulalacao Coastal Zone",
          from: "2026-01-01",
          to: "2026-01-31",
          period: null,
        },
      }),
    );
    expect(label).toContain("Bulalacao Coastal Zone");
    expect(label).not.toContain("Zone:");
    expect(label).not.toContain("municipalities");
  });

  it("coverage: shows month + year from the period field", () => {
    const label = buildReportSummaryLabel(
      baseRow({
        reportType: "coverage",
        reportSummary: {
          municipalityName: null,
          protectedZoneName: null,
          templateName: null,
          areaName: null,
          from: null,
          to: null,
          period: { year: 2026, month: 6 },
        },
      }),
    );
    expect(label).toBe("Coverage · June 2026");
  });

  it("falls back to just the humanized report type when reportSummary is missing", () => {
    expect(
      buildReportSummaryLabel(baseRow({ reportType: "rangers", reportSummary: undefined })),
    ).toBe("Rangers");
  });
});

describe("buildReportSummaryParts (date range on its own line)", () => {
  function baseRow(overrides: Partial<ExportRowItem> = {}): ExportRowItem {
    return makeRow(overrides);
  }

  it("report_map: primary = type · municipality · Zone (NO range); range separated", () => {
    const parts = buildReportSummaryParts(
      baseRow({
        reportType: "report_map",
        reportSummary: {
          municipalityName: "Calapan City",
          protectedZoneName: null,
          templateName: null,
          areaName: null,
          from: "2026-06-05T00:00:00.000Z",
          to: "2026-07-05T00:00:00.000Z",
          period: null,
        },
      }),
    );
    // date range must NOT be in the primary line (it was hiding the Zone detail)
    expect(parts.primary).toBe("Report map · Calapan City · Zone: —");
    expect(parts.primary).not.toContain(" – ");
    expect(parts.dateRange).not.toBeNull();
    expect(parts.dateRange).toContain("2026");
    expect(parts.dateRange).toContain(" – ");
  });

  it("area: primary = type · area; range separated", () => {
    const parts = buildReportSummaryParts(
      baseRow({
        reportType: "area",
        reportSummary: {
          municipalityName: null,
          protectedZoneName: null,
          templateName: null,
          areaName: "Bulalacao Coastal Zone",
          from: "2026-01-01",
          to: "2026-01-31",
          period: null,
        },
      }),
    );
    expect(parts.primary).toBe("Area · Bulalacao Coastal Zone");
    expect(parts.dateRange).not.toBeNull();
  });

  it("coverage: month/year stays in primary, no separate range", () => {
    const parts = buildReportSummaryParts(
      baseRow({
        reportType: "coverage",
        reportSummary: {
          municipalityName: null,
          protectedZoneName: null,
          templateName: null,
          areaName: null,
          from: null,
          to: null,
          period: { year: 2026, month: 6 },
        },
      }),
    );
    expect(parts.primary).toBe("Coverage · June 2026");
    expect(parts.dateRange).toBeNull();
  });
});
