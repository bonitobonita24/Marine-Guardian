// 5.3b — pdf-render worker tests.
//
// Verifies the worker factory registers with BullMQ correctly:
//  (1) queue name = "pdf-render" (QUEUE_NAMES.PDF_RENDER),
//  (2) limiter = { max: 5, duration: 1000 } — per DECISIONS_LOG
//      "Puppeteer Concurrency + Rate Limiter" lock (5/sec smooths bursty
//      admin "rebuild all reports" actions),
//  (3) concurrency = PDF_RENDER_CONCURRENCY constant (2) — caps two
//      concurrent Chromium renders per worker container (~300-500MB
//      resident each) to avoid OOM on smaller staging/prod hosts,
//  (4) processor = processPdfRender (the imported handler),
//  (5) connection is provided via getConnection().

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWorkerCtor, mockProcessor, mockConnection } = vi.hoisted(() => ({
  mockWorkerCtor: vi.fn(),
  mockProcessor: vi.fn(),
  mockConnection: {
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  },
}));

vi.mock("bullmq", () => ({
  Worker: mockWorkerCtor,
  Queue: vi.fn(),
}));

vi.mock("../../connection", () => ({
  getConnection: vi.fn().mockReturnValue(mockConnection),
}));

vi.mock("../../processors/pdf-render.processor", () => ({
  processPdfRender: mockProcessor,
}));

import {
  startPdfRenderWorker,
  PDF_RENDER_LIMITER,
  PDF_RENDER_CONCURRENCY,
  PDF_RENDER_LOCK_DURATION_MS,
} from "../pdf-render.worker";
import { QUEUE_NAMES } from "../../queues/types";
import { processPdfRender } from "../../processors/pdf-render.processor";

type WorkerCtorArgs = [
  string,
  unknown,
  {
    connection: unknown;
    concurrency: number;
    autorun: boolean;
    limiter?: { max: number; duration: number };
    lockDuration?: number;
  },
];

describe("startPdfRenderWorker", () => {
  beforeEach(() => {
    mockWorkerCtor.mockReset();
    mockWorkerCtor.mockImplementation(function workerCtor(this: object) {
      Object.assign(this, { on: vi.fn().mockReturnThis() });
    });
  });

  it("registers worker with queue name 'pdf-render'", () => {
    startPdfRenderWorker();
    expect(mockWorkerCtor).toHaveBeenCalledTimes(1);
    const [queueName] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(queueName).toBe(QUEUE_NAMES.PDF_RENDER);
    expect(queueName).toBe("pdf-render");
  });

  it("registers worker with limiter { max: 5, duration: 1000 } per DECISIONS_LOG Puppeteer lock", () => {
    startPdfRenderWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.limiter).toEqual({ max: 5, duration: 1000 });
  });

  it("PDF_RENDER_LIMITER constant matches the 5/sec ceiling", () => {
    expect(PDF_RENDER_LIMITER.max).toBe(5);
    expect(PDF_RENDER_LIMITER.duration).toBe(1000);
  });

  it("registers worker with concurrency = PDF_RENDER_CONCURRENCY (2)", () => {
    startPdfRenderWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.concurrency).toBe(PDF_RENDER_CONCURRENCY);
    expect(PDF_RENDER_CONCURRENCY).toBe(2);
  });

  it("registers worker with the processPdfRender processor", () => {
    startPdfRenderWorker();
    const [, processor] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(processor).toBe(processPdfRender);
  });

  // 2b — regression: BullMQ's default lockDuration (30000ms) sits well below
  // the pdf-renderer's Puppeteer navigation timeout (raised to 120000ms —
  // see deploy/pdf-renderer/src/server.js). This worker must set an explicit
  // lockDuration comfortably above that so a genuinely long-running render
  // is never mistaken for a stalled job mid-render.
  it("registers worker with an explicit lockDuration >= the pdf-renderer nav timeout (120000ms)", () => {
    startPdfRenderWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.lockDuration).toBe(PDF_RENDER_LOCK_DURATION_MS);
    expect(PDF_RENDER_LOCK_DURATION_MS).toBeGreaterThanOrEqual(120_000);
  });

  it("provides a connection object to the Worker constructor", () => {
    startPdfRenderWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.connection).toBeDefined();
    expect(opts.connection).toEqual({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });
});
