import { describe, expect, it } from "vitest";

import { buildMunicipalityScopeWhere } from "../municipality-scope";

describe("buildMunicipalityScopeWhere", () => {
  it("returns plain municipalityId equality for a single id with no childZoneIds", () => {
    expect(buildMunicipalityScopeWhere(["muni-1"])).toEqual({
      municipalityId: "muni-1",
    });
  });

  it("returns municipalityId `in` clause for multiple ids with no childZoneIds", () => {
    expect(buildMunicipalityScopeWhere(["muni-1", "muni-2"])).toEqual({
      municipalityId: { in: ["muni-1", "muni-2"] },
    });
  });

  it("collapses to plain municipalityId when childZoneIds is an empty array", () => {
    expect(buildMunicipalityScopeWhere(["muni-1"], [])).toEqual({
      municipalityId: "muni-1",
    });
  });

  it("widens to an OR with coveredZones when childZoneIds is non-empty", () => {
    expect(buildMunicipalityScopeWhere(["muni-1"], ["z1", "z2"])).toEqual({
      OR: [
        { municipalityId: "muni-1" },
        { coveredZones: { some: { protectedZoneId: { in: ["z1", "z2"] } } } },
      ],
    });
  });
});
