// Regression test for the municipality-assign BullMQ lock-duration defect.
//
// MEASURED DEFECT: municipality-assign jobs were observed running ~4min each
// on staging. BullMQ's default lockDuration (30000ms) is far below that, and
// — unlike an IO-bound processor — auto-renewal cannot save it: the
// processor runs synchronous turf geometry that blocks the Node event loop,
// so the renewal timer never fires. Every long job silently lost its lock
// and was re-run from scratch ("Missing lock for job ... moveToFinished").
//
// This test asserts the municipality-assign worker is registered with an
// EXPLICIT lockDuration equal to MUNICIPALITY_ASSIGN_LOCK_DURATION_MS
// (900000ms / 15min — ~3.75x the observed 4min staging worst case), so a
// future edit cannot silently drop back to the BullMQ default.
//
// start-workers.ts runs ALL worker registration (plus DB-backed recurring-
// job bootstrap and process signal handlers) as import-time side effects, so
// every dependency it touches is mocked here rather than letting the module
// reach a real Redis/Postgres connection.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWorkerCtor, mockConnection } = vi.hoisted(() => ({
  mockWorkerCtor: vi.fn(),
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

vi.mock("../connection", () => ({
  getConnection: vi.fn().mockReturnValue(mockConnection),
}));

// start-workers.ts calls platformPrisma.tenantErConnection.findMany() at
// import time (bootstrapRecurringErSync) — stub it to resolve immediately
// with no connections so the bootstrap does nothing and no real DB is hit.
vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    tenantErConnection: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Recurring-job scheduling helpers touch BullMQ repeatables directly against
// a Queue instance — mock them to no-ops, they are exercised by their own
// queue-level tests, not this worker-registration test.
vi.mock("../queues/er-sync.queue", () => ({
  scheduleRecurringErSync: vi.fn().mockResolvedValue(undefined),
  removeRecurringErSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../queues/export-janitor.queue", () => ({
  scheduleRecurringExportJanitor: vi.fn().mockResolvedValue(undefined),
}));

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

describe("start-workers.ts — municipality-assign lock duration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockWorkerCtor.mockReset();
    mockWorkerCtor.mockImplementation(function workerCtor(this: object) {
      Object.assign(this, { on: vi.fn().mockReturnThis() });
    });
  });

  it("registers the municipality-assign worker with an explicit lockDuration equal to MUNICIPALITY_ASSIGN_LOCK_DURATION_MS", async () => {
    const startWorkers = await import("../start-workers");

    const call = mockWorkerCtor.mock.calls.find(
      (c) => (c as WorkerCtorArgs)[0] === "municipality-assign",
    ) as WorkerCtorArgs | undefined;

    expect(call).toBeDefined();
    const [, , opts] = call as WorkerCtorArgs;

    expect(opts.lockDuration).toBe(
      startWorkers.MUNICIPALITY_ASSIGN_LOCK_DURATION_MS,
    );
    // Sanity-anchor the constant itself so a future edit that shrinks it
    // back toward the BullMQ default (30000ms) fails loudly here rather
    // than silently reintroducing the mid-render lock-loss defect. 15
    // minutes gives ~3.75x headroom over the observed ~4min staging worst
    // case.
    expect(startWorkers.MUNICIPALITY_ASSIGN_LOCK_DURATION_MS).toBe(900_000);
  });

  it("does NOT rely on the BullMQ default lockDuration (30000ms) for municipality-assign", async () => {
    await import("../start-workers");

    const call = mockWorkerCtor.mock.calls.find(
      (c) => (c as WorkerCtorArgs)[0] === "municipality-assign",
    ) as WorkerCtorArgs | undefined;

    const [, , opts] = call as WorkerCtorArgs;
    expect(opts.lockDuration).toBeGreaterThan(30_000);
  });

  // CROSS-QUEUE STARVATION regression (2026-07): municipality-assign,
  // area-rederive and patrol-track-materialize all run in ONE process / ONE
  // event loop. When municipality-assign's synchronous turf geometry blocks
  // the loop, the lock-renewal timers of its SIBLINGS are starved too — so
  // their 30s-default locks expired and BullMQ re-ran them from scratch
  // (prod observed a patrol-track-materialize job re-running 16×). These two
  // siblings MUST carry an explicit lockDuration that survives a full
  // municipality-assign stall, or the re-run spiral returns.
  it.each([
    ["area-rederive"],
    ["patrol-track-materialize"],
    ["er-sync"],
    ["alerts"],
    ["email"],
    ["maintenance"],
    ["export-janitor"],
  ])(
    "registers the %s worker with an explicit lockDuration that survives a sibling municipality-assign event-loop block",
    async (queueName) => {
      const { EVENT_LOOP_BLOCKING_LOCK_DURATION_MS } = await import(
        "../workers/base-worker"
      );
      await import("../start-workers");

      const call = mockWorkerCtor.mock.calls.find(
        (c) => (c as WorkerCtorArgs)[0] === queueName,
      ) as WorkerCtorArgs | undefined;

      expect(call).toBeDefined();
      const [, , opts] = call as WorkerCtorArgs;
      expect(opts.lockDuration).toBe(EVENT_LOOP_BLOCKING_LOCK_DURATION_MS);
      expect(opts.lockDuration).toBeGreaterThan(30_000);
    },
  );

  it("sets EVENT_LOOP_BLOCKING_LOCK_DURATION_MS to the proven 15-minute ceiling", async () => {
    const { EVENT_LOOP_BLOCKING_LOCK_DURATION_MS } = await import(
      "../workers/base-worker"
    );
    expect(EVENT_LOOP_BLOCKING_LOCK_DURATION_MS).toBe(900_000);
  });
});
