// get-event-highlights-report-data.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    reportExport: { findUnique: vi.fn() },
    reportTemplate: { findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    municipality: { findUnique: vi.fn(), findMany: vi.fn() },
    protectedZone: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@marine-guardian/storage", () => ({
  getImageBytes: vi.fn(),
  getExportsBucketName: vi.fn().mockReturnValue("marine-guardian-dev-exports"),
}));

import { prisma } from "@marine-guardian/db";
import { getImageBytes } from "@marine-guardian/storage";
import {
  applyTotalPhotoBudget,
  extractRemarks,
  getEventHighlightsReportData,
  MAX_TOTAL_PHOTOS,
} from "../get-event-highlights-report-data";
import type { EventHighlightsEventBlock } from "../get-event-highlights-report-data";
import { BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI } from "@/server/report-map-report/assets/blue-alliance-default-logo";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const TENANT_ID = "tenant_a";
const TENANT_SLUG = "mindoro";
const EXPORT_ID = "exp_hl_1";
const TEMPLATE_ID = "tpl_1";

const TENANT_ROW = {
  id: TENANT_ID,
  name: "Mindoro MPA",
  slug: TENANT_SLUG,
  timezone: "Asia/Manila",
};

const EXPORT_ROW = {
  tenantId: TENANT_ID,
  reportType: "event_highlights" as const,
  paramsJson: {
    templateId: TEMPLATE_ID,
    from: "2026-05-01T00:00:00.000Z",
    to: "2026-06-01T00:00:00.000Z",
  },
};

const TEMPLATE_ROW = {
  id: TEMPLATE_ID,
  name: "Mindoro Template",
  layout: "two-column",
  reportTitle: "Mindoro Marine Report",
  footerNotes: "Confidential",
  municipalLogoKey: null,
  partnerLogoKey: null,
};

type AssetFixture = { id: string; mimeType: string | null; filename: string; telegramFileId: string | null };

function photo(id: string): AssetFixture {
  return { id, mimeType: "image/jpeg", filename: `${id}.jpg`, telegramFileId: `tg_${id}` };
}

function unusablePhoto(id: string): AssetFixture {
  // No recognizable mime + no extension → not inline-safe → not displayable.
  return { id, mimeType: null, filename: id, telegramFileId: `tg_${id}` };
}

type EventFixture = {
  id: string;
  title: string | null;
  priority: number;
  state: string;
  reportedAt: Date | null;
  locationLat: number | null;
  locationLon: number | null;
  areaName: string | null;
  reportedByName: string | null;
  actionTaken: string | null;
  notesJson: unknown;
  eventDetailsJson: unknown;
  hasPhoto: boolean;
  eventType: { display: string; category: string } | null;
  municipality: { name: string } | null;
  municipalityId: string | null;
  assets: AssetFixture[];
};

function baseEvent(overrides: Partial<EventFixture> = {}): EventFixture {
  return {
    id: "e1",
    title: "Illegal Fishing Sighted",
    priority: 100,
    state: "resolved",
    reportedAt: new Date("2026-05-10T00:00:00.000Z"),
    locationLat: 13.1,
    locationLon: 121.1,
    areaName: null,
    reportedByName: "Juan Dela Cruz",
    actionTaken: "Confiscated illegal gear.",
    notesJson: null,
    eventDetailsJson: null,
    hasPhoto: true,
    eventType: { display: "Illegal Fishing", category: "law-enforcement-and-apprehensions" },
    municipality: { name: "Puerto Galera" },
    municipalityId: "muni_a",
    assets: [photo("a1"), photo("a2")],
    ...overrides,
  };
}

function setupHappyPath(events: EventFixture[] = []) {
  vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
  vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(EXPORT_ROW as never);
  vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
  vi.mocked(prisma.event.findMany).mockResolvedValue(events as never);
  vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.municipality.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.protectedZone.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([] as never);
  vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));
}

// ─── extractRemarks ─────────────────────────────────────────────────────────

