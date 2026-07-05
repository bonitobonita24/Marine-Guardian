// 5.3b — pdf-render queue tests.
//
// Verifies enqueuePdfRender:
//  (1) calls queue.add with name="pdf-render" and the full payload,
//  (2) sets jobId for deterministic dedupe across rapid re-enqueues
//      (reportExport.create double-fires racing the 5.3d retry button on
//      the same exportId → second add is silently dropped by BullMQ via
//      jobId match — ONLY while the prior job is still active/waiting),
//  (3) returns the BullMQ-assigned job id as a string,
//  (4) jobId scopes by exportId ONLY — tenantId + userId do NOT affect
//      dedupe (exportId is globally unique cuid; the row identity owns
//      this render).
//
// 🔴 2026-07-05 — also verifies the stuck-at-"queued"-forever regression
// fix: a completed/failed job under the same jobId is removed BEFORE add()
// so an explicit retry actually re-runs instead of silently no-op'ing
// against BullMQ's own jobId dedupe (see pdf-render.queue.ts header note).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockGetQueue = vi
  .fn()
  .mockReturnValue({ add: mockAdd, getJob: mockGetJob });

vi.mock("../queue-factory", () => ({
  getQueue: (
    name: string,
  ): { add: typeof mockAdd; getJob: typeof mockGetJob } => {
    mockGetQueue(name);
    return { add: mockAdd, getJob: mockGetJob };
  },
}));

import {
  cancelPdfRender,
  enqueuePdfRender,
  EnqueueTimeoutError,
  getPdfRenderQueue,
} from "../pdf-render.queue";
import type { PdfRenderJobPayload } from "../types";
import { QUEUE_NAMES } from "../types";

describe("pdf-render queue", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetJob.mockReset();
    // Default: no prior job under this id — the common case (first
    // enqueue). Tests that care about a pre-existing job override this.
    mockGetJob.mockResolvedValue(undefined);
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

  // -------------------------------------------------------------------------
  // 🔴 2026-07-05 regression — stuck-at-"queued" forever after Retry.
  // -------------------------------------------------------------------------

  describe("stale terminal job removal (2a fix)", () => {
    it("removes a prior FAILED job under the same jobId before re-adding (retry path actually re-runs)", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      const mockGetState = vi.fn().mockResolvedValue("failed");
      mockGetJob.mockResolvedValueOnce({
        getState: mockGetState,
        remove: mockRemove,
      });
      mockAdd.mockResolvedValueOnce({ id: "job-retry-1" });

      const jobId = await enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-retry-1",
      });

      expect(mockGetJob).toHaveBeenCalledWith("pdf-render__export-retry-1");
      expect(mockGetState).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledTimes(1);
      expect(jobId).toBe("job-retry-1");
      // remove() must happen BEFORE add() so BullMQ's jobId dedupe doesn't
      // see a stale terminal job still occupying the id.
      expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(
        mockAdd.mock.invocationCallOrder[0] ?? Infinity,
      );
    });

    it("removes a prior COMPLETED job under the same jobId before re-adding", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("completed"),
        remove: mockRemove,
      });
      mockAdd.mockResolvedValueOnce({ id: "job-retry-2" });

      await enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-retry-2",
      });

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it("does NOT remove a still-active/waiting job under the same jobId (preserves double-fire dedupe)", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("active"),
        remove: mockRemove,
      });
      mockAdd.mockResolvedValueOnce({ id: "job-active-1" });

      await enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-active-1",
      });

      expect(mockRemove).not.toHaveBeenCalled();
      expect(mockAdd).toHaveBeenCalledTimes(1);
    });

    it("proceeds with add() when no prior job exists under the jobId (first enqueue, unchanged behavior)", async () => {
      mockGetJob.mockResolvedValueOnce(undefined);
      mockAdd.mockResolvedValueOnce({ id: "job-fresh-1" });

      const jobId = await enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-fresh-1",
      });

      expect(jobId).toBe("job-fresh-1");
      expect(mockAdd).toHaveBeenCalledTimes(1);
    });

    it("proceeds with add() even when getJob() throws (best-effort, never blocks enqueue)", async () => {
      mockGetJob.mockRejectedValueOnce(new Error("Valkey blip"));
      mockAdd.mockResolvedValueOnce({ id: "job-degraded-1" });

      const jobId = await enqueuePdfRender({
        tenantId: "tenant-a",
        userId: "user-1",
        exportId: "export-degraded-1",
      });

      expect(jobId).toBe("job-degraded-1");
      expect(mockAdd).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------
  // cancelPdfRender — Exports page "Stop"/"Delete" queue cleanup.
  // ---------------------------------------------------------------------

  describe("cancelPdfRender", () => {
    it("removes a WAITING job under the export's jobId", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("waiting"),
        remove: mockRemove,
      });

      await cancelPdfRender("export-cancel-1");

      expect(mockGetJob).toHaveBeenCalledWith("pdf-render__export-cancel-1");
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it("does NOT remove an ACTIVE job (worker holds the lock) — no-op, never throws", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockGetJob.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("active"),
        remove: mockRemove,
      });

      await expect(cancelPdfRender("export-cancel-2")).resolves.toBeUndefined();
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it("is a no-op when no job exists under the id (already terminal/never enqueued)", async () => {
      mockGetJob.mockResolvedValueOnce(undefined);

      await expect(cancelPdfRender("export-cancel-3")).resolves.toBeUndefined();
    });

    it("swallows a getJob() failure — never throws (best-effort)", async () => {
      mockGetJob.mockRejectedValueOnce(new Error("Valkey blip"));

      await expect(cancelPdfRender("export-cancel-4")).resolves.toBeUndefined();
    });

    it("swallows a job.remove() failure — never throws (best-effort)", async () => {
      const mockRemove = vi.fn().mockRejectedValue(new Error("locked"));
      mockGetJob.mockResolvedValueOnce({
        getState: vi.fn().mockResolvedValue("waiting"),
        remove: mockRemove,
      });

      await expect(cancelPdfRender("export-cancel-5")).resolves.toBeUndefined();
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });
});
