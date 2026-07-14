import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    patrolSchedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  writeAuditLog: vi.fn(),
  PatrolScheduleStatus: {
    planned: "planned",
    in_progress: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
  },
}));

vi.mock("../../../lib/rate-limit", () => ({
  rateLimiters: {
    public: { check: vi.fn() },
    api: { check: vi.fn() },
    auth: { check: vi.fn() },
    upload: { check: vi.fn() },
  },
}));

vi.mock("../../../auth", () => ({
  auth: vi.fn(),
}));

import { prisma, writeAuditLog, PatrolScheduleStatus } from "@marine-guardian/db";
import { createCallerFactory } from "../../trpc";
import { patrolScheduleRouter } from "../patrolSchedule";

const createCaller = createCallerFactory(patrolScheduleRouter);

const TENANT_ID = "tenant-abc";
const USER_ID = "user-123";
const SCHEDULE_ID = "sched-001";
const RANGER_ID = "ranger-001";

function makeCtx(
  tenantId: string | null = TENANT_ID,
  roles: string[] = ["field_coordinator"],
) {
  return {
    session: {
      user: {
        id: USER_ID,
        tenantId: tenantId as string,
        tenantSlug: "",
        roles,
        email: "coord@example.com",
        name: "Test Coordinator",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

const START = new Date("2024-06-01T08:00:00Z");
const END = new Date("2024-06-01T16:00:00Z");

const mockConflict = {
  id: "conflict-sched-1",
  scheduledStart: START,
  scheduledEnd: END,
  rangerName: "John Doe",
  patrolArea: { id: "area-1", name: "North Zone" },
};

const mockScheduleRow = {
  id: SCHEDULE_ID,
  tenantId: TENANT_ID,
  patrolAreaId: "area-1",
  rangerUserId: RANGER_ID,
  rangerName: "John Doe",
  accompanyingRangers: null,
  scheduledStart: START,
  scheduledEnd: END,
  plannedHours: null,
  plannedTrackGeojson: null,
  status: PatrolScheduleStatus.planned,
  notes: null,
  createdBy: USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("patrolSchedule.checkConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { conflicts: [] } when rangerUserId is undefined — no DB call", async () => {
    const caller = createCaller(makeCtx());
    const result = await caller.checkConflicts({
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(result).toEqual({ conflicts: [] });
    expect(vi.mocked(prisma.patrolSchedule.findMany)).not.toHaveBeenCalled();
  });

  it("returns conflicts when overlap found", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([mockConflict] as never);
    const caller = createCaller(makeCtx());
    const result = await caller.checkConflicts({
      rangerUserId: RANGER_ID,
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.id).toBe("conflict-sched-1");
  });

  it("passes excludeId to findMany where clause", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.checkConflicts({
      rangerUserId: RANGER_ID,
      scheduledStart: START,
      scheduledEnd: END,
      excludeId: SCHEDULE_ID,
    });
    expect(vi.mocked(prisma.patrolSchedule.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: { not: SCHEDULE_ID },
        }),
      }),
    );
  });

  it("boundary: scheduledStart filter uses lt (not lte) against input.scheduledEnd — half-open interval", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
    const caller = createCaller(makeCtx());
    await caller.checkConflicts({
      rangerUserId: RANGER_ID,
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(vi.mocked(prisma.patrolSchedule.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          scheduledStart: { lt: END },
          scheduledEnd: { gt: START },
        }),
      }),
    );
  });
});

