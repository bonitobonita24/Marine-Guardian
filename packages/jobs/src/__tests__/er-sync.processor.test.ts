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
    tenantErConnection: { findUnique: vi.fn() },
    eventType: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    subject: { upsert: vi.fn() },
    subjectGroup: { upsert: vi.fn() },
    event: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    eventRevision: { findMany: vi.fn().mockResolvedValue([]) },
    patrol: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), update: vi.fn() },
    patrolRevision: { findMany: vi.fn().mockResolvedValue([]) },
    patrolSegment: { upsert: vi.fn() },
    observation: { upsert: vi.fn() },
    syncLog: { create: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    knownRanger: { findFirst: vi.fn() },
  },
  decrypt: vi.fn((v: string) => `decrypted_${v}`),
}));

vi.mock("../queues/alerts.queue", () => ({
  enqueueAlert: vi.fn().mockResolvedValue("alert-job-1"),
}));

vi.mock("../queues/area-rederive.queue", () => ({
  enqueueAreaRederive: vi.fn().mockResolvedValue("area-job-1"),
}));

vi.mock("../queues/patrol-track-materialize.queue", () => ({
  enqueuePatrolTrackMaterialize: vi.fn().mockResolvedValue("ptm-job-1"),
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
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";

const mockPrisma = platformPrisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  tenantErConnection: { findUnique: ReturnType<typeof vi.fn> };
  eventType: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  subject: { upsert: ReturnType<typeof vi.fn> };
  event: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  eventRevision: { findMany: ReturnType<typeof vi.fn> };
  patrol: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patrolRevision: { findMany: ReturnType<typeof vi.fn> };
  observation: { upsert: ReturnType<typeof vi.fn> };
  syncLog: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  knownRanger: { findFirst: ReturnType<typeof vi.fn> };
};

const mockEnqueueAlert = enqueueAlert as ReturnType<typeof vi.fn>;
const mockEnqueueAreaRederive = enqueueAreaRederive as ReturnType<typeof vi.fn>;
const mockEnqueuePatrolTrackMaterialize = enqueuePatrolTrackMaterialize as ReturnType<typeof vi.fn>;

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
    // ER creds now live on the canonical TenantErConnection table (the Settings
    // UI writes here). baseUrl is plaintext; apiTokenEnc is decrypted at use.
    const mockErConnection = {
      baseUrl: "https://er.example.com",
      apiTokenEnc: "encrypted_token_123",
    };
    mockPrisma.tenantErConnection.findUnique.mockResolvedValue(mockErConnection);
    mockPrisma.syncLog.create.mockResolvedValue({ id: "sl-1" });
    mockPrisma.syncLog.update.mockResolvedValue({ id: "sl-1" });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.knownRanger.findFirst.mockResolvedValue(null);
    // Default event-type catalog resolved during syncEvents' Skylight lookup
    // (packages/jobs/src/processors/er-sync.processor.ts syncEvents). Tests
    // that need a Skylight-display type override this per-test.
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "poaching", display: "Poaching Report" },
    ]);
  });

  it("throws if tenant has no ER connection configured", async () => {
    mockPrisma.tenantErConnection.findUnique.mockResolvedValue(null);

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
    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      entity: "event",
      id: "evt-1",
    });
  });

  it("syncs events: updates existing event without re-creating", async () => {
    mockPrisma.event.findUnique.mockResolvedValue({ id: "evt-existing" });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      entity: "event",
      id: "evt-existing",
    });
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
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-1" });

    await processErSync(makeJob({ syncType: "patrols" }));

    expect(mockPrisma.patrol.upsert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create).toMatchObject({
      isTestPatrol: false,
      startLocationLat: null,
      startLocationLon: null,
      endLocationLat: null,
      endLocationLon: null,
    });
    expect(upsertCall.create.firstSeenAt).toBeInstanceOf(Date);
    expect(upsertCall.create.lastSyncedAt).toBeInstanceOf(Date);
    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      entity: "patrol",
      id: "patrol-1",
    });
    expect(mockEnqueuePatrolTrackMaterialize).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      patrolId: "patrol-1",
    });
  });

  // Issue A fix (2026-06-23): patrol_type keyword heuristic — matches real ER values
  // like "marine_patrol", "sea_patrol", "boat" instead of exact "seaborne" string.
  it.each([
    ["marine_patrol", "seaborne"],
    ["sea_patrol", "seaborne"],
    ["boat_patrol", "seaborne"],
    ["water_patrol", "seaborne"],
    ["terrestrial_patrol", "foot"],
    ["default_patrol", "foot"],
    ["foot_patrol", "foot"],
    ["", "foot"],
  ])(
    "maps ER patrol_type '%s' → PatrolType.%s",
    async (erPatrolType, expectedMgType) => {
      mockErClient.getPatrols.mockResolvedValueOnce([
        {
          id: "p-type",
          title: "Type test patrol",
          patrol_type: erPatrolType,
          state: "open",
          patrol_segments: [],
        },
      ]);
      mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-type" });

      await processErSync(makeJob({ syncType: "patrols" }));

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
      expect(upsertCall.create.patrolType).toBe(expectedMgType);
    },
  );

  it("marks patrol as test when title matches /test|qa|demo/i", async () => {
    mockErClient.getPatrols.mockResolvedValueOnce([
      { id: "p-t", title: "QA Test Run", patrol_type: "foot", state: "open", patrol_segments: [] },
    ]);
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-t" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create).toMatchObject({ isTestPatrol: true });
  });

  it("populates start/end location from first/last segment", async () => {
    mockErClient.getPatrols.mockResolvedValueOnce([
      {
        id: "p-loc",
        title: "Location patrol",
        patrol_type: "seaborne",
        state: "open",
        patrol_segments: [
          {
            id: "s1",
            start_location: { type: "Point", coordinates: [120.5, 14.5] },
            end_location: { type: "Point", coordinates: [120.8, 14.7] },
          },
        ],
      },
    ]);
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-loc" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create).toMatchObject({
      startLocationLon: 120.5,
      startLocationLat: 14.5,
      endLocationLon: 120.8,
      endLocationLat: 14.7,
    });
  });

  it("writes syncNeeded=false on the create branch of a successful upsert", async () => {
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-1" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create.syncNeeded).toBe(false);
    expect(mockPrisma.patrol.update).not.toHaveBeenCalled();
  });

  it("writes syncNeeded=false on the update branch of a successful upsert", async () => {
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-1" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(upsertCall.update.syncNeeded).toBe(false);
    expect(mockPrisma.patrol.update).not.toHaveBeenCalled();
  });

  it("flags patrol with syncNeeded=true when enqueueAreaRederive fails", async () => {
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-1" });
    mockEnqueueAreaRederive.mockRejectedValueOnce(new Error("queue down"));
    mockPrisma.patrol.update.mockResolvedValue({ id: "patrol-1" });

    await processErSync(makeJob({ syncType: "patrols" }));

    expect(mockPrisma.patrol.update).toHaveBeenCalledWith({
      where: { id: "patrol-1" },
      data: { syncNeeded: true },
    });
  });

  it("syncs observations", async () => {
    mockPrisma.observation.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "observations" }));

    expect(mockPrisma.observation.upsert).toHaveBeenCalledTimes(1);
  });

  it("syncs events: maps end_time string to endTime Date on create", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-2", serial_number: 1002, title: "Test event", priority: 100, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: "2026-06-01T10:00:00Z", event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-2", priority: 100 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          endTime: new Date("2026-06-01T10:00:00Z"),
        }),
      }),
    );
  });

  it("syncs events: maps end_time null to endTime null on create", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-3", serial_number: 1003, title: "No end event", priority: 100, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-3", priority: 100 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          endTime: null,
        }),
      }),
    );
  });

  it("syncs events: maps photos array presence to hasPhoto=true on create", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-photo-1", serial_number: 2001, title: "With photo", priority: 100, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [], photos: [{ url: "https://example.com/p.jpg" }] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-photo-1", priority: 100 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          hasPhoto: true,
        }),
      }),
    );
  });

  it("syncs events: maps missing photos to hasPhoto=false on create", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-no-photo", serial_number: 2002, title: "No photo", priority: 100, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-no-photo", priority: 100 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          hasPhoto: false,
        }),
      }),
    );
  });

  it("syncs events: resolves reported_by.email to reportedByUserId on create", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-by-user", serial_number: 2003, title: "By user", priority: 100, state: "active", location: null, reported_by: { name: "Ranger Alpha", email: "alpha@example.com" }, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-by-user", priority: 100 });
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "user-alpha" });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          reportedByUserId: "user-alpha",
          reportedByKnownRangerId: null,
        }),
      }),
    );
  });

  it("syncs events: falls back to KnownRanger name match when email absent", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-by-ranger", serial_number: 2004, title: "By ranger", priority: 100, state: "active", location: null, reported_by: { name: "Ranger Bravo" }, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-by-ranger", priority: 100 });
    mockPrisma.knownRanger.findFirst.mockResolvedValueOnce({ id: "kr-bravo" });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          reportedByUserId: null,
          reportedByKnownRangerId: "kr-bravo",
        }),
      }),
    );
  });

  it("syncs events: leaves both reportedBy ids null when no match found", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-no-match", serial_number: 2005, title: "Unknown source", priority: 100, state: "active", location: null, reported_by: { name: "Stranger", email: "stranger@example.com" }, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-no-match", priority: 100 });
    // user.findFirst + knownRanger.findFirst both return null (default in beforeEach)

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          reportedByUserId: null,
          reportedByKnownRangerId: null,
        }),
      }),
    );
  });

  it("syncs events: leaves both reportedBy ids null when reported_by is null", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-null-rb", serial_number: 2006, title: "No reporter", priority: 100, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-null-rb", priority: 100 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          reportedByUserId: null,
          reportedByKnownRangerId: null,
        }),
      }),
    );
  });

  // Skylight ingestion block — an event is Skylight when its resolved event
  // type's `display` contains "skylight" (case-insensitive), the same marker
  // used in dashboard.ts:179 / reportMap.ts:59. Skylight events must never be
  // created or updated by the recurring ER sync so they can't flood back in
  // after the one-time DB cleanup.
  it("skips creating a Skylight-display event and does not enqueue downstream jobs for it", async () => {
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "skylight_detection", display: "Skylight Detection Alert" },
    ]);
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-sky-1", serial_number: 9001, title: "Vessel detected", priority: 50, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "skylight_detection", event_details: {}, notes: [] },
    ]);

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
    expect(mockPrisma.event.update).not.toHaveBeenCalled();
    expect(mockEnqueueAlert).not.toHaveBeenCalled();
    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled();
  });

  it("matches Skylight display case-insensitively (e.g. 'SKYLIGHT Entry Alert')", async () => {
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "skylight_entry", display: "SKYLIGHT Entry Alert" },
    ]);
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-sky-2", serial_number: 9002, title: "Vessel entered zone", priority: 50, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "skylight_entry", event_details: {}, notes: [] },
    ]);

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it("still ingests a non-Skylight event when Skylight types exist in the same batch", async () => {
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "poaching", display: "Poaching Report" },
      { value: "skylight_detection", display: "Skylight Detection Alert" },
    ]);
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-sky-3", serial_number: 9003, title: "Vessel detected", priority: 50, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "skylight_detection", event_details: {}, notes: [] },
      { id: "ev-4", serial_number: 1004, title: "Illegal fishing spotted", priority: 200, state: "active", location: null, reported_by: null, time: "2026-06-01T09:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-4", priority: 200 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          erEventId: "ev-4",
        }),
      }),
    );
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
