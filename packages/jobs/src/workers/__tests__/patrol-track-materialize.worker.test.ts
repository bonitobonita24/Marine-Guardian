// 5.2b — patrol-track-materialize worker tests.
//
// Verifies the worker factory registers with BullMQ correctly:
//  (1) queue name = "patrol-track-materialize" (QUEUE_NAMES.PATROL_TRACK_MATERIALIZE),
//  (2) limiter = { max: 20, duration: 1000 } — conservative ceiling for the
//      ER tracks endpoint (typically stricter rate limits than the
//      events/patrols endpoints — see DECISIONS_LOG entry for 5.2b),
//  (3) concurrency = PATROL_TRACK_MATERIALIZE_CONCURRENCY constant (5),
//  (4) processor = processPatrolTrackMaterialize (the imported handler),
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

vi.mock("../../processors/patrol-track-materialize.processor", () => ({
  processPatrolTrackMaterialize: mockProcessor,
}));

import {
  startPatrolTrackMaterializeWorker,
  PATROL_TRACK_MATERIALIZE_LIMITER,
  PATROL_TRACK_MATERIALIZE_CONCURRENCY,
} from "../patrol-track-materialize.worker";
import { QUEUE_NAMES } from "../../queues/types";
import { processPatrolTrackMaterialize } from "../../processors/patrol-track-materialize.processor";

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

describe("startPatrolTrackMaterializeWorker", () => {
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

  it("registers worker with queue name 'patrol-track-materialize'", () => {
    startPatrolTrackMaterializeWorker();
    expect(mockWorkerCtor).toHaveBeenCalledTimes(1);
    const [queueName] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(queueName).toBe(QUEUE_NAMES.PATROL_TRACK_MATERIALIZE);
    expect(queueName).toBe("patrol-track-materialize");
  });

  it("registers worker with limiter { max: 20, duration: 1000 } per 5.2b conservative ER tracks endpoint budget", () => {
    startPatrolTrackMaterializeWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.limiter).toEqual({ max: 20, duration: 1000 });
  });

  it("PATROL_TRACK_MATERIALIZE_LIMITER constant matches the 20/sec ceiling", () => {
    expect(PATROL_TRACK_MATERIALIZE_LIMITER.max).toBe(20);
    expect(PATROL_TRACK_MATERIALIZE_LIMITER.duration).toBe(1000);
  });

  it("registers worker with concurrency = PATROL_TRACK_MATERIALIZE_CONCURRENCY (5)", () => {
    startPatrolTrackMaterializeWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.concurrency).toBe(PATROL_TRACK_MATERIALIZE_CONCURRENCY);
    expect(PATROL_TRACK_MATERIALIZE_CONCURRENCY).toBe(5);
  });

  it("registers worker with the processPatrolTrackMaterialize processor", () => {
    startPatrolTrackMaterializeWorker();
    const [, processor] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(processor).toBe(processPatrolTrackMaterialize);
  });

  it("registers worker with autorun=true", () => {
    startPatrolTrackMaterializeWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.autorun).toBe(true);
  });

  it("provides a connection object to the Worker constructor", () => {
    startPatrolTrackMaterializeWorker();
    const [, , opts] = mockWorkerCtor.mock.calls[0] as WorkerCtorArgs;
    expect(opts.connection).toBeDefined();
    expect(opts.connection).toEqual({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });
});
