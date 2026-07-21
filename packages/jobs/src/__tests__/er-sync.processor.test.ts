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
    eventType: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
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

vi.mock("../queues/municipality-assign.queue", () => ({
  enqueueMunicipalityAssign: vi.fn().mockResolvedValue("muni-job-1"),
}));

vi.mock("../lib/er-sync-watermark", () => ({
  getWatermark: vi.fn(),
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
import { processErSync, buildSubjectUpdatePayload } from "../processors/er-sync.processor";
import { enqueueAlert } from "../queues/alerts.queue";
import { enqueueAreaRederive } from "../queues/area-rederive.queue";
import { enqueuePatrolTrackMaterialize } from "../queues/patrol-track-materialize.queue";
import { enqueueMunicipalityAssign } from "../queues/municipality-assign.queue";
import { getWatermark } from "../lib/er-sync-watermark";

const mockPrisma = platformPrisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  tenantErConnection: { findUnique: ReturnType<typeof vi.fn> };
  eventType: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  subject: { upsert: ReturnType<typeof vi.fn> };
  event: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  eventRevision: { findMany: ReturnType<typeof vi.fn> };
  patrol: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patrolRevision: { findMany: ReturnType<typeof vi.fn> };
  patrolSegment: { upsert: ReturnType<typeof vi.fn> };
  observation: { upsert: ReturnType<typeof vi.fn> };
  syncLog: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  knownRanger: { findFirst: ReturnType<typeof vi.fn> };
};

const mockEnqueueAlert = enqueueAlert as ReturnType<typeof vi.fn>;
const mockEnqueueAreaRederive = enqueueAreaRederive as ReturnType<typeof vi.fn>;
const mockEnqueuePatrolTrackMaterialize = enqueuePatrolTrackMaterialize as ReturnType<typeof vi.fn>;
const mockEnqueueMunicipalityAssign = enqueueMunicipalityAssign as ReturnType<typeof vi.fn>;
const mockGetWatermark = getWatermark as ReturnType<typeof vi.fn>;

// Default job.name is a ONE-SHOT sync name ("er-sync:<type>") so the recurring
// watermark self-advance path (job.name starting "er-sync:recurring:") is
// skipped by default and existing tests are unaffected. Pass `name` explicitly
// to exercise the recurring path.
function makeJob(overrides: Partial<ErSyncJobPayload> = {}, name?: string) {
  const syncType = overrides.syncType ?? "event_types";
  return {
    id: "test-job-1",
    name: name ?? `er-sync:${syncType}`,
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
    mockPrisma.patrolSegment.upsert.mockResolvedValue({});
    // Default event-type catalog (kept for tests that still stub eventType
    // lookups elsewhere in the processor; syncEvents itself no longer reads
    // this table as of SKY-1 — Skylight is no longer filtered at ingest).
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "poaching", display: "Poaching Report" },
    ]);
    mockGetWatermark.mockResolvedValue(undefined);
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

  // Fix A (2026-07-06): a recurring subjects sync where ER returns NO
  // last_position must NOT null out an existing subject's real position —
  // that was silencing every ranger marker on the Command Center map (Hide
  // idle on map had nothing to hide because lastPositionLat/Lon/At were
  // always null after the next sync tick).
  describe("buildSubjectUpdatePayload", () => {
    it("omits lastPositionLat/Lon/At when ER returns no last_position (preserves existing position)", () => {
      const payload = buildSubjectUpdatePayload({
        name: "Ranger Alpha",
        subject_type: "person",
        subject_subtype: "ranger",
        last_position: null,
        last_position_date: null,
        additional: {},
      });

      expect(payload).not.toHaveProperty("lastPositionLat");
      expect(payload).not.toHaveProperty("lastPositionLon");
      expect(payload).not.toHaveProperty("lastPositionAt");
      expect(payload).toMatchObject({
        name: "Ranger Alpha",
        subjectType: "person",
        subjectSubtype: "ranger",
      });
    });

    it("sets lastPositionLat/Lon/At when ER provides a real last_position", () => {
      const payload = buildSubjectUpdatePayload({
        name: "Ranger Alpha",
        subject_type: "person",
        subject_subtype: "ranger",
        last_position: { latitude: -6.5, longitude: 106.8 },
        last_position_date: "2026-07-01T00:00:00Z",
        additional: {},
      });

      expect(payload).toMatchObject({
        lastPositionLat: -6.5,
        lastPositionLon: 106.8,
        lastPositionAt: new Date("2026-07-01T00:00:00Z"),
      });
    });

    it("omits only lastPositionAt when last_position_date is absent but last_position is present", () => {
      const payload = buildSubjectUpdatePayload({
        name: "Ranger Alpha",
        last_position: { latitude: -6.5, longitude: 106.8 },
        last_position_date: null,
        additional: {},
      });

      expect(payload).toMatchObject({
        lastPositionLat: -6.5,
        lastPositionLon: 106.8,
      });
      expect(payload).not.toHaveProperty("lastPositionAt");
    });
  });

  it("syncs subjects: update payload omits position fields when ER returns no last_position (existing position preserved)", async () => {
    mockErClient.getSubjects.mockResolvedValueOnce([
      { id: "s-1", name: "Ranger Alpha", subject_type: "person", subject_subtype: "ranger", last_position: null, last_position_date: null, additional: {}, subject_group: null },
    ]);
    mockPrisma.subject.upsert.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "subjects" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.subject.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(upsertCall.update).not.toHaveProperty("lastPositionLat");
    expect(upsertCall.update).not.toHaveProperty("lastPositionLon");
    expect(upsertCall.update).not.toHaveProperty("lastPositionAt");
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

  it("syncs events: SKIPS re-attribution when an existing event's location is UNCHANGED", async () => {
    // Incoming ev-1 has location { lat: -6.5, lon: 106.8 }; the stored row has
    // the SAME location — ER only bumped a non-geometry field. The event data
    // is still updated, but the (redundant) attribution jobs are NOT re-enqueued.
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: -6.5,
      locationLon: 106.8,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1); // data still refreshed
    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled(); // attribution skipped
  });

  it("syncs events: RE-attributes when an existing event's location CHANGED", async () => {
    // Stored location differs from the incoming ev-1 location → the event moved,
    // so attribution must re-run.
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: -7.0, // different from incoming -6.5
      locationLon: 106.8,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "system",
      entity: "event",
      id: "evt-existing",
    });
  });

  // FP-noise guard (2026-07-21) — ER re-serializes coordinates with sub-display
  // floating-point noise on every sync, which previously tripped the strict
  // `!==` geometry-change check on every cycle even though the event never
  // actually moved, perpetually re-deriving attribution and spiking worker CPU.
  it("syncs events: does NOT re-attribute when ER coords differ only by floating-point noise (< epsilon)", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      {
        id: "ev-1",
        serial_number: 1001,
        title: "Illegal fishing spotted",
        priority: 200,
        state: "active",
        location: { latitude: 13.5616817, longitude: 120.9222917 },
        reported_by: { name: "Ranger Alpha" },
        time: "2025-01-01T12:00:00Z",
        event_type: "poaching",
        event_details: {},
        notes: [],
      },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: 13.5616816,
      locationLon: 120.9222916,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.update).toHaveBeenCalledTimes(1); // data still refreshed
    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled();
    expect(mockEnqueueMunicipalityAssign).not.toHaveBeenCalled();
  });

  it("syncs events: RE-attributes when ER location moved beyond the epsilon (both jobs enqueued)", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      {
        id: "ev-1",
        serial_number: 1001,
        title: "Illegal fishing spotted",
        priority: 200,
        state: "active",
        location: { latitude: 13.57, longitude: 120.92229166666667 },
        reported_by: { name: "Ranger Alpha" },
        time: "2025-01-01T12:00:00Z",
        event_type: "poaching",
        event_details: {},
        notes: [],
      },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: 13.56,
      locationLon: 120.92229166666667,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAreaRederive).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledTimes(1);
  });

  it("syncs events: does NOT re-attribute when location is exactly equal", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      {
        id: "ev-1",
        serial_number: 1001,
        title: "Illegal fishing spotted",
        priority: 200,
        state: "active",
        location: { latitude: 13.56, longitude: 120.9 },
        reported_by: { name: "Ranger Alpha" },
        time: "2025-01-01T12:00:00Z",
        event_type: "poaching",
        event_details: {},
        notes: [],
      },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: 13.56,
      locationLon: 120.9,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAreaRederive).not.toHaveBeenCalled();
    expect(mockEnqueueMunicipalityAssign).not.toHaveBeenCalled();
  });

  it("syncs events: RE-attributes when stored location is non-null but ER now returns null (value→null change)", async () => {
    mockErClient.getEvents.mockResolvedValueOnce([
      {
        id: "ev-1",
        serial_number: 1001,
        title: "Illegal fishing spotted",
        priority: 200,
        state: "active",
        location: null,
        reported_by: { name: "Ranger Alpha" },
        time: "2025-01-01T12:00:00Z",
        event_type: "poaching",
        event_details: {},
        notes: [],
      },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue({
      id: "evt-existing",
      erOriginalSnapshot: null,
      locationLat: 13.56,
      locationLon: 120.9,
    });
    mockPrisma.event.update.mockResolvedValue({});

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAreaRederive).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledTimes(1);
  });

  it("syncs events: a brand-new event is always enqueued (existing create-path behavior)", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-brand-new", priority: 200 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-brand-new" }),
    );
    expect(mockEnqueueMunicipalityAssign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-brand-new" }),
    );
  });

  // Recurring-watermark self-advance (2026-07-21) — a recurring er-sync
  // repeatable bakes `since` into its BullMQ payload once at schedule time;
  // reading job.data.since forever freezes the delta window (stuck at the
  // schedule-time value) and re-pulls the same rows every cycle. A recurring
  // firing must recompute `since` from SyncLog each run so it self-advances.
  describe("recurring watermark self-advance", () => {
    it("a RECURRING job (name starts 'er-sync:recurring:') calls ER with the FRESH watermark, ignoring the stale payload `since`", async () => {
      mockGetWatermark.mockResolvedValueOnce("2026-07-20T00:00:00.000Z");
      mockPrisma.event.findUnique.mockResolvedValue(null);
      mockPrisma.event.create.mockResolvedValue({ id: "evt-recurring", priority: 200 });

      await processErSync(
        makeJob(
          { syncType: "events", since: "2026-07-06T13:00:01.900Z" },
          "er-sync:recurring:events",
        ),
      );

      expect(mockGetWatermark).toHaveBeenCalledWith("tenant-1", "events");
      expect(mockErClient.getEvents).toHaveBeenCalledWith("2026-07-20T00:00:00.000Z");
    });

    it("a ONE-SHOT job (name 'er-sync:events') uses the explicit payload `since` as-is, never consulting the watermark", async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      mockPrisma.event.create.mockResolvedValue({ id: "evt-oneshot", priority: 200 });

      await processErSync(
        makeJob(
          { syncType: "events", since: "2026-07-06T13:00:01.900Z" },
          "er-sync:events",
        ),
      );

      expect(mockGetWatermark).not.toHaveBeenCalled();
      expect(mockErClient.getEvents).toHaveBeenCalledWith("2026-07-06T13:00:01.900Z");
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
    // Patrol geometry re-derivation (area-rederive + municipality-assign) is
    // NO LONGER enqueued directly from er-sync — it moved into
    // patrol-track-materialize.processor.ts, gated on trackChanged. er-sync
    // now only triggers the materialize job for patrols.
    expect(mockEnqueueAreaRederive).not.toHaveBeenCalledWith(
      expect.objectContaining({ entity: "patrol" }),
    );
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

  it("flags patrol with syncNeeded=true when enqueuePatrolTrackMaterialize fails", async () => {
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-1" });
    mockEnqueuePatrolTrackMaterialize.mockRejectedValueOnce(
      new Error("queue down"),
    );
    mockPrisma.patrol.update.mockResolvedValue({ id: "patrol-1" });

    await processErSync(makeJob({ syncType: "patrols" }));

    expect(mockPrisma.patrol.update).toHaveBeenCalledWith({
      where: { id: "patrol-1" },
      data: { syncNeeded: true },
    });
  });

  // Roster mis-attribution bug fix (2026-07-07) — Defect A: the live sync
  // never wrote patrol_segments, so the segment leader (used by the Command
  // Center roster to compute on_patrol) was never materialized outside the
  // one-off ingest-earthranger.mjs backfill.
  it("upserts a patrolSegment row with the segment leader when the patrol has a segment", async () => {
    mockErClient.getPatrols.mockResolvedValueOnce([
      {
        id: "p-seg",
        title: "Segment patrol",
        patrol_type: "seaborne",
        state: "open",
        patrol_segments: [
          {
            id: "seg-1",
            time_range: { start_time: "2026-07-01T06:00:00Z" },
            leader: { id: "er-subject-abc", name: "Benedicto Cabiguen Sr." },
          },
        ],
      },
    ]);
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-seg" });

    await processErSync(makeJob({ syncType: "patrols" }));

    expect(mockPrisma.patrolSegment.upsert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const segUpsertCall = mockPrisma.patrolSegment.upsert.mock.calls[0]![0] as {
      where: { patrolId_erSegmentId: { patrolId: string; erSegmentId: string } };
      create: Record<string, unknown>;
    };
    expect(segUpsertCall.where.patrolId_erSegmentId).toEqual({
      patrolId: "patrol-seg",
      erSegmentId: "seg-1",
    });
    expect(segUpsertCall.create).toMatchObject({
      patrolId: "patrol-seg",
      erSegmentId: "seg-1",
      leaderErId: "er-subject-abc",
      leaderName: "Benedicto Cabiguen Sr.",
    });
    expect(segUpsertCall.create.actualStart).toEqual(new Date("2026-07-01T06:00:00Z"));
    expect(segUpsertCall.create.actualEnd).toBeNull();
  });

  // Defect B: a patrol whose segment has ended must map to state=done even
  // when ER's own p.state still reads "open" (the incremental
  // `?updated_since=` sync window can miss the transition — e.g. ER #5235
  // "Apo Reef LGU" stayed `open` in our DB after finishing in ER).
  it("maps patrolState to done when the segment has ended, even if p.state is still open", async () => {
    mockErClient.getPatrols.mockResolvedValueOnce([
      {
        id: "p-stale-open",
        title: "Apo Reef LGU",
        patrol_type: "seaborne",
        state: "open",
        patrol_segments: [
          {
            id: "seg-done",
            time_range: { start_time: "2026-07-04T06:00:00Z", end_time: "2026-07-04T12:00:00Z" },
            leader: { id: "er-subject-xyz", name: "Some Ranger" },
          },
        ],
      },
    ]);
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-stale-open" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create.state).toBe("done");
  });

  // A genuinely active patrol (no segment has ended yet, ER still reports
  // "open") must stay open — the done-derivation must not over-trigger.
  it("keeps patrolState open when no segment has ended and p.state is open", async () => {
    mockErClient.getPatrols.mockResolvedValueOnce([
      {
        id: "p-active",
        title: "Active patrol",
        patrol_type: "seaborne",
        state: "open",
        patrol_segments: [
          {
            id: "seg-active",
            time_range: { start_time: "2026-07-07T06:00:00Z" },
            leader: { id: "er-subject-123", name: "Active Ranger" },
          },
        ],
      },
    ]);
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "patrol-active" });

    await processErSync(makeJob({ syncType: "patrols" }));

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const upsertCall = mockPrisma.patrol.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsertCall.create.state).toBe("open");
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

  // Skylight ingestion (SKY-1) — Skylight-display event types (marker: the
  // resolved event type's `display` contains "skylight", case-insensitive,
  // same marker used in dashboard.ts:179 / reportMap.ts:59) are now ingested
  // like any other event by the recurring ER sync. Skylight stays excluded
  // from reports/dashboard/events-list/municipality coverage — only ingest
  // behavior changed here; the /map opt-in toggle filters at query time.
  it("ingests a Skylight-display event like any other event and enqueues downstream jobs", async () => {
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "skylight_detection", display: "Skylight Detection Alert" },
    ]);
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-sky-1", serial_number: 9001, title: "Vessel detected", priority: 50, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "skylight_detection", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-sky-1", priority: 50 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          erEventId: "ev-sky-1",
        }),
      }),
    );
    expect(mockEnqueueAlert).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt-sky-1" }),
    );
    expect(mockEnqueueAreaRederive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-sky-1" }),
    );
  });

  it("ingests both a Skylight-display event and a non-Skylight event in the same batch", async () => {
    mockPrisma.eventType.findMany.mockResolvedValue([
      { value: "poaching", display: "Poaching Report" },
      { value: "skylight_detection", display: "Skylight Detection Alert" },
    ]);
    mockErClient.getEvents.mockResolvedValueOnce([
      { id: "ev-sky-3", serial_number: 9003, title: "Vessel detected", priority: 50, state: "active", location: null, reported_by: null, time: "2026-06-01T08:00:00Z", end_time: null, event_type: "skylight_detection", event_details: {}, notes: [] },
      { id: "ev-4", serial_number: 1004, title: "Illegal fishing spotted", priority: 200, state: "active", location: null, reported_by: null, time: "2026-06-01T09:00:00Z", end_time: null, event_type: "poaching", event_details: {}, notes: [] },
    ]);
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create
      .mockResolvedValueOnce({ id: "evt-sky-3", priority: 50 })
      .mockResolvedValueOnce({ id: "evt-4", priority: 200 });

    await processErSync(makeJob({ syncType: "events" }));

    expect(mockPrisma.event.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.event.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          erEventId: "ev-sky-3",
        }),
      }),
    );
    expect(mockPrisma.event.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          erEventId: "ev-4",
        }),
      }),
    );
  });

  // T2 (2026-07-06) — root-cause fix: syncEvents() previously never resolved
  // eventTypeId at all. entry_alert_rep (Skylight AOI entry-alerts) must now
  // link to the catalog's "Skylight Entry Alert" EventType row and default
  // to state=resolved on FIRST INSERT only.
  describe("T2: event-type resolution + Skylight default-resolved", () => {
    const skylightEventTypeRow = {
      id: "et-skylight-entry-alert",
      display: "Skylight Entry Alert",
      category: "analyzer_event",
    };
    const poachingEventTypeRow = {
      id: "et-poaching",
      display: "Poaching Report",
      category: "security",
    };

    it("resolves entry_alert_rep to the Skylight Entry Alert catalog type and sets state=resolved on insert", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValueOnce(skylightEventTypeRow);
      mockErClient.getEvents.mockResolvedValueOnce([
        {
          id: "ev-sky-entry-1",
          serial_number: 9101,
          title: "Marine Entry",
          priority: 50,
          state: "active",
          location: null,
          reported_by: null,
          time: "2026-07-01T08:00:00Z",
          end_time: null,
          event_type: "entry_alert_rep",
          event_details: {},
          notes: [],
        },
      ]);
      mockPrisma.event.findUnique.mockResolvedValue(null);
      mockPrisma.event.create.mockResolvedValue({ id: "evt-sky-entry-1", priority: 50 });

      await processErSync(makeJob({ syncType: "events" }));

      expect(mockPrisma.eventType.findFirst).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", value: "entry_alert_rep" },
        select: { id: true, display: true, category: true },
      });
      expect(mockPrisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining<Record<string, unknown>>({
          data: expect.objectContaining<Record<string, unknown>>({
            eventTypeId: "et-skylight-entry-alert",
            state: "resolved",
          }),
        }),
      );
    });

    it("does NOT force state=resolved for a normal (non-Skylight) event type on insert", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValueOnce(poachingEventTypeRow);
      mockErClient.getEvents.mockResolvedValueOnce([
        {
          id: "ev-poach-1",
          serial_number: 9102,
          title: "Illegal fishing spotted",
          priority: 200,
          state: "active",
          location: null,
          reported_by: null,
          time: "2026-07-01T08:00:00Z",
          end_time: null,
          event_type: "poaching",
          event_details: {},
          notes: [],
        },
      ]);
      mockPrisma.event.findUnique.mockResolvedValue(null);
      mockPrisma.event.create.mockResolvedValue({ id: "evt-poach-1", priority: 200 });

      await processErSync(makeJob({ syncType: "events" }));

      const createCall = mockPrisma.event.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.eventTypeId).toBe("et-poaching");
      expect(createCall.data).not.toHaveProperty("state");
    });

    it("leaves eventTypeId null when the ER event_type has no catalog match", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValueOnce(null);
      mockErClient.getEvents.mockResolvedValueOnce([
        {
          id: "ev-unknown-type",
          serial_number: 9103,
          title: "Unknown type",
          priority: 0,
          state: "active",
          location: null,
          reported_by: null,
          time: "2026-07-01T08:00:00Z",
          end_time: null,
          event_type: "some_new_type_not_yet_synced",
          event_details: {},
          notes: [],
        },
      ]);
      mockPrisma.event.findUnique.mockResolvedValue(null);
      mockPrisma.event.create.mockResolvedValue({ id: "evt-unknown-type", priority: 0 });

      await processErSync(makeJob({ syncType: "events" }));

      const createCall = mockPrisma.event.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.eventTypeId).toBeNull();
      expect(createCall.data).not.toHaveProperty("state");
    });

    it("a manually re-opened Skylight event is NOT re-resolved on the next recurring sync (update branch never touches state)", async () => {
      mockPrisma.eventType.findFirst.mockResolvedValueOnce(skylightEventTypeRow);
      mockErClient.getEvents.mockResolvedValueOnce([
        {
          id: "ev-sky-entry-reopened",
          serial_number: 9104,
          title: "Marine Entry",
          priority: 50,
          state: "active",
          location: null,
          reported_by: null,
          time: "2026-07-01T08:00:00Z",
          end_time: null,
          event_type: "entry_alert_rep",
          event_details: {},
          notes: [],
        },
      ]);
      // Existing event: a ranger manually re-opened it (state=active in MG,
      // independent of ER's own `state`). The update path must not include
      // `state` at all, so the manual re-open survives this sync.
      mockPrisma.event.findUnique.mockResolvedValue({
        id: "evt-sky-entry-reopened",
        erOriginalSnapshot: { event_type: "entry_alert_rep" },
      });
      mockPrisma.event.update.mockResolvedValue({});

      await processErSync(makeJob({ syncType: "events" }));

      expect(mockPrisma.event.create).not.toHaveBeenCalled();
      const updateCall = mockPrisma.event.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).not.toHaveProperty("state");
      // eventTypeId is still (re-)resolved on update, same as any other live field.
      expect(updateCall.data.eventTypeId).toBe("et-skylight-entry-alert");
    });
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

