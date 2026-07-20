// municipality-assign queue tests.
//
// 🔴 2026-07-20 regression suite for the "re-enqueue silently no-ops" defect.
//
// enqueueMunicipalityAssign uses a DETERMINISTIC jobId
// (`municipality-assign__{tenantId}__{entity}__{id}`) so that rapid duplicate
// enqueues for the same row collapse to a single unit of work. That dedupe is
// deliberate and must be preserved. BUT BullMQ applies jobId dedupe REGARDLESS
// of the existing job's state: with `removeOnComplete: { count: 1000 }`
// (queue-factory.ts), a COMPLETED job lingers under that id and a later
// `queue.add()` silently returns the stale terminal job WITHOUT scheduling any
// new execution — while still resolving successfully, so the caller believes
// it worked.
//
// User-visible consequence: "Clear municipality override" (event.ts +
// patrol.ts) drops the manual lock and re-enqueues, expecting automatic
// re-attribution. The add() was dropped, the processor never ran again, and
// the row stayed frozen at its old value forever.
//
// These tests pin BOTH directions:
//   - a re-enqueue after a TERMINAL (completed/failed) job must actually run,
//   - a re-enqueue while a job is still PENDING (waiting/active/delayed) must
//     still dedupe and NOT create redundant work.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockGetQueue = vi.fn();

vi.mock("../queue-factory", () => ({
  getQueue: (name: string): unknown => {
    mockGetQueue(name);
    return { add: mockAdd, getJob: mockGetJob };
  },
}));

import {
  enqueueMunicipalityAssign,
  getMunicipalityAssignQueue,
} from "../municipality-assign.queue";
import type { MunicipalityAssignJobPayload } from "../types";
import { QUEUE_NAMES } from "../types";

const PAYLOAD: MunicipalityAssignJobPayload = {
  tenantId: "tenant-a",
  userId: "user-1",
  entity: "event",
  id: "evt-1",
};

const EXPECTED_JOB_ID = "municipality-assign__tenant-a__event__evt-1";

/** Builds a fake BullMQ Job stub reporting `state`. */
function jobInState(state: string): {
  getState: () => Promise<string>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    getState: () => Promise.resolve(state),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("municipality-assign queue", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetJob.mockReset();
    mockGetQueue.mockClear();
    mockAdd.mockResolvedValue({ id: EXPECTED_JOB_ID });
    // Default: no prior job under this id.
    mockGetJob.mockResolvedValue(undefined);
  });

  it("getMunicipalityAssignQueue requests the MUNICIPALITY_ASSIGN queue name", () => {
    getMunicipalityAssignQueue();
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.MUNICIPALITY_ASSIGN);
    expect(QUEUE_NAMES.MUNICIPALITY_ASSIGN).toBe("municipality-assign");
  });

  it("calls queue.add with name + payload + deterministic dedupe jobId", async () => {
    const jobId = await enqueueMunicipalityAssign(PAYLOAD);

    expect(jobId).toBe(EXPECTED_JOB_ID);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, addedPayload, opts] = mockAdd.mock.calls[0] as [
      string,
      MunicipalityAssignJobPayload,
      { jobId: string },
    ];
    expect(name).toBe("municipality-assign:event");
    expect(addedPayload).toEqual(PAYLOAD);
    expect(opts.jobId).toBe(EXPECTED_JOB_ID);
  });

  // ── The regression: re-enqueue after the prior job already finished ──
  //
  // This is the test that FAILS before the fix: without removeStaleTerminalJob
  // the completed job is never cleared, so BullMQ drops the add() and the
  // processor never runs a second time.

  it("🔴 removes a COMPLETED job under the same id before re-adding, so the processor actually runs again", async () => {
    const stale = jobInState("completed");
    mockGetJob.mockResolvedValue(stale);

    await enqueueMunicipalityAssign(PAYLOAD);

    expect(mockGetJob).toHaveBeenCalledWith(EXPECTED_JOB_ID);
    expect(stale.remove).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    // Order matters: the stale job must be gone BEFORE add(), otherwise
    // BullMQ's jobId dedupe drops the new job.
    expect(stale.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdd.mock.invocationCallOrder[0] as number,
    );
  });

  it("🔴 removes a FAILED job under the same id before re-adding", async () => {
    const stale = jobInState("failed");
    mockGetJob.mockResolvedValue(stale);

    await enqueueMunicipalityAssign(PAYLOAD);

    expect(stale.remove).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  // ── The property we must NOT break: pending-work dedupe ──

  it.each(["waiting", "active", "delayed", "prioritized", "waiting-children"])(
    "preserves dedupe: does NOT remove a job in %s state (no redundant work)",
    async (state) => {
      const pending = jobInState(state);
      mockGetJob.mockResolvedValue(pending);

      await enqueueMunicipalityAssign(PAYLOAD);

      expect(pending.remove).not.toHaveBeenCalled();
      // add() is still called — BullMQ itself collapses it onto the existing
      // job via the jobId, which is exactly the dedupe we want.
      expect(mockAdd).toHaveBeenCalledTimes(1);
      const opts = mockAdd.mock.calls[0]?.[2] as { jobId: string };
      expect(opts.jobId).toBe(EXPECTED_JOB_ID);
    },
  );

  it("rapid duplicate enqueues while pending keep the SAME jobId (BullMQ collapses them)", async () => {
    mockGetJob.mockResolvedValue(jobInState("waiting"));

    await enqueueMunicipalityAssign(PAYLOAD);
    await enqueueMunicipalityAssign({ ...PAYLOAD, userId: "someone-else" });

    const ids = mockAdd.mock.calls.map(
      (c) => (c[2] as { jobId: string }).jobId,
    );
    expect(ids).toEqual([EXPECTED_JOB_ID, EXPECTED_JOB_ID]);
  });

  it("jobId is per-row: different entity/id produce different jobIds", async () => {
    await enqueueMunicipalityAssign(PAYLOAD);
    await enqueueMunicipalityAssign({ ...PAYLOAD, entity: "patrol", id: "p-9" });

    const ids = mockAdd.mock.calls.map(
      (c) => (c[2] as { jobId: string }).jobId,
    );
    expect(ids[0]).toBe(EXPECTED_JOB_ID);
    expect(ids[1]).toBe("municipality-assign__tenant-a__patrol__p-9");
  });

  // ── Best-effort: a Valkey hiccup in the cleanup must not block the add ──

  it("still enqueues when the stale-job lookup throws (best-effort cleanup)", async () => {
    mockGetJob.mockRejectedValue(new Error("valkey down"));

    const jobId = await enqueueMunicipalityAssign(PAYLOAD);

    expect(jobId).toBe(EXPECTED_JOB_ID);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});