describe("extractRemarks", () => {
  it("returns a plain non-empty notesJson string", () => {
    expect(extractRemarks({ notesJson: "  saw a suspicious boat  ", eventDetailsJson: null })).toBe(
      "saw a suspicious boat",
    );
  });

  it("returns a value from an object key matching /remark|note|narrative/i in notesJson", () => {
    expect(
      extractRemarks({
        notesJson: { remarks: "boarded the vessel" },
        eventDetailsJson: null,
      }),
    ).toBe("boarded the vessel");
  });

  it("returns a value from eventDetailsJson when notesJson yields nothing", () => {
    expect(
      extractRemarks({
        notesJson: null,
        eventDetailsJson: { narrative: "confiscated a net" },
      }),
    ).toBe("confiscated a net");
  });

  it("returns null when nothing matches", () => {
    expect(
      extractRemarks({
        notesJson: { unrelatedField: "hello" },
        eventDetailsJson: { anotherField: 42 },
      }),
    ).toBeNull();
    expect(extractRemarks({ notesJson: "", eventDetailsJson: null })).toBeNull();
    expect(extractRemarks({ notesJson: null, eventDetailsJson: null })).toBeNull();
  });
});

// ─── getEventHighlightsReportData ───────────────────────────────────────────

describe("getEventHighlightsReportData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Null-contract tests ────────────────────────────────────────────────

  it("returns null when tenant not found", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
    expect(await getEventHighlightsReportData("unknown-slug", EXPORT_ID)).toBeNull();
  });

  it("returns null when export not found", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue(null);
    expect(await getEventHighlightsReportData(TENANT_SLUG, "no-such-export")).toBeNull();
  });

  it("returns null when export belongs to a different tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      tenantId: "other_tenant",
    } as never);
    expect(await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID)).toBeNull();
  });

  it("returns null when reportType is not event_highlights", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      reportType: "report_map",
    } as never);
    expect(await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID)).toBeNull();
  });

  // ── Qualifying filter ──────────────────────────────────────────────────

  it("qualifies an event with displayable photos + actionTaken", async () => {
    setupHappyPath([baseEvent()]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.id).toBe("e1");
  });

  it("excludes a Skylight-sourced event even with photos + narrative", async () => {
    setupHappyPath([
      baseEvent({
        id: "e_skylight",
        eventType: { display: "Skylight Entry Alert", category: "monitoring_patrolling_and_surveillance" },
      }),
    ]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(0);
    expect(result.totalQualifying).toBe(0);
  });

  it("excludes an event with photos but no narrative (no actionTaken, no remarks)", async () => {
    setupHappyPath([baseEvent({ id: "e_no_narrative", actionTaken: null, notesJson: null, eventDetailsJson: null })]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(0);
  });

  it("excludes an event with narrative but no displayable photo, and pre-filters via assets:{some:{}} in the query", async () => {
    setupHappyPath([baseEvent({ id: "e_no_photo", assets: [unusablePhoto("bad1")] })]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(0);
    expect(vi.mocked(prisma.event.findMany).mock.calls[0]?.[0]?.where).toMatchObject({
      assets: { some: {} },
    });
  });

  it("qualifies an event with no actionTaken but a remarks-like notesJson string (extractRemarks)", async () => {
    setupHappyPath([
      baseEvent({
        id: "e_remarks",
        actionTaken: null,
        notesJson: { remarks: "Vessel warned and released." },
      }),
    ]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.remarks).toBe("Vessel warned and released.");
    expect(result.blocks[0]?.actionTaken).toBeNull();
  });

  // ── Layout classification ──────────────────────────────────────────────

  it("classifies an event with exactly 2 displayable photos as layout half", async () => {
    setupHappyPath([baseEvent({ id: "e_half", assets: [photo("a1"), photo("a2")] })]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks[0]?.layout).toBe("half");
  });

  it("classifies an event with 3 displayable photos as layout full", async () => {
    setupHappyPath([baseEvent({ id: "e_full", assets: [photo("a1"), photo("a2"), photo("a3")] })]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks[0]?.layout).toBe("full");
  });

  // ── photoAssetIds cap ───────────────────────────────────────────────────

  it("caps photoAssetIds at 8 while photoCount reflects the true total", async () => {
    const tenPhotos = Array.from({ length: 10 }, (_, i) => photo(`a${String(i)}`));
    setupHappyPath([baseEvent({ id: "e_many", assets: tenPhotos })]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks[0]?.photoAssetIds).toHaveLength(8);
    expect(result.blocks[0]?.photoCount).toBe(10);
  });

  // ── Sort + cap ──────────────────────────────────────────────────────────

  it("sorts blocks by photoCount desc, then reportedAt desc as tiebreak", async () => {
    setupHappyPath([
      baseEvent({
        id: "e_low",
        reportedAt: new Date("2026-05-20T00:00:00.000Z"),
        assets: [photo("a1"), photo("a2")],
      }),
      baseEvent({
        id: "e_high",
        reportedAt: new Date("2026-05-05T00:00:00.000Z"),
        assets: [photo("b1"), photo("b2"), photo("b3"), photo("b4")],
      }),
      baseEvent({
        id: "e_tie_newer",
        reportedAt: new Date("2026-05-25T00:00:00.000Z"),
        assets: [photo("c1"), photo("c2")],
      }),
    ]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks.map((b) => b.id)).toEqual(["e_high", "e_tie_newer", "e_low"]);
  });

  it("caps blocks at 25 while totalQualifying reflects the full pre-cap count", async () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      baseEvent({
        id: `e${String(i)}`,
        reportedAt: new Date(2026, 4, 1 + i),
        assets: [photo(`p${String(i)}a`), photo(`p${String(i)}b`)],
      }),
    );
    setupHappyPath(events);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.blocks).toHaveLength(25);
    expect(result.totalQualifying).toBe(30);
  });

  // ── scopeTitle precedence ───────────────────────────────────────────────

  it("scopeTitle: protectedZone name wins when protectedZoneId is set", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: {
        ...EXPORT_ROW.paramsJson,
        municipalityId: "muni_a",
        protectedZoneId: "pz_a",
      },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue({ name: "Puerto Galera" } as never);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.protectedZone.findUnique).mockResolvedValue({ name: "Verde Island MPA" } as never);
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.scopeTitle).toBe("Verde Island MPA");
  });

  it("scopeTitle: municipality name when only municipalityId is set", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, municipalityId: "muni_a" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue({ name: "Puerto Galera" } as never);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.protectedZone.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.scopeTitle).toBe("Puerto Galera");
    expect(result.isRegionReport).toBe(false);
  });

  it("scopeTitle: province name when only province is set", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(TENANT_ROW as never);
    vi.mocked(prisma.reportExport.findUnique).mockResolvedValue({
      ...EXPORT_ROW,
      paramsJson: { ...EXPORT_ROW.paramsJson, province: "Oriental Mindoro" },
    } as never);
    vi.mocked(prisma.reportTemplate.findFirst).mockResolvedValue(TEMPLATE_ROW as never);
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.municipality.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.municipality.findMany).mockResolvedValue([{ id: "muni_pg" }, { id: "muni_sj" }] as never);
    vi.mocked(prisma.protectedZone.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.protectedZone.findMany).mockResolvedValue([] as never);
    vi.mocked(getImageBytes).mockResolvedValue(Buffer.from(""));

    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.scopeTitle).toBe("Oriental Mindoro");
    expect(result.isRegionReport).toBe(true);
  });

  it('scopeTitle: "All Municipalities" when no scope is set', async () => {
    setupHappyPath([]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.scopeTitle).toBe("All Municipalities");
    expect(result.isRegionReport).toBe(false);
  });

  // ── Template fallback ──────────────────────────────────────────────────

  it("falls back to the Blue Alliance default partner logo when no template partner logo is set", async () => {
    setupHappyPath([]);
    const result = await getEventHighlightsReportData(TENANT_SLUG, EXPORT_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.template.partnerLogoDataUri).toBe(BLUE_ALLIANCE_DEFAULT_LOGO_DATA_URI);
  });
});