// ── syncPatrols anti-clobber: officer-supplied start/end times survive sync ──
//
// The ER mobile app frequently fails to capture the phone's date/time, so ER
// supplies no start_time for a large slice of patrols (overwhelmingly `foot`).
// A Command Center officer fills the time in by hand via
// patrol.setTimeOverride, which flags the row startTimeManual/endTimeManual.
// If the sync then passes ER's value straight through, the next poll silently
// reverts the officer's correction — the exact bug this guard prevents.
//
// These tests fail WITHOUT the manualTimeFields filter in syncPatrols and
// pass with it.
describe("processErSync — syncPatrols manual time-override anti-clobber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenantErConnection.findUnique.mockResolvedValue({
      baseUrl: "https://er.example.com",
      apiTokenEnc: "encrypted_token_123",
    });
    mockPrisma.syncLog.create.mockResolvedValue({ id: "sl-1" });
    mockPrisma.syncLog.update.mockResolvedValue({ id: "sl-1" });
    mockPrisma.patrolRevision.findMany.mockResolvedValue([]);
    mockPrisma.patrolSegment.upsert.mockResolvedValue({});
    mockPrisma.patrol.upsert.mockResolvedValue({ id: "pat-db-1" });
  });

  /** The `update` payload syncPatrols sent to patrol.upsert. */
  function updatePayload(): Record<string, unknown> {
    const call = mockPrisma.patrol.upsert.mock.calls[0]?.[0] as
      | { update: Record<string, unknown> }
      | undefined;
    return call?.update ?? {};
  }

  it("does NOT overwrite startTime when startTimeManual=true (officer correction survives)", async () => {
    mockPrisma.patrol.findUnique.mockResolvedValue({
      id: "pat-db-1",
      startTimeManual: true,
      endTimeManual: false,
    });

    await processErSync(makeJob({ syncType: "patrols" }));

    const update = updatePayload();
    // ER supplied start_time 2025-01-01T06:00:00Z (see mockErClient.getPatrols).
    // It must NOT appear in the update payload.
    expect(update).not.toHaveProperty("startTime");
    // endTime is unflagged, so ER still owns it.
    expect(update).toHaveProperty("endTime");
  });

  it("does NOT overwrite endTime when endTimeManual=true", async () => {
    mockPrisma.patrol.findUnique.mockResolvedValue({
      id: "pat-db-1",
      startTimeManual: false,
      endTimeManual: true,
    });

    await processErSync(makeJob({ syncType: "patrols" }));

    const update = updatePayload();
    expect(update).not.toHaveProperty("endTime");
    expect(update).toHaveProperty("startTime");
  });

  it("protects BOTH times when both flags are set", async () => {
    mockPrisma.patrol.findUnique.mockResolvedValue({
      id: "pat-db-1",
      startTimeManual: true,
      endTimeManual: true,
    });

    await processErSync(makeJob({ syncType: "patrols" }));

    const update = updatePayload();
    expect(update).not.toHaveProperty("startTime");
    expect(update).not.toHaveProperty("endTime");
    // Non-time fields are untouched by this guard.
    expect(update).toHaveProperty("title");
  });

  it("writes both times normally when neither flag is set (no regression)", async () => {
    mockPrisma.patrol.findUnique.mockResolvedValue({
      id: "pat-db-1",
      startTimeManual: false,
      endTimeManual: false,
    });

    await processErSync(makeJob({ syncType: "patrols" }));

    const update = updatePayload();
    expect(update.startTime).toEqual(new Date("2025-01-01T06:00:00Z"));
    expect(update.endTime).toEqual(new Date("2025-01-01T12:00:00Z"));
  });

  it("a brand-new patrol (no existing row) writes ER times unfiltered on create", async () => {
    mockPrisma.patrol.findUnique.mockResolvedValue(null);

    await processErSync(makeJob({ syncType: "patrols" }));

    const call = mockPrisma.patrol.upsert.mock.calls[0]?.[0] as
      | { create: Record<string, unknown> }
      | undefined;
    expect(call?.create.startTime).toEqual(new Date("2025-01-01T06:00:00Z"));
    expect(call?.create.endTime).toEqual(new Date("2025-01-01T12:00:00Z"));
  });
});
