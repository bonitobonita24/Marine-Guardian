// 5.1c — area-rederive queue tests.
//
// Verifies enqueueAreaRederive:
//  (1) calls queue.add with name="area-rederive:{entity}" and the full payload,
//  (2) sets jobId for deterministic dedupe across rapid re-enqueues
//      (boundary update + sync change racing on the same row → second add
//      is silently dropped by BullMQ via jobId match),
//  (3) returns the BullMQ-assigned job id as a string,
//  (4) works for all three entity types.

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
  enqueueAreaRederive,
  getAreaRederiveQueue,
} from "../area-rederive.queue";
import type { AreaRederiveJobPayload } from "../types";
import { QUEUE_NAMES } from "../types";

describe("area-rederive queue", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockGetQueue.mockClear();
  });

  it("getAreaRederiveQueue requests the AREA_REDERIVE queue name", () => {
    getAreaRederiveQueue();
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.AREA_REDERIVE);
    expect(QUEUE_NAMES.AREA_REDERIVE).toBe("area-rederive");
  });

  it("enqueueAreaRederive calls queue.add with name + payload + dedupe jobId", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-1" });
    const payload: AreaRederiveJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      entity: "event",
      id: "evt-1",
    };

    const jobId = await enqueueAreaRederive(payload);

    expect(jobId).toBe("job-1");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, addedPayload, opts] = mockAdd.mock.calls[0] as [
      string,
      AreaRederiveJobPayload,
      { jobId: string },
    ];
    expect(name).toBe("area-rederive:event");
    expect(addedPayload).toEqual(payload);
    expect(opts.jobId).toBe("area-rederive:tenant-a:event:evt-1");
  });

  it("enqueueAreaRederive returns empty string when BullMQ omits job.id", async () => {
    mockAdd.mockResolvedValueOnce({ id: undefined });
    const payload: AreaRederiveJobPayload = {
      tenantId: "tenant-a",
      userId: "user-1",
      entity: "event",
      id: "evt-1",
    };
    const jobId = await enqueueAreaRederive(payload);
    expect(jobId).toBe("");
  });

  it("enqueueAreaRederive supports entity='patrol'", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-p" });
    await enqueueAreaRederive({
      tenantId: "tenant-a",
      userId: "user-1",
      entity: "patrol",
      id: "patrol-9",
    });
    const [name, , opts] = mockAdd.mock.calls[0] as [
      string,
      unknown,
      { jobId: string },
    ];
    expect(name).toBe("area-rederive:patrol");
    expect(opts.jobId).toBe("area-rederive:tenant-a:patrol:patrol-9");
  });

  it("enqueueAreaRederive supports entity='fuelEntry'", async () => {
    mockAdd.mockResolvedValueOnce({ id: "job-f" });
    await enqueueAreaRederive({
      tenantId: "tenant-a",
      userId: "user-1",
      entity: "fuelEntry",
      id: "fuel-77",
    });
    const [name, , opts] = mockAdd.mock.calls[0] as [
      string,
      unknown,
      { jobId: string },
    ];
    expect(name).toBe("area-rederive:fuelEntry");
    expect(opts.jobId).toBe("area-rederive:tenant-a:fuelEntry:fuel-77");
  });

  it("jobId is deterministic for the same (tenantId, entity, id) triple — enables BullMQ dedupe", async () => {
    mockAdd.mockResolvedValue({ id: "job-x" });
    await enqueueAreaRederive({
      tenantId: "tenant-a",
      userId: "user-1",
      entity: "event",
      id: "evt-1",
    });
    await enqueueAreaRederive({
      tenantId: "tenant-a",
      // Different userId — should NOT affect jobId; the row identity is what
      // matters, not who triggered the re-derive.
      userId: "user-2",
      entity: "event",
      id: "evt-1",
    });

    const calls = mockAdd.mock.calls;
    const opts0 = calls[0]?.[2] as { jobId: string };
    const opts1 = calls[1]?.[2] as { jobId: string };
    expect(opts0.jobId).toBe(opts1.jobId);
    expect(opts0.jobId).toBe("area-rederive:tenant-a:event:evt-1");
  });
});
