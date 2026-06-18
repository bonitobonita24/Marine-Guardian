// 5.3b — pdf-render queue tests.
//
// Verifies enqueuePdfRender:
//  (1) calls queue.add with name="pdf-render" and the full payload,
//  (2) sets jobId for deterministic dedupe across rapid re-enqueues
//      (reportExport.create double-fires racing the 5.3d retry button on
//      the same exportId → second add is silently dropped by BullMQ via
//      jobId match),
//  (3) returns the BullMQ-assigned job id as a string,
//  (4) jobId scopes by exportId ONLY — tenantId + userId do NOT affect
//      dedupe (exportId is globally unique cuid; the row identity owns
//      this render).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockGetQueue = vi.fn().mockReturnValue({ add: mockAdd });

vi.mock("../queue-factory", () => ({
  getQueue: (name: string): { add: typeof mockAdd } => {
    mockGetQueue(name);
    return { add: mockAdd };
  },
}));

import {
  enqueuePdfRender,
  EnqueueTimeoutError,
  getPdfRenderQueue,
} from "../pdf-render.queue";
import type { PdfRenderJobPayload } from "../types";
import { QUEUE_NAMES } from "../types";

describe("pdf-render queue", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetQueue.mockClear();
  });

  it("getPdfRenderQueue requests the PDF_RENDER queue name", () => {
    getPdfRenderQueue();
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.PDF_RENDER);
    expect(QUEUE_NAMES.PDF_RENDER).toBe("pdf-render");
  });

  it("enqueuePdfRender calls queue.add with name + payload + dedupe jobId", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-1" });
    const payload: PdfRenderJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      exportId: "export-cuid-1",
    };

    const jobId = await enqueuePdfRender(payload);

    expect(jobId).toBe("job-1");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, addedPayload, opts] = mockAdd.mock.calls[0] as [
      string,
      PdfRenderJobPayload,
      { jobId: string },
    ];
    expect(name).toBe("pdf-render");
    expect(addedPayload).toEqual(payload);
    expect(opts.jobId).toBe("pdf-render__export-cuid-1");
  });

  it("enqueuePdfRender returns empty string when BullMQ omits job.id", async () => {
    mockAdd.mockResolvedValueOnce({ id: undefined });
    const payload: PdfRenderJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      exportId: "export-cuid-2",
    };
    const jobId = await enqueuePdfRender(payload);
    expect(jobId).toBe("");
  });

  it("jobId is deterministic for the same exportId — enables BullMQ dedupe across retry path", async () => {
    mockAdd.mockResolvedValue({ id: "job-x" });
    await enqueuePdfRender({
      tenantId: "tenant-a",
      userId: "user-1",
      exportId: "export-cuid-3",
    });
    await enqueuePdfRender({
      // Different tenantId AND userId — should NOT affect jobId; exportId
      // is the row identity that owns this render.
      tenantId: "tenant-b",
      userId: "user-2",
      exportId: "export-cuid-3",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).toBe(opts1.jobId);
    expect(opts0.jobId).toBe("pdf-render__export-cuid-3");
  });

  // Regression — Generate Report 524 timeout. The shared Valkey connection
  // uses maxRetriesPerRequest:null, so when Valkey is unreachable queue.add
  // never resolves. enqueuePdfRender must NOT hang forever; it rejects with
  // EnqueueTimeoutError so reportExport.create can degrade gracefully instead
  // of holding the HTTP request open until the proxy 524s.
  it("rejects with EnqueueTimeoutError when queue.add never resolves", async () => {
    vi.useFakeTimers();
    try {
      // Never-resolving add simulates an unreachable Valkey under
      // maxRetriesPerRequest:null (infinite retry, no rejection).
      mockAdd.mockReturnValueOnce(new Promise<never>(() => {}));
      const promise = enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-hang",
      });
      // Attach a rejection handler before advancing timers.
      const assertion = expect(promise).rejects.toBeInstanceOf(
        EnqueueTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("different exportIds produce distinct jobIds", async () => {
    mockAdd.mockResolvedValue({ id: "job-y" });
    await enqueuePdfRender({
      tenantId: "tenant-a",
      userId: "user-1",
      exportId: "export-cuid-a",
    });
    await enqueuePdfRender({
      tenantId: "tenant-a",
      userId: "user-1",
      exportId: "export-cuid-b",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).not.toBe(opts1.jobId);
    expect(opts0.jobId).toBe("pdf-render__export-cuid-a");
    expect(opts1.jobId).toBe("pdf-render__export-cuid-b");
  });
});
