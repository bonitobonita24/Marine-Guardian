// @vitest-environment jsdom

// Phase 4 S7 — in-dialog per-file progress row.
//
// The tRPC client is mocked wholesale (matching the sibling
// generate-printable-button.test.tsx approach). `stubs` drives what each
// query returns per test, and `captured` records the OPTIONS each useQuery
// received so the polling-stops-at-terminal contract can be asserted directly
// rather than inferred.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

type ExportStatus = "queued" | "rendering" | "ready" | "failed";

interface PollData {
  id: string;
  status: ExportStatus;
  completedAt: Date | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
}

interface PptxPollData {
  id: string;
  pptxStatus: ExportStatus | null;
  pptxFileSizeBytes: number | null;
  pptxErrorMessage: string | null;
}

const { stubs, captured, renderPptxSpy } = vi.hoisted(() => ({
  stubs: {
    poll: null as PollData | null,
    downloadUrl: null as string | null,
    pptxPoll: null as PptxPollData | null,
    pptxDownloadUrl: null as string | null,
  },
  captured: {
    pollOptions: null as Record<string, unknown> | null,
    pptxPollOptions: null as Record<string, unknown> | null,
    downloadOptions: null as Record<string, unknown> | null,
    pptxDownloadOptions: null as Record<string, unknown> | null,
  },
  renderPptxSpy: vi.fn(),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    reportExport: {
      pollStatus: {
        useQuery: (_input: unknown, opts?: Record<string, unknown>) => {
          captured.pollOptions = opts ?? null;
          return { data: stubs.poll };
        },
      },
      getDownloadUrl: {
        useQuery: (_input: unknown, opts?: Record<string, unknown>) => {
          captured.downloadOptions = opts ?? null;
          return {
            data:
              stubs.downloadUrl === null
                ? undefined
                : { downloadUrl: stubs.downloadUrl, status: "ready" },
          };
        },
      },
      pollPptxStatus: {
        useQuery: (_input: unknown, opts?: Record<string, unknown>) => {
          captured.pptxPollOptions = opts ?? null;
          return { data: stubs.pptxPoll };
        },
      },
      getPptxDownloadUrl: {
        useQuery: (_input: unknown, opts?: Record<string, unknown>) => {
          captured.pptxDownloadOptions = opts ?? null;
          return {
            data:
              stubs.pptxDownloadUrl === null
                ? undefined
                : { downloadUrl: stubs.pptxDownloadUrl, pptxStatus: "ready" },
          };
        },
      },
      renderPptx: {
        useMutation: () => ({ mutate: renderPptxSpy, isPending: false }),
      },
    },
  },
}));

import {
  ExportProgressRow,
  EXPORT_POLL_INTERVAL_MS,
  EXPORT_ROW_FAILURE_FALLBACK,
} from "../export-progress-row";

/** Invokes a captured functional refetchInterval with a fake Query object. */
function callRefetchInterval(
  opts: Record<string, unknown> | null,
  data: unknown,
): number | false | undefined {
  const fn = opts?.refetchInterval;
  if (typeof fn !== "function") {
    throw new Error("refetchInterval was not a function");
  }
  return (fn as (q: { state: { data: unknown } }) => number | false | undefined)(
    { state: { data } },
  );
}

function pollRow(status: ExportStatus, errorMessage: string | null = null): PollData {
  return {
    id: "exp-1",
    status,
    completedAt: null,
    fileSizeBytes: null,
    errorMessage,
  };
}

