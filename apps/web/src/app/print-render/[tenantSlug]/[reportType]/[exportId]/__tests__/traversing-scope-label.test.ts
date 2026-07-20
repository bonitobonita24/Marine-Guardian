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
});
