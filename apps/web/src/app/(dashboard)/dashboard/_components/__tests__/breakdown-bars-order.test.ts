import { describe, it, expect } from "vitest";
import {
  orderBreakdownData,
  type BreakdownDatum,
} from "../breakdown-bars";

describe("orderBreakdownData", () => {
  it("law_enforcement: renders the canonical owner order regardless of count", () => {
    // Intentionally shuffled + count-inverted input.
    const data: BreakdownDatum[] = [
      { type: "Compressor Fishing", count: 8 },
      { type: "Unregistered Illegal Fishing", count: 1 },
      { type: "Destructive Practices", count: 50 },
      { type: "Use of Prohibited Gears", count: 3 },
      { type: "Fishing in a prohibited area (MPA)", count: 7 },
      { type: "Taking of Prohibited Species", count: 2 },
    ];
    const out = orderBreakdownData(data, "law_enforcement").map((d) => d.type);
    expect(out).toEqual([
      "Unregistered Illegal Fishing",
      "Fishing in a prohibited area (MPA)",
      "Taking of Prohibited Species",
      "Use of Prohibited Gears",
      "Compressor Fishing",
      "Destructive Practices",
    ]);
  });

  it("monitoring: canonical order, matching is case/typo-tolerant on punctuation+case", () => {
    const data: BreakdownDatum[] = [
      { type: "Community Support", count: 105 },
      { type: "Threats on Habitat", count: 21 },
      { type: "Infrastructure and Assets", count: 16 }, // capital A in data
      { type: "Research and Studies", count: 12 },
      { type: "Marine Wildlife Sightings", count: 11 }, // capitalised in data
    ];
    const out = orderBreakdownData(data, "monitoring").map((d) => d.type);
    expect(out).toEqual([
      "Marine Wildlife Sightings",
      "Infrastructure and Assets",
      "Research and Studies",
      "Community Support",
      "Threats on Habitat",
    ]);
  });

  it("appends unlisted types (e.g. Others) after the canonical order, by count", () => {
    const data: BreakdownDatum[] = [
      { type: "Others", count: 9 },
      { type: "Compressor Fishing", count: 8 },
      { type: "Unregistered Illegal Fishing", count: 1 },
      { type: "Misc", count: 20 },
    ];
    const out = orderBreakdownData(data, "law_enforcement").map((d) => d.type);
    expect(out).toEqual([
      "Unregistered Illegal Fishing",
      "Compressor Fishing",
      "Misc", // unlisted, higher count first
      "Others",
    ]);
  });

  it("matches 'Fishing in a prohibited area' even without the (MPA) suffix", () => {
    const data: BreakdownDatum[] = [
      { type: "Compressor Fishing", count: 8 },
      { type: "Fishing in a prohibited area", count: 7 },
    ];
    const out = orderBreakdownData(data, "law_enforcement").map((d) => d.type);
    expect(out).toEqual(["Fishing in a prohibited area", "Compressor Fishing"]);
  });

  it("no variant → top-5 by count (legacy behaviour)", () => {
    const data: BreakdownDatum[] = [
      { type: "A", count: 1 },
      { type: "B", count: 6 },
      { type: "C", count: 3 },
      { type: "D", count: 9 },
      { type: "E", count: 2 },
      { type: "F", count: 8 },
    ];
    const out = orderBreakdownData(data, undefined).map((d) => d.type);
    expect(out).toEqual(["D", "F", "B", "C", "E"]);
  });
});
