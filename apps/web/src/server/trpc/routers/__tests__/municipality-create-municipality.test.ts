/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findFirst: vi.fn(), create: vi.fn() },
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

// Stub the area-rederive + municipality-reassign fan-outs — not under test here.
vi.mock("../areaBoundary", () => ({
  fanOutAreaRederive: vi.fn().mockResolvedValue({ enqueued: 12 }),
  fanOutMunicipalityReassign: vi.fn().mockResolvedValue({ enqueued: 7 }),
}));

import { prisma } from "@marine-guardian/db";
import { importOfficialBoundaries } from "@/server/boundaries/import-official-boundaries";
import { fanOutAreaRederive, fanOutMunicipalityReassign } from "../areaBoundary";
import { createCallerFactory } from "../../trpc";
import { municipalityRouter } from "../municipality";

const createCaller = createCallerFactory(municipalityRouter);
const TENANT_ID = "tenant-abc";

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

describe("municipality.createMunicipalityFromUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.municipality.create).mockResolvedValue({
      id: "muni-new",
      slug: "test-town",
      name: "Test Town",
      province: "Palawan",
      boundaryGeojson: squareFC,
    } as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("creates a new Layer-1 municipality and regenerates overlays", async () => {
    const caller = createCaller(makeCtx());
    const res = await caller.createMunicipalityFromUpload({
      name: "Test Town",
      geojson: squareFC,
      province: "Palawan",
    });

    expect(res).toMatchObject({ municipalityId: "muni-new", name: "Test Town", province: "Palawan" });

    const createArg = vi.mocked(prisma.municipality.create).mock.calls[0]?.[0];
    expect(createArg?.data.tenantId).toBe(TENANT_ID);
    expect(createArg?.data.slug).toBe("test-town");
    expect(createArg?.data.name).toBe("Test Town");
    expect(createArg?.data.province).toBe("Palawan");
    expect(createArg?.data.boundaryGeojson).toBeDefined();
    expect(createArg?.data.landBoundaryManual).toBe(true);

    expect(importOfficialBoundaries).toHaveBeenCalledWith(prisma, TENANT_ID, "user-123");
    expect(fanOutAreaRederive).toHaveBeenCalledWith(TENANT_ID, "user-123");
    expect(fanOutMunicipalityReassign).toHaveBeenCalledWith(TENANT_ID, "user-123");

    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(res.enqueuedJobs).toBe(12);
    expect(res.municipalityReassignJobs).toBe(7);
  });

  it("rejects a duplicate municipality name for the tenant (CONFLICT)", async () => {
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({ id: "existing" } as any);
    const caller = createCaller(makeCtx());
    await expect(
      caller.createMunicipalityFromUpload({ name: "Test Town", geojson: squareFC, province: "Palawan" }),
    ).rejects.toThrow(/already exists/);
    expect(prisma.municipality.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid province", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.createMunicipalityFromUpload({
        name: "Test Town",
        geojson: squareFC,
        province: "Cebu" as any,
      }),
    ).rejects.toThrow();
    expect(prisma.municipality.create).not.toHaveBeenCalled();
  });

  it("rejects geometry with no polygon (BAD_REQUEST)", async () => {
    const caller = createCaller(makeCtx());
    await expect(
      caller.createMunicipalityFromUpload({
        name: "Bad",
        geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [120, 12] } }] },
        province: "Palawan",
      }),
    ).rejects.toThrow(/No polygon/);
    expect(prisma.municipality.create).not.toHaveBeenCalled();
  });

  it("forbids non-admin roles", async () => {
    const caller = createCaller(makeCtx(["operator"]));
    await expect(
      caller.createMunicipalityFromUpload({ name: "Test Town", geojson: squareFC, province: "Palawan" }),
    ).rejects.toThrow();
    expect(prisma.municipality.create).not.toHaveBeenCalled();
  });
});
