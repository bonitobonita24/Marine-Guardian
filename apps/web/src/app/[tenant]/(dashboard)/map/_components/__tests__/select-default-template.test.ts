// Default report-template selection (2026-07-20).
//
// Regression origin: an all-municipalities report rendered as "LGU All
// Municipalities" while carrying the Apo Reef Park logo, because the dropdown
// defaulted to the tenant's isDefault template regardless of scope.

import { describe, it, expect } from "vitest";
import {
  namesMatch,
  pickDefaultTemplateId,
  type TemplateOption,
} from "../select-default-template";

const PLACES = [
  "Calapan",
  "Baco",
  "Sablayan",
  "Apo Reef Natural Park",
  "Oriental Mindoro",
  "Occidental Mindoro",
];

const TEMPLATES: TemplateOption[] = [
  // The tenant's default is deliberately a place-specific template — this is
  // exactly the configuration that produced the reported defect.
  { id: "tpl-apo", name: "Apo Reef Park", isDefault: true },
  { id: "tpl-calapan", name: "Calapan Municipal", isDefault: false },
  { id: "tpl-baco", name: "Baco Municipal", isDefault: false },
  { id: "tpl-lgu", name: "LGU All Municipalities", isDefault: false },
];

const NO_SCOPE = {
  zoneName: null,
  municipalityName: null,
  provinceName: null,
};

describe("namesMatch", () => {
  it("matches identical names ignoring case and punctuation", () => {
    expect(namesMatch("Apo Reef Park", "apo  reef, park")).toBe(true);
  });

  it("matches a template name that contains the place name", () => {
    expect(namesMatch("Calapan Municipal", "Calapan")).toBe(true);
  });

  it("matches across differing generic words (the real Apo Reef case)", () => {
    // Neither string contains the other verbatim — "Natural" breaks substring
    // matching — but their significant tokens are identical.
    expect(namesMatch("Apo Reef Park", "Apo Reef Natural Park")).toBe(true);
  });

  it("does not match unrelated names", () => {
    expect(namesMatch("Calapan Municipal", "Baco")).toBe(false);
    expect(namesMatch("Oriental Mindoro", "Occidental Mindoro")).toBe(false);
  });

  it("refuses matches on near-miss fragments", () => {
    // "Bac" is a substring of "Baco" but is not the same token.
    expect(namesMatch("Bac", "Baco Municipal")).toBe(false);
  });

  it("treats a name made only of generic words as matching nothing", () => {
    expect(namesMatch("LGU All Municipalities", "Calapan")).toBe(false);
    expect(namesMatch("LGU All Municipalities", "Apo Reef Natural Park")).toBe(
      false,
    );
  });

  it("treats an empty or punctuation-only name as never matching", () => {
    expect(namesMatch("", "Calapan")).toBe(false);
    expect(namesMatch("---", "Calapan")).toBe(false);
  });
});

describe("pickDefaultTemplateId — default follows the scope", () => {
  it("defaults a municipality-scoped report to that municipality's template", () => {
    expect(
      pickDefaultTemplateId(
        TEMPLATES,
        { ...NO_SCOPE, municipalityName: "Calapan" },
        PLACES,
      ),
    ).toBe("tpl-calapan");
  });

  it("defaults a zone-scoped report to that zone's template", () => {
    expect(
      pickDefaultTemplateId(
        TEMPLATES,
        { ...NO_SCOPE, zoneName: "Apo Reef Park" },
        PLACES,
      ),
    ).toBe("tpl-apo");
  });

  it("prefers the zone over the containing municipality when both are set", () => {
    expect(
      pickDefaultTemplateId(
        TEMPLATES,
        {
          zoneName: "Apo Reef Park",
          municipalityName: "Sablayan",
          provinceName: "Occidental Mindoro",
        },
        PLACES,
      ),
    ).toBe("tpl-apo");
  });

  it("falls back to the generic template for an ALL-MUNICIPALITIES report (the reported defect)", () => {
    // Must NOT be tpl-apo, even though tpl-apo is isDefault.
    expect(pickDefaultTemplateId(TEMPLATES, NO_SCOPE, PLACES)).toBe("tpl-lgu");
  });

  it("falls back to the generic template when a scope has no matching template", () => {
    expect(
      pickDefaultTemplateId(
        TEMPLATES,
        { ...NO_SCOPE, municipalityName: "Mamburao" },
        PLACES,
      ),
    ).toBe("tpl-lgu");
  });

  it("uses a province-scoped template when one exists", () => {
    const withProvince: TemplateOption[] = [
      ...TEMPLATES,
      { id: "tpl-om", name: "Occidental Mindoro", isDefault: false },
    ];
    expect(
      pickDefaultTemplateId(
        withProvince,
        { ...NO_SCOPE, provinceName: "Occidental Mindoro" },
        PLACES,
      ),
    ).toBe("tpl-om");
  });

  it("prefers the tenant default among several generic templates", () => {
    const generics: TemplateOption[] = [
      { id: "g1", name: "Standard Report", isDefault: false },
      { id: "g2", name: "Provincial Summary Sheet", isDefault: true },
    ];
    expect(pickDefaultTemplateId(generics, NO_SCOPE, PLACES)).toBe("g2");
  });

  it("falls back to the tenant default when EVERY template is place-specific", () => {
    const allPlaceSpecific = TEMPLATES.filter((t) => t.id !== "tpl-lgu");
    expect(pickDefaultTemplateId(allPlaceSpecific, NO_SCOPE, PLACES)).toBe(
      "tpl-apo",
    );
  });

  it("falls back to the first template when none is marked default", () => {
    const noDefault: TemplateOption[] = [
      { id: "a", name: "Alpha Report", isDefault: false },
      { id: "b", name: "Beta Report", isDefault: false },
    ];
    expect(pickDefaultTemplateId(noDefault, NO_SCOPE, PLACES)).toBe("a");
  });

  it("returns null when there are no templates", () => {
    expect(pickDefaultTemplateId([], NO_SCOPE, PLACES)).toBeNull();
  });

  it("treats every template as generic when the known-place list is empty", () => {
    // Degraded input (place queries failed) must still yield the tenant default
    // rather than nothing.
    expect(pickDefaultTemplateId(TEMPLATES, NO_SCOPE, [])).toBe("tpl-apo");
  });
});
