/**
 * Tests for the er-sync queue helpers — ops-milestone-1.
 *
 * Validates:
 *   - scheduleRecurringErSync always embeds a `since` watermark for delta types
 *     when a prior successful sync exists (q-ops-06).
 *   - scheduleRecurringErSync enforces the minimum 60 000ms interval floor.
 *   - enqueueErSyncWithWatermark computes `since` for delta types, passes
 *     undefined for full-sync types (subjects/event_types).
 *   - removeRecurringErSync removes the BullMQ repeatables.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Queue mock ───────────────────────────────────────────────────────────────
// We mock the queue-factory module directly rather than the BullMQ constructor
// because queue-factory caches Queue instances in a module-level Map — once
// instantiated by the processor tests, `new Queue(...)` is never called again
// in the same Vitest worker. Mocking the factory bypasses the cache entirely.
const mockQueueAdd = vi.fn().mockResolvedValue({ id: "job-1" });
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);

const mockQueueInstance = {
  add: mockQueueAdd,
  removeJobScheduler: mockRemoveJobScheduler,
};

vi.mock("../queues/queue-factory", () => ({
  getQueue: vi.fn(() => mockQueueInstance),
  closeAllQueues: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(),
  Worker: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

// ── Watermark mock ───────────────────────────────────────────────────────────
const mockGetWatermark = vi.fn<() => Promise<string | undefined>>();

vi.mock("../lib/er-sync-watermark", () => ({
  getWatermark: (...args: Parameters<typeof mockGetWatermark>) =>
    mockGetWatermark(...args),
}));

import {
  scheduleRecurringErSync,
  enqueueErSyncWithWatermark,
  removeRecurringErSync,
} from "../queues/er-sync.queue";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect all `data` payloads passed to queue.add() across all calls.
 */
function capturePayloads(): Array<Record<string, unknown>> {
  return mockQueueAdd.mock.calls.map(
    (call) => call[1] as Record<string, unknown>,
  );
}

describe("scheduleRecurringErSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: watermark exists for all delta types
    mockGetWatermark.mockResolvedValue("2026-06-21T10:00:00.000Z");
  });

  it("schedules jobs for all 5 sync types", async () => {
    await scheduleRecurringErSync("tenant-1", "system");

    expect(mockQueueAdd).toHaveBeenCalledTimes(5);
    const names = mockQueueAdd.mock.calls.map((c) => c[0] as string);
    expect(names).toContain("er-sync:recurring:events");
    expect(names).toContain("er-sync:recurring:patrols");
    expect(names).toContain("er-sync:recurring:observations");
    expect(names).toContain("er-sync:recurring:subjects");
    expect(names).toContain("er-sync:recurring:event_types");
  });

  it("q-ops-06: embeds since watermark for delta types (events/patrols/observations)", async () => {
    const watermark = "2026-06-21T10:00:00.000Z";
    mockGetWatermark.mockResolvedValue(watermark);

    await scheduleRecurringErSync("tenant-1", "system");

    const payloads = capturePayloads();
    const eventsPayload = payloads.find((p) => p.syncType === "events");
    const patrolsPayload = payloads.find((p) => p.syncType === "patrols");
    const observationsPayload = payloads.find((p) => p.syncType === "observations");

    expect(eventsPayload?.since).toBe(watermark);
    expect(patrolsPayload?.since).toBe(watermark);
    expect(observationsPayload?.since).toBe(watermark);
  });

  it("passes since=undefined for full-sync types (subjects/event_types)", async () => {
    await scheduleRecurringErSync("tenant-1", "system");

    const payloads = capturePayloads();
    const subjectsPayload = payloads.find((p) => p.syncType === "subjects");
    const eventTypesPayload = payloads.find((p) => p.syncType === "event_types");

    // subjects and event_types always full-pull (no updated_since support)
    expect(subjectsPayload?.since).toBeUndefined();
    expect(eventTypesPayload?.since).toBeUndefined();
  });

  it("first-run case: since=undefined for delta types when no prior sync exists", async () => {
    // No prior sync → watermark is undefined. This is the ONE permitted full-pull
    // per q-ops-07 (initial backfill on the very first repeatable firing).
    mockGetWatermark.mockResolvedValue(undefined);

    await scheduleRecurringErSync("tenant-1", "system");

    const payloads = capturePayloads();
    const eventsPayload = payloads.find((p) => p.syncType === "events");
    // First run — undefined is acceptable (initial backfill case)
    expect(eventsPayload?.since).toBeUndefined();
  });

  it("uses the provided intervalMs in the repeat option", async () => {
    await scheduleRecurringErSync("tenant-1", "system", 120_000);

    const opts = mockQueueAdd.mock.calls[0]?.[2] as { repeat?: { every: number } };
    expect(opts.repeat?.every).toBe(120_000);
  });

  it("clamps intervalMs to minimum 60_000ms", async () => {
    // Caller passes 10_000ms (below minimum 1 minute)
    await scheduleRecurringErSync("tenant-1", "system", 10_000);

    const opts = mockQueueAdd.mock.calls[0]?.[2] as { repeat?: { every: number } };
    expect(opts.repeat?.every).toBe(60_000);
  });

  it("uses default intervalMs of 300_000 (5 min) when not specified", async () => {
    await scheduleRecurringErSync("tenant-1", "system");

    const opts = mockQueueAdd.mock.calls[0]?.[2] as { repeat?: { every: number } };
    expect(opts.repeat?.every).toBe(300_000);
  });

  it("uses stable jobId for de-duplication (BullMQ upsert semantics)", async () => {
    await scheduleRecurringErSync("tenant-abc", "system");

    const jobIds = mockQueueAdd.mock.calls.map(
      (c) => (c[2] as { jobId: string }).jobId,
    );
    expect(jobIds).toContain("er-sync__recurring__tenant-abc__events");
    expect(jobIds).toContain("er-sync__recurring__tenant-abc__patrols");
  });

  it("queries watermark once per delta sync type (3 calls for events/patrols/observations)", async () => {
    await scheduleRecurringErSync("tenant-1", "system");

    // Only delta types (events, patrols, observations) should query the watermark
    expect(mockGetWatermark).toHaveBeenCalledTimes(3);
  });
});