describe("patrolSchedule.create — conflict detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds when no conflicts (findMany resolves [])", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    const result = await caller.create({
      patrolAreaId: "area-1",
      rangerUserId: RANGER_ID,
      rangerName: "John Doe",
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(result.id).toBe(SCHEDULE_ID);
  });

  it("throws TRPCError CONFLICT when conflicts found and overrideConflicts not set", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([mockConflict] as never);
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        patrolAreaId: "area-1",
        rangerUserId: RANGER_ID,
        rangerName: "John Doe",
        scheduledStart: START,
        scheduledEnd: END,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("error.code is CONFLICT and cause contains conflictingSchedules array", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([mockConflict] as never);
    const caller = createCaller(makeCtx());
    let caughtErr: unknown;
    try {
      await caller.create({
        patrolAreaId: "area-1",
        rangerUserId: RANGER_ID,
        rangerName: "John Doe",
        scheduledStart: START,
        scheduledEnd: END,
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(TRPCError);
    const err = caughtErr as TRPCError;
    expect(err.code).toBe("CONFLICT");
    const cause = (err.cause as unknown) as { conflictingSchedules: unknown[] };
    expect(cause.conflictingSchedules).toHaveLength(1);
  });

  it("succeeds with overrideConflicts: true even when conflict present — findMany NOT called", async () => {
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    const result = await caller.create({
      patrolAreaId: "area-1",
      rangerUserId: RANGER_ID,
      rangerName: "John Doe",
      scheduledStart: START,
      scheduledEnd: END,
      overrideConflicts: true,
    });
    expect(result.id).toBe(SCHEDULE_ID);
    expect(vi.mocked(prisma.patrolSchedule.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
        entityType: "PatrolSchedule",
      }),
    );
  });

  it("does NOT write OVERRIDE_CONFLICT audit when overrideConflicts is false and no conflicts", async () => {
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.create({
      patrolAreaId: "area-1",
      rangerUserId: RANGER_ID,
      rangerName: "John Doe",
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });

  it("skips conflict check when rangerUserId not provided — findMany not called", async () => {
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.create({
      patrolAreaId: "area-1",
      rangerName: "Anonymous Ranger",
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(vi.mocked(prisma.patrolSchedule.findMany)).not.toHaveBeenCalled();
  });
});

describe("patrolSchedule.update — conflict detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws CONFLICT and findMany was called with id: { not: input.id } filter", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([mockConflict] as never);
    const caller = createCaller(makeCtx());
    let caughtErr: unknown;
    try {
      await caller.update({
        id: SCHEDULE_ID,
        rangerUserId: RANGER_ID,
        scheduledStart: START,
        scheduledEnd: END,
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(TRPCError);
    const err = caughtErr as TRPCError;
    expect(err.code).toBe("CONFLICT");
    expect(vi.mocked(prisma.patrolSchedule.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          id: { not: SCHEDULE_ID },
        }),
      }),
    );
  });

  it("succeeds with overrideConflicts: true even with conflict present", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.update).mockResolvedValue({
      ...mockScheduleRow,
      notes: "updated",
    });
    const caller = createCaller(makeCtx());
    const result = await caller.update({
      id: SCHEDULE_ID,
      notes: "updated",
      overrideConflicts: true,
    });
    expect(result.notes).toBe("updated");
    expect(vi.mocked(prisma.patrolSchedule.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "PATROL_SCHEDULE:OVERRIDE_CONFLICT",
        entityType: "PatrolSchedule",
      }),
    );
  });

  it("does NOT write OVERRIDE_CONFLICT audit when overrideConflicts is false and no conflicts", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patrolSchedule.update).mockResolvedValue({
      ...mockScheduleRow,
      notes: "no-override",
    });
    const caller = createCaller(makeCtx());
    await caller.update({
      id: SCHEDULE_ID,
      notes: "no-override",
    });
    expect(vi.mocked(writeAuditLog)).not.toHaveBeenCalled();
  });
});

describe("patrolSchedule.create — overhaul fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds without patrolAreaId — now optional", async () => {
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.create({
      rangerName: "No Area Ranger",
      scheduledStart: START,
      scheduledEnd: END,
    });
    expect(vi.mocked(prisma.patrolSchedule.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.not.objectContaining({ patrolAreaId: expect.anything() }),
      }),
    );
  });

  it("derives scheduledEnd from scheduledStart + plannedHours when plannedHours provided", async () => {
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.create({
      rangerName: "Timed Ranger",
      scheduledStart: START,
      plannedHours: 4,
    });
    const expectedEnd = new Date(START.getTime() + 4 * 3600 * 1000);
    expect(vi.mocked(prisma.patrolSchedule.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          plannedHours: 4,
          scheduledEnd: expectedEnd,
        }),
      }),
    );
  });

  it("throws BAD_REQUEST when neither scheduledEnd nor plannedHours provided", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.create({
        rangerName: "Incomplete Ranger",
        scheduledStart: START,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("persists accompanyingRangers on create", async () => {
    vi.mocked(prisma.patrolSchedule.create).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.create({
      rangerName: "Lead Ranger",
      scheduledStart: START,
      scheduledEnd: END,
      accompanyingRangers: [{ userId: "u-2", name: "Second Ranger" }],
    });
    expect(vi.mocked(prisma.patrolSchedule.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          accompanyingRangers: [{ userId: "u-2", name: "Second Ranger" }],
        }),
      }),
    );
  });
});

describe("patrolSchedule.update — overhaul fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recomputes scheduledEnd from plannedHours when plannedHours changes", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.update).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.update({
      id: SCHEDULE_ID,
      plannedHours: 6,
    });
    const expectedEnd = new Date(mockScheduleRow.scheduledStart.getTime() + 6 * 3600 * 1000);
    expect(vi.mocked(prisma.patrolSchedule.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          plannedHours: 6,
          scheduledEnd: expectedEnd,
        }),
      }),
    );
  });

  it("persists accompanyingRangers on update", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.update).mockResolvedValue(mockScheduleRow);
    const caller = createCaller(makeCtx());
    await caller.update({
      id: SCHEDULE_ID,
      accompanyingRangers: [{ name: "Third Ranger" }],
    });
    expect(vi.mocked(prisma.patrolSchedule.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          accompanyingRangers: [{ name: "Third Ranger" }],
        }),
      }),
    );
  });
});

describe("patrolSchedule.setStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates only the status field", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(mockScheduleRow);
    vi.mocked(prisma.patrolSchedule.update).mockResolvedValue({
      ...mockScheduleRow,
      status: PatrolScheduleStatus.in_progress,
    });
    const caller = createCaller(makeCtx());
    const result = await caller.setStatus({
      id: SCHEDULE_ID,
      status: PatrolScheduleStatus.in_progress,
    });
    expect(result.status).toBe(PatrolScheduleStatus.in_progress);
    expect(vi.mocked(prisma.patrolSchedule.update)).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID },
      data: { status: PatrolScheduleStatus.in_progress },
    });
  });

  it("throws when the schedule is not found in the tenant", async () => {
    vi.mocked(prisma.patrolSchedule.findFirst).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.setStatus({ id: "missing-id", status: PatrolScheduleStatus.completed }),
    ).rejects.toThrow();
  });
});
