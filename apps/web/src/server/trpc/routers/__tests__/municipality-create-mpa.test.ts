/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findMany: vi.fn(), findFirst: vi.fn() },
    protectedZone: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    event: { findMany: vi.fn() },
    patrol: { findMany: vi.fn() },
    eventCoveredZone: { createMany: vi.fn() },
    patrolCoveredZone: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
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

vi.mock("../../../auth", () => ({ auth: vi.fn() }));

// Stub the official-boundary import (DB→DB regeneration) — not under test here.
vi.mock("@/server/boundaries/import-official-boundaries", () => ({
  importOfficialBoundaries: vi.fn().mockResolvedValue({ created: 1, updated: 34, total: 35 }),
}));

import { prisma } from "@marine-guardian/db";
import { importOfficialBoundaries } from "@/server/boundaries/import-official-boundaries";
import { createCallerFactory } from "../../trpc";
import { municipalityRouter } from "../municipality";

const createCaller = createCallerFactory(municipalityRouter);
const TENANT_ID = "tenant-abc";
const PARENT_MUNI_ID = "cl9ebqhxk00003b600tymydho";

// Square covering 120.4..120.5 lon, 12.6..12.7 lat (Mindoro waters).
const square = [
  [120.4, 12.6],
  [120.5, 12.6],
  [120.5, 12.7],
  [120.4, 12.7],
  [120.4, 12.6],
];
const squareFC = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [square] } }],
};

function makeCtx(roles: string[] = ["tenant_superadmin"]) {
  return {
    session: {
      user: {
        id: "user-123",
        tenantId: TENANT_ID,
        tenantSlug: "",
        roles: roles as any,
        email: "admin@example.com",
        name: "Admin",
      },
      expires: "9999-01-01",
    },
    ip: "127.0.0.1",
    impersonationTenantId: null,
  };
}

describe("municipality.createBoundaryFromUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: PARENT_MUNI_ID } as any);
    vi.mocked(prisma.protectedZone.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.protectedZone.create).mockResolvedValue({
      id: "zone-new",
      slug: "test-mpa",
      name: "Test MPA",
      boundaryGeojson: squareFC,
    } as any);
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: "ev-in", locationLat: 12.65, locationLon: 120.45 },
      { id: "ev-out", locationLat: 12.65, locationLon: 121.9 },
    ] as any);
    vi.mocked(prisma.patrol.findMany).mockResolvedValue([
      { id: "pt-in", startLocationLat: 12.66, startLocationLon: 120.42 },
    ] as any);
    vi.mocked(prisma.eventCoveredZone.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.patrolCoveredZone.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("creates the zone, regenerates overlay, and counts only points inside the polygon", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.createBoundaryFromUpload({ name: "Test MPA", geojson: squareFC, category: "mpa", parentMunicipalityId: PARENT_MUNI_ID });

    expect(res).toMatchObject({ protectedZoneId: "zone-new", eventCount: 1, patrolCount: 1 });

    // ProtectedZone created tenant-scoped, FeatureCollection boundary.
    const createArg = vi.mocked(prisma.protectedZone.create).mock.calls[0]?.[0];
    expect(createArg?.data.tenantId).toBe(TENANT_ID);
    expect(createArg?.data.slug).toBe("test-mpa");

    // Overlay regenerated.
    expect(importOfficialBoundaries).toHaveBeenCalledWith(prisma, TENANT_ID, "user-123");

    // Only the inside event/patrol were inserted (point-in-polygon is real turf).
    const evArg = vi.mocked(prisma.eventCoveredZone.createMany).mock.calls[0]?.[0];
    const evRows = Array.isArray(evArg?.data) ? evArg.data : [];
    expect(evRows).toHaveLength(1);
    expect(evRows[0]?.eventId).toBe("ev-in");
    const ptArg = vi.mocked(prisma.patrolCoveredZone.createMany).mock.calls[0]?.[0];
    const ptRows = Array.isArray(ptArg?.data) ? ptArg.data : [];
    expect(ptRows).toHaveLength(1);
    expect(ptRows[0]?.patrolId).toBe("pt-in");

    // Audit written.
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("rejects a duplicate MPA name for the tenant (CONFLICT)", async () => {
    vi.mocked(prisma.protectedZone.findFirst).mockResolvedValue({ id: "existing" } as any);
    const caller = createCaller(makeCtx());
    await expect(
      caller.createBoundaryFromUpload({ name: "Test MPA", geojson: squareFC, category: "mpa", parentMunicipalityId: PARENT_MUNI_ID }),
    ).rejects.toThrow(/already exists/);
    expect(prisma.protectedZone.create).not.toHaveBeenCalled();
  });

  it("rejects geometry with no polygon (BAD_REQUEST)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.createBoundaryFromUpload({
        name: "Bad",
        geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [120, 12] } }] },
        category: "special_area",
        parentMunicipalityId: PARENT_MUNI_ID,
      }),
    ).rejects.toThrow(/No polygon/);
    expect(prisma.protectedZone.create).not.toHaveBeenCalled();
  });

  it("forbids non-admin roles", async () => {
    const caller = createCaller(makeCtx(["operator"]));
    await expect(
      caller.createBoundaryFromUpload({ name: "Test MPA", geojson: squareFC, category: "mpa", parentMunicipalityId: PARENT_MUNI_ID }),
    ).rejects.toThrow();
    expect(prisma.protectedZone.create).not.toHaveBeenCalled();
  });
});
