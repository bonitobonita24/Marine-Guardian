// 5.1c — area-rederive worker tests.
//
// Verifies the worker factory registers with BullMQ correctly:
//  (1) queue name = "area-rederive" (QUEUE_NAMES.AREA_REDERIVE),
//  (2) limiter = { max: 50, duration: 1000 } per v2 spec L545,
//  (3) concurrency = AREA_REDERIVE_CONCURRENCY constant (10),
//  (4) processor = processAreaRederive (the imported handler),
//  (5) connection is provided via getConnection().
//
// Mocks the BullMQ Worker constructor; assertions verify the third
// constructor arg (worker options).

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() factories are hoisted to top-of-file. References to outer
// const/let trigger TDZ ReferenceError at import time. Use vi.hoisted()
// so mockWorkerCtor exists before the factory runs.
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

vi.mock("../../processors/area-rederive.processor", () => ({
  processAreaRederive: mockProcessor,
}));

import {
  startAreaRederiveWorker,
  AREA_REDERIVE_LIMITER,
  AREA_REDERIVE_CONCURRENCY,
} from "../area-rederive.worker";
import { QUEUE_NAMES } from "../../queues/types";
import { processAreaRederive } from "../../processors/area-rederive.processor";

// Cast helper for typing the captured Worker constructor args.
type WorkerCtorArgs = [
  string,
  unknown,
  {
    connection: unknown;
    concurrency: number;
    autorun: boolean;
    limiter?: { max: number; duration: number };
  },
];

describe("startAreaRederiveWorker", () => {
  beforeEach(() => {
    mockWorkerCtor.mockReset();
    // Worker is invoked as `new Worker(...)`. Use a regular function (not
    // arrow) so vitest's vi.fn().mockImplementation accepts it as a
    // constructor. The fake instance carries .on() so createWorker's
    // worker.on('failed', ...) + worker.on('completed', ...) calls in
    // base-worker.ts don't throw.
    mockWorkerCtor.mockImplementation(function workerCtor(this: object) {
      Object.assign(this, { on: vi.fn().mockReturnThis() });
    });
  });

  it("registers worker with queue name 'area-rederive'", () => {
    startAreaRederiveWorker();
    expect(mockWorkerCtor).toHaveBeenCalledTimes(1);
    const [queueName] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(queueName).toBe(QUEUE_NAMES.AREA_REDERIVE);
    expect(queueName).toBe("area-rederive");
  });

  it("registers worker with limiter { max: 50, duration: 1000 } per v2 L545", () => {
    startAreaRederiveWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.limiter).toEqual({ max: 50, duration: 1000 });
  });

  it("AREA_REDERIVE_LIMITER constant matches v2 spec L545 ceiling", () => {
    expect(AREA_REDERIVE_LIMITER.max).toBe(50);
    expect(AREA_REDERIVE_LIMITER.duration).toBe(1000);
  });

  it("registers worker with concurrency = AREA_REDERIVE_CONCURRENCY (10)", () => {
    startAreaRederiveWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.concurrency).toBe(AREA_REDERIVE_CONCURRENCY);
    expect(AREA_REDERIVE_CONCURRENCY).toBe(10);
  });

  it("registers worker with the processAreaRederive processor", () => {
    startAreaRederiveWorker();
    const [, processor] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(processor).toBe(processAreaRederive);
  });

  it("registers worker with autorun=true", () => {
    startAreaRederiveWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.autorun).toBe(true);
  });

  it("provides a connection object to the Worker constructor", () => {
    startAreaRederiveWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.connection).toBeDefined();
    expect(opts.connection).toEqual({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });
});