// ─── applyTotalPhotoBudget (pure helper) ───────────────────────────────────

/** Minimal block fixture — only `photoAssetIds`/`photoCount` matter here. */
function budgetBlock(id: string, photos: number): EventHighlightsEventBlock {
  return {
    id,
    title: `Event ${id}`,
    typeDisplay: "Illegal Fishing",
    reportedAt: new Date("2026-05-10T08:00:00.000Z"),
    municipalityName: "Puerto Galera",
    areaName: null,
    lat: null,
    lon: null,
    reportedByName: null,
    actionTaken: "Patrol dispatched.",
    remarks: null,
    photoAssetIds: Array.from({ length: photos }, (_, i) => `${id}_a${String(i)}`),
    photoCount: photos,
    layout: photos <= 2 ? "half" : "full",
  };
}

describe("applyTotalPhotoBudget", () => {
  it("is a no-op when the total is at or under budget", () => {
    const blocks = [budgetBlock("b1", 8), budgetBlock("b2", 4)];
    const result = applyTotalPhotoBudget(blocks, 120);

    expect(result.photoBudgetReached).toBe(false);
    expect(result.photosShown).toBe(12);
    expect(result.photosAvailable).toBe(12);
    // Identical array reference — nothing was copied or truncated.
    expect(result.blocks).toBe(blocks);
    expect(result.blocks[0]?.photoAssetIds).toHaveLength(8);
    expect(result.blocks[1]?.photoAssetIds).toHaveLength(4);
  });

  it("is a no-op when the total exactly equals the budget (boundary)", () => {
    const result = applyTotalPhotoBudget([budgetBlock("b1", 5), budgetBlock("b2", 5)], 10);
    expect(result.photoBudgetReached).toBe(false);
    expect(result.photosShown).toBe(10);
  });

  it("truncates across multiple blocks, walking them in order", () => {
    // 8 + 8 + 8 = 24 photos available, budget 10 → 8 + 2 + 0.
    const blocks = [budgetBlock("b1", 8), budgetBlock("b2", 8), budgetBlock("b3", 8)];
    const result = applyTotalPhotoBudget(blocks, 10);

    expect(result.photoBudgetReached).toBe(true);
    expect(result.photosAvailable).toBe(24);
    expect(result.photosShown).toBe(10);
    expect(result.blocks.map((b) => b.photoAssetIds.length)).toEqual([8, 2, 0]);
    // The surviving ids are the leading ones, in their original order.
    expect(result.blocks[1]?.photoAssetIds).toEqual(["b2_a0", "b2_a1"]);
  });

  it("keeps a budget-starved block (zero photos) instead of dropping it", () => {
    const result = applyTotalPhotoBudget([budgetBlock("b1", 4), budgetBlock("b2", 4)], 4);

    expect(result.blocks).toHaveLength(2);
    const starved = result.blocks[1];
    expect(starved?.id).toBe("b2");
    expect(starved?.photoAssetIds).toEqual([]);
    // Text content survives untouched — the narrative is the point of the report.
    expect(starved?.actionTaken).toBe("Patrol dispatched.");
    expect(starved?.title).toBe("Event b2");
  });

  it("leaves the pre-cap photoCount intact so the UI can still say 'N photos available'", () => {
    const result = applyTotalPhotoBudget([budgetBlock("b1", 8), budgetBlock("b2", 8)], 8);

    expect(result.blocks[1]?.photoAssetIds).toHaveLength(0);
    // photoCount is the PRE-cap count and must NOT be rewritten to 0.
    expect(result.blocks[0]?.photoCount).toBe(8);
    expect(result.blocks[1]?.photoCount).toBe(8);
    // layout is likewise derived from photoCount and stays stable.
    expect(result.blocks[1]?.layout).toBe("full");
  });

  it("handles an empty block list", () => {
    const result = applyTotalPhotoBudget([], 120);
    expect(result.blocks).toEqual([]);
    expect(result.photosShown).toBe(0);
    expect(result.photosAvailable).toBe(0);
    expect(result.photoBudgetReached).toBe(false);
  });

  it("defaults to MAX_TOTAL_PHOTOS, which is below the 25×8 per-block ceiling", () => {
    expect(MAX_TOTAL_PHOTOS).toBe(120);
    // 25 blocks × 8 photos = the 200-photo worst case that blew the renderer.
    const blocks = Array.from({ length: 25 }, (_, i) => budgetBlock(`b${String(i)}`, 8));
    const result = applyTotalPhotoBudget(blocks);

    expect(result.photosAvailable).toBe(200);
    expect(result.photosShown).toBe(MAX_TOTAL_PHOTOS);
    expect(result.photoBudgetReached).toBe(true);
    expect(result.blocks).toHaveLength(25);
    const rendered = result.blocks.reduce((n, b) => n + b.photoAssetIds.length, 0);
    expect(rendered).toBe(MAX_TOTAL_PHOTOS);
  });
});
