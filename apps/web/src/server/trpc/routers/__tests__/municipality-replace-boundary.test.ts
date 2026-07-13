/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    municipality: { findFirst: vi.fn(), update: vi.fn() },
    municipalityBoundarySnapshot: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
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

// Stub both fan-outs — the point of this test is that BOTH get called for a
// boundary geometry replacement, not their internal implementation.
vi.mock("../areaBoundary", () => ({
  fanOutAreaRederive: vi.fn().mockResolvedValue({ enqueued: 12 }),
  fanOutMunicipalityReassign: vi.fn().mockResolvedValue({ enqueued: 9 }),
}));

import { prisma } from "@marine-guardian/db";
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

describe("municipality.replaceBoundaryGeometry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    vi.mocked(prisma.municipality.findFirst).mockResolvedValue({
      id: "clx0000000000000000000001",
      name: "Calapan",
      slug: "calapan",
      boundaryGeojson: null,
      waterGeojson: null,
    } as any);
    vi.mocked(prisma.municipalityBoundarySnapshot.create).mockResolvedValue({} as any);
    vi.mocked(prisma.municipality.update).mockResolvedValue({} as any);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
  });

  it("marks waterBoundaryManual=true and fans out municipality re-attribution on a water boundary replace", async () => {
    const caller = createCaller(makeCtx());

    const res = await caller.replaceBoundaryGeometry({
      municipalityId: "clx0000000000000000000001",
      kind: "water",
      geojson: squareFC,
    });

    // (a) the water boundary is flagged manual — hardcoded loaders must
    // never silently overwrite it again (packages/db manual-boundary-guard.ts).
    const updateArg = vi.mocked(prisma.municipality.update).mock.calls[0]?.[0];
    expect(updateArg?.data.waterBoundaryManual).toBe(true);
    expect(updateArg?.data.landBoundaryManual).toBeUndefined();
    expect(updateArg?.data.waterGeojson).toBeDefined();

    // (b) municipality re-attribution is enqueued alongside area re-derivation
    // — the boundary that determines municipalityId just changed.
    expect(fanOutAreaRederive).toHaveBeenCalledWith(TENANT_ID, "user-123");
    expect(fanOutMunicipalityReassign).toHaveBeenCalledWith(TENANT_ID, "user-123");

    expect(res.enqueuedJobs).toBe(12);
    expect(res.municipalityReassignJobs).toBe(9);
  });

  it("marks landBoundaryManual=true on a land boundary replace", async () => {
    const caller = createCaller(makeCtx());

    await caller.replaceBoundaryGeometry({
      municipalityId: "clx0000000000000000000001",
      kind: "land",
      geojson: squareFC,
    });

    const updateArg = vi.mocked(prisma.municipality.update).mock.calls[0]?.[0];
    expect(updateArg?.data.landBoundaryManual).toBe(true);
    expect(updateArg?.data.waterBoundaryManual).toBeUndefined();
    expect(fanOutMunicipalityReassign).toHaveBeenCalledWith(TENANT_ID, "user-123");
  });

  it("forbids non-admin roles", async () => {
    const caller = createCaller(makeCtx(["operator"]));
    await expect(
      caller.replaceBoundaryGeometry({ municipalityId: "clx0000000000000000000001", kind: "water", geojson: squareFC }),
    ).rejects.toThrow();
    expect(prisma.municipality.update).not.toHaveBeenCalled();
    expect(fanOutMunicipalityReassign).not.toHaveBeenCalled();
  });
});
