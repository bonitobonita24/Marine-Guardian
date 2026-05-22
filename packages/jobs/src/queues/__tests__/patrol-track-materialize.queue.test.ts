// 5.2b — patrol-track-materialize queue tests.
//
// Verifies enqueuePatrolTrackMaterialize:
//  (1) calls queue.add with name="patrol-track-materialize" and the full payload,
//  (2) sets jobId for deterministic dedupe across rapid re-enqueues
//      (admin tenant-wide fan-out + a sync-driven enqueue racing on the same
//      patrol → second add is silently dropped by BullMQ via jobId match),
//  (3) returns the BullMQ-assigned job id as a string,
//  (4) jobId scopes by (tenantId, patrolId) — userId does NOT affect dedupe
//      (the row identity is what matters, not who triggered the refetch).

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
  enqueuePatrolTrackMaterialize,
  getPatrolTrackMaterializeQueue,
} from "../patrol-track-materialize.queue";
import type { PatrolTrackMaterializeJobPayload } from "../types";
import { QUEUE_NAMES } from "../types";

describe("patrol-track-materialize queue", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetQueue.mockClear();
  });

  it("getPatrolTrackMaterializeQueue requests the PATROL_TRACK_MATERIALIZE queue name", () => {
    getPatrolTrackMaterializeQueue();
    expect(mockGetQueue).toHaveBeenCalledWith(
      QUEUE_NAMES.PATROL_TRACK_MATERIALIZE,
    );
    expect(QUEUE_NAMES.PATROL_TRACK_MATERIALIZE).toBe(
      "patrol-track-materialize",
    );
  });

  it("enqueuePatrolTrackMaterialize calls queue.add with name + payload + dedupe jobId", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-1" });
    const payload: PatrolTrackMaterializeJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-1",
    };

    const jobId = await enqueuePatrolTrackMaterialize(payload);

    expect(jobId).toBe("job-1");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, addedPayload, opts] = mockAdd.mock.calls[0] as [
      string,
      PatrolTrackMaterializeJobPayload,
      { jobId: string },
    ];
    expect(name).toBe("patrol-track-materialize");
    expect(addedPayload).toEqual(payload);
    expect(opts.jobId).toBe("patrol-track-materialize__tenant-a__patrol-1");
  });

  it("enqueuePatrolTrackMaterialize returns empty string when BullMQ omits job.id", async () => {
    mockAdd.mockResolvedValueOnce({ id: undefined });
    const payload: PatrolTrackMaterializeJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-1",
    };
    const jobId = await enqueuePatrolTrackMaterialize(payload);
    expect(jobId).toBe("");
  });

  it("jobId is deterministic for the same (tenantId, patrolId) pair — enables BullMQ dedupe", async () => {
    mockAdd.mockResolvedValue({ id: "job-x" });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-1",
    });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-a",
      // Different userId — should NOT affect jobId; the row identity is what
      // matters, not who triggered the refetch.
      userId: "user-2",
      patrolId: "patrol-1",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).toBe(opts1.jobId);
    expect(opts0.jobId).toBe("patrol-track-materialize__tenant-a__patrol-1");
  });

  it("jobId scopes by tenant — same patrolId across different tenants does NOT collide", async () => {
    mockAdd.mockResolvedValue({ id: "job-y" });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-1",
    });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-b",
      userId: "user-1",
      patrolId: "patrol-1",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).not.toBe(opts1.jobId);
    expect(opts0.jobId).toBe("patrol-track-materialize__tenant-a__patrol-1");
    expect(opts1.jobId).toBe("patrol-track-materialize__tenant-b__patrol-1");
  });

  it("different patrolIds in the same tenant produce distinct jobIds", async () => {
    mockAdd.mockResolvedValue({ id: "job-z" });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-1",
    });
    await enqueuePatrolTrackMaterialize({
      tenantId: "tenant-a",
      userId: "user-1",
      patrolId: "patrol-2",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).not.toBe(opts1.jobId);
  });
});
