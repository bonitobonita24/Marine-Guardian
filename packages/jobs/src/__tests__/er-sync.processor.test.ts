import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { ErSyncJobPayload } from "../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: {
    tenant: { findUnique: vi.fn() },
    eventType: { upsert: vi.fn() },
    subject: { upsert: vi.fn() },
    subjectGroup: { upsert: vi.fn() },
    event: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    patrol: { upsert: vi.fn() },
    patrolSegment: { upsert: vi.fn() },
    observation: { upsert: vi.fn() },
    syncLog: { create: vi.fn(), update: vi.fn() },
  },
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

vi.mock("../queues/alerts.queue", () => ({
  enqueueAlert: vi.fn().mockResolvedValue("alert-job-1"),
}));

const mockErClient = {
  getEventTypes: vi.fn().mockResolvedValue([
    { id: "et-1", value: "poaching", display: "Poaching Report", category: { value: "security" }, default_priority: 200, icon_id: "poaching-icon", schema: {} },
  ]),
  getSubjects: vi.fn().mockResolvedValue([
    { id: "s-1", name: "Ranger Alpha", subject_type: "person", subject_subtype: "ranger", last_position: { latitude: -6.5, longitude: 106.8 }, last_position_date: "2025-01-01T00:00:00Z", additional: {}, subject_group: null },
  ]),
  getEvents: vi.fn().mockResolvedValue([
    { id: "ev-1", serial_number: 1001, title: "Illegal fishing spotted", priority: 200, state: "active", location: { latitude: -6.5, longitude: 106.8 }, reported_by: { name: "Ranger Alpha" }, time: "2025-01-01T12:00:00Z", event_type: "poaching", event_details: {}, notes: [] },
  ]),
  getPatrols: vi.fn().mockResolvedValue([
    { id: "p-1", serial_number: 501, title: "Morning patrol", patrol_type: "seaborne", state: "done", start_time: "2025-01-01T06:00:00Z", end_time: "2025-01-01T12:00:00Z", patrol_segments: [] },
  ]),
  getObservations: vi.fn().mockResolvedValue([
    { id: "ob-1", location: { latitude: -6.5, longitude: 106.8 }, recorded_at: "2025-01-01T10:00:00Z", source: "direct", additional: {} },
  ]),
};

vi.mock("../lib/earthranger-client", () => {
  return {
    EarthRangerClient: vi.fn().mockImplementation(function () {
      return mockErClient;
    }),
  };
});

import { platformPrisma } from "@marine-guardian/db";
import { processErSync } from "../processors/er-sync.processor";
import { enqueueAlert } from "../queues/alerts.queue";

const mockPrisma = platformPrisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  eventType: { upsert: ReturnType<typeof vi.fn> };
  subject: { upsert: ReturnType<typeof vi.fn> };
  event: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  patrol: { upsert: ReturnType<typeof vi.fn> };
  observation: { upsert: ReturnType<typeof vi.fn> };
  syncLog: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

const mockEnqueueAlert = enqueueAlert as ReturnType<typeof vi.fn>;

function makeJob(overrides: Partial<ErSyncJobPayload> = {}) {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-1",
      syncType: "event_types" as const,
      ...overrides,
    },
  } as unknown as Job<ErSyncJobPayload>;
}

describe("processErSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockTenant = {
      id: "tenant-1",
      earthrangerUrl: "https://er.example.com",
      earthrangerDasToken: "encrypted_token_123",
    };
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    mockPrisma.syncLog.create.mockResolvedValue({ id: "sl-1" });
    mockPrisma.syncLog.update.mockResolvedValue({ id: "sl-1" });
  });

  it("throws if tenant has no ER URL configured", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      earthrangerUrl: null,
      earthrangerDasToken: null,
    });

    await expect(processErSync(makeJob())).rejects.toThrow(
      "EarthRanger not configured",
    );
  });

  it("syncs event_types and creates SyncLog", async () => {
    mockPrisma.eventType.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "event_types" }));

    expect(mockPrisma.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          status: "success",
        }),
      }),
    );
    expect(mockPrisma.eventType.upsert).toHaveBeenCalledTimes(1);
  });

  it("syncs subjects and upserts by compound unique", async () => {
    mockPrisma.subject.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "subjects" }));

    expect(mockPrisma.subject.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_erSubjectId: { tenantId: "tenant-1", erSubjectId: "s-1" } },
      }),
    );
  });

  it("syncs events: creates new event when none exists", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-1", priority: 200 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.event.update).not.toHaveBeenCalled();
  });

  it("syncs events: updates existing event without re-creating", async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ id: "evt-existing" });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1);
  });

  it("enqueues alert evaluation for newly created events only", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-new-1", priority: 200 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAlert).toHaveBeenCalledOnce();
    expect(mockEnqueueAlert).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      alertRuleId: "",
      eventId: "evt-new-1",
      priority: 200,
    });
  });

  it("does NOT enqueue alert evaluation when event already existed (update path)", async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ id: "evt-existing" });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAlert).not.toHaveBeenCalled();
  });

  it("sync succeeds even if enqueueAlert throws (queue unavailable)", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-new-2", priority: 100 });
    mockEnqueueAlert.mockRejectedValueOnce(new Error("Redis connection lost"));

    await expect(
      processErSync(makeJob({ syncType: "events" })),
    ).resolves.not.toThrow();

    expect(mockPrisma.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          status: "success",
        }),
      }),
    );
  });

  it("syncs patrols", async () => {
    mockPrisma.patrol.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "patrols" }));

    expect(mockPrisma.patrol.upsert).toHaveBeenCalledTimes(1);
  });

  it("syncs observations", async () => {
    mockPrisma.observation.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "observations" }));

    expect(mockPrisma.observation.upsert).toHaveBeenCalledTimes(1);
  });

  it("records failed status on SyncLog when API errors", async () => {
    mockErClient.getEventTypes.mockRejectedValueOnce(new Error("API timeout"));

    await expect(processErSync(makeJob())).rejects.toThrow("API timeout");

    expect(mockPrisma.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          status: "failed",
          errorMessage: "API timeout",
        }),
      }),
    );
  });
});