describe("ExportProgressRow", () => {
  beforeEach(() => {
    stubs.poll = null;
    stubs.downloadUrl = null;
    stubs.pptxPoll = null;
    stubs.pptxDownloadUrl = null;
    captured.pollOptions = null;
    captured.pptxPollOptions = null;
    captured.downloadOptions = null;
    captured.pptxDownloadOptions = null;
    renderPptxSpy.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a spinner and NO Download button while queued", () => {
    stubs.poll = pollRow("queued");
    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );

    expect(getByTestId("export-progress-spinner-exp-1")).toBeTruthy();
    expect(queryByTestId("export-download-exp-1")).toBeNull();
    expect(queryByTestId("export-render-pptx-exp-1")).toBeNull();
  });

  it("renders a spinner while rendering", () => {
    stubs.poll = pollRow("rendering");
    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(getByTestId("export-progress-spinner-exp-1")).toBeTruthy();
    expect(queryByTestId("export-download-exp-1")).toBeNull();
  });

  it("renders the label so simultaneous rows are distinguishable", () => {
    stubs.poll = pollRow("queued");
    const { getByText } = render(
      <ExportProgressRow exportId="exp-1" label="Report (charts)" />,
    );
    expect(getByText("Report (charts)")).toBeTruthy();
  });

  it("renders a Download anchor with the href from getDownloadUrl once ready", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );

    const link = getByTestId("export-download-exp-1");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/api/exports/reports/exp-1/download");
    expect(link.hasAttribute("download")).toBe(true);
    expect(queryByTestId("export-progress-spinner-exp-1")).toBeNull();
  });

  it("only enables the download query once the status is ready", () => {
    stubs.poll = pollRow("rendering");
    render(<ExportProgressRow exportId="exp-1" label="Report" />);
    expect(captured.downloadOptions?.enabled).toBe(false);

    cleanup();
    stubs.poll = pollRow("ready");
    render(<ExportProgressRow exportId="exp-1" label="Report" />);
    expect(captured.downloadOptions?.enabled).toBe(true);
  });

  it("renders a Generate PowerPoint button beside Download on a ready row", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    const { getByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(getByTestId("export-render-pptx-exp-1").textContent).toContain(
      "Generate PowerPoint",
    );
  });

  it("clicking Generate PowerPoint calls renderPptx and shows a pending spinner", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );

    fireEvent.click(getByTestId("export-render-pptx-exp-1"));

    expect(renderPptxSpy).toHaveBeenCalledTimes(1);
    expect(renderPptxSpy).toHaveBeenCalledWith({ id: "exp-1" });
    // pptxStatus is still null (poll has not returned) — pending, not idle.
    expect(getByTestId("export-pptx-spinner-exp-1")).toBeTruthy();
    expect(queryByTestId("export-render-pptx-exp-1")).toBeNull();
  });

  it("does NOT poll the pptx status until a PPTX has been requested", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    const { getByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(captured.pptxPollOptions?.enabled).toBe(false);

    fireEvent.click(getByTestId("export-render-pptx-exp-1"));
    expect(captured.pptxPollOptions?.enabled).toBe(true);
  });

  it("renders a SECOND Download button with the pptx href once pptxStatus is ready", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    stubs.pptxPoll = {
      id: "exp-1",
      pptxStatus: "ready",
      pptxFileSizeBytes: 1234,
      pptxErrorMessage: null,
    };
    stubs.pptxDownloadUrl = "/api/exports/reports/exp-1/pptx";

    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );

    const pdfLink = getByTestId("export-download-exp-1");
    const pptxLink = getByTestId("export-download-pptx-exp-1");
    expect(pdfLink.getAttribute("href")).toBe(
      "/api/exports/reports/exp-1/download",
    );
    expect(pptxLink.getAttribute("href")).toBe("/api/exports/reports/exp-1/pptx");
    expect(pptxLink.hasAttribute("download")).toBe(true);
    expect(queryByTestId("export-render-pptx-exp-1")).toBeNull();
    expect(queryByTestId("export-pptx-spinner-exp-1")).toBeNull();
  });

  it("renders the generic message from the poll query on a failed row", () => {
    stubs.poll = pollRow("failed", "Report generation failed. Please try again.");
    const { getByTestId, queryByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );

    expect(getByTestId("export-error-exp-1").textContent).toBe(
      "Report generation failed. Please try again.",
    );
    expect(queryByTestId("export-download-exp-1")).toBeNull();
    expect(queryByTestId("export-progress-spinner-exp-1")).toBeNull();
  });

  it("falls back to a generic message when a failed row has a null errorMessage", () => {
    stubs.poll = pollRow("failed", null);
    const { getByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(getByTestId("export-error-exp-1").textContent).toBe(
      EXPORT_ROW_FAILURE_FALLBACK,
    );
  });

  it("offers Retry PowerPoint and a generic message when the pptx render failed", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    stubs.pptxPoll = {
      id: "exp-1",
      pptxStatus: "failed",
      pptxFileSizeBytes: null,
      pptxErrorMessage: "Report generation failed. Please try again.",
    };
    const { getByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(getByTestId("export-render-pptx-exp-1").textContent).toContain(
      "Retry PowerPoint",
    );
    expect(getByTestId("export-pptx-error-exp-1").textContent).toBe(
      "Report generation failed. Please try again.",
    );
  });

  it("polls at the interval while non-terminal and STOPS (false) once ready or failed", () => {
    stubs.poll = pollRow("queued");
    render(<ExportProgressRow exportId="exp-1" label="Report" />);

    expect(callRefetchInterval(captured.pollOptions, pollRow("queued"))).toBe(
      EXPORT_POLL_INTERVAL_MS,
    );
    expect(callRefetchInterval(captured.pollOptions, pollRow("rendering"))).toBe(
      EXPORT_POLL_INTERVAL_MS,
    );
    expect(callRefetchInterval(captured.pollOptions, pollRow("ready"))).toBe(false);
    expect(callRefetchInterval(captured.pollOptions, pollRow("failed"))).toBe(false);
    // Undefined data (first tick, nothing fetched yet) must keep polling.
    expect(callRefetchInterval(captured.pollOptions, undefined)).toBe(
      EXPORT_POLL_INTERVAL_MS,
    );
  });

  it("stops polling the pptx status once it reaches a terminal state", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    render(<ExportProgressRow exportId="exp-1" label="Report" />);

    const pptx = (s: ExportStatus | null): PptxPollData => ({
      id: "exp-1",
      pptxStatus: s,
      pptxFileSizeBytes: null,
      pptxErrorMessage: null,
    });

    expect(callRefetchInterval(captured.pptxPollOptions, pptx("queued"))).toBe(
      EXPORT_POLL_INTERVAL_MS,
    );
    expect(callRefetchInterval(captured.pptxPollOptions, pptx("ready"))).toBe(false);
    expect(callRefetchInterval(captured.pptxPollOptions, pptx("failed"))).toBe(false);
    // pptxStatus null means "never requested" — NOT terminal.
    expect(callRefetchInterval(captured.pptxPollOptions, pptx(null))).toBe(
      EXPORT_POLL_INTERVAL_MS,
    );
  });

  it("exposes a polite live region announcing the row state", () => {
    stubs.poll = pollRow("ready");
    stubs.downloadUrl = "/api/exports/reports/exp-1/download";
    const { container } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live?.textContent).toContain("Report is ready to download.");
  });

  it("marks the pending spinner aria-busy", () => {
    stubs.poll = pollRow("rendering");
    const { getByTestId } = render(
      <ExportProgressRow exportId="exp-1" label="Report" />,
    );
    expect(
      getByTestId("export-progress-spinner-exp-1").getAttribute("aria-busy"),
    ).toBe("true");
  });
});
