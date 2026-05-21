// get-coverage-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    patrol: { findMany: vi.fn() },
  },
}));

import { prisma } from "@marine-guardian/db";
import {
  extractTrackEndpoints,
  getCoverageReportData,
  parseCoverageParams,
} from "../get-coverage-report-data";

const TENANT_ID = "tenant_a";
const TENANT_SLUG = "mindoro";
const EXPORT_ID = "exp_1";

describe("parseCoverageParams", () => {
  it("returns empty object for null/undefined/non-object input", () => {
    expect(parseCoverageParams(null)).toEqual({});
    expect(parseCoverageParams(undefined)).toEqual({});
    expect(parseCoverageParams("string")).toEqual({});
    expect(parseCoverageParams(42)).toEqual({});
  });

  it("preserves valid category + year + month + weekIndex + excludeTestPatrols", () => {
    const out = parseCoverageParams({
      category: "weekly",
      year: 2026,
      month: 5,
      weekIndex: 0,
      excludeTestPatrols: false,
    });
    expect(out).toEqual({
      category: "weekly",
      year: 2026,
      month: 5,
      weekIndex: 0,
      excludeTestPatrols: false,
    });
  });

  it("drops unrecognised category", () => {
    const out = parseCoverageParams({ category: "daily" });
    expect(out.category).toBeUndefined();
  });

  it("drops non-integer year", () => {
    const out = parseCoverageParams({ year: 2026.5 });
    expect(out.year).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    const out = parseCoverageParams({ category: "monthly", foo: "bar" });
    expect(out).toEqual({ category: "monthly" });
  });
});

describe("extractTrackEndpoints", () => {
  it("returns null/null for missing or non-object", () => {
    expect(extractTrackEndpoints(null)).toEqual({ start: null, end: null });
    expect(extractTrackEndpoints(undefined)).toEqual({
      start: null,
      end: null,
    });
    expect(extractTrackEndpoints("string")).toEqual({
      start: null,
      end: null,
    });
  });

  it("extracts first + last from LineString", () => {
    const r = extractTrackEndpoints({
      type: "LineString",
      coordinates: [
        [121.5, 13.5],
        [121.6, 13.6],
        [121.7, 13.7],
      ],
    });
    expect(r.start).toEqual({ lat: 13.5, lon: 121.5 });
    expect(r.end).toEqual({ lat: 13.7, lon: 121.7 });
  });

  it("extracts endpoints from MultiLineString", () => {
    const r = extractTrackEndpoints({
      type: "MultiLineString",
      coordinates: [
        [
          [121.5, 13.5],
          [121.6, 13.6],
        ],
        [
          [121.7, 13.7],
          [121.8, 13.8],
        ],
      ],
    });
    expect(r.start).toEqual({ lat: 13.5, lon: 121.5 });
    expect(r.end).toEqual({ lat: 13.8, lon: 121.8 });
  });

  it("returns null/null when coordinates malformed", () => {
    expect(
      extractTrackEndpoints({ type: "LineString", coordinates: [] }),
    ).toEqual({ start: null, end: null });
    expect(
      extractTrackEndpoints({
        type: "LineString",
        coordinates: [["bad", "data"]],
      }),
    ).toEqual({ start: null, end: null });
  });

  it("returns null/null for unsupported geometry type", () => {
    expect(
      extractTrackEndpoints({
        type: "Point",
        coordinates: [121.5, 13.5],
      }),
    ).toEqual({ start: null, end: null });
  });
});

describe("getCoverageReportData", () => {
  const TENANT_ROW = {
    id: TENANT_ID,
    name: "Mindoro MPA",
    slug: TENANT_SLUG,
    timezone: "Asia/Manila",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tenant slug is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(null);
    const r = await getCoverageReportData("nope", EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export id is unknown", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce(null);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: "tenant_b",
      reportType: "coverage",
      paramsJson: {},
      paperSize: "A4",
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("returns null when reportType is not coverage", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "area",
      paramsJson: {},
      paperSize: "A4",
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).toBeNull();
  });

  it("shapes the full payload for a valid coverage export", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: { category: "monthly", year: 2026, month: 5 },
      paperSize: "A4",
      createdAt: new Date("2026-05-21T08:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        serialNumber: "MG-0042",
        title: "Routine reef sweep",
        patrolType: "foot",
        state: "done",
        startTime: new Date("2026-05-15T03:00:00.000Z"),
        endTime: new Date("2026-05-15T07:30:00.000Z"),
        totalDistanceKm: 8.4,
        totalHours: 4.5,
        boatName: null,
        areaName: "North Reef",
        segments: [{ leaderName: "Maria Santos" }],
        track: {
          trackGeojson: {
            type: "LineString",
            coordinates: [
              [121.5, 13.5],
              [121.55, 13.55],
              [121.6, 13.6],
            ],
          },
        },
      },
      {
        id: "p2",
        serialNumber: "MG-0043",
        title: "Vessel boarding",
        patrolType: "seaborne",
        state: "done",
        startTime: new Date("2026-05-18T01:00:00.000Z"),
        endTime: null,
        totalDistanceKm: null,
        totalHours: null,
        boatName: "Bantay 2",
        areaName: null,
        segments: [],
        track: null,
      },
    ] as never);

    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r).not.toBeNull();
    expect(r?.tenant.name).toBe("Mindoro MPA");
    expect(r?.tenant.timezone).toBe("Asia/Manila");
    expect(r?.period.category).toBe("monthly");
    expect(r?.period.label).toBe("MAY 2026");
    expect(r?.paperSize).toBe("A4");
    expect(r?.excludeTestPatrols).toBe(true);
    expect(r?.patrols).toHaveLength(2);

    const [a, b] = r?.patrols ?? [];
    expect(a?.id).toBe("p1");
    expect(a?.serialNumber).toBe("MG-0042");
    expect(a?.leaderName).toBe("Maria Santos");
    expect(a?.startLocation).toEqual({ lat: 13.5, lon: 121.5 });
    expect(a?.endLocation).toEqual({ lat: 13.6, lon: 121.6 });

    expect(b?.id).toBe("p2");
    expect(b?.leaderName).toBeNull();
    expect(b?.startLocation).toBeNull();
    expect(b?.endLocation).toBeNull();

    // Confirms prisma query scoped to tenant + period bounds.
    const calls = vi.mocked(prisma.patrol.findMany).mock.calls;
    expect(calls).toHaveLength(1);
    const arg = calls[0]?.[0] as
      | {
          where?: {
            tenantId?: string;
            startTime?: { gte?: Date; lt?: Date };
          };
        }
      | undefined;
    expect(arg?.where?.tenantId).toBe(TENANT_ID);
    expect(arg?.where?.startTime?.gte).toBeInstanceOf(Date);
    expect(arg?.where?.startTime?.lt).toBeInstanceOf(Date);
  });

  it("falls back to current month when paramsJson is empty {}", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValueOnce(
      TENANT_ROW as never,
    );
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValueOnce({
      tenantId: TENANT_ID,
      reportType: "coverage",
      paramsJson: {},
      paperSize: "Letter",
      // Tue May 19 2026 12:00 PHT = May 19 04:00 UTC
      createdAt: new Date("2026-05-19T04:00:00.000Z"),
    } as never);
    vi.mocked(prisma.patrol.findMany).mockResolvedValueOnce([] as never);
    const r = await getCoverageReportData(TENANT_SLUG, EXPORT_ID);
    expect(r?.period.label).toBe("MAY 2026");
    expect(r?.paperSize).toBe("Letter");
    expect(r?.patrols).toEqual([]);
  });
});