describe("enqueueErSyncWithWatermark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWatermark.mockResolvedValue("2026-06-21T10:00:00.000Z");
  });

  it("q-ops-06: computes since from watermark for events", async () => {
    const watermark = "2026-06-21T10:00:00.000Z";
    mockGetWatermark.mockResolvedValue(watermark);

    await enqueueErSyncWithWatermark("tenant-1", "user-1", "events");

    const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.since).toBe(watermark);
  });

  it("q-ops-06: computes since from watermark for patrols", async () => {
    const watermark = "2026-06-20T08:00:00.000Z";
    mockGetWatermark.mockResolvedValue(watermark);

    await enqueueErSyncWithWatermark("tenant-1", "user-1", "patrols");

    const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.since).toBe(watermark);
  });

  it("passes since=undefined for subjects (full-sync type)", async () => {
    await enqueueErSyncWithWatermark("tenant-1", "user-1", "subjects");

    const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.since).toBeUndefined();
    // Should NOT have called getWatermark for a full-sync type
    expect(mockGetWatermark).not.toHaveBeenCalled();
  });

  it("passes since=undefined for event_types (full-sync type)", async () => {
    await enqueueErSyncWithWatermark("tenant-1", "user-1", "event_types");

    const payload = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.since).toBeUndefined();
    expect(mockGetWatermark).not.toHaveBeenCalled();
  });

  it("returns the job id from the queue", async () => {
    mockQueueAdd.mockResolvedValueOnce({ id: "test-job-123" });

    const id = await enqueueErSyncWithWatermark("tenant-1", "user-1", "events");

    expect(id).toBe("test-job-123");
  });
});

describe("removeRecurringErSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveJobScheduler.mockResolvedValue(true);
  });

  it("calls removeJobScheduler for all 5 sync types with the stable scheduler id", async () => {
    await removeRecurringErSync("tenant-1");

    // All 5 sync types should be removed (events, patrols, observations, subjects, event_types)
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(5);
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(
      "er-sync__recurring__tenant-1__events",
    );
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(
      "er-sync__recurring__tenant-1__patrols",
    );
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(
      "er-sync__recurring__tenant-1__observations",
    );
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(
      "er-sync__recurring__tenant-1__subjects",
    );
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(
      "er-sync__recurring__tenant-1__event_types",
    );
  });

  it("does not affect other tenants — scheduler ids are tenant-scoped", async () => {
    await removeRecurringErSync("tenant-1");

    // All calls should be scoped to tenant-1 only
    const callArgs = mockRemoveJobScheduler.mock.calls.map((c) => c[0] as string);
    expect(callArgs.every((id) => id.includes("tenant-1"))).toBe(true);
  });

  it("is idempotent — removeJobScheduler with non-existent id returns false (not throws)", async () => {
    mockRemoveJobScheduler.mockResolvedValue(false);

    // Should not throw even if scheduler doesn't exist
    await expect(removeRecurringErSync("tenant-missing")).resolves.toBeUndefined();
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(5);
  });
});
