// traversing-scope-label.test.ts
//
// Guards the traversing page's scope labelling across ALL THREE scope levels.
// The defect this protects against: a zone-scoped report printed "Patrols
// Traversing Sablayan" (the parent municipality) above a table measuring
// distance inside "Apo Reef Natural Park", with body copy claiming the
// patrols "started in another municipality".

import { describe, expect, it } from "vitest";

import {
  resolveTraversingScopeLabel,
  type TraversingScopeLabelInput,
} from "../traversing-scope-label";

function input(
  overrides: Partial<TraversingScopeLabelInput> = {},
): TraversingScopeLabelInput {
  return {
    mode: "clipped",
    scopeTitleOverride: null,
    isRegionReport: false,
    municipalityName: null,
    ...overrides,
  };
}

describe("resolveTraversingScopeLabel", () => {
  describe("zone scope", () => {
    // A zone-scoped filter carries BOTH the zone id AND the parent
    // municipalityId, so municipalityName resolves to the parent. The zone
    // must win — this is the exact reported defect.
    const label = resolveTraversingScopeLabel(
      input({
        scopeTitleOverride: "Apo Reef Natural Park",
        municipalityName: "Sablayan",
      }),
    );

    it("names the zone, not its parent municipality", () => {
      expect(label.kind).toBe("zone");
      expect(label.name).toBe("Apo Reef Natural Park");
      expect(label.heading).toBe("Patrols Traversing Apo Reef Natural Park");
      expect(label.caption).toBe("Patrols traversing Apo Reef Natural Park");
    });

    it("never leaks the parent municipality into any label", () => {
      expect(label.heading).not.toContain("Sablayan");
      expect(label.caption).not.toContain("Sablayan");
      expect(label.note).not.toContain("Sablayan");
    });

    it("body copy names the zone and does not say 'another municipality'", () => {
      expect(label.note).toContain("Apo Reef Natural Park");
      expect(label.note).toContain("inside this zone");
      expect(label.note).not.toContain("another municipality");
    });
  });

  describe("province (region) scope", () => {
    // In region mode the loader carries the PROVINCE name through
    // municipalityName — see ReportMapReportData.isRegionReport.
    const label = resolveTraversingScopeLabel(
      input({ isRegionReport: true, municipalityName: "Occidental Mindoro" }),
    );

    it("names the province", () => {
      expect(label.kind).toBe("province");
      expect(label.name).toBe("Occidental Mindoro");
      expect(label.heading).toBe("Patrols Traversing Occidental Mindoro");
      expect(label.caption).toBe("Patrols traversing Occidental Mindoro");
    });

    it("body copy uses the province noun, not municipality", () => {
      expect(label.note).toContain("inside this province");
      expect(label.note).not.toContain("another municipality");
    });
  });

  describe("municipality scope", () => {
    const label = resolveTraversingScopeLabel(
      input({ municipalityName: "Sablayan" }),
    );

    it("names the municipality", () => {
      expect(label.kind).toBe("municipality");
      expect(label.name).toBe("Sablayan");
      expect(label.heading).toBe("Patrols Traversing Sablayan");
      expect(label.caption).toBe("Patrols traversing Sablayan");
      expect(label.note).toContain("inside this municipality");
    });
  });

  describe("precedence + degenerate inputs", () => {
    it("zone wins even in region mode", () => {
      const label = resolveTraversingScopeLabel(
        input({
          scopeTitleOverride: "Apo Reef Natural Park",
          isRegionReport: true,
          municipalityName: "Occidental Mindoro",
        }),
      );
      expect(label.kind).toBe("zone");
      expect(label.name).toBe("Apo Reef Natural Park");
    });

    it("falls back to an unscoped area label when nothing resolves", () => {
      const label = resolveTraversingScopeLabel(input());
      expect(label.kind).toBe("unscoped");
      expect(label.name).toBeNull();
      expect(label.heading).toBe("Patrols Traversing This Area");
      expect(label.caption).toBe("Patrols traversing this area");
      expect(label.note).toContain("inside this area");
    });

    it("treats a blank/whitespace name as absent", () => {
      const label = resolveTraversingScopeLabel(
        input({ scopeTitleOverride: "   ", municipalityName: "Sablayan" }),
      );
      expect(label.kind).toBe("municipality");
      expect(label.name).toBe("Sablayan");
    });

    it("region mode with no province name degrades to unscoped", () => {
      const label = resolveTraversingScopeLabel(
        input({ isRegionReport: true, municipalityName: null }),
      );
      expect(label.kind).toBe("unscoped");
    });

    it("trims surrounding whitespace from a resolved name", () => {
      const label = resolveTraversingScopeLabel(
        input({ scopeTitleOverride: "  Apo Reef Natural Park  " }),
      );
      expect(label.name).toBe("Apo Reef Natural Park");
      expect(label.heading).toBe("Patrols Traversing Apo Reef Natural Park");
    });
  });

  // ─── mode: clipped vs full (2026-07-20) ─────────────────────────────────
  //
  // The full-traversing toggle inverts the meaning of this page: in "clipped"
  // mode these patrols are counted at their ORIGIN and only their inside-zone
  // portion is shown; in "full" mode they ARE counted here, in full. Printing
  // the clipped copy in full mode would be a factually FALSE statement on a
  // funder-facing report, so the copy must follow the mode.
  describe("mode", () => {
    const zone = {
      scopeTitleOverride: "Apo Reef Natural Park",
      municipalityName: "Sablayan",
    } as const;

    it("clipped copy is byte-identical to the pre-toggle wording", () => {
      const label = resolveTraversingScopeLabel(
        input({ ...zone, mode: "clipped" }),
      );
      expect(label.note).toBe(
        "These patrols started outside Apo Reef Natural Park and are counted " +
          "where they started, not here. Distance and time shown are only the " +
          "portion inside this zone; time is estimated (proportional to distance).",
      );
    });

    it("full copy drops the two claims that become false", () => {
      const label = resolveTraversingScopeLabel(
        input({ ...zone, mode: "full" }),
      );
      expect(label.note).not.toContain("not here");
      expect(label.note).not.toContain("only the portion");
    });

    it("full copy states these patrols ARE counted here, in full, and warns against summing reports", () => {
      const label = resolveTraversingScopeLabel(
        input({ ...zone, mode: "full" }),
      );
      expect(label.note).toContain("Apo Reef Natural Park");
      expect(label.note).toContain("ARE included");
      expect(label.note).toContain("full patrol distance and time");
      expect(label.note).toContain("must not be added together");
    });

    it("heading and caption are identical in both modes", () => {
      const clipped = resolveTraversingScopeLabel(
        input({ ...zone, mode: "clipped" }),
      );
      const full = resolveTraversingScopeLabel(input({ ...zone, mode: "full" }));
      expect(full.heading).toBe(clipped.heading);
      expect(full.heading).toBe("Patrols Traversing Apo Reef Natural Park");
      expect(full.caption).toBe(clipped.caption);
      expect(full.kind).toBe(clipped.kind);
    });

    it("full copy still uses the resolved scope noun at non-zone scopes", () => {
      // Full crediting is gated to zone scope upstream (Slice 1), but the
      // resolver must not silently mislabel if it is ever reached elsewhere.
      const label = resolveTraversingScopeLabel(
        input({ mode: "full", municipalityName: "Sablayan" }),
      );
      expect(label.note).toContain("started outside Sablayan");
      expect(label.note).toContain("transit outside this municipality");
      expect(label.note).not.toContain("not here");
    });
  });
});
